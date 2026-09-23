const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');

async function main() {
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: path.resolve('.whatsapp') }),
    puppeteer: {
      headless: process.env.WHATSAPP_HEADLESS === 'true',
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
  });

  let resolveReady;
  const ready = new Promise((r) => (resolveReady = r));
  client.on('ready', resolveReady);
  client.on('qr', () => console.log('QR GERADO - cancelando'));
  client.on('auth_failure', (m) => { console.error('AUTH_FAILURE', m); process.exit(1); });
  client.on('disconnected', (r) => console.log('DISCONNECTED', r));

  const t = setTimeout(() => { console.error('TIMEOUT esperando ready'); process.exit(1); }, 120000);
  await client.initialize();
  await ready;
  clearTimeout(t);
  console.log('READY');

  const page = client.pupPage;

  const out = await page.evaluate(async () => {
    const res = {};
    const requireMod = (m) => {
      try { return window.require(m); } catch (e) { return e; }
    };
    const desc = (v) => {
      if (v instanceof Error) return { err: v.message };
      if (v === null || v === undefined) return null;
      if (typeof v !== 'object') return v;
      return {
        typeName: v.constructor && v.constructor.name,
        keys: Object.keys(v).slice(0, 40),
        idType: typeof v.id,
        idKeys: v.id && typeof v.id === 'object' ? Object.keys(v.id) : null,
        idSer: v.id ? (v.id._serialized || v.id.$1) : undefined,
        isMe: typeof v.isMe === 'function' ? v.isMe() : undefined,
        name: v.name, shortName: v.shortName, pushname: v.pushname,
        serializeId: v.serialize && v.serialize().id,
        get: v.get ? (() => { try { const g = v.get('id'); return g && (g._serialized || g.$1); } catch (e) { return 'err:' + e.message; } })() : undefined,
      };
    };

    try {
      const chat = await window.WWebJS.getChat('120363428169029383@g.us', { getAsModel: false });
      res.chatId = chat.id && (chat.id._serialized || chat.id.$1);

      const prefs = requireMod('WAWebUserPrefsMeUser');
      res.prefsKeys = Object.keys(prefs).sort();

      try { res.matchAddressing = desc(prefs.getMeUserMatchingAddressingModeOrThrow(chat.id)); } catch (e) { res.matchAddressingErr = e.message; }
      try { res.getMeUserOrThrow = desc(prefs.getMeUserOrThrow()); } catch (e) { res.getMeUserOrThrowErr = e.message; }
      try { res.getMeLidUserOrThrow = desc(prefs.getMeLidUserOrThrow()); } catch (e) { res.getMeLidUserOrThrowErr = e.message; }
    } catch (e) { res.topErr = e.message; }

    for (const m of ['WAWebUserStore', 'WAWebContactModel', 'WAWebUserPrefsMeUserStore', 'WAWebCollectionsModule', 'WAWebMain', 'WAWebLidMigration', 'WAWebUser']) {
      const mod = requireMod(m);
      if (mod instanceof Error) { res['mod_' + m] = { err: mod.message }; continue; }
      const empty = mod && typeof mod;
      res['mod_' + m] = { keys: (mod && typeof mod === 'object' && Object.keys(mod).length) ? Object.keys(mod).slice(0, 40) : String(empty) };
    }

    try {
      const coll = requireMod('WAWebCollections');
      const Contact = coll.Contact;
      for (const w of ['194424764154058@lid', '558585199192@c.us']) {
        try { res['contact_' + w] = desc(Contact.get(w)); } catch (e) { res['contact_' + w + '_err'] = e.message; }
      }

      const Msg = coll.Msg;
      const msgs = await Msg.getMessagesByChat(chat, { count: 1, direction: 'previous' });
      const real = msgs && msgs[0];
      res.realFrom = real ? desc(real.from) : null;
      res.realParticipantType = real && real.participant ? typeof real.participant : null;
      res.realParticipant = real && real.participant ? (real.participant._serialized || real.participant.$1) : null;
      res.realTo = real ? (real.to && (real.to._serialized || real.to.$1)) : null;
      res.realId = real ? (real.id && (real.id._serialized || real.id.$1)) : null;
      res.realIsFromMe = real ? real.isFromMe : undefined;
      try { res.realSender = real ? desc(real.getSender() ? real.getSender() : null) : null; } catch (e) { res.realSenderErr = e.message; }
      res.realAck = real ? real.ack : undefined;

      res.msgGetSenderType = typeof real.getSender;
      res.MsgCtor = Msg && Msg.modelClass ? { has: true } : null;
    } catch (e) { res.msgErr = e.message; }

    return res;
  });

  console.log(JSON.stringify(out, null, 2));
  try { await client.destroy(); } catch (e) { console.log('destroy err', e.message); }
  process.exit(0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });