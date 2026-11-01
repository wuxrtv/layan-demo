// Схема базы (Cloudflare D1 / SQLite) и автоматическая подготовка при первом запуске:
// таблицы создаются, если их нет, а в пустую базу заливается стартовый каталог.
// Поэтому после создания пустой базы в Cloudflare ничего вручную выполнять не нужно.
import { SEED_PRODUCTS, SEED_SETTINGS } from './seed.js';

const SCHEMA = [
  // Товары: сам товар — JSON (названия, цвета, размеры, фото); active — показывать в магазине; sort — порядок
  `CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  // Заказы: номер для покупателя = 1000 + id; status: new | confirmed | delivered | cancelled
  `CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'new',
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    method TEXT NOT NULL,
    address TEXT,
    pay TEXT NOT NULL,
    comment TEXT,
    items TEXT NOT NULL,
    sum INTEGER NOT NULL,
    fee INTEGER NOT NULL,
    total INTEGER NOT NULL,
    lang TEXT,
    tg_user TEXT
  )`,
  'CREATE INDEX IF NOT EXISTS orders_status_id ON orders (status, id)',
  // Настройки: одна запись key='shop' с JSON (доставка, баннер, самовывоз, фото категорий)
  'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  // Фото из админки (сжатые в браузере до ~1200px)
  `CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    mime TEXT NOT NULL,
    data BLOB NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
];

let ready = null; // одна проверка на экземпляр функции

export function ensureDb(db) {
  if (!ready) {
    ready = (async () => {
      await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
      const hasSettings = await db.prepare("SELECT 1 FROM settings WHERE key = 'shop'").first();
      if (hasSettings) return;
      // самый первый запуск: настройки + стартовые товары (INSERT OR IGNORE — повтор ничего не дублирует)
      const add = db.prepare('INSERT OR IGNORE INTO products (id, data, active, sort) VALUES (?1, ?2, 1, ?3)');
      await db.batch([
        ...SEED_PRODUCTS.map((p, i) => add.bind(p.id, JSON.stringify(p.data), i + 1)),
        db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('shop', ?1)").bind(JSON.stringify(SEED_SETTINGS)),
      ]);
    })().catch((e) => {
      ready = null; // при ошибке попробуем снова на следующем запросе
      throw e;
    });
  }
  return ready;
}
