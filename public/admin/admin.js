(function () {
  'use strict';

  // Админка открывается из бота как Telegram Mini App: подпись initData — это и есть вход
  const tg = window.Telegram && window.Telegram.WebApp;
  const initData = (tg && tg.initData) || '';
  if (tg && initData) {
    tg.ready();
    tg.expand();
    try {
      if (tg.isVersionAtLeast('6.1')) tg.setBackgroundColor('#ffffff');
      if (tg.isVersionAtLeast('6.9')) tg.setHeaderColor('#ffffff');
    } catch (e) { /* старый клиент */ }
  }

  // В Telegram обычный confirm() работает не везде — используем окно Telegram
  const ask = (msg) => new Promise((resolve) => {
    if (tg && initData && tg.isVersionAtLeast('6.2')) tg.showConfirm(msg, (ok) => resolve(!!ok));
    else resolve(window.confirm(msg));
  });

  // ---------- helpers ----------
  const esc =(s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
  const FILTERS = [['new', 'Новые'], ['confirmed', 'В работе'], ['delivered', 'Выполнены'], ['cancelled', 'Отменены'], ['all', 'Все']];

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
    admins: [], newAdmin: { tgId: '', name: '' }, addingAdmin: false,
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
    const headers = { 'x-tg-init-data': initData };
    if (raw) headers['content-type'] = raw.type;
    else if (body) headers['content-type'] = 'application/json';
    const res = await fetch('/api/admin' + path, {
      method,
      headers,
      body: raw || (body ? JSON.stringify(body) : undefined),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403 || res.status === 503) {
      renderLogin(res.status, data);
      throw new Error(data.error || 'Нет доступа');
    }
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

  // анимация появления — только когда сменился экран, а не при каждой перерисовке
  let lastView = '', enterTimer;
  function render() {
    if (blocked) return;
    renderNav();
    if (state.tab === 'orders') $app.innerHTML = viewOrders();
    else if (state.tab === 'products') $app.innerHTML = state.draft ? viewEditor() : viewProducts();
    else $app.innerHTML = viewSettings();
    const view = [state.tab, state.filter, state.ordersLoaded, state.productsLoaded, !!state.draft, !!state.settingsDraft].join();
    if (view !== lastView) {
      lastView = view;
      $app.classList.remove('enter');
      void $app.offsetWidth;
      $app.classList.add('enter');
      clearTimeout(enterTimer);
      enterTimer = setTimeout(() => $app.classList.remove('enter'), 700);
    }
  }

  let blocked = false;
  function renderLogin(status, data) {
    blocked = true;
    $nav.innerHTML = '';
    let msg;
    if (status === 403) {
      msg = `<p><b>Нет доступа к админке.</b></p>
        <p>Ваш Telegram ID: <b class="tg-id">${esc(data.tgId)}</b></p>
        <p>Отправьте этот ID владельцу магазина — он добавит вас в разделе «Настройки → Администраторы». После этого просто откройте админку снова.</p>`;
    } else if (status === 503) {
      msg = `<p>${esc(data.error || 'Админка ещё не настроена.')}</p>`;
    } else if (!initData) {
      msg = `<p><b>Откройте админку кнопкой «Открыть админку» в боте.</b></p><p>Вход происходит автоматически по вашему Telegram-аккаунту — пароль не нужен. Обычная ссылка в браузере вход не передаёт.</p>`;
    } else {
      // сервер объясняет причину: подпись не совпала, вход устарел и т.п.
      msg = `<p><b>Не удалось войти.</b></p><p>${esc(data.error || 'Закройте и снова откройте админку из бота.')}</p>`;
    }
    $app.innerHTML = `<div class="adm-empty">${msg}</div>`;
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
    const b = (status, label, cls) => `<button class="${cls}" data-act="status" data-id="${o.id}" data-v="${status}">${label}</button>`;
    if (o.status === 'new') return b('cancelled', 'Отменить', 'btn-line') + b('confirmed', 'Подтвердить', 'btn-main');
    if (o.status === 'confirmed') return b('cancelled', 'Отменить', 'btn-line') + b('delivered', 'Выполнен', 'btn-main');
    return b('new', 'Вернуть в новые', 'btn-line');
  }

  function orderCard(o) {
    const tel = o.phone.replace(/\s/g, '');
    const tg = o.tg_user
      ? o.tg_user.username
        ? `<a href="https://t.me/${esc(o.tg_user.username)}" target="_blank" rel="noopener">@${esc(o.tg_user.username)}</a>`
        : `<span class="muted">Telegram: ${esc(o.tg_user.first_name || o.tg_user.id)}</span>`
      : '';
    return `
      <article class="o-card" data-st="${o.status}">
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
      return `<button class="${state.filter === id ? 'on' : ''}" data-act="filter" data-v="${id}">${label}${n ? `<b>${n}</b>` : ''}</button>`;
    }).join('');
    const list = !state.ordersLoaded
      ? '<div class="adm-empty">Загружаем…</div>'
      : state.orders.length
        ? state.orders.map(orderCard).join('')
        : `<div class="adm-empty">${state.filter === 'new' ? 'Новых заказов нет' : 'Здесь пока пусто'}</div>`;
    return `
      <div class="adm-title"><h1>Заказы</h1></div>
      <div class="seg">${chips}</div>
      <div class="o-list">${list}</div>`;
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
    const rows = list.map((p) => `
        <button class="p-row ${p.active ? '' : 'p-off'}" data-act="edit" data-id="${p.id}">
          <span class="p-thumb">${pic(p.colors[0] && p.colors[0].photo, 48, 60)}</span>
          <span class="p-main">
            <b>${esc(p.name.ru)}</b>
            <small>${CATS[p.cat] || ''}</small>
          </span>
          <span class="p-side">
            <span class="p-price">${money(p.price)}</span>
            ${p.active ? '' : '<span class="tag">Скрыт</span>'}
          </span>
        </button>`).join('');
    return `
      <div class="adm-title"><h1>Товары</h1><button class="btn-sm" data-act="new">Добавить</button></div>
      <label class="search ic"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg><input id="pq" type="search" placeholder="Поиск" value="${esc(state.query)}" autocomplete="off"></label>
      ${!state.productsLoaded ? '<div class="adm-empty">Загружаем…</div>' : list.length ? `<div class="p-list">${rows}</div>` : '<div class="adm-empty">Ничего не найдено</div>'}`;
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

  async function closeEditor(force) {
    if (!force && state.dirty && !(await ask('Изменения не сохранены. Выйти без сохранения?'))) return;
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
        ${photoTile('draft', `colors.${i}.photo`, c.photo)}
        <div class="color-fields">
          <div class="f-2">${field('Цвет RU', `colors.${i}.ru`, 'maxlength="40" placeholder="Чёрный"')}${field('Цвет UZ', `colors.${i}.uz`, 'maxlength="40" placeholder="Qora"')}</div>
          <div class="color-tools">
            <input type="color" data-bind="colors.${i}.hex" value="${esc(c.hex)}" aria-label="Оттенок цвета">
            ${d.colors.length > 1 ? `<button class="link danger" data-act="rm-color" data-i="${i}">Убрать</button>` : ''}
          </div>
        </div>
      </div>`).join('');

    const extra = d.photos.map((src, i) => photoTile('draft', `photos.${i}`, src, { removable: true })).join('');
    const addingExtra = state.uploading['draft:photos'];
    return `
      <div class="adm-title sub"><button class="back" data-act="close" aria-label="Назад"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button><h1>${state.draftId ? 'Товар' : 'Новый товар'}</h1></div>

      <section class="form-sec">
        <h2>Основное</h2>
        ${field('Название RU', 'name.ru', 'maxlength="120" placeholder="Платье макси"')}
        ${field('Название UZ', 'name.uz', 'maxlength="120" placeholder="Maksi ko‘ylak"')}
        <label class="f"><span>Категория</span><select data-bind="cat">${Object.entries(CATS).map(([v, l]) => `<option value="${v}" ${d.cat === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <div class="f-2">
          ${field('Цена, сум', 'price', 'inputmode="numeric" placeholder="459000"')}
          ${field('Старая цена', 'oldPrice', 'inputmode="numeric" placeholder="—"')}
        </div>
        <div class="check"><span>Новинка</span><button class="switch ${d.tags.includes('new') ? 'on' : ''}" data-act="tag-new" aria-label="Новинка" aria-pressed="${d.tags.includes('new')}"></button></div>
        <div class="check"><span>Показывать в магазине</span><button class="switch ${d.active ? 'on' : ''}" data-act="draft-active" aria-label="Показывать в магазине" aria-pressed="${d.active}"></button></div>
      </section>

      <section class="form-sec">
        <h2>Цвета</h2>
        ${colorRows}
        <button class="link" data-act="add-color">Добавить цвет</button>
      </section>

      <section class="form-sec">
        <h2>Фото</h2>
        <div class="tiles">${extra}${addingExtra ? '<div class="tile loading"></div>' : ''}<button class="tile add" data-act="upload" data-scope="draft" data-path="photos" data-push="1" aria-label="Добавить фото">+</button></div>
      </section>

      <section class="form-sec">
        <h2>Размеры</h2>
        <label class="f"><span>Через запятую</span><input data-bind="sizesText" value="${esc(d.sizesText)}" placeholder="S, M, L, XL"></label>
      </section>

      <section class="form-sec">
        <h2>Описание</h2>
        ${area('RU', 'desc.ru')}
        ${area('UZ', 'desc.uz')}
      </section>

      ${state.draftId ? '<button class="link danger del" data-act="delete">Удалить товар</button>' : ''}

      <div class="save-bar"><div>
        <button class="btn-main" data-act="save" ${state.saving ? 'disabled' : ''}>${state.saving ? 'Сохраняем…' : 'Сохранить'}</button>
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

  // ---------- настройки ----------
  async function loadSettings() {
    try {
      const [{ settings }, me, { admins }] = await Promise.all([api('/settings'), api('/me'), api('/admins')]);
      state.settings = settings;
      state.me = me;
      state.admins = admins;
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
    return `
      <div class="adm-title"><h1>Настройки</h1></div>

      <section class="form-sec">
        <h2>Доставка</h2>
        <div class="f-2">${sf('Стоимость, сум', 'deliveryFee', 'inputmode="numeric"')}${sf('Бесплатно от, сум', 'freeFrom', 'inputmode="numeric"')}</div>
      </section>

      <section class="form-sec">
        <h2>Самовывоз</h2>
        ${sf('Адрес RU', 'pickupPoint.ru', 'maxlength="120"')}
        ${sf('Адрес UZ', 'pickupPoint.uz', 'maxlength="120"')}
        <div class="f-2">${sf('Часы RU', 'pickupHours.ru', 'maxlength="80"')}${sf('Часы UZ', 'pickupHours.uz', 'maxlength="80"')}</div>
      </section>

      <section class="form-sec">
        <h2>Баннер</h2>
        ${photoTile('settings', 'banner', s.banner, { cls: 'wide', w: 560, h: 320 })}
      </section>

      <div class="save-inline"><button class="btn-main" data-act="save-settings" ${state.saving ? 'disabled' : ''}>${state.saving ? 'Сохраняем…' : 'Сохранить'}</button></div>

      ${viewAdmins()}`;
  }

  // ---------- администраторы ----------
  function viewAdmins() {
    const me = state.me || {};
    const isOwner = me.role === 'owner';
    const bell = '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 004 0"/></svg>';
    const rows = (state.admins || []).map((a) => {
      const self = a.tg_id === String(me.id);
      const title = a.name || (a.username ? '@' + a.username : 'ID ' + a.tg_id);
      const canToggle = isOwner || self;
      const canRemove = isOwner && a.role !== 'owner';
      return `
        <div class="adm-row">
          <div class="adm-main">
            <b>${esc(title)}</b>
            <small>${a.role === 'owner' ? 'Владелец' : 'Администратор'}${self ? ' · вы' : ''}</small>
          </div>
          <button class="icon-btn ${a.notify ? 'on' : ''}" data-act="adm-notify" data-id="${esc(a.tg_id)}" aria-label="Заказы в Telegram" title="Заказы в Telegram" aria-pressed="${a.notify}" ${canToggle ? '' : 'disabled'}>${bell}</button>
          ${canRemove ? `<button class="icon-btn" data-act="adm-rm" data-id="${esc(a.tg_id)}" aria-label="Убрать" title="Убрать"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : ''}
        </div>`;
    }).join('');
    const nd = state.newAdmin;
    const form = isOwner ? `
      <div class="adm-add">
        <div class="f-2">
          <label class="f"><span>Telegram ID</span><input data-abind="tgId" value="${esc(nd.tgId)}" inputmode="numeric" placeholder="7567850330"></label>
          <label class="f"><span>Имя</span><input data-abind="name" value="${esc(nd.name)}" maxlength="60" placeholder="Дилноза"></label>
        </div>
        <button class="btn-line" data-act="adm-add" ${state.addingAdmin ? 'disabled' : ''}>${state.addingAdmin ? 'Добавляем…' : 'Добавить администратора'}</button>
      </div>` : '';
    return `
      <section class="form-sec">
        <h2>Администраторы</h2>
        <div class="adm-list">${rows}</div>
        ${form}
      </section>`;
  }

  async function reloadAdmins() {
    const [{ admins }, me] = await Promise.all([api('/admins'), api('/me')]);
    state.admins = admins;
    state.me = me;
    render();
  }

  async function addAdmin() {
    if (state.addingAdmin) return;
    state.addingAdmin = true;
    render();
    try {
      const { notified } = await api('/admins', { method: 'POST', body: state.newAdmin });
      state.newAdmin = { tgId: '', name: '' };
      toast(notified ? 'Администратор добавлен, бот отправил ему кнопку входа' : 'Администратор добавлен. Пусть откроет админку из бота');
      await reloadAdmins();
    } catch (e) {
      toast(e.message, true);
    }
    state.addingAdmin = false;
    render();
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
        if (state.tab === 'products' && state.draft && state.dirty && !(await ask('Изменения не сохранены. Уйти без сохранения?'))) return;
        state.tab = d.v;
        state.draft = null;
        render();
        if (d.v === 'orders') loadOrders();
        if (d.v === 'products' && !state.productsLoaded) loadProducts();
        if (d.v === 'settings') loadSettings();
        break;
      case 'filter': state.filter = d.v; state.ordersLoaded = false; render(); loadOrders(); break;
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
        if (!(await ask('Удалить товар безвозвратно? Можно вместо этого скрыть его из магазина.'))) return;
        try {
          await api('/products/' + state.draftId, { method: 'DELETE' });
          toast('Товар удалён');
          closeEditor(true);
          loadProducts();
        } catch (e) { toast(e.message, true); }
        break;
      case 'tag-new': state.draft.tags = state.draft.tags.includes('new') ? [] : ['new']; state.dirty = true; render(); break;
      case 'draft-active': state.draft.active = !state.draft.active; state.dirty = true; render(); break;
      case 'add-color': state.draft.colors.push({ hex: '#c8a77c', ru: '', uz: '', photo: '' }); state.dirty = true; render(); break;
      case 'rm-color': state.draft.colors.splice(Number(d.i), 1); state.dirty = true; render(); break;
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
      case 'adm-add': addAdmin(); break;
      case 'adm-notify': {
        const a = state.admins.find((x) => x.tg_id === d.id);
        a.notify = !a.notify;
        render();
        try {
          await api('/admins/' + encodeURIComponent(d.id), { method: 'PATCH', body: { notify: a.notify } });
          await reloadAdmins();
        } catch (e) { a.notify = !a.notify; render(); toast(e.message, true); }
        break;
      }
      case 'adm-rm':
        if (!(await ask('Убрать администратора? Он больше не сможет открыть админку и получать заказы.'))) return;
        try {
          await api('/admins/' + encodeURIComponent(d.id), { method: 'DELETE' });
          toast('Администратор убран');
          await reloadAdmins();
        } catch (e) { toast(e.message, true); }
        break;
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
    if (el.dataset.abind) state.newAdmin[el.dataset.abind] = el.value;
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
    document.getElementById('me').textContent = me.name || 'админ-панель';
    loadOrders();
  }).catch(() => {});
})();
