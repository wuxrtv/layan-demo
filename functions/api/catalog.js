// GET /api/catalog — товары для витрины (только включённые) и настройки магазина
import { json, handle } from '../../lib/http.js';
import { getSettings, listProducts } from '../../lib/store.js';

export const onRequestGet = handle(async ({ env }) => {
  const [products, settings] = await Promise.all([listProducts(env.DB, { onlyActive: true }), getSettings(env.DB)]);
  return json(
    { products: products.map(({ active, sort, ...p }) => p), settings },
    { headers: { 'cache-control': 'public, max-age=10' } },
  );
});
