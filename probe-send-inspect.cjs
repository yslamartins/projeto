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
  const version = await getJson(`http://localhost:${port}/json/version`);
  const browser = await puppeteer.connect({ browserWSEndpoint: version.webSocketDebuggerUrl, defaultViewport: null });
  const pages = await browser.pages();
  const page = pages.find((p) => p.url().includes('web.whatsapp.com'));

  const b64 = fs.readFileSync(VIDEO).toString('base64');

  const result = await page.evaluate(async (b64) => {
    const out = {};
    const requireModule = (m) => window.require(m);
    const chatId = '120363428169029383@g.us';

    try {
      const origAction = requireModule('WAWebSendMsgChatAction');
      const origAdd = origAction.addAndSendMsgToChat;
      origAction.addAndSendMsgToChat = (chat, message) => {
        out.intercepted = {
          hasId: !!message.id,
          idKeys: message.id ? Object.keys(message.id) : null,
          idSerialized: message.id ? message.id._serialized : undefined,
          idDollar1: message.id ? message.id.$1 : undefined,
          idRemote: message.id && message.id.remote,
          fromType: typeof message.from,
          fromKeys: message.from ? Object.keys(message.from) : null,
          fromSerialized: message.from ? message.from._serialized : undefined,
          fromDollar1: message.from ? message.from.$1 : undefined,
          toType: typeof message.to,
          toKeys: message.to ? Object.keys(message.to) : null,
          toSerialized: message.to ? message.to._serialized : undefined,
          toDollar1: message.to ? message.to.$1 : undefined,
          participant: message.participant ? message.participant._serialized || message.participant.$1 : null,
          hasMsgs: false,
          type: message.type,
          mediaKeys: Object.keys(message).filter((k) => /media|mimetype|filehash|directPath|clientUrl|mediaKey|streaming/i.test(k)),
        };
        return origAdd.apply(origAction, [chat, message]);
      };

      const chat = await window.WWebJS.getChat(chatId, { getAsModel: false });
      out.gotChat = !!chat;
      out.chatIdKeys = chat.id ? Object.keys(chat.id) : null;
      out.chatIdSerialized = chat.id ? chat.id._serialized : undefined;
      out.chatIdDollar1 = chat.id ? chat.id.$1 : undefined;

      const media = { mimetype: 'video/mp4', filename: 'video.mp4', data: b64 };
      const msg = await window.WWebJS.sendMessage(chat, '', {
        caption: 'Caption de teste',
        media,
        linkPreview: undefined,
      });
      out.sent = true;
      out.sentId = msg && (msg.id && (msg.id._serialized || msg.id.$1));
    } catch (e) {
      out.err = String(e && e.message ? e.message : e);
      out.fullStack = String(e && e.stack ? e.stack : e).slice(0, 2000);
    }
    return out;
  }, b64);

  console.log(JSON.stringify(result, null, 2));
  await browser.disconnect();
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });