(function () {
  'use strict';

  // ---------- helpers ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => String(n ?? 0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' сум';
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // как в магазине: ID фото Unsplash → ссылка нужного размера, свои фото (/img/...) — как есть
  function photoUrl(src, w, h) {
    if (!src) return '';
    if (/[/.]/.test(src)) return src;
    return `https://images.unsplash.com/photo-${src}?w=${w * 2}&h=${h * 2}&fit=crop&auto=format&q=70`;
  }
  const pic = (src, w, h) => (src ? `<img class="ph" src="${esc(photoUrl(src, w, h))}" alt="" loading="lazy" onload="this.classList.add('ld')">` : '');

  const CATS = { women: 'Женщинам', men: 'Мужчинам', kids: 'Детям' };
  const STATUS = { new: 'Новый', confirmed: 'Подтверждён', delivered: 'Выполнен', cancelled: 'Отменён' };
  const FILTERS = [['new', 'Новые'], ['confirmed', 'Подтверждённые'], ['delivered', 'Выполненные'], ['cancelled', 'Отменённые'], ['all', 'Все']];
  const SIZE_PRESETS = [['Взрослые', 'S, M, L, XL'], ['Обувь', '38, 39, 40, 41, 42, 43'], ['Дети', '98, 110, 122, 134'], ['Один размер', 'One Size']];

  const fmtTime = (s) => new Date(String(s).replace(' ', 'T') + 'Z').toLocaleString('ru-RU', {
    timeZone: 'Asia/Tashkent', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  const $app = document.getElementById('app');
  const $nav = document.getElementById('nav');
  const $toast = document.getElementById('toast');
  const $file = document.getElementById('file');

  const state = {
    tab: 'orders',
    filter: 'new',
    orders: [], counts: {}, ordersLoaded: false,
    products: [], productsLoaded: false, query: '',
    settings: null, me: null,
    draft: null, draftId: null, dirty: false, // редактируемый товар
    settingsDraft: null,
    saving: false,
    uploading: {}, // путь поля → true, пока грузится фото
  };

  let toastTimer;
  function toast(msg, warn) {
    $toast.innerHTML = `<span class="toast-ic ${warn ? 'warn' : 'ok'}">${warn ? '!' : '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'}</span><span>${esc(msg)}</span>`;
    $toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $toast.classList.remove('show'), 2600);
  }

  async function api(path, { method = 'GET', body, raw } = {}) {
    const res = await fetch('/api/admin' + path, {
      method,
      headers: raw ? { 'content-type': raw.type } : body ? { 'content-type': 'application/json' } : {},
      body: raw || (body ? JSON.stringify(body) : undefined),
      cache: 'no-store',
    });
    if (res.status === 401) {
      renderLogin();
      throw new Error('Нужно войти');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Ошибка сервера');
    return data;
  }

  // путь вида "colors.0.ru" → чтение/запись во вложенном объекте
  const getAt = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  function setAt(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => o[k], obj);
    target[last] = value;
  }

  // ---------- фото: сжимаем в браузере и загружаем ----------
  async function compress(file) {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
    let max = 1200, blob = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.82));
      if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
      if (blob && blob.size <= 1.4 * 1024 * 1024) return blob;
      max = Math.round(max * 0.75);
    }
    return blob;
  }

  let uploadTarget = null; // { scope: 'draft' | 'settings', path, push }
  function pickPhoto(target) {
    uploadTarget = target;
    $file.value = '';
    $file.click();
  }

  $file.addEventListener('change', async () => {
    const file = $file.files && $file.files[0];
    const target = uploadTarget;
    if (!file || !target) return;
    const obj = target.scope === 'settings' ? state.settingsDraft : state.draft;
    const key = target.scope + ':' + target.path;
    state.uploading[key] = true;
    render();
    try {
      const blob = await compress(file);
      const { url } = await api('/images', { method: 'POST', raw: blob });
      if (target.push) getAt(obj, target.path).push(url);
      else setAt(obj, target.path, url);
      if (target.scope === 'draft') state.dirty = true;
    } catch (e) {
      toast(e.message || 'Не удалось загрузить фото', true);
    } finally {
      delete state.uploading[key];
      render();
    }
  });

  // ---------- навигация ----------
  function renderNav() {
    const n = state.counts.new || 0;
    $nav.innerHTML = [['orders', 'Заказы', n], ['products', 'Товары'], ['settings', 'Настройки']]
      .map(([id, label, badge]) => `<button class="${state.tab === id ? 'on' : ''}" data-act="tab" data-v="${id}">${label}${badge ? `<em>${badge}</em>` : ''}</button>`)
      .join('');
  }

  function render() {
    renderNav();
    if (state.tab === 'orders') $app.innerHTML = viewOrders();
    else if (state.tab === 'products') $app.innerHTML = state.draft ? viewEditor() : viewProducts();
    else $app.innerHTML = viewSettings();
  }

  function renderLogin() {
    $nav.innerHTML = '';
    $app.innerHTML = `<div class="adm-empty"><p>Сессия закончилась. Войдите снова — код придёт на почту.</p><button class="btn" onclick="location.reload()">Войти</button></div>`;
  }

  // ---------- заказы ----------
  async function loadOrders(silent) {
    try {
      const data = await api('/orders' + (state.filter === 'all' ? '' : '?status=' + state.filter));
      const hadNew = state.counts.new || 0;
      state.orders = data.orders;
      state.counts = data.counts;
      state.ordersLoaded = true;
      if (silent && (state.counts.new || 0) > hadNew) toast('Новый заказ');
      if (state.tab === 'orders' || !silent) render();
      else renderNav();
    } catch (e) {
      if (!silent) toast(e.message, true);
    }
  }

  function orderActions(o) {
    const b = (status, label, cls = '') => `<button class="btn-ghost ${cls}" data-act="status" data-id="${o.id}" data-v="${status}">${label}</button>`;
    if (o.status === 'new') return b('confirmed', 'Подтвердить', 'ok') + b('cancelled', 'Отменить', 'danger');
    if (o.status === 'confirmed') return b('delivered', 'Выполнен', 'ok') + b('cancelled', 'Отменить', 'danger');
    return b('new', 'Вернуть в новые');
  }

  function orderCard(o) {
    const tel = o.phone.replace(/\s/g, '');
    const tg = o.tg_user
      ? o.tg_user.username
        ? `<a href="https://t.me/${esc(o.tg_user.username)}" target="_blank" rel="noopener">@${esc(o.tg_user.username)}</a>`
        : `<span class="muted">Telegram: ${esc(o.tg_user.first_name || o.tg_user.id)}</span>`
      : '';
    return `
      <article class="o-card ${o.status === 'new' ? 'is-new' : ''}">
        <div class="o-top"><b>#${o.no}</b><span class="st st-${o.status}">${STATUS[o.status] || o.status}</span><span class="o-time">${fmtTime(o.created_at)}</span></div>
        <div class="o-total">${money(o.total)}</div>
        <div class="o-row"><span>${esc(o.name)}</span><a href="tel:${esc(tel)}">${esc(o.phone)}</a>${tg}</div>
        <div class="o-row muted">${o.method === 'pickup' ? 'Самовывоз' : 'Доставка: ' + esc(o.address)}</div>
        <div class="o-row muted">Оплата: ${o.pay === 'card' ? 'картой при получении' : 'наличными'} · доставка ${o.fee ? money(o.fee) : 'бесплатно'}</div>
        ${o.comment ? `<div class="o-comment">${esc(o.comment)}</div>` : ''}
        <ul class="o-items">${o.items.map((i) => `<li><span>${esc(i.name.ru)} · ${esc(i.color.ru)} · ${esc(i.size)} × ${i.qty}</span><span>${money(i.price * i.qty)}</span></li>`).join('')}</ul>
        <div class="o-actions">${orderActions(o)}</div>
      </article>`;
  }

  function viewOrders() {
    const chips = FILTERS.map(([id, label]) => {
      const n = id === 'all' ? Object.values(state.counts).reduce((a, b) => a + b, 0) : state.counts[id] || 0;
      return `<button class="${state.filter === id ? 'on' : ''}" data-act="filter" data-v="${id}">${label}<b>${n}</b></button>`;
    }).join('');
    const list = !state.ordersLoaded
      ? '<div class="adm-empty">Загружаем…</div>'
      : state.orders.length
        ? state.orders.map(orderCard).join('')
        : `<div class="adm-empty">${state.filter === 'new' ? 'Новых заказов нет' : 'Здесь пока пусто'}</div>`;
    return `
      <div class="adm-title"><h1>Заказы</h1><button class="btn-ghost" data-act="refresh">Обновить</button></div>
      <div class="chips">${chips}</div>
      ${list}`;
  }

  // ---------- товары ----------
  async function loadProducts() {
    try {
      state.products = (await api('/products')).products;
      state.productsLoaded = true;
      render();
    } catch (e) {
      toast(e.message, true);
    }
  }

  function viewProducts() {
    const q = state.query.trim().toLowerCase();
    const list = state.products.filter((p) => !q || `${p.name.ru} ${p.name.uz}`.toLowerCase().includes(q));
    const rows = list.map((p) => {
      const idx = state.products.indexOf(p);
      return `
        <div class="p-row ${p.active ? '' : 'p-off'}">
          <button class="p-thumb" data-act="edit" data-id="${p.id}">${pic(p.colors[0] && p.colors[0].photo, 48, 60)}</button>
          <button class="p-main" data-act="edit" data-id="${p.id}">
            <b>${esc(p.name.ru)}</b>
            <span class="p-price">${money(p.price)}</span>
            <small>${CATS[p.cat] || ''}${p.oldPrice ? ' · скидка' : ''}${p.tags.includes('new') ? ' · новинка' : ''}${p.active ? '' : ' · скрыт'}</small>
          </button>
          ${q ? '' : `<div class="p-move"><button data-act="move" data-id="${p.id}" data-v="-1" ${idx === 0 ? 'disabled' : ''} aria-label="Выше">▲</button><button data-act="move" data-id="${p.id}" data-v="1" ${idx === state.products.length - 1 ? 'disabled' : ''} aria-label="Ниже">▼</button></div>`}
          <button class="switch ${p.active ? 'on' : ''}" data-act="toggle" data-id="${p.id}" aria-label="Показывать в магазине" aria-pressed="${p.active}"></button>
        </div>`;
    }).join('');
    return `
      <div class="adm-title"><h1>Товары</h1><button class="btn-sm" data-act="new">+ Добавить</button></div>
      <div class="search-row"><label class="search ic"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg><input id="pq" type="search" placeholder="Поиск товара" value="${esc(state.query)}" autocomplete="off"></label></div>
      ${!state.productsLoaded ? '<div class="adm-empty">Загружаем…</div>' : list.length ? `<div class="sec">${rows}</div><p class="hint">Переключатель справа — показывать товар в магазине. Стрелки меняют порядок в каталоге.</p>` : '<div class="adm-empty">Товаров не найдено</div>'}`;
  }

  const blankProduct = () => ({
    cat: 'women', tags: [], name: { ru: '', uz: '' }, desc: { ru: '', uz: '' }, price: '', oldPrice: '',
    colors: [{ hex: '#c8a77c', ru: '', uz: '', photo: '' }], photos: [], sizes: ['S', 'M', 'L', 'XL'], active: true,
  });

  function openEditor(id) {
    const p = id ? state.products.find((x) => x.id === id) : null;
    state.draft = p ? clone(p) : blankProduct();
    state.draft.oldPrice = state.draft.oldPrice ?? '';
    state.draft.sizesText = state.draft.sizes.join(', ');
    state.draftId = p ? p.id : null;
    state.dirty = false;
    render();
    window.scrollTo(0, 0);
  }

  function closeEditor(force) {
    if (!force && state.dirty && !confirm('Изменения не сохранены. Выйти без сохранения?')) return;
    state.draft = null;
    state.draftId = null;
    state.dirty = false;
    render();
  }

  const field = (label, path, attrs = '', type = 'text') =>
    `<label class="f"><span>${label}</span><input type="${type}" data-bind="${path}" value="${esc(getAt(state.draft, path) ?? '')}" ${attrs}></label>`;
  const area = (label, path) =>
    `<label class="f"><span>${label}</span><textarea data-bind="${path}" maxlength="1500">${esc(getAt(state.draft, path) ?? '')}</textarea></label>`;

  function photoTile(scope, path, src, opts = {}) {
    const loading = state.uploading[scope + ':' + path];
    if (!src && !loading) return `<button class="tile add ${opts.cls || ''}" data-act="upload" data-scope="${scope}" data-path="${path}" aria-label="Загрузить фото">+</button>`;
    return `
      <div class="tile ${opts.cls || ''} ${loading ? 'loading' : ''}">
        ${pic(src, opts.w || 72, opts.h || 90)}
        <button style="position:absolute;inset:0" data-act="upload" data-scope="${scope}" data-path="${path}" aria-label="Заменить фото"></button>
        ${opts.removable ? `<button class="x" data-act="rm-photo" data-scope="${scope}" data-path="${path}" aria-label="Удалить фото">×</button>` : ''}
      </div>`;
  }

  function viewEditor() {
    const d = state.draft;
    const colorRows = d.colors.map((c, i) => `
      <div class="color-row">
        <div>${photoTile('draft', `colors.${i}.photo`, c.photo)}<span class="tile-cap">${i === 0 ? 'главное фото' : 'фото цвета'}</span></div>
        <div>
          <div class="f-2">${field('Цвет (RU)', `colors.${i}.ru`, 'maxlength="40" placeholder="Чёрный"')}${field('Цвет (UZ)', `colors.${i}.uz`, 'maxlength="40" placeholder="Qora"')}</div>
          <div class="color-tools" style="margin-top:8px">
            <input type="color" data-bind="colors.${i}.hex" value="${esc(c.hex)}" aria-label="Оттенок цвета">
            <span class="muted" style="font-size:12px">оттенок кружка в карточке</span>
            ${d.colors.length > 1 ? `<button class="btn-ghost danger" style="margin-left:auto" data-act="rm-color" data-i="${i}">Убрать</button>` : ''}
          </div>
        </div>
      </div>`).join('');

    const extra = d.photos.map((src, i) => photoTile('draft', `photos.${i}`, src, { removable: true })).join('');
    const addingExtra = state.uploading['draft:photos'];
    return `
      <div class="adm-title"><button class="link" data-act="close">‹ Товары</button><span class="muted">${state.draftId ? 'Редактирование' : 'Новый товар'}</span></div>

      <section class="form-sec">
        <h2>Название и цена</h2>
        ${field('Название (RU)', 'name.ru', 'maxlength="120" placeholder="Платье макси"')}
        ${field('Название (UZ)', 'name.uz', 'maxlength="120" placeholder="Maksi ko‘ylak"')}
        <div class="f-2">
          <label class="f"><span>Категория</span><select data-bind="cat">${Object.entries(CATS).map(([v, l]) => `<option value="${v}" ${d.cat === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          ${field('Цена, сум', 'price', 'inputmode="numeric" placeholder="459000"')}
        </div>
        <div class="f-2">
          ${field('Старая цена (для скидки)', 'oldPrice', 'inputmode="numeric" placeholder="необязательно"')}
          <div></div>
        </div>
        <div class="check"><span>Метка «Новинка»</span><button class="switch ${d.tags.includes('new') ? 'on' : ''}" data-act="tag-new" aria-pressed="${d.tags.includes('new')}"></button></div>
        <div class="check"><span>Показывать в магазине</span><button class="switch ${d.active ? 'on' : ''}" data-act="draft-active" aria-pressed="${d.active}"></button></div>
      </section>

      <section class="form-sec">
        <h2>Цвета и фото</h2>
        ${colorRows}
        <button class="btn-ghost" data-act="add-color">+ Добавить цвет</button>
        <p class="hint">У каждого цвета своё фото — оно показывается при выборе цвета. Лучше вертикальные фото 4:5.</p>
      </section>

      <section class="form-sec">
        <h2>Дополнительные фото</h2>
        <div class="tiles">${extra}${addingExtra ? '<div class="tile loading"></div>' : ''}<button class="tile add" data-act="upload" data-scope="draft" data-path="photos" data-push="1" aria-label="Добавить фото">+</button></div>
      </section>

      <section class="form-sec">
        <h2>Размеры</h2>
        <label class="f"><span>Через запятую</span><input data-bind="sizesText" value="${esc(d.sizesText)}" placeholder="S, M, L, XL"></label>
        <div class="presets">${SIZE_PRESETS.map(([l, v]) => `<button class="btn-ghost" data-act="sizes" data-v="${v}">${l}</button>`).join('')}</div>
      </section>

      <section class="form-sec">
        <h2>Описание</h2>
        ${area('Описание (RU)', 'desc.ru')}
        ${area('Описание (UZ)', 'desc.uz')}
      </section>

      ${state.draftId ? '<button class="btn-ghost danger" style="width:100%;height:44px" data-act="delete">Удалить товар</button>' : ''}

      <div class="save-bar"><div>
        <button class="btn-ghost" data-act="close">Отмена</button>
        <button class="btn-sm" data-act="save" ${state.saving ? 'disabled' : ''}>${state.saving ? 'Сохраняем…' : 'Сохранить'}</button>
      </div></div>`;
  }

  function productPayload() {
    const d = state.draft;
    const num = (v) => (String(v).trim() === '' ? '' : Number(String(v).replace(/\s/g, '')));
    return {
      cat: d.cat, tags: d.tags, name: d.name, desc: d.desc,
      price: num(d.price), oldPrice: num(d.oldPrice),
      colors: d.colors, photos: d.photos,
      sizes: d.sizesText.split(/[,;]+/).map((s) => s.trim()).filter(Boolean),
      active: d.active,
    };
  }

  async function saveProduct() {
    if (state.saving) return;
    state.saving = true;
    render();
    try {
      const body = productPayload();
      if (state.draftId) await api('/products/' + state.draftId, { method: 'PUT', body });
      else await api('/products', { method: 'POST', body });
      toast('Товар сохранён');
      state.saving = false;
      closeEditor(true);
      loadProducts();
    } catch (e) {
      state.saving = false;
      render();
      toast(e.message, true);
    }
  }

  async function moveProduct(id, dir) {
    const i = state.products.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= state.products.length) return;
    [state.products[i], state.products[j]] = [state.products[j], state.products[i]];
    render();
    try {
      await api('/products/order', { method: 'POST', body: { ids: state.products.map((p) => p.id) } });
    } catch (e) {
      toast(e.message, true);
      loadProducts();
    }
  }

  // ---------- настройки ----------
  async function loadSettings() {
    try {
      const [{ settings }, me] = await Promise.all([api('/settings'), state.me ? Promise.resolve(state.me) : api('/me')]);
      state.settings = settings;
      state.me = me;
      state.settingsDraft = clone(settings);
      render();
    } catch (e) {
      toast(e.message, true);
    }
  }

  function viewSettings() {
    const s = state.settingsDraft;
    if (!s) return '<div class="adm-empty">Загружаем…</div>';
    const sf = (label, path, attrs = '') =>
      `<label class="f"><span>${label}</span><input data-sbind="${path}" value="${esc(getAt(s, path) ?? '')}" ${attrs}></label>`;
    const tgOn = state.me && state.me.telegram;
    return `
      <div class="adm-title"><h1>Настройки</h1></div>

      <section class="form-sec">
        <h2>Доставка</h2>
        <div class="f-2">${sf('Стоимость, сум', 'deliveryFee', 'inputmode="numeric"')}${sf('Бесплатно от, сум', 'freeFrom', 'inputmode="numeric"')}</div>
      </section>

      <section class="form-sec">
        <h2>Самовывоз</h2>
        ${sf('Адрес (RU)', 'pickupPoint.ru', 'maxlength="120"')}
        ${sf('Адрес (UZ)', 'pickupPoint.uz', 'maxlength="120"')}
        <div class="f-2">${sf('Часы (RU)', 'pickupHours.ru', 'maxlength="80"')}${sf('Часы (UZ)', 'pickupHours.uz', 'maxlength="80"')}</div>
      </section>

      <section class="form-sec">
        <h2>Баннер на главной</h2>
        ${photoTile('settings', 'banner', s.banner, { cls: 'wide', w: 560, h: 320 })}
        <p class="hint">Горизонтальное фото. Нажмите, чтобы заменить.</p>
      </section>

      <section class="form-sec">
        <h2>Фото категорий</h2>
        <div class="tiles">${Object.entries(CATS).map(([id, label]) => `<div>${photoTile('settings', `categoryPhotos.${id}`, s.categoryPhotos[id], { cls: 'round', w: 72, h: 72 })}<span class="tile-cap">${label}</span></div>`).join('')}</div>
      </section>

      <section class="form-sec">
        <h2>Уведомления о заказах</h2>
        <div class="tg-status ${tgOn ? 'on' : ''}"><i></i><span>${tgOn ? 'Новые заказы приходят в Telegram.' : 'Telegram не подключён: добавьте TG_BOT_TOKEN и TG_CHAT_ID в настройках проекта Cloudflare.'}</span></div>
      </section>

      <div class="save-bar"><div>
        <button class="btn-sm" data-act="save-settings" ${state.saving ? 'disabled' : ''}>${state.saving ? 'Сохраняем…' : 'Сохранить настройки'}</button>
      </div></div>`;
  }

  async function saveSettings() {
    if (state.saving) return;
    state.saving = true;
    render();
    try {
      const s = clone(state.settingsDraft);
      s.deliveryFee = Number(String(s.deliveryFee).replace(/\s/g, ''));
      s.freeFrom = Number(String(s.freeFrom).replace(/\s/g, ''));
      const { settings } = await api('/settings', { method: 'PUT', body: s });
      state.settings = settings;
      state.settingsDraft = clone(settings);
      toast('Настройки сохранены');
    } catch (e) {
      toast(e.message, true);
    }
    state.saving = false;
    render();
  }

  // ---------- события ----------
  document.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const d = el.dataset;
    switch (d.act) {
      case 'tab':
        if (state.tab === 'products' && state.draft && state.dirty && !confirm('Изменения не сохранены. Уйти без сохранения?')) return;
        state.tab = d.v;
        state.draft = null;
        render();
        if (d.v === 'orders') loadOrders();
        if (d.v === 'products' && !state.productsLoaded) loadProducts();
        if (d.v === 'settings') loadSettings();
        break;
      case 'filter': state.filter = d.v; state.ordersLoaded = false; render(); loadOrders(); break;
      case 'refresh': loadOrders(); break;
      case 'status':
        try {
          await api('/orders/' + d.id, { method: 'PATCH', body: { status: d.v } });
          toast('Статус: ' + STATUS[d.v]);
          loadOrders();
        } catch (e) { toast(e.message, true); }
        break;
      case 'new': openEditor(null); break;
      case 'edit': openEditor(d.id); break;
      case 'close': closeEditor(false); break;
      case 'save': saveProduct(); break;
      case 'delete':
        if (!confirm('Удалить товар безвозвратно? Можно вместо этого просто скрыть его переключателем.')) return;
        try {
          await api('/products/' + state.draftId, { method: 'DELETE' });
          toast('Товар удалён');
          closeEditor(true);
          loadProducts();
        } catch (e) { toast(e.message, true); }
        break;
      case 'toggle': {
        const p = state.products.find((x) => x.id === d.id);
        p.active = !p.active;
        render();
        try {
          await api('/products/' + p.id, { method: 'PATCH', body: { active: p.active } });
          toast(p.active ? 'Товар показан в магазине' : 'Товар скрыт из магазина');
        } catch (e) { p.active = !p.active; render(); toast(e.message, true); }
        break;
      }
      case 'move': moveProduct(d.id, Number(d.v)); break;
      case 'tag-new': state.draft.tags = state.draft.tags.includes('new') ? [] : ['new']; state.dirty = true; render(); break;
      case 'draft-active': state.draft.active = !state.draft.active; state.dirty = true; render(); break;
      case 'add-color': state.draft.colors.push({ hex: '#c8a77c', ru: '', uz: '', photo: '' }); state.dirty = true; render(); break;
      case 'rm-color': state.draft.colors.splice(Number(d.i), 1); state.dirty = true; render(); break;
      case 'sizes': state.draft.sizesText = d.v; state.dirty = true; render(); break;
      case 'upload': pickPhoto({ scope: d.scope, path: d.path, push: !!d.push }); break;
      case 'rm-photo': {
        const parts = d.path.split('.');
        const i = Number(parts.pop());
        getAt(state.draft, parts.join('.')).splice(i, 1);
        state.dirty = true;
        render();
        break;
      }
      case 'save-settings': saveSettings(); break;
    }
  });

  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.id === 'pq') {
      state.query = el.value;
      const pos = el.selectionStart;
      render();
      const q = document.getElementById('pq');
      q.focus();
      q.setSelectionRange(pos, pos);
      return;
    }
    if (el.dataset.bind && state.draft) {
      setAt(state.draft, el.dataset.bind, el.value);
      state.dirty = true;
    }
    if (el.dataset.sbind && state.settingsDraft) setAt(state.settingsDraft, el.dataset.sbind, el.value);
  });

  window.addEventListener('beforeunload', (ev) => {
    if (state.draft && state.dirty) { ev.preventDefault(); ev.returnValue = ''; }
  });

  // новые заказы подтягиваются сами раз в 30 секунд
  setInterval(() => { if (!document.hidden) loadOrders(true); }, 30000);

  // ---------- старт ----------
  render();
  api('/me').then((me) => {
    state.me = me;
    document.getElementById('me').textContent = me.email;
    loadOrders();
  }).catch(() => {});
})();
