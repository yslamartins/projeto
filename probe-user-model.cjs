const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const portFile = path.join('C:\\projeto', '.whatsapp', 'session', 'DevToolsActivePort');
const [port] = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/, 2);

function getJson(url) {
  return new Promise((resolve, reject) => {
    const http2 = require('http');
    http2.get(url, { host: '127.0.0.1' }, (res) => {
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
    const describe = (label, v) => {
      try {
        if (v instanceof Error) { out[label] = { err: v.message }; return; }
        if (typeof v === 'object' && v !== null) {
          out[label] = {
            typeName: v.constructor && v.constructor.name,
            keys: Object.keys(v),
            idType: typeof v.id,
            idKeys: v.id && typeof v.id === 'object' ? Object.keys(v.id) : null,
            idSerialized: v.id ? (v.id._serialized || v.id.$1) : undefined,
            isMe: typeof v.isMe === 'function' ? v.isMe() : undefined,
            name: v.name,
            shortName: v.shortName,
            pushname: v.pushname,
            contactName: v.contactName,
          };
        } else { out[label] = v; }
      } catch (e) { out[label + '_err'] = e && e.message; }
    };
    try {
      const chat = await window.WWebJS.getChat('120363428169029383@g.us', { getAsModel: false });
      out.groupIdSerialized = chat.id && (chat.id._serialized || chat.id.$1);
      const prefs = requireMod('WAWebUserPrefsMeUser');
      const lidWid = prefs.getMaybeMeLidUser();
      const pnWid = prefs.getMaybeMePnUser();
      describe('lidWid', lidWid);
      describe('pnWid', pnWid);

      for (const fn of ['getMeUserMatchingAddressingModeOrThrow', 'getMeUserOrThrow', 'getMeLidUserOrThrow']) {
        try {
          const args = fn === 'getMeUserMatchingAddressingModeOrThrow' ? [chat.id] : [];
          describe('prefs.' + fn, prefs[fn](...args));
        } catch (e) { out['prefs.' + fn + '_err'] = e && e.message; }
      }
    } catch (e) { out.topErr = e && e.message; }

    try {
      const coll = requireMod('WAWebCollections');
      const Contact = coll.Contact;
      const contact = Contact.get('194424764154058@lid');
      describe('Contact.get(lid)', contact);
      const contactPn = Contact.get('558585199192@c.us');
      describe('Contact.get(pn)', contactPn);
    } catch (e) { out.contactErr = e && e.message; }

    for (const m of ['WAWebContactModel', 'WAWebUserStore', 'WAWebUser', 'WAWebCollectionsModule']) {
      const mod = requireMod(m);
      if (mod instanceof Error) { out['mod_' + m] = { err: mod.message }; continue; }
      const modKeys = mod && typeof mod === 'object' ? Object.keys(mod) : [];
      out['mod_' + m] = { keys: modKeys.slice(0, 30), typeof: typeof mod };
    }

    return out;
  });

  console.log(JSON.stringify(result, null, 2));
  await browser.disconnect();
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });