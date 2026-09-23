const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const portFile = path.join('C:\\projeto', '.whatsapp', 'session', 'DevToolsActivePort');
const [port] = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/, 2);
const VIDEO = path.join('C:\\projeto', '.videos', '1573953914.22294546368.mp4');

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
  const version = await getJson(`http://127.0.0.1:${port}/json/version`);
  const browser = await puppeteer.connect({ browserWSEndpoint: version.webSocketDebuggerUrl, defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find((p) => p.url().includes('web.whatsapp.com'));

  const b64 = fs.readFileSync(VIDEO).toString('base64');

  const result = await page.evaluate(async (b64) => {
    const out = {};
    const requireModule = (m) => window.require(m);
    const chatId = '120363428169029383@g.us';

    const tryBuild = (label, message) => {
      try {
        const m = new (requireModule('WAWebCollections').Msg.modelClass)(message);
        return { label, ok: true, id: m.id && (m.id._serialized || m.id.$1) };
      } catch (e) {
        return { label, ok: false, err: String((e && e.message) || e), stack: String((e && e.stack) || '').slice(0, 700) };
      }
    };

    try {
      const origAction = requireModule('WAWebSendMsgChatAction');
      const origAdd = origAction.addAndSendMsgToChat;
      origAction.addAndSendMsgToChat = (chat, message) => {
        out.intercepted = {
          fromKeys: message.from ? Object.keys(message.from) : null,
          fromSer: message.from ? message.from._serialized : undefined,
          fromType: String(message.from && message.from.constructor && message.from.constructor.name),
          participant: message.participant ? message.participant._serialized || message.participant.$1 : null,
          toSer: message.to && message.to._serialized,
          type: message.type,
          mediaType: message.type,
          hasMediaKeys: !!message.mediaKey,
        };

        const prefs = requireModule('WAWebUserPrefsMeUser');
        const col = requireModule('WAWebCollections');
        const WidFactory = requireModule('WAWebWidFactory');

        const meContact = (() => {
          const lid = prefs.getMaybeMeLidUser();
          const pn = prefs.getMaybeMePnUser();
          try {
            return col.Contact.get(lid._serialized) || col.Contact.get(pn._serialized);
          } catch { return null; }
        })();

        out.reproduceSemFix = tryBuild('semFix', message);
        out.reproduceComFix = (() => {
          if (!meContact) return { label: 'comFix', ok: false, err: 'no meContact' };
          const candidate = { ...message, from: meContact };
          return tryBuild('comFix', candidate);
        })();

        return [Promise.resolve(), Promise.resolve()];
      };

      const chat = await window.WWebJS.getChat(chatId, { getAsModel: false });

      const media = { mimetype: 'video/mp4', filename: 'video.mp4', data: b64 };
      await window.WWebJS.sendMessage(chat, '', {
        caption: 'teste-silencioso',
        media,
        linkPreview: undefined,
      });
      out.done = true;
    } catch (e) {
      out.err = String((e && e.message) || e);
      out.fullStack = String((e && e.stack) || e).slice(0, 1500);
    }
    return out;
  }, b64);

  console.log(JSON.stringify(result, null, 2));
  await browser.disconnect();
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });