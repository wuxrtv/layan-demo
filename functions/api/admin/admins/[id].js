// PATCH  /api/admin/admins/:id — включить/выключить уведомления ({ notify }); владелец — любому, админ — только себе
// DELETE /api/admin/admins/:id — убрать администратора (только владелец; владельцев убрать нельзя)
import { json, fail, handle, readJson } from '../../../../lib/http.js';
import { ownerIds } from '../../../../lib/telegram.js';

export const onRequestPatch = handle(async ({ request, env, params, data }) => {
  const id = String(params.id);
  if (data.admin.role !== 'owner' && data.admin.id !== id) return fail('Можно менять только свои уведомления', 403);
  const { notify } = await readJson(request, 1024);
  // владелец мог ещё ни разу не заходить — тогда создаём ему запись
  if (ownerIds(env).includes(id)) {
    await env.DB.prepare("INSERT OR IGNORE INTO admins (tg_id, role) VALUES (?1, 'owner')").bind(id).run();
  }
  const r = await env.DB.prepare('UPDATE admins SET notify = ?2 WHERE tg_id = ?1').bind(id, notify ? 1 : 0).run();
  if (!r.meta.changes) return fail('Администратор не найден', 404);
  return json({ ok: true });
});

export const onRequestDelete = handle(async ({ env, params, data }) => {
  const id = String(params.id);
  if (data.admin.role !== 'owner') return fail('Убирать администраторов может только владелец', 403);
  if (ownerIds(env).includes(id)) return fail('Владельца нельзя убрать из админки');
  // без условия на role: бывший владелец (убранный из ADMIN_TG_IDS) в таблице ещё может значиться как owner
  const r = await env.DB.prepare('DELETE FROM admins WHERE tg_id = ?1').bind(id).run();
  if (!r.meta.changes) return fail('Администратор не найден', 404);
  return json({ ok: true });
});
