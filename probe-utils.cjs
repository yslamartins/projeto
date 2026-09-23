const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');
const portFile = path.join('C:\\projeto', '.whatsapp', 'session', 'DevToolsActivePort');
const [port] = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/, 2);
function getJson(url) { return new Promise((resolve, reject) => { http.get(url, (res) => { let data=''; res.on('data',(c)=>data+=c); res.on('end',()=>resolve(JSON.parse(data))); }).on('error',reject); }); }
(async () => {
  const version = await getJson(`http://127.0.0.1:${port}/json/version`);
  const browser = await puppeteer.connect({ browserWSEndpoint: version.webSocketDebuggerUrl, defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find((p) => p.url().includes('web.whatsapp.com'));

  const result = await page.evaluate(async () => {
    const out = {};
    try {
      // Load the Msg model utility directly
      const utils = window.require('WAWebMsgModelUtils');
      out.utilsType = typeof utils;
      out.getValidatedSender = typeof utils.getValidatedSender;

      // Get a model from chat msgs (last loaded)
      const chat = await window.WWebJS.getChat('120363428169029383@g.us', { getAsModel: false });
      const models = chat.msgs._models || [];
      out.msgsCount = models.length;
      if (models.length) {
        const m = models[models.length - 1];
        out.modelCtor = m.constructor && m.constructor.name;
        // Test getValidatedSender directly
        try {
          out.getValidatedSenderResult = String(utils.getValidatedSender(m));
        } catch (e) {
          out.getValidatedSenderErr = String((e && e.message) || e);
        }
        // Test getSender
        try {
          out.getSenderResult = String(m.getSender ? m.getSender() : 'no getSender');
        } catch (e) {
          out.getSenderErr = String((e && e.message) || e);
        }
      }
      // Also test utils with raw WID (from getMaybeMeLidUser equivalent pattern)
      const prefs = window.require('WAWebUserPrefsMeUser');
      const rawWid = prefs.getMaybeMeLidUser();  // returns {server,user,_serialized}
      try {
        out.getValidatedSender_rawWid = String(utils.getValidatedSender(rawWid));
      } catch (e) {
        out.getValidatedSender_rawWidErr = String((e && e.message) || e);
      }
      // Test with a Contact model from store
      const coll = window.require('WAWebCollections');
      try {
        const contact = coll.Contact.get(rawWid._serialized);
        out.getValidatedSender_contactModel = String(utils.getValidatedSender(contact));
      } catch (e) {
        out.getValidatedSender_contactErr = String((e && e.message) || e);
      }
    } catch (e) { out.topErr = String((e && e.stack) || e).slice(0, 800); }
    return out;
  });

  console.log(JSON.stringify(result, null, 2));
  await browser.disconnect();
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });