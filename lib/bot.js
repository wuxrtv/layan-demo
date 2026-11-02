// Бот: ответ на «Старт» (и любое другое сообщение в личке).
// Покупатель получает приветствие и кнопку «Открыть магазин», администраторы — ещё и кнопку «Админ-панель».
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

const TEXT = {
  ru: {
    hello: (name) => `<b>Здравствуйте${name ? ', ' + name : ''}! Добро пожаловать в LAYAN.</b>\n` +
      'Семейный магазин одежды: женщинам, мужчинам и детям.\nОплата при получении — наличными или картой.\n\nНажмите кнопку ниже, чтобы открыть каталог.',
    admin: '\n\nВы администратор магазина: новые заказы приходят сюда, а заказы, товары и настройки — в админ-панели.',
    shop: 'Открыть магазин',
    panel: 'Админ-панель',
  },
  uz: {
    hello: (name) => `<b>Assalomu alaykum${name ? ', ' + name : ''}! LAYAN do‘koniga xush kelibsiz.</b>\n` +
      'Oilaviy kiyim do‘koni: ayollar, erkaklar va bolalar uchun.\nTo‘lov qabul qilishda — naqd yoki karta orqali.\n\nKatalogni ochish uchun quyidagi tugmani bosing.',
    admin: '\n\nSiz do‘kon administratorisiz: yangi buyurtmalar shu yerga keladi, buyurtmalar, mahsulotlar va sozlamalar — admin panelda.',
    shop: 'Do‘konni ochish',
    panel: 'Admin panel',
  },
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
  const L = TEXT[String(msg.from.language_code || '').startsWith('uz') ? 'uz' : 'ru'];
  const admin = await isAdmin(env, id);
  const origin = `https://${shopHost(env)}`;
  const keyboard = [[{ text: L.shop, web_app: { url: origin + '/' } }]];
  if (admin) keyboard.push([{ text: L.panel, web_app: { url: origin + '/admin/' } }]);
  await sendMessage(env, id, L.hello(esc(msg.from.first_name)) + (admin ? L.admin : ''), { reply_markup: { inline_keyboard: keyboard } });
}
