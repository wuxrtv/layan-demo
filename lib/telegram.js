// Telegram: уведомление менеджеру о новом заказе и проверка initData покупателя

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const money = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' сум';

const MAX_ITEM_LINES = 15; // Telegram принимает до 4096 символов — длинный список сокращаем, полный заказ есть в админке

export function orderMessage(no, o, tgUser) {
  const lines = [`<b>Новый заказ #${no}</b>`, ''];
  for (const i of o.items.slice(0, MAX_ITEM_LINES)) {
    lines.push(`${esc(i.name.ru)} · ${esc(i.color.ru)} · ${esc(i.size)} × ${i.qty} — ${money(i.price * i.qty)}`);
  }
  if (o.items.length > MAX_ITEM_LINES) lines.push(`…и ещё ${o.items.length - MAX_ITEM_LINES} поз. — полный список в админке`);
  lines.push('', `Товары: ${money(o.sum)}`, `Доставка: ${o.fee ? money(o.fee) : 'бесплатно'}`, `<b>Итого: ${money(o.total)}</b>`, '');
  lines.push(`Имя: ${esc(o.name)}`, `Телефон: ${esc(o.phone)}`);
  lines.push(o.method === 'pickup' ? 'Получение: самовывоз' : `Доставка: ${esc(o.address)}`);
  lines.push(`Оплата: ${o.pay === 'card' ? 'картой при получении' : 'наличными'}`);
  if (o.comment) lines.push(`Комментарий: ${esc(o.comment.slice(0, 500))}`);
  if (tgUser && tgUser.username) lines.push(`Telegram: @${esc(tgUser.username)}`);
  else if (tgUser && tgUser.id) lines.push(`Telegram: <a href="tg://user?id=${Number(tgUser.id)}">${esc(tgUser.first_name || 'профиль')}</a>`);
  return lines.join('\n');
}

// Токен бота без случайных пробелов/переносов строки (частая ошибка при вставке в панель Cloudflare)
export const botToken = (env) => String(env.TG_BOT_TOKEN || '').trim();

// Вызов Bot API: возвращает ответ Telegram { ok, result | description }
export async function tgApi(env, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${botToken(env)}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  return res.json().catch(() => ({ ok: false, description: 'HTTP ' + res.status }));
}

// Telegram ID владельцев (секрет ADMIN_TG_IDS, через запятую)
export const ownerIds = (env) => String(env.ADMIN_TG_IDS || '').split(/[\s,;]+/).filter((s) => /^-?\d+$/.test(s));

// Куда слать заказы: в группу TG_CHAT_ID, если она задана, иначе — администраторам с включёнными уведомлениями
// (плюс владельцам, которые ещё ни разу не заходили в админку)
export async function notifyTargets(env) {
  if (env.TG_CHAT_ID) return [String(env.TG_CHAT_ID)];
  const { results } = await env.DB.prepare('SELECT tg_id, role, notify FROM admins').all();
  const owners = ownerIds(env);
  const known = new Set(results.map((r) => r.tg_id));
  return [
    // бывший владелец (убран из ADMIN_TG_IDS и ещё не заходил) заказы больше не получает
    ...results.filter((r) => r.notify && (r.role !== 'owner' || owners.includes(r.tg_id))).map((r) => r.tg_id),
    ...owners.filter((id) => !known.has(id)),
  ];
}

export async function sendMessage(env, chatId, text, extra = {}) {
  const r = await tgApi(env, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
  if (!r.ok) console.error('telegram sendMessage failed', chatId, r.description);
  return !!r.ok;
}

export async function notifyOrder(env, no, order, tgUser) {
  if (!botToken(env)) return;
  const text = orderMessage(no, order, tgUser);
  await Promise.all((await notifyTargets(env)).map((chatId) => sendMessage(env, chatId, text)));
}

// Username бота (для ссылки t.me/<bot>/admin), один запрос на экземпляр функции
let botUsername = null;
export async function getBotUsername(env) {
  if (botUsername !== null || !botToken(env)) return botUsername || '';
  try {
    const data = await tgApi(env, 'getMe');
    botUsername = (data.ok && data.result.username) || '';
  } catch (e) {
    return '';
  }
  return botUsername;
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmac(keyBytes, data) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, typeof data === 'string' ? new TextEncoder().encode(data) : data);
}

// Проверка подписи Telegram.WebApp.initData (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
// Возвращает { user } или { reason: 'no_data' | 'bad_sig' | 'expired' | 'no_user' }.
export async function checkInitData(initData, token) {
  if (!initData) return { reason: 'no_data' };
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !token) return { reason: 'no_data' };
  params.delete('hash');
  // строка проверки: все поля, кроме hash, отсортированные по имени
  const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = await hmac(new TextEncoder().encode('WebAppData'), token);
  if (hex(await hmac(secret, check)) !== hash) return { reason: 'bad_sig' };
  const authDate = Number(params.get('auth_date') || 0);
  if (Date.now() / 1000 - authDate > 86400) return { reason: 'expired' };
  try {
    const u = JSON.parse(params.get('user') || 'null');
    return u ? { user: { id: u.id, username: u.username || '', first_name: u.first_name || '' } } : { reason: 'no_user' };
  } catch (e) {
    return { reason: 'no_user' };
  }
}

// Пользователь Telegram или null
export async function verifyInitData(initData, token) {
  return (await checkInitData(initData, token)).user || null;
}
