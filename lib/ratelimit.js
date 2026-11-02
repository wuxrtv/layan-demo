// Ограничение частоты заказов: защита от скриптов, которые засыпают базу и Telegram фальшивыми заказами.
// Заказы принимаются только из Telegram (подпись initData проверена), поэтому считаем по аккаунту покупателя:
// не больше 3 заказов за 10 минут.

const WINDOW = 10 * 60 * 1000;
const MAX_ORDERS = 3;

export const orderKey = (tgUser) => 'tg:' + tgUser.id;

// true — можно оформлять; false — лимит исчерпан
export async function orderAllowed(db, key) {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM order_hits WHERE key = ?1 AND at > ?2').bind(key, Date.now() - WINDOW).first();
  return (row.n || 0) < MAX_ORDERS;
}

export function recordOrder(db, key) {
  const now = Date.now();
  return db.batch([
    db.prepare('INSERT INTO order_hits (key, at) VALUES (?1, ?2)').bind(key, now),
    db.prepare('DELETE FROM order_hits WHERE at < ?1').bind(now - WINDOW),
  ]);
}
