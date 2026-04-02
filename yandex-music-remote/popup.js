const qrCode = new QRCode("qrcode");

chrome.storage.sync.get(["RCID"], function ({ RCID }) {
  const href = `https://app.ymrc-service.ru/${RCID}`;
  qrCode.makeCode(href);
  link.textContent = href;
  link.href = href;
  pincode.textContent = RCID;
});
