// Ограничение частоты заказов: защита от скриптов, которые засыпают базу и Telegram фальшивыми заказами.
// Внутри Telegram считаем по аккаунту покупателя (подпись initData проверена), в браузере — по IP.
// У мобильных операторов один IP бывает у многих людей, поэтому для IP лимит мягче.
// IP хранится только в виде хэша.

const MIN = 60 * 1000;
const LIMITS = {
  tg: [[10 * MIN, 3], [24 * 60 * MIN, 10]], // не больше 3 заказов за 10 минут и 10 за сутки
  ip: [[10 * MIN, 6], [24 * 60 * MIN, 25]],
};

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function orderKey(request, tgUser) {
  if (tgUser && tgUser.id) return { key: 'tg:' + tgUser.id, kind: 'tg' };
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
  return { key: 'ip:' + (await sha256(ip)), kind: 'ip' };
}

// true — можно оформлять; false — лимит исчерпан
export async function orderAllowed(db, { key, kind }) {
  const now = Date.now();
  const counts = await db.batch(LIMITS[kind].map(([win]) =>
    db.prepare('SELECT COUNT(*) AS n FROM order_hits WHERE key = ?1 AND at > ?2').bind(key, now - win)));
  return LIMITS[kind].every(([, max], i) => (counts[i].results[0].n || 0) < max);
}

export function recordOrder(db, { key }) {
  const now = Date.now();
  return db.batch([
    db.prepare('INSERT INTO order_hits (key, at) VALUES (?1, ?2)').bind(key, now),
    db.prepare('DELETE FROM order_hits WHERE at < ?1').bind(now - 24 * 60 * MIN),
  ]);
}
