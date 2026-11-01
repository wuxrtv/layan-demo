// Telegram: уведомление менеджеру о новом заказе и проверка initData покупателя

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const money = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' сум';

export function orderMessage(no, o, tgUser) {
  const lines = [`<b>Новый заказ #${no}</b>`, ''];
  for (const i of o.items) {
    lines.push(`${esc(i.name.ru)} · ${esc(i.color.ru)} · ${esc(i.size)} × ${i.qty} — ${money(i.price * i.qty)}`);
  }
  lines.push('', `Товары: ${money(o.sum)}`, `Доставка: ${o.fee ? money(o.fee) : 'бесплатно'}`, `<b>Итого: ${money(o.total)}</b>`, '');
  lines.push(`Имя: ${esc(o.name)}`, `Телефон: ${esc(o.phone)}`);
  lines.push(o.method === 'pickup' ? 'Получение: самовывоз' : `Доставка: ${esc(o.address)}`);
  lines.push(`Оплата: ${o.pay === 'card' ? 'картой при получении' : 'наличными'}`);
  if (o.comment) lines.push(`Комментарий: ${esc(o.comment)}`);
  if (tgUser && tgUser.username) lines.push(`Telegram: @${esc(tgUser.username)}`);
  else if (tgUser && tgUser.id) lines.push(`Telegram: <a href="tg://user?id=${Number(tgUser.id)}">${esc(tgUser.first_name || 'профиль')}</a>`);
  return lines.join('\n');
}

export async function notifyOrder(env, no, order, tgUser) {
  if (!env.TG_BOT_TOKEN || !env.TG_CHAT_ID) return;
  const res = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TG_CHAT_ID, text: orderMessage(no, order, tgUser), parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  if (!res.ok) console.error('telegram sendMessage failed', res.status, await res.text());
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmac(keyBytes, data) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', key, typeof data === 'string' ? new TextEncoder().encode(data) : data);
}

// Проверка подписи Telegram.WebApp.initData (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
// Возвращает пользователя Telegram или null, если подпись неверна или данные старше суток.
export async function verifyInitData(initData, botToken) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = await hmac(new TextEncoder().encode('WebAppData'), botToken);
  if (hex(await hmac(secret, check)) !== hash) return null;
  const authDate = Number(params.get('auth_date') || 0);
  if (Date.now() / 1000 - authDate > 86400) return null;
  try {
    const u = JSON.parse(params.get('user') || 'null');
    return u ? { id: u.id, username: u.username || '', first_name: u.first_name || '' } : null;
  } catch (e) {
    return null;
  }
}
