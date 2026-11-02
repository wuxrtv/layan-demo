// Место в базе D1: сколько занято (бесплатный тариф Cloudflare — 500 МБ на базу),
// предупреждение администраторам в Telegram при 80% и уборка фото, которые больше нигде не используются.
import { botToken, notifyTargets, sendMessage } from './telegram.js';

const MB = 1024 * 1024;
const WARN_AT = 0.8; // при 80% — сообщение в Telegram
const REARM_AT = 0.7; // ниже 70% — снова предупредим, когда опять дойдёт до 80%

export const limitBytes = (env) => (Number(env.DB_LIMIT_MB) || 500) * MB;

export async function dbUsage(env) {
  const r = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM images) AS photos,
            (SELECT COUNT(*) FROM products) AS products,
            (SELECT COALESCE(SUM(length(data)), 0) FROM images) + (SELECT COALESCE(SUM(length(data)), 0) FROM products) AS bytes`,
  ).all();
  const row = r.results[0] || {};
  // size_after — точный размер файла базы от D1; если его нет, считаем по фото и товарам
  const used = Math.max(Number(r.meta && r.meta.size_after) || 0, Number(row.bytes) || 0);
  return { used, limit: limitBytes(env), photos: row.photos || 0, products: row.products || 0 };
}

export async function warnIfFull(env) {
  const u = await dbUsage(env);
  const ratio = u.used / u.limit;
  const warned = await env.DB.prepare("SELECT 1 FROM settings WHERE key = 'usage_warned'").first();
  if (ratio >= WARN_AT && !warned) {
    await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('usage_warned', '1')").run();
    if (!botToken(env)) return;
    const text = `<b>LAYAN: место в базе заканчивается</b>\nЗанято ${Math.round(u.used / MB)} из ${Math.round(u.limit / MB)} МБ (${Math.round(ratio * 100)}%).\n` +
      'Удалите ненужные товары и фото или перейдите на платный тариф Cloudflare.';
    await Promise.all((await notifyTargets(env)).map((chatId) => sendMessage(env, chatId, text)));
  } else if (ratio < REARM_AT && warned) {
    await env.DB.prepare("DELETE FROM settings WHERE key = 'usage_warned'").run();
  }
}

// Фото удалённых товаров и заменённые фото остаются в базе и занимают место — убираем их.
// Не трогаем фото моложе суток: их могли только что загрузить в ещё не сохранённый товар.
export async function pruneImages(env) {
  const [products, settings, images] = await Promise.all([
    env.DB.prepare('SELECT data FROM products').all(),
    env.DB.prepare("SELECT value FROM settings WHERE key = 'shop'").first(),
    env.DB.prepare("SELECT id FROM images WHERE created_at < datetime('now', '-1 day')").all(),
  ]);
  const used = new Set();
  const text = products.results.map((r) => r.data).join('\n') + (settings ? settings.value : '');
  for (const m of text.matchAll(/\/img\/([a-z0-9]+)/g)) used.add(m[1]);
  const orphans = images.results.map((r) => r.id).filter((id) => !used.has(id));
  for (let i = 0; i < orphans.length; i += 50) {
    const part = orphans.slice(i, i + 50);
    await env.DB.prepare(`DELETE FROM images WHERE id IN (${part.map((_, j) => '?' + (j + 1)).join(',')})`).bind(...part).run();
  }
  if (orphans.length) await warnIfFull(env); // освободили место — возможно, пора снять отметку о предупреждении
}
