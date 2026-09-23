const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const portFile = path.join('C:\\projeto', '.whatsapp', 'session', 'DevToolsActivePort');
const [port] = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/, 2);

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

(async () => {
  const version = await getJson(`http://localhost:${port}/json/version`);
  const browser = await puppeteer.connect({ browserWSEndpoint: version.webSocketDebuggerUrl, defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find((p) => p.url().includes('web.whatsapp.com'));

  const result = await page.evaluate(async () => {
    const out = {};
    const requireModule = (m) => window.require(m);

    try {
      const prefs = requireModule('WAWebUserPrefsMeUser');
      out.prefsKeys = Object.keys(prefs).sort();
      for (const k of Object.keys(prefs)) {
        if (/me|user|lid|pn/i.test(k)) {
          try {
            const v = typeof prefs[k] === 'function' ? prefs[k]() : prefs[k];
            out['var_' + k] = v ? { typeof: typeof v, keys: Object.keys(v), idHasIdProp: !!(v.id && v.id._serialized), idSerialized: v.id && (v.id._serialized || v.id.$1) } : null;
          } catch (e) {
            out['var_' + k + '_err'] = e && e.message;
          }
        }
      }
    } catch (e) {
      out.prefsErr = String(e && e.message ? e.message : e);
    }

    try {
      const coll = requireModule('WAWebCollections');
      out.collectionKeys = Object.keys(coll).sort().slice(0, 60);
      out.hasUser = !!coll.User;
      out.hasContact = !!coll.Contact;
      out.hasMe = !!coll.Me;
    } catch (e) {
      out.collErr = String(e && e.message ? e.message : e);
    }

    try {
      const { Conn } = requireModule('WAWebConnModel');
      out.meUser = Conn ? { me: !!Conn.me, meKeys: Conn.me ? Object.keys(Conn.me) : null, meId: Conn.me && (Conn.me.id && (Conn.me.id._serialized || Conn.me.id.$1)) } : null;
      out.lidUser = Conn && Conn.lidUser ? { keys: Object.keys(Conn.lidUser), id: Conn.lidUser.id && (Conn.lidUser.id._serialized || Conn.lidUser.id.$1) } : 'none';
    } catch (e) {
      out.connErr = String(e && e.message ? e.message : e);
    }

    return out;
  });

  console.log(JSON.stringify(result, null, 2));
  await browser.disconnect();
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });