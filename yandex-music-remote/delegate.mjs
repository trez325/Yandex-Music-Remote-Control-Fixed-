const RCID = "RCID";

// ---------------------------------------------------------------------------------

const clickOnControl = (ariaLabel) => {
  const btn = document.querySelector(`button[aria-label="${ariaLabel}"]`);
  if (btn) {
    btn.click();
  } else {
    console.log("Button not found:", ariaLabel);
  }
}

// ---------------------------------------------------------------------------------

class HTTPClient {
  constructor({ baseURL }) {
    this.baseURL = baseURL;
  }

  get(path, params) {
    const url = new URL(path, this.baseURL);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, value);
    }
    return fetch(url);
  }

  post(path, data) {
    const url = new URL(path, this.baseURL);
    return fetch(url, {
      method: 'POST',
      body: JSON.stringify(data, null, 2)
    });
  }
}

// ---------------------------------------------------------------------------------

class Poller {
  constructor({ commandExecutor, pincodeManager, httpClient, since = new Date(), timeout = 1000 }) {
    this.commandExecutor = commandExecutor;
    this.pincodeManager = pincodeManager;
    this.since = since;
    this.timeout = timeout;
    this.httpClient = httpClient;
    this.t = null;

    // Храним id последней выполненной команды
    this.lastExecutedId = null;
  }

  start() {
    const poll = () => {
      this.poll();
      this.t = setTimeout(poll, this.timeout);
    };
    this.t = setTimeout(poll, this.timeout);
  }

  stop() {
    clearTimeout(this.t);
  }

  async poll() {
    const pincode = await this.pincodeManager.getPincode();
    const resp = await this.httpClient.get(`/players/${pincode}/get_commands`, { since: this.since.getTime() });
    const commands = await resp.json();
    this.since = new Date();

    for (const { id, method, params } of commands) {
      // Пропускаем команды которые уже выполняли (по id)
      if (id !== undefined && id <= this.lastExecutedId) {
        continue;
      }

      const methodFn = this.commandExecutor[method];
      if (typeof methodFn === 'function') {
        if (id !== undefined) this.lastExecutedId = id;
        await methodFn.apply(this.commandExecutor, params ?? []);
      }
    }
  }
}

// ---------------------------------------------------------------------------------

class CommandExecutor {
  constructor({ stateUpdater, httpClient }) {
    this.stateUpdater = stateUpdater;
    this.httpClient = httpClient;
  }

  async play() {
    clickOnControl("Воспроизведение");
    await this.stateUpdater.nowPlaying(true);
  }

  async pause() {
    clickOnControl("Пауза");ff
    await this.stateUpdater.nowPlaying(false);
  }

  forward() {
    clickOnControl("Следующая песня");
  }

  backward() {
    clickOnControl("Предыдущая песня");
  }
}

// ---------------------------------------------------------------------------------

class StateUpdater {
  constructor({ httpClient, pincodeManager, timeout = 3000 }) {
    this.timeout = timeout;
    this.httpClient = httpClient;
    this.pincodeManager = pincodeManager;
    this.t = null;
  }

  async start() {
    const upd = async () => {
      await this.fullUpdate();
      this.t = setTimeout(upd, this.timeout);
    };
    await upd();
  }

  stop() {
    clearTimeout(this.t);
  }

  async fullUpdate() {
    try {
      const trackTitle = document.querySelector('[data-testid="track-title"]')?.innerText ?? '';
      const artistName = document.querySelector('[data-testid="track-artist"]')?.innerText ?? '';
      const prevBtn = document.querySelector('button[aria-label="Предыдущая песня"]');
      const nextBtn = document.querySelector('button[aria-label="Следующая песня"]');
      const pauseBtn = document.querySelector('button[aria-label="Пауза"]');

      this.update({
        curr_name: `${trackTitle} - ${artistName}`,
        prev_name: prevBtn?.title ?? '',
        next_name: nextBtn?.title ?? '',
        curr_volume: null,
        now_playing: pauseBtn ? 1 : 0
      });
    } catch (e) {
      console.log("Update error", e);
    }
  }

  async update(state) {
    const pincode = await this.pincodeManager.getPincode();
    await this.httpClient.post(`/players/${pincode}/state_update`, state);
  }

  async nowPlaying(state) {
    await this.update({ now_playing: state ? 1 : 0 });
  }
}

// ---------------------------------------------------------------------------------

class PincodeManager {
  symbols = ['0','1','2','3','4','5','6','7','8','9'];

  constructor(size) {
    this.size = size;
  }

  getPincode() {
    return new Promise((resolve) => {
      chrome.storage.sync.get([RCID], ({ [RCID]: value }) => {
        if (value == null) {
          value = this.generatePincode();
          chrome.storage.sync.set({ [RCID]: value });
        }
        resolve(value);
      });
    });
  }

  generatePincode() {
    let pincode = '';
    for (let i = 0; i < this.size; i++) {
      const idx = Math.floor(Math.random() * this.symbols.length);
      pincode += this.symbols[idx];
    }
    return pincode;
  }
}

// =================================================================================

const pincodeManager = new PincodeManager(8);
const httpClient = new HTTPClient({ baseURL: 'https://ymrc-service.ru' });
const stateUpdater = new StateUpdater({ pincodeManager, httpClient });
const commandExecutor = new CommandExecutor({ stateUpdater, httpClient });
const poller = new Poller({ pincodeManager, commandExecutor, httpClient });

poller.start();
stateUpdater.start();
