// GET  /api/admin/admins — список администраторов
// POST /api/admin/admins — добавить администратора по Telegram ID (только владелец)
import { json, fail, handle, readJson } from '../../../../lib/http.js';
import { botToken, ownerIds, sendMessage } from '../../../../lib/telegram.js';

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export async function listAdmins(env) {
  const { results } = await env.DB.prepare('SELECT tg_id, name, username, role, notify, created_at FROM admins ORDER BY role DESC, created_at').all();
  const owners = ownerIds(env);
  const known = new Set(results.map((r) => r.tg_id));
  // владельцы из ADMIN_TG_IDS, которые ещё не заходили в админку
  const pending = owners.filter((id) => !known.has(id)).map((id) => ({ tg_id: id, name: '', username: '', role: 'owner', notify: 1, created_at: null }));
  // роль — по ADMIN_TG_IDS, а не по таблице: убранный из владельцев сразу становится обычным админом, и его можно убрать
  return [...results, ...pending]
    .map((r) => ({ ...r, role: owners.includes(r.tg_id) ? 'owner' : 'admin', notify: !!r.notify }))
    .sort((a, b) => (a.role === b.role ? 0 : a.role === 'owner' ? -1 : 1));
}

export const onRequestGet = handle(async ({ env }) => json({ admins: await listAdmins(env) }));

export const onRequestPost = handle(async ({ request, env, data }) => {
  if (data.admin.role !== 'owner') return fail('Добавлять администраторов может только владелец', 403);
  const body = await readJson(request, 2048);
  const tgId = String(body.tgId ?? '').replace(/\D/g, '');
  if (!/^\d{5,15}$/.test(tgId)) return fail('Укажите Telegram ID — только цифры');
  const name = String(body.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);

  const exists = await env.DB.prepare('SELECT 1 FROM admins WHERE tg_id = ?1').bind(tgId).first();
  if (exists || ownerIds(env).includes(tgId)) return fail('Этот человек уже администратор');
  await env.DB.prepare("INSERT INTO admins (tg_id, name, role) VALUES (?1, ?2, 'admin')").bind(tgId, name).run();

  // бот сразу пишет новому администратору и присылает кнопку для входа
  // (дойдёт, если человек хотя бы раз нажимал «Start» в боте)
  let notified = false;
  if (botToken(env)) {
    const url = new URL('/admin/', request.url).toString();
    notified = await sendMessage(env, tgId,
      `<b>Вас добавили администратором магазина LAYAN.</b>\nНовые заказы будут приходить сюда. Админка открывается кнопкой ниже.${data.admin.first_name ? `\n\nДобавил: ${esc(data.admin.first_name)}` : ''}`,
      { reply_markup: { inline_keyboard: [[{ text: 'Открыть админку', web_app: { url } }]] } },
    ).catch(() => false);
  }
  return json({ ok: true, notified }, { status: 201 });
});
