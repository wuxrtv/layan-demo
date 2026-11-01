// GET /img/:id — фото, загруженное из админки
export async function onRequestGet({ params, env }) {
  const id = String(params.id || '');
  if (!/^[a-z0-9]{8,40}$/.test(id)) return new Response('Not found', { status: 404 });
  const row = await env.DB.prepare('SELECT mime, data FROM images WHERE id = ?1').bind(id).first();
  if (!row) return new Response('Not found', { status: 404 });
  const bytes = row.data instanceof ArrayBuffer ? row.data : new Uint8Array(row.data);
  return new Response(bytes, {
    headers: { 'content-type': row.mime, 'cache-control': 'public, max-age=31536000, immutable' },
  });
}
