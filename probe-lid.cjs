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
    const requireModule = (m) =>
      (window).require(m);

    try {
      const { getMaybeMeLidUser, getMaybeMePnUser } = requireModule('WAWebUserPrefsMeUser');
      const lidUser = getMaybeMeLidUser();
      const meUser = getMaybeMePnUser();
      out.rawLid = lidUser;
      out.rawPn = meUser;
      out.lidId = lidUser && lidUser.id ? { serialized: lidUser.id._serialized || lidUser.id.$1, isLid: lidUser.isLid() } : null;
      out.pnId = meUser && meUser.id ? { serialized: meUser.id._serialized || meUser.id.$1, isLid: meUser.isLid() } : null;
      if (lidUser && meUser) {
        try {
          out.asUserLid = requireModule('WAWebWidFactory').asUserWidOrThrow(lidUser)._serialized;
        } catch (e) { out.asUserLid = 'ERR ' + (e && e.message); }
        try {
          out.asUserPn = requireModule('WAWebWidFactory').asUserWidOrThrow(meUser)._serialized;
        } catch (e) { out.asUserPn = 'ERR ' + (e && e.message); }
      }
    } catch (e) {
      out.err = String(e && e.stack ? e.stack : e);
    }

    try {
      const chats = requireModule('WAWebCollections').Chat.getModelsArray();
      const group = chats.find((c) => c.groupMetadata && c.name === 'SHOPEE VIDEO');
      out.groupId = group.id._serialized || group.id.$1;
      out.groupIsLidAddressing = group.groupMetadata ? group.groupMetadata.isLidAddressingMode : 'no gm';
    } catch (e) {
      out.groupErr = String(e && e.message ? e.message : e);
    }
    return out;
  });

  console.log(JSON.stringify(result, null, 2));
  await browser.disconnect();
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });