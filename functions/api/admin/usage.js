// GET /api/admin/usage — сколько места занято в базе (для полоски в «Настройках»)
import { json, handle } from '../../../lib/http.js';
import { dbUsage } from '../../../lib/usage.js';

export const onRequestGet = handle(async ({ env }) => json(await dbUsage(env)));
