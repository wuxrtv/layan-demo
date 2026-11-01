// Каталог, настройки и проверка данных товаров/заказов
import { UserError } from './http.js';

export const CATEGORIES = ['women', 'men', 'kids'];
export const STATUSES = ['new', 'confirmed', 'delivered', 'cancelled'];
export const MAX_QTY = 99;

export const DEFAULT_SETTINGS = {
  deliveryFee: 25000,
  freeFrom: 500000,
  banner: '',
  categoryPhotos: { women: '', men: '', kids: '' },
  pickupPoint: { ru: '', uz: '' },
  pickupHours: { ru: '', uz: '' },
};

// ---------- чтение ----------
export async function getSettings(db) {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'shop'").first();
  const saved = row ? JSON.parse(row.value) : {};
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    categoryPhotos: { ...DEFAULT_SETTINGS.categoryPhotos, ...(saved.categoryPhotos || {}) },
    pickupPoint: { ...DEFAULT_SETTINGS.pickupPoint, ...(saved.pickupPoint || {}) },
    pickupHours: { ...DEFAULT_SETTINGS.pickupHours, ...(saved.pickupHours || {}) },
  };
}

export async function listProducts(db, { onlyActive }) {
  const sql = `SELECT id, data, active, sort FROM products ${onlyActive ? 'WHERE active = 1' : ''} ORDER BY sort, id`;
  const { results } = await db.prepare(sql).all();
  return results.map((r) => ({ id: r.id, ...JSON.parse(r.data), active: !!r.active, sort: r.sort }));
}

// ---------- проверка и очистка ----------
const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const longText = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const int = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : NaN);

// Фото: ID фото Unsplash, загруженное фото (/img/...) или https-ссылка
export function cleanPhoto(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^[\w-]{5,80}$/.test(s)) return s;
  if (/^\/img\/[a-z0-9]{8,40}$/.test(s)) return s;
  if (/^https:\/\/[^\s"'<>]{4,500}$/.test(s)) return s;
  throw new UserError('Некорректная ссылка на фото');
}

const bilingual = (o, max, label, required = true) => {
  const out = { ru: text(o && o.ru, max), uz: text(o && o.uz, max) };
  if (required && (!out.ru || !out.uz)) throw new UserError(`Заполните ${label} на русском и узбекском`);
  return out;
};

export function sanitizeProduct(p) {
  if (!p || typeof p !== 'object') throw new UserError('Некорректные данные товара');
  if (!CATEGORIES.includes(p.cat)) throw new UserError('Выберите категорию');

  const price = int(p.price);
  if (!(price > 0 && price < 1e9)) throw new UserError('Укажите цену');
  let oldPrice = p.oldPrice === '' || p.oldPrice == null ? null : int(p.oldPrice);
  if (oldPrice != null && !(oldPrice > price && oldPrice < 1e9)) throw new UserError('Старая цена должна быть больше текущей');

  const colors = (Array.isArray(p.colors) ? p.colors : []).slice(0, 12).map((c) => {
    const hex = String(c && c.hex || '').trim();
    if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new UserError('Некорректный цвет');
    const name = bilingual(c, 40, 'название цвета');
    return { hex: hex.toLowerCase(), ru: name.ru, uz: name.uz, photo: cleanPhoto(c.photo) };
  });
  if (!colors.length) throw new UserError('Добавьте хотя бы один цвет');
  if (!colors[0].photo) throw new UserError('Добавьте фото для первого цвета');

  const sizes = [...new Set((Array.isArray(p.sizes) ? p.sizes : []).map((s) => text(s, 12)).filter(Boolean))].slice(0, 20);
  if (!sizes.length) throw new UserError('Укажите хотя бы один размер');

  return {
    cat: p.cat,
    tags: p.tags && p.tags.includes && p.tags.includes('new') ? ['new'] : [],
    name: bilingual(p.name, 120, 'название'),
    desc: { ru: longText(p.desc && p.desc.ru, 1500), uz: longText(p.desc && p.desc.uz, 1500) },
    price,
    oldPrice,
    colors,
    photos: (Array.isArray(p.photos) ? p.photos : []).map(cleanPhoto).filter(Boolean).slice(0, 10),
    sizes,
  };
}

export function sanitizeSettings(s) {
  if (!s || typeof s !== 'object') throw new UserError('Некорректные настройки');
  const deliveryFee = int(s.deliveryFee);
  const freeFrom = int(s.freeFrom);
  if (!(deliveryFee >= 0 && deliveryFee < 1e8)) throw new UserError('Некорректная стоимость доставки');
  if (!(freeFrom >= 0 && freeFrom < 1e10)) throw new UserError('Некорректная сумма бесплатной доставки');
  const cp = s.categoryPhotos || {};
  return {
    deliveryFee,
    freeFrom,
    banner: cleanPhoto(s.banner),
    categoryPhotos: Object.fromEntries(CATEGORIES.map((c) => [c, cleanPhoto(cp[c])])),
    pickupPoint: bilingual(s.pickupPoint, 120, 'адрес самовывоза', false),
    pickupHours: bilingual(s.pickupHours, 80, 'часы работы', false),
  };
}

// Заказ из магазина: проверяем всё и пересчитываем суммы по ценам из базы
export function buildOrder(body, products, settings) {
  const name = text(body.name, 60);
  if (name.length < 2) throw new UserError('name');
  const digits = String(body.phone || '').replace(/\D/g, '');
  if (!/^998\d{9}$/.test(digits)) throw new UserError('phone');
  const phone = `+998 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10, 12)}`;
  const method = body.method === 'pickup' ? 'pickup' : 'delivery';
  const address = method === 'delivery' ? text(body.address, 200) : '';
  if (method === 'delivery' && address.length < 5) throw new UserError('address');
  const pay = body.pay === 'card' ? 'card' : 'cash';
  const comment = longText(body.comment, 500);
  const lang = body.lang === 'uz' ? 'uz' : 'ru';

  const byId = new Map(products.map((p) => [p.id, p]));
  const raw = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
  if (!raw.length) throw new UserError('empty');
  const items = raw.map((i) => {
    const p = byId.get(String(i && i.id));
    const color = p && p.colors[int(i.color)];
    const qty = int(i.qty);
    if (!p || !color || !p.sizes.includes(String(i.size)) || !(qty >= 1 && qty <= MAX_QTY)) throw new UserError('stale');
    return { id: p.id, name: p.name, color: { ru: color.ru, uz: color.uz }, size: String(i.size), qty, price: p.price };
  });

  const sum = items.reduce((s, i) => s + i.price * i.qty, 0);
  const fee = method === 'pickup' || sum >= settings.freeFrom ? 0 : settings.deliveryFee;
  return { name, phone, method, address, pay, comment, lang, items, sum, fee, total: sum + fee };
}
