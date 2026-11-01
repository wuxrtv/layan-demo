// GET/PUT /api/admin/settings — настройки магазина
import { json, handle, readJson } from '../../../lib/http.js';
import { getSettings, sanitizeSettings } from '../../../lib/store.js';

export const onRequestGet = handle(async ({ env }) => json({ settings: await getSettings(env.DB) }));

export const onRequestPut = handle(async ({ request, env }) => {
  const settings = sanitizeSettings(await readJson(request));
  await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('shop', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(JSON.stringify(settings))
    .run();
  return json({ settings });
});
