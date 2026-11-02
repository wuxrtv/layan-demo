// Бот: ответ на «Старт» (и любое другое сообщение в личке).
// Покупатель получает приветствие на узбекском и кнопку магазина, администраторы — ещё и кнопку админ-панели.
// Telegram присылает сообщения на /api/tg-webhook; вебхук регистрируется сам (ensureWebhook).
import { botToken, ownerIds, sendMessage, tgApi } from './telegram.js';

// Адрес боевого сайта: вебхук ставим только с него, чтобы тестовые сборки (*.layan-shop.pages.dev) его не перехватили
export const shopHost = (env) => String(env.SHOP_HOST || 'layan-shop.pages.dev').trim();
export const webhookPath = '/api/tg-webhook';

// Секрет для заголовка X-Telegram-Bot-Api-Secret-Token — выводим из токена бота, отдельный секрет не нужен
export async function webhookSecret(env) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('layan-webhook:' + botToken(env)));
  return [...new Uint8Array(buf)].slice(0, 24).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Один раз на экземпляр функции: если вебхук не стоит — ставим. Чужой вебхук (другой сервис) не трогаем.
let webhookChecked = false;
export async function ensureWebhook(env) {
  if (webhookChecked || !botToken(env)) return;
  webhookChecked = true;
  const url = `https://${shopHost(env)}${webhookPath}`;
  const info = await tgApi(env, 'getWebhookInfo');
  if (!info.ok) { webhookChecked = false; return; }
  const current = info.result.url || '';
  if (current && current !== url) {
    console.warn('telegram webhook belongs to another service, not replacing:', current);
    return;
  }
  if (current === url) return;
  const r = await tgApi(env, 'setWebhook', { url, secret_token: await webhookSecret(env), allowed_updates: ['message'], drop_pending_updates: true });
  if (!r.ok) { webhookChecked = false; console.error('setWebhook failed', r.description); }
}

// Приветствие всегда на узбекском (так решил магазин), с аккуратными эмодзи — по одному в начале строки
const TEXT = {
  hello: (name) => [
    `🌸 <b>Assalomu alaykum${name ? ', ' + name : ''}!</b>`,
    '',
    '<b>LAYAN</b> — oilaviy kiyim do‘koniga xush kelibsiz ✨',
    '',
    '👗 Ayollar uchun',
    '👔 Erkaklar uchun',
    '🧸 Bolalar uchun',
    '',
    '🚚 Yetkazib berish — 1–2 kun',
    '💳 To‘lov — qabul qilganda, naqd yoki karta orqali',
  ].join('\n'),
  admin: [
    '',
    '━━━━━━━━━━━━━━',
    '🔐 <b>Siz do‘kon administratorisiz</b>',
    '🔔 Yangi buyurtmalar shu chatga keladi',
    '⚙️ Buyurtmalar, mahsulotlar va sozlamalar — «Admin panel»da',
  ].join('\n'),
  // последняя строка — прямо над кнопками
  footer: '👇 Katalogni ochish uchun quyidagi tugmani bosing',
  shop: '🛍 Do‘konni ochish',
  panel: '⚙️ Admin panel',
};

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

async function isAdmin(env, id) {
  if (ownerIds(env).includes(id)) return true;
  return !!(await env.DB.prepare('SELECT 1 FROM admins WHERE tg_id = ?1').bind(id).first());
}

export async function handleUpdate(env, update) {
  const msg = update && update.message;
  // отвечаем только в личных сообщениях людям (не в группах и не ботам)
  if (!msg || !msg.chat || msg.chat.type !== 'private' || !msg.from || msg.from.is_bot) return;
  const id = String(msg.from.id);
  const admin = await isAdmin(env, id);
  const origin = `https://${shopHost(env)}`;
  const keyboard = [[{ text: TEXT.shop, web_app: { url: origin + '/' } }]];
  if (admin) keyboard.push([{ text: TEXT.panel, web_app: { url: origin + '/admin/' } }]);
  const text = [TEXT.hello(esc(msg.from.first_name)), admin ? TEXT.admin : null, '', TEXT.footer].filter((s) => s !== null).join('\n');
  await sendMessage(env, id, text, { reply_markup: { inline_keyboard: keyboard } });
}
