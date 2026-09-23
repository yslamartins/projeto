const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const portFile = path.join('C:\\projeto', '.whatsapp', 'session', 'DevToolsActivePort');
const [port] = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/, 2);

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, { host: '127.0.0.1' }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

(async () => {
  const version = await getJson(`http://127.0.0.1:${port}/json/version`);
  const browser = await puppeteer.connect({ browserWSEndpoint: version.webSocketDebuggerUrl, defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find((p) => p.url().includes('web.whatsapp.com'));

  const result = await page.evaluate(async () => {
    const out = {};
    const requireMod = (m) => {
      try { return window.require(m); } catch (e) { return e; }
    };

    try {
      const coll = requireMod('WAWebCollections');
      const MsgModel = coll.Msg.modelClass;
      const MsgKey = requireMod('WAWebMsgKey');
      const WidFactory = requireMod('WAWebWidFactory');
      const prefs = requireMod('WAWebUserPrefsMeUser');
      const chat = await window.WWebJS.getChat('120363428169029383@g.us', { getAsModel: false });

      const lidUser = prefs.getMaybeMeLidUser();
      const meUser = prefs.getMaybeMePnUser();

      const fromWid = lidUser;                       // como o lib faz hoje (isLidAddressingMode=true)
      const participant = WidFactory.asUserWidOrThrow(fromWid);

      const newId = await MsgKey.newId();
      const newMsgKey = new MsgKey({ from: fromWid, to: chat.id, id: newId, participant, selfDir: 'out' });

      const baseMessage = {
        id: newMsgKey, ack: 0, body: 'validacao sem envio', from: fromWid, to: chat.id,
        local: true, self: 'out', t: Math.floor(Date.now() / 1000), isNewMsg: true, type: 'chat',
      };

      try {
        const m = new MsgModel(baseMessage);
        out.semFix = { ok: true, id: m.id && (m.id._serialized || m.id.$1) };
      } catch (e) {
        out.semFix = { ok: false, err: e && e.message };
      }

      const meContact = coll.Contact.get(lidUser._serialized) || coll.Contact.get(meUser._serialized);
      out.meContactId = meContact && (meContact.id && (meContact.id._serialized || meContact.id.$1));

      const candidateFrom = meContact || { id: lidUser, _serialized: lidUser._serialized };
      const newMsgKey2 = new MsgKey({ from: candidateFrom, to: chat.id, id: newId, participant, selfDir: 'out' });
      const baseMessage2 = { ...baseMessage, id: newMsgKey2, from: candidateFrom };

      try {
        const m2 = new MsgModel(baseMessage2);
        out.comFix = { ok: true, id: m2.id && (m2.id._serialized || m2.id.$1) };
      } catch (e) {
        out.comFix = { ok: false, err: e && e.message };
      }
    } catch (e) { out.topErr = e && e.message; }

    return out;
  });

  console.log(JSON.stringify(result, null, 2));
  await browser.disconnect();
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });