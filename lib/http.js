// Общие помощники для ответов API

export const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(init.headers || {}) },
  });

export const fail = (message, status = 400) => json({ error: message }, { status });

// Ошибка с текстом для пользователя (показывается в админке / магазине как есть)
export class UserError extends Error {}

export async function readJson(request, maxBytes = 64 * 1024) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > maxBytes) throw new UserError('Слишком большой запрос');
  const text = await request.text();
  if (text.length > maxBytes) throw new UserError('Слишком большой запрос');
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new UserError('Некорректные данные');
  }
}

// Обёртка обработчика: UserError → 400 с текстом, остальное → 500 без подробностей
export const handle = (fn) => async (context) => {
  try {
    return await fn(context);
  } catch (e) {
    if (e instanceof UserError) return fail(e.message, 400);
    console.error(e);
    return fail('Внутренняя ошибка сервера', 500);
  }
};
