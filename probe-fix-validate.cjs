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
    const describe = (label, v) => {
      try {
        if (v instanceof Error) { out[label] = { err: v.message }; return; }
        if (v === null || v === undefined) { out[label] = null; return; }
        if (typeof v !== 'object') { out[label] = v; return; }
        out[label] = {
          typeName: v.constructor && v.constructor.name,
          idType: typeof v.id,
          idKeys: v.id && typeof v.id === 'object' ? Object.keys(v.id) : null,
          idSer: v.id ? (v.id._serialized || v.id.$1) : undefined,
          isMe: typeof v.isMe === 'function' ? v.isMe() : undefined,
          isLid: v.id && typeof v.id.isLid === 'function' ? v.id.isLid() : undefined,
          shortName: v.shortName, name: v.name, pushname: v.pushname,
        };
      } catch (e) { out[label + '_err'] = e && e.message; }
    };

    try {
      const prefs = requireMod('WAWebUserPrefsMeUser');
      const chat = await window.WWebJS.getChat('120363428169029383@g.us', { getAsModel: false });
      out.chatIdSer = chat.id && (chat.id._serialized || chat.id.$1);
      out.lidAddressing = chat.groupMetadata && chat.groupMetadata.isLidAddressingMode;

      describe('matchingOrThrow(chat.id)', prefs.getMeUserMatchingAddressingModeOrThrow(chat.id));
      describe('meUserOrThrow', prefs.getMeUserOrThrow());

      const coll = requireMod('WAWebCollections');
      const lidWid = prefs.getMaybeMeLidUser();
      const pnWid = prefs.getMaybeMePnUser();
      describe('lidWid', lidWid);
      describe('pnWid', pnWid);

      for (const w of ['194424764154058@lid', '558585199192@c.us']) {
        try { out['contact_' + w] = { found: !!coll.Contact.get(w), id: coll.Contact.get(w) && (coll.Contact.get(w).id && (coll.Contact.get(w).id._serialized || coll.Contact.get(w).id.$1)), keys: coll.Contact.get(w) ? Object.keys(coll.Contact.get(w)).slice(0, 20) : null }; } catch (e) { out['contact_' + w + '_err'] = e.message; }
      }
    } catch (e) { out.topErr = e.message; }

    return out;
  });

  console.log(JSON.stringify(result, null, 2));
  await browser.disconnect();
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });