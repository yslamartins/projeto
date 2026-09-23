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
    const brief = (v) => {
      if (v === null || v === undefined) return { t: typeof v, v: v };
      if (typeof v !== 'object') return { t: typeof v, v: String(v).slice(0, 30) };
      return {
        ctor: v.constructor && v.constructor.name,
        hasId: 'id' in v,
        idType: typeof v.id,
        idSer: v.id ? (v.id._serialized || v.id.$1) : undefined,
        keys: Object.keys(v).slice(0, 8),
        ser: v._serialized,
      };
    };
    try {
      // Load chat and models first (reuses existing logic)
      const chat = await window.WWebJS.getChat('120363428169029383@g.us', { getAsModel: false });
      const models = chat.msgs._models || [];
      out.msgsCount = models.length;
      // ... (keep existing last/outMsg picks from earlier probe)
      const pick = (label, m) => {
        if (!m) { out[label] = null; return; }
        out[label + '.fromModel'] = (() => { try { return String(m.getSender()); } catch (e) { return 'getSender ERR: ' + e.message; } })();
        out[label + '.fromValidated'] = (() => { try { return String(m.getValidatedSender()); } catch (e) { return 'getValidatedSender ERR: ' + e.message; } })();
        out[label + '.from'] = brief(m.from);
        out[label + '.participant'] = brief(m.participant);
        out[label + '.keyFrom'] = m.key ? brief(m.key.from) : undefined;
        out[label + '.keyRemote'] = m.key ? brief(m.key.remote) : undefined;
        out[label + '.fromMe'] = (() => { try { return m.fromMe; } catch (e) { return 'ERR ' + e.message; } })();
      };
      const last = models[models.length - 1];
      pick('last', last);
      const outMsg = models.find((m) => { try { return m.fromMe === true; } catch { return false; } });
      pick('outMsg', outMsg || last);
      if (models.length > 1) pick('prev', models[models.length - 2]);

      // NOW test WAWebMsgModelUtils.getValidatedSender on these models
      const utils = window.require('WAWebMsgModelUtils');
      out.utilsType = typeof utils;
      if (models.length) {
        const last = models[models.length - 1];
        try { out.last_getValidatedSender = String(utils.getValidatedSender(last)); } catch (e) { out.last_getValidatedSenderErr = String((e && e.message) || e); }
        try { out.last_getSender = String(last.getSender ? last.getSender() : 'no getSender'); } catch (e) { out.last_getSenderErr = String((e && e.message) || e); }
        // test on raw WID
        const rawWid = window.require('WAWebUserPrefsMeUser').getMaybeMeLidUser();
        try { out.rawWid_getValidatedSender = String(utils.getValidatedSender(rawWid)); } catch (e) { out.rawWid_getValidatedSenderErr = String((e && e.message) || e); }
        // test on Contact model
        const coll = window.require('WAWebCollections');
        try { const c = coll.Contact.get(rawWid._serialized); out.contactModel_getValidatedSender = String(utils.getValidatedSender(c)); } catch (e) { out.contactModel_getValidatedSenderErr = String((e && e.message) || e); }
        // test on User model (same as rawWid actually)
        try { const u = coll.User ? coll.User.get(rawWid._serialized) : null; if (u) out.userModel_getValidatedSender = String(utils.getValidatedSender(u)); } catch (e) { out.userModel_getValidatedSenderErr = String((e && e.message) || e); }
      }
    } catch (e) { out.topErr = String((e && e.stack) || e).slice(0, 900); }
    return out;
  });

  console.log(JSON.stringify(result, null, 2));
  await browser.disconnect();
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });