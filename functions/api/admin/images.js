// POST /api/admin/images — загрузить фото (тело запроса — сам файл, уже сжатый в браузере)
import { json, fail, handle } from '../../../lib/http.js';

const TYPES = ['image/webp', 'image/jpeg', 'image/png'];
const MAX_BYTES = 1.5 * 1024 * 1024; // запись в D1 — до 2 МБ

export const onRequestPost = handle(async ({ request, env }) => {
  const mime = (request.headers.get('content-type') || '').split(';')[0].trim();
  if (!TYPES.includes(mime)) return fail('Нужна картинка JPG, PNG или WebP');
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return fail('Пустой файл');
  if (bytes.byteLength > MAX_BYTES) return fail('Фото слишком большое, максимум 1,5 МБ');
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  await env.DB.prepare('INSERT INTO images (id, mime, data) VALUES (?1, ?2, ?3)').bind(id, mime, bytes).run();
  return json({ url: `/img/${id}` }, { status: 201 });
});
