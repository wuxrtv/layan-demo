// Вход в админку через Telegram: админка открывается из бота как Mini App,
// браузер присылает Telegram.WebApp.initData в заголовке X-Tg-Init-Data,
// сервер проверяет подпись токеном бота и ищет Telegram ID среди администраторов.
//
// Владельцы — ID из секрета ADMIN_TG_IDS: всегда имеют доступ и управляют списком администраторов.
// Остальных администраторов владелец добавляет в админке (таблица admins).
import { ownerIds, verifyInitData } from './telegram.js';

export async function verifyAdmin(request, env) {
  if (!env.TG_BOT_TOKEN) return { status: 503, error: 'Бот не подключён: добавьте TG_BOT_TOKEN в настройках Cloudflare' };
  const user = await verifyInitData(request.headers.get('x-tg-init-data') || '', env.TG_BOT_TOKEN);
  if (!user) return { status: 401, error: 'Откройте админку через бота в Telegram' };

  const id = String(user.id);
  const isOwner = ownerIds(env).includes(id);
  const row = await env.DB.prepare('SELECT role, name, username FROM admins WHERE tg_id = ?1').bind(id).first();
  if (!isOwner && !row) return { status: 403, error: 'Нет доступа', tgId: user.id };

  const role = isOwner ? 'owner' : 'admin';
  // запоминаем имя из Telegram, чтобы в списке администраторов было видно, кто есть кто
  if (!row) {
    await env.DB.prepare('INSERT INTO admins (tg_id, name, username, role) VALUES (?1, ?2, ?3, ?4)')
      .bind(id, user.first_name, user.username, role).run();
  } else if (row.role !== role || row.name !== user.first_name || row.username !== user.username) {
    await env.DB.prepare('UPDATE admins SET role = ?2, name = ?3, username = ?4 WHERE tg_id = ?1')
      .bind(id, role, user.first_name, user.username).run();
  }
  return { admin: { ...user, id, role } };
}
