(function () {
  'use strict';

  const S = window.STORE;
  const I18N = window.I18N;
  const tg = window.Telegram && window.Telegram.WebApp;
  // initData пуст при запуске с reply-кнопки бота, поэтому смотрим и на platform ('unknown' вне Telegram)
  const inTG = !!(tg && (tg.initData || (tg.platform && tg.platform !== 'unknown')));
  // BackButton и HapticFeedback появились в Bot API 6.1; на более старых клиентах — свои кнопки «назад»
  const nativeBack = inTG && tg.isVersionAtLeast('6.1');

  // Цвета бренда для нативных элементов Telegram (шапка, фон, главная кнопка)
  const BRAND = { bg: '#fbf6ec', button: '#b8892b', buttonText: '#ffffff' };
  const MAX_QTY = 99;

  // ---------- storage ----------
  // Свой префикс: localStorage общий для всего домена (например, всех сайтов на github.io)
  const ls = {
    get(k, d) {
      try { const v = localStorage.getItem('layan:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem('layan:' + k, JSON.stringify(v)); } catch (e) { /* приватный режим */ }
    },
  };

  const user = inTG && tg.initDataUnsafe ? tg.initDataUnsafe.user : null;

  const state = {
    lang: ls.get('lang', user && user.language_code === 'uz' ? 'uz' : 'ru'),
    view: 'home',
    params: {},
    stack: [],
    cat: 'all',
    query: '',
    cart: ls.get('cart', []),
    favs: ls.get('favs', []),
    sel: null,
    form: {
      name: user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : '',
      phone: '', method: 'delivery', address: '', pay: 'cash', comment: '',
    },
    errors: {},
    order: null,
  };

  const $app = document.getElementById('app');
  const $tabbar = document.getElementById('tabbar');
  const $fb = document.getElementById('fallback-main');
  const $fbBtn = document.getElementById('fallback-main-btn');
  const $toast = document.getElementById('toast');

  // ---------- helpers ----------
  const t = (k) => I18N[state.lang][k] ?? I18N.ru[k] ?? k;
  const L = (o) => (o && typeof o === 'object' ? o[state.lang] ?? o.ru : o);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ' + L(S.currency);
  const product = (id) => S.products.find((p) => p.id === id);
  const discount = (p) => (p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0);

  // Поиск без учёта регистра, «ё» и разных апострофов узбекской латиницы (o' / oʻ / o‘ / o’)
  const norm = (s) => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[‘’ʻʼ`´]/g, "'");

  function countLabel(n) {
    if (state.lang === 'uz') return n + ' ta mahsulot';
    const m10 = n % 10, m100 = n % 100;
    const w = m10 === 1 && m100 !== 11 ? 'товар' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'товара' : 'товаров';
    return n + ' ' + w;
  }

  const saveCart = () => ls.set('cart', state.cart);
  const cartCount = () => state.cart.reduce((s, i) => s + i.qty, 0);
  const cartSum = () => state.cart.reduce((s, i) => s + product(i.id).price * i.qty, 0);
  const deliveryFee = () => (state.form.method === 'pickup' || cartSum() >= S.delivery.freeFrom ? 0 : S.delivery.fee);

  // Местные 9 цифр номера (без кода страны 998) из текущего значения поля
  function localDigits(v) {
    let d;
    const m = /^\s*\+(\d*)/.exec(v);
    if (m) {
      // цифры, набранные в префиксе сверх 998, — начало местного номера;
      // если префикс повреждён (стёрли цифру), он просто восстановится
      d = (m[1].startsWith('998') ? m[1].slice(3) : '') + v.slice(m[0].length).replace(/\D/g, '');
    } else {
      d = v.replace(/\D/g, '');
    }
    if (d.length > 9 && d.startsWith('998')) d = d.slice(3); // вставили полный номер с кодом страны
    return d.slice(0, 9);
  }

  const groupPhone = (d) => '+998 ' + [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');

  // Переформатирует телефон, сохраняя позицию курсора относительно местных цифр
  function formatPhoneInput(el, inputType, prev) {
    const raw = el.value;
    const caret = el.selectionStart ?? raw.length;
    let d = localDigits(raw);
    let before = Math.min(localDigits(raw.slice(0, caret)).length, d.length);
    // Backspace/Delete по пробелу не меняет цифры — тогда удаляем соседнюю цифру
    if (d === localDigits(prev || '')) {
      if (inputType === 'deleteContentBackward' && before > 0) { d = d.slice(0, before - 1) + d.slice(before); before--; }
      else if (inputType === 'deleteContentForward' && before < d.length) d = d.slice(0, before) + d.slice(before + 1);
    }
    const out = groupPhone(d);
    el.value = out;
    if (document.activeElement !== el) return out;
    let pos = 5, seen = 0;
    for (let i = 5; i < out.length && seen < before; i++) if (/\d/.test(out[i]) && ++seen === before) pos = i + 1;
    el.setSelectionRange(pos, pos);
    return out;
  }

  // ---------- photos ----------
  // ID фото Unsplash превращается в ссылку нужного размера; полный путь/ссылка используется как есть.
  // crop: 'faces' — кадрировать по лицам (категории с людьми)
  function photoUrl(src, w, h, crop) {
    if (/[/.]/.test(src)) return src;
    const dpr = Math.min(2, Math.ceil(window.devicePixelRatio || 1));
    const c = crop === 'faces' ? '&crop=faces,center' : '';
    return `https://images.unsplash.com/photo-${src}?w=${w * dpr}&h=${h * dpr}&fit=crop${c}&auto=format&q=70`;
  }

  // Фото выбранного цвета идёт первым, затем общие фото товара
  function gallery(p, ci) {
    const main = (p.colors[ci] || p.colors[0]).photo;
    return [...new Set([main, ...(p.photos || [])].filter(Boolean))];
  }

  // opts: { crop, eager } — eager для картинок первого экрана (баннер, главное фото товара)
  function img(src, w, h, cls = '', alt = '', opts = {}) {
    if (!src) return `<span class="${cls} ld" role="img" aria-label="${esc(alt)}"></span>`;
    return `<img class="${cls}" src="${photoUrl(src, w, h, opts.crop)}" alt="${esc(alt)}" loading="${opts.eager ? 'eager' : 'lazy'}" decoding="async" onload="this.classList.add('ld')">`;
  }

  // ---------- Telegram ----------
  function haptic(kind) {
    if (!nativeBack || !tg.HapticFeedback) return;
    try {
      if (kind === 'success' || kind === 'error' || kind === 'warning') tg.HapticFeedback.notificationOccurred(kind);
      else if (kind === 'select') tg.HapticFeedback.selectionChanged();
      else tg.HapticFeedback.impactOccurred(kind || 'light');
    } catch (e) { /* старый клиент */ }
  }

  function ask(msg, cb) {
    if (inTG && tg.isVersionAtLeast('6.2')) tg.showConfirm(msg, (ok) => ok && cb());
    else if (window.confirm(msg)) cb();
  }

  // Главная кнопка: в Telegram — нативная MainButton в золоте бренда, в браузере — своя кнопка внизу.
  // amount выводится отдельно, чтобы на узком экране обрезалась подпись, а не сумма.
  let mainHandler = null;
  let mainLockUntil = 0; // после смены действия кнопки второй тап двойного нажатия не должен сработать
  function setMain(label, fn, amount) {
    mainHandler = fn;
    if (inTG) {
      const text = amount ? `${label} · ${amount}` : label;
      tg.MainButton.setParams({ text, color: BRAND.button, text_color: BRAND.buttonText, is_active: true, is_visible: true });
    } else {
      $fbBtn.innerHTML = `<span class="mb-label">${esc(label)}</span>${amount ? `<span class="mb-amount">·&nbsp;${esc(amount)}</span>` : ''}`;
      $fb.hidden = false;
      document.body.classList.add('has-main');
    }
  }
  const lockMain = () => { mainLockUntil = Date.now() + 450; };
  function pressMain() {
    if (Date.now() < mainLockUntil || !mainHandler) return;
    mainHandler();
  }
  function hideMain() {
    mainHandler = null;
    if (inTG) tg.MainButton.hide();
    else {
      $fb.hidden = true;
      document.body.classList.remove('has-main');
    }
  }

  function syncBack() {
    if (!nativeBack) return;
    if (state.stack.length) tg.BackButton.show();
    else tg.BackButton.hide();
  }

  let toastTimer;
  function hideToast() {
    clearTimeout(toastTimer);
    $toast.classList.remove('show');
  }
  function toast(msg, kind = 'ok') {
    $toast.innerHTML = `<span class="toast-ic ${kind}">${kind === 'ok' ? I.check : '!'}</span><span>${esc(msg)}</span>`;
    $toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $toast.classList.remove('show'), 2000);
  }

  // ---------- icons ----------
  const I = {
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/></svg>',
    shop: '<svg viewBox="0 0 24 24"><path d="M4 9.5l1.6-5h12.8L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5 12v7.5h14V12"/></svg>',
    bag: '<svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    truck: '<svg viewBox="0 0 24 24"><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>',
    shirt: '<svg viewBox="0 0 24 24"><path d="M8.5 4L4 6l-2 5 3 1.2 1-2V20h12v-9.8l1 2 3-1.2-2-5-4.5-2a3.5 3.5 0 0 1-7 0z"/></svg>',
    swap: '<svg viewBox="0 0 24 24"><path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/></svg>',
    store: '<svg viewBox="0 0 24 24"><path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9.5 20v-5h5v5"/></svg>',
    cash: '<svg viewBox="0 0 24 24"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/></svg>',
    card: '<svg viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6 15h4"/></svg>',
  };

  const isq = (icon) => `<span class="isq">${icon}</span>`;

  // ---------- shared blocks ----------
  const section = (header, body, footer = '', cls = '') => `
    ${header ? `<div class="sec-h">${header}</div>` : ''}
    <div class="sec ${cls}">${body}</div>
    ${footer ? `<div class="sec-f">${footer}</div>` : ''}`;

  const backBtn = (cls) => `<button class="${cls} ic" data-action="back" aria-label="${esc(t('back'))}">${I.back}</button>`;

  const pageHead = (title, right = '') => `
    <header class="page-head">
      ${!nativeBack && state.stack.length ? backBtn('back') : ''}
      <h1>${title}</h1>${right}
    </header>`;

  const empty = (icon, title, hint, cta = true) => `
    <div class="empty">
      <div class="empty-ic ic">${icon}</div>
      <b>${title}</b>
      ${hint ? `<p>${hint}</p>` : ''}
      ${cta ? `<button class="btn" data-action="tab" data-tab="home">${t('toCatalog')}</button>` : ''}
    </div>`;

  const favBtn = (p, cls = '') =>
    `<button class="fav ic ${cls} ${state.favs.includes(p.id) ? 'on' : ''}" data-action="fav" data-id="${p.id}" aria-label="${esc(t('favs'))}" aria-pressed="${state.favs.includes(p.id)}">${I.heart}</button>`;

  function card(p) {
    const d = discount(p);
    const badge = d ? `<span class="pill sale">−${d}%</span>` : p.tags && p.tags.includes('new') ? `<span class="pill">${t('new')}</span>` : '';
    return `
      <article class="card">
        <button class="card-open" data-action="open" data-id="${p.id}" aria-label="${esc(L(p.name))}"></button>
        <div class="card-img">
          ${img(gallery(p, 0)[0], 240, 300, 'ph', L(p.name))}
          ${badge}
          ${favBtn(p)}
        </div>
        <div class="card-body">
          <div class="price">${money(p.price)}${p.oldPrice ? `<s>${money(p.oldPrice)}</s>` : ''}</div>
          <div class="name">${L(p.name)}</div>
          ${p.colors.length > 1 ? `<div class="dots">${p.colors.map((c) => `<i style="background:${c.hex}"></i>`).join('')}</div>` : ''}
        </div>
      </article>`;
  }

  const kv = (k, v, cls = '') => `<div class="cell kv ${cls}"><span>${k}</span><span>${v}</span></div>`;

  function summary(o) {
    const sum = o ? o.sum : cartSum();
    const fee = o ? o.fee : deliveryFee();
    const method = o ? o.method : state.form.method;
    const count = o ? o.count : cartCount();
    return [
      kv(`${t('items')} (${count})`, money(sum)),
      kv(method === 'pickup' ? t('pickup') : t('delivery'), fee ? money(fee) : `<em class="ok">${t('free')}</em>`),
      o ? kv(t('payment'), t('pay_' + o.pay)) : '',
      kv(t('total'), money(sum + fee), 'total'),
    ].join('');
  }

  // ---------- views ----------
  function filtered() {
    const q = norm(state.query.trim());
    return S.products.filter((p) => {
      if (q) return norm(`${p.name.ru} ${p.name.uz}`).includes(q);
      if (state.cat === 'all') return true;
      if (state.cat === 'sale') return !!p.oldPrice;
      return p.cat === state.cat;
    });
  }

  function listBlock() {
    const list = filtered();
    const title = state.query.trim() ? t('results') : state.cat === 'all' ? t('allProducts') : L(S.categories.find((c) => c.id === state.cat));
    if (!list.length) return empty(I.search, t('nothingFound'), t('nothingFoundHint'), false);
    return `
      <div class="list-head"><span>${title}</span><span>${countLabel(list.length)}</span></div>
      <div class="grid">${list.map(card).join('')}</div>`;
  }

  const catIcon = (c) =>
    c.photo ? img(c.photo, 120, 120, 'ph', '', { crop: 'faces' })
      : c.id === 'sale' ? '<span class="cat-glyph">%</span>'
        : `<img class="cat-logo" src="${S.logo.icon}" alt="">`;

  function viewHome() {
    const searching = !!state.query.trim();
    return `
      <header class="hero-head">
        <div class="seg lang">${['ru', 'uz']
          .map((l) => `<button class="${state.lang === l ? 'on' : ''}" data-action="lang" data-v="${l}">${l.toUpperCase()}</button>`)
          .join('')}</div>
        <img class="hero-logo" src="${S.logo.full}" alt="${esc(`${S.brand} — ${t('tagline')}`)}">
      </header>
      <label class="search ic">${I.search}<input id="q" type="search" enterkeyhint="search" placeholder="${esc(t('search'))}" aria-label="${esc(t('search'))}" value="${esc(state.query)}" autocomplete="off"></label>
      <div id="promo" ${searching ? 'hidden' : ''}>
        <nav class="circles">${S.categories
          .map((c) => `<button class="circle cat ${state.cat === c.id ? 'on' : ''}" data-action="cat" data-cat="${c.id}"><span class="circle-img">${catIcon(c)}</span><span>${L(c)}</span></button>`)
          .join('')}</nav>
        <button class="banner" data-action="cat" data-cat="all">
          ${img(S.banner, 560, 320, 'banner-img', '', { eager: true })}
          <span class="banner-text">
            <small>${t('bannerKicker')}</small>
            <b>${t('bannerTitle')}</b>
            <span class="banner-cta">${t('bannerCta')}</span>
          </span>
        </button>
      </div>
      <div id="list">${listBlock()}</div>`;
  }

  function viewFavs() {
    const list = S.products.filter((p) => state.favs.includes(p.id));
    return pageHead(t('favs')) + (list.length ? `<div class="grid">${list.map(card).join('')}</div>` : empty(I.heart, t('favsEmpty'), t('favsEmptyHint')));
  }

  function viewProduct() {
    const p = product(state.params.id);
    const sel = state.sel;
    const c = p.colors[sel.color];
    const d = discount(p);
    const photos = gallery(p, sel.color);

    const colorOpts = p.colors.map((x, i) => `
      <button class="color-opt ${i === sel.color ? 'on' : ''}" data-action="color" data-i="${i}" aria-pressed="${i === sel.color}">
        <span class="thumb" style="background:${x.hex}">${x.photo ? img(x.photo, 64, 80, 'ph') : ''}</span>
        <span>${L(x)}</span>
      </button>`).join('');

    return `
      <div class="gal-wrap">
        <div class="gal" id="gal">${photos.map((src, i) => img(src, 480, 600, 'ph', L(p.name), { eager: i === 0 })).join('')}</div>
        ${photos.length > 1 ? `<div class="gal-dots" id="gal-dots">${photos.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}
        ${!nativeBack ? backBtn('float-btn back') : ''}
        ${favBtn(p, 'float-btn')}
      </div>

      <div class="sec pd-info">
        <div class="pd-price">${money(p.price)}${p.oldPrice ? `<s>${money(p.oldPrice)}</s><span class="pill sale">−${d}%</span>` : ''}</div>
        <h1 class="pd-name">${L(p.name)}</h1>
        <div class="pd-sub"><i class="dot-ok"></i>${t('inStock')}</div>
      </div>

      ${section(`${t('color')}: <b>${L(c)}</b>`, `<div class="colors">${colorOpts}</div>`)}
      ${section(`${t('size')}${sel.size ? `: <b>${sel.size}</b>` : ''}`,
        `<div class="sizes" id="sizes">${p.sizes.map((s) => `<button class="sz ${s === sel.size ? 'on' : ''}" data-action="size" data-s="${esc(s)}" aria-pressed="${s === sel.size}">${s}</button>`).join('')}</div>`)}
      ${section(t('description'), `<p class="pd-desc">${L(p.desc)}</p>`)}
      ${section('', `
        <div class="cell">${isq(I.truck)}<div class="cell-main"><div class="cell-title">${t('perkDelivery')}</div><div class="cell-sub">${t('perkDeliverySub')}</div></div></div>
        <div class="cell">${isq(I.shirt)}<div class="cell-main"><div class="cell-title">${t('perkFitting')}</div><div class="cell-sub">${t('perkFittingSub')}</div></div></div>
        <div class="cell">${isq(I.swap)}<div class="cell-main"><div class="cell-title">${t('perkReturn')}</div><div class="cell-sub">${t('perkReturnSub')}</div></div></div>`,
        '', 'icons gap-top')}`;
  }

  function cartItem(it, idx) {
    const p = product(it.id);
    const c = p.colors[it.color];
    return `
      <div class="cell ci">
        <button class="ci-img" data-action="open" data-id="${p.id}" data-color="${it.color}" data-size="${esc(it.size)}" aria-label="${esc(L(p.name))}">${img(gallery(p, it.color)[0], 56, 70, 'ph', L(p.name))}</button>
        <div class="cell-main">
          <div class="ci-name">${L(p.name)}</div>
          <div class="cell-sub">${L(c)} · ${it.size}</div>
          <div class="ci-row">
            <span class="ci-price">${money(p.price * it.qty)}</span>
            <span class="stepper">
              <button class="ic ${it.qty === 1 ? 'del' : ''}" data-action="dec" data-idx="${idx}" aria-label="−">${it.qty === 1 ? I.trash : I.minus}</button>
              <span>${it.qty}</span>
              <button class="ic" data-action="inc" data-idx="${idx}" aria-label="+" ${it.qty >= MAX_QTY ? 'disabled' : ''}>${I.plus}</button>
            </span>
          </div>
        </div>
      </div>`;
  }

  function viewCart() {
    if (!state.cart.length) return pageHead(t('cart')) + empty(I.bag, t('cartEmpty'), t('cartEmptyHint'));
    const sum = cartSum();
    const left = S.delivery.freeFrom - sum;
    const hint = left > 0
      ? `<div class="bar"><i style="width:${Math.min(100, (sum / S.delivery.freeFrom) * 100)}%"></i></div>${t('freeLeft').replace('{x}', `<b>${money(left)}</b>`)}`
      : t('freeOk');
    return `
      ${pageHead(t('cart'), `<button class="link" data-action="clear">${t('clear')}</button>`)}
      ${section('', state.cart.map(cartItem).join(''), state.form.method === 'pickup' ? '' : hint, 'thumbs')}
      ${section(t('total'), summary())}`;
  }

  function viewCheckout() {
    const f = state.form, e = state.errors;
    const input = (key, label, ph, attrs = '') => `
      <label class="cell field ${e[key] ? 'err' : ''}">
        ${label ? `<span class="field-label">${label}</span>` : ''}
        <input data-field="${key}" value="${esc(f[key])}" placeholder="${esc(ph)}" aria-label="${esc(label || ph)}" aria-invalid="${!!e[key]}" ${attrs}>
      </label>`;
    const option = (action, value, current, icon, title, sub) => `
      <button class="cell opt" data-action="${action}" data-v="${value}" aria-pressed="${value === current}">
        ${isq(icon)}
        <span class="cell-main"><span class="cell-title">${title}</span><span class="cell-sub">${sub}</span></span>
        <span class="tick ic ${value === current ? 'on' : ''}">${I.check}</span>
      </button>`;
    const fee = cartSum() >= S.delivery.freeFrom ? t('free') : money(S.delivery.fee);

    return `
      ${pageHead(t('checkoutTitle'))}
      ${section(t('contacts'),
        input('name', t('name'), t('namePh'), 'autocomplete="name" maxlength="60"') +
        input('phone', t('phone'), '+998 90 123 45 67', 'type="tel" inputmode="tel" autocomplete="tel"'))}

      ${section(t('receive'),
        option('method', 'delivery', f.method, I.truck, `${t('delivery')} · ${fee}`, t('deliverySub')) +
        option('method', 'pickup', f.method, I.store, `${t('pickup')} · ${t('free')}`, `${t('pickupPoint')}, ${t('pickupHours')}`),
        '', 'icons')}

      ${f.method === 'delivery' ? section(t('address'), input('address', '', t('addressPh'), 'autocomplete="street-address" maxlength="200"')) : ''}

      ${section(t('payment'),
        option('pay', 'cash', f.pay, I.cash, t('pay_cash'), t('pay_cashSub')) +
        option('pay', 'card', f.pay, I.card, t('pay_card'), t('pay_cardSub')),
        t('payHint'), 'icons')}

      ${section(t('comment'), `<label class="cell field"><textarea data-field="comment" rows="2" maxlength="500" placeholder="${esc(t('commentPh'))}" aria-label="${esc(t('comment'))}">${esc(f.comment)}</textarea></label>`)}

      ${section(t('yourOrder'), summary(), t('demoNote'))}`;
  }

  function viewSuccess() {
    const o = state.order;
    return `
      <div class="success">
        <div class="done-ic ic">${I.check}</div>
        <h1>${t('orderDone')}</h1>
        <p class="order-no">${t('orderNo')} <b>#${o.no}</b></p>
        <p>${t('orderHint')}</p>
      </div>
      ${section(t('yourOrder'), summary(o))}`;
  }

  // ---------- render ----------
  const TABS = ['home', 'favs', 'cart'];
  const VIEWS = { home: viewHome, favs: viewFavs, product: viewProduct, cart: viewCart, checkout: viewCheckout, success: viewSuccess };

  function renderTabbar() {
    const show = TABS.includes(state.view);
    document.body.classList.toggle('has-tabbar', show);
    if (!show) { $tabbar.innerHTML = ''; return; }
    const n = cartCount();
    const tab = (id, icon, label, badge) =>
      `<button class="tab ic ${state.view === id ? 'on' : ''}" data-action="tab" data-tab="${id}" ${state.view === id ? 'aria-current="page"' : ''}>${icon}${badge ? `<em>${badge > MAX_QTY ? MAX_QTY + '+' : badge}</em>` : ''}<span>${label}</span></button>`;
    $tabbar.innerHTML = tab('home', I.shop, t('home')) + tab('favs', I.heart, t('favs')) + tab('cart', I.bag, t('cart'), n);
  }

  function syncMain() {
    const v = state.view;
    if (v === 'product') {
      const p = product(state.params.id);
      const inCart = state.cart.some((i) => i.id === p.id && i.color === state.sel.color && i.size === state.sel.size);
      if (inCart) setMain(t('goToCart'), () => go('cart'));
      else setMain(t('addToCart'), addToCart, money(p.price));
    } else if (v === 'cart' && state.cart.length) {
      setMain(t('checkout'), () => go('checkout'), money(cartSum() + deliveryFee()));
    } else if (v === 'checkout') {
      setMain(t('confirm'), submitOrder, money(cartSum() + deliveryFee()));
    } else if (v === 'success') {
      setMain(t('backToCatalog'), () => go('home'));
    } else {
      hideMain();
    }
  }

  function bindGallery() {
    const gal = document.getElementById('gal');
    const dots = document.getElementById('gal-dots');
    if (!gal || !dots) return;
    gal.addEventListener('scroll', () => {
      const i = Math.round(gal.scrollLeft / gal.clientWidth);
      [...dots.children].forEach((d, j) => d.classList.toggle('on', i === j));
    }, { passive: true });
  }

  function render() {
    document.documentElement.lang = state.lang;
    if ($app.dataset.view !== state.view) {
      hideToast(); // уведомление не переносим на другой экран
      lockMain(); // кнопка в том же месте сменила действие — защищаемся от двойного тапа
    }
    $app.dataset.view = state.view;
    $app.innerHTML = VIEWS[state.view]();
    if (state.view === 'product') bindGallery();
    renderTabbar();
    syncMain();
    syncBack();
  }

  function animateEnter() {
    $app.classList.remove('enter');
    void $app.offsetWidth;
    $app.classList.add('enter');
  }

  // ---------- история браузера (только вне Telegram) ----------
  // Каждому экрану в стеке соответствует запись history, чтобы системная кнопка «Назад»
  // возвращала на предыдущий экран. При сбросе стека (вкладки, успешный заказ) лишние записи сматываются.
  let unwinding = false;   // ждём popstate от history.go(-n)
  let pendingPushes = 0;   // переходы, сделанные пока история сматывалась
  let backPending = false; // history.back() уже вызван, второй тап игнорируем

  function histPush() {
    if (inTG) return;
    if (unwinding) pendingPushes++;
    else history.pushState({ layan: true }, '');
  }
  function histUnwind(n) {
    if (inTG || n <= 0) return;
    if (unwinding) { pendingPushes = Math.max(0, pendingPushes - n); return; }
    unwinding = true;
    history.go(-n);
  }

  function go(view, params = {}) {
    if (view === 'product' && !product(params.id)) return;
    if (TABS.includes(view) || view === 'success') {
      histUnwind(state.stack.length);
      state.stack = [];
    } else {
      state.stack.push({ view: state.view, params: state.params, y: window.scrollY });
      histPush();
    }
    if (view === 'product') {
      const p = product(params.id);
      // из корзины товар открывается с тем же цветом и размером, что в корзине
      const color = p.colors[params.color] ? params.color : 0;
      const size = p.sizes.includes(params.size) ? params.size : p.sizes.length === 1 ? p.sizes[0] : null;
      state.sel = { color, size };
    }
    if (view === 'checkout') state.errors = {};
    state.view = view;
    state.params = params;
    render();
    animateEnter();
    window.scrollTo(0, 0);
  }

  function back() {
    const prev = state.stack.pop();
    if (!prev) return;
    state.view = prev.view;
    state.params = prev.params;
    render();
    animateEnter();
    window.scrollTo(0, prev.y || 0);
  }

  // Кнопка «назад» в интерфейсе: в браузере идём через историю, чтобы она не расходилась со стеком экранов
  function navBack() {
    if (inTG || !state.stack.length) { back(); return; }
    if (backPending || unwinding) return;
    backPending = true;
    history.back();
  }

  function onPopState() {
    if (inTG) return;
    if (unwinding) {
      unwinding = false;
      for (; pendingPushes > 0; pendingPushes--) history.pushState({ layan: true }, '');
      return;
    }
    backPending = false;
    back();
  }

  // ---------- actions ----------
  function addToCart() {
    const p = product(state.params.id);
    const sel = state.sel;
    if (!sel.size) {
      haptic('error');
      toast(t('pickSize'), 'warn');
      const el = document.getElementById('sizes');
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const ex = state.cart.find((i) => i.id === p.id && i.color === sel.color && i.size === sel.size);
    if (ex) ex.qty = Math.min(MAX_QTY, ex.qty + 1);
    else state.cart.push({ id: p.id, color: sel.color, size: sel.size, qty: 1 });
    saveCart();
    haptic('success');
    toast(t('added'));
    syncMain();
    lockMain(); // кнопка стала «Перейти в корзину»
  }

  function toggleFav(id) {
    const i = state.favs.indexOf(id);
    if (i >= 0) state.favs.splice(i, 1);
    else state.favs.push(id);
    ls.set('favs', state.favs);
    haptic('light');
    if (state.view === 'favs') { render(); return; }
    document.querySelectorAll(`.fav[data-id="${id}"]`).forEach((b) => {
      b.classList.toggle('on', i < 0);
      b.setAttribute('aria-pressed', String(i < 0));
    });
  }

  function setCat(id) {
    state.query = '';
    state.cat = id;
    haptic('select');
    if (state.view !== 'home') { go('home'); return; }
    document.querySelectorAll('.cat').forEach((c) => c.classList.toggle('on', c.dataset.cat === id));
    document.getElementById('list').innerHTML = listBlock();
    const head = document.querySelector('.list-head');
    if (head) head.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function selectColor(i) {
    state.sel.color = i;
    haptic('select');
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }

  function submitOrder() {
    const f = state.form, e = {};
    if (f.name.trim().length < 2) e.name = 1;
    if (f.phone.replace(/\D/g, '').length !== 12) e.phone = 1;
    if (f.method === 'delivery' && f.address.trim().length < 5) e.address = 1;
    state.errors = e;
    if (Object.keys(e).length) {
      haptic('error');
      toast(t('fillRequired'), 'warn');
      render();
      const first = document.querySelector('.field.err');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    state.order = {
      no: 1000 + Math.floor(Math.random() * 9000),
      sum: cartSum(), fee: deliveryFee(), count: cartCount(),
      method: f.method, pay: f.pay,
    };
    ls.set('form', { name: f.name.trim(), phone: f.phone, address: f.address.trim() });
    state.form.comment = ''; // комментарий относится только к этому заказу
    state.cart = [];
    saveCart();
    haptic('success');
    go('success');
  }

  // ---------- events ----------
  // После удаления строки корзины под пальцем оказывается кнопка следующей — гасим второй тап двойного нажатия
  let cartTapLockUntil = 0;

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const d = el.dataset;
    if ((d.action === 'inc' || d.action === 'dec') && Date.now() < cartTapLockUntil) return;
    switch (d.action) {
      case 'open':
        haptic('light');
        go('product', { id: d.id, color: d.color != null ? +d.color : undefined, size: d.size });
        break;
      case 'fav': toggleFav(d.id); break;
      case 'cat': setCat(d.cat); break;
      case 'tab': if (state.view !== d.tab) { haptic('select'); go(d.tab); } break;
      case 'back': navBack(); break;
      case 'lang': state.lang = d.v; ls.set('lang', d.v); haptic('select'); render(); break;
      case 'color': selectColor(+d.i); break;
      case 'size': state.sel.size = d.s; haptic('select'); render(); break;
      case 'inc': {
        const it = state.cart[+d.idx];
        if (!it) break;
        it.qty = Math.min(MAX_QTY, it.qty + 1);
        saveCart(); haptic('light'); render();
        break;
      }
      case 'dec': {
        const it = state.cart[+d.idx];
        if (!it) break;
        if (it.qty > 1) it.qty--;
        else { state.cart.splice(+d.idx, 1); cartTapLockUntil = Date.now() + 400; }
        saveCart(); haptic('light'); render();
        break;
      }
      case 'clear': ask(t('clearConfirm'), () => { state.cart = []; saveCart(); haptic('warning'); render(); }); break;
      case 'method': state.form.method = d.v; haptic('select'); render(); break;
      case 'pay': state.form.pay = d.v; haptic('select'); render(); break;
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') ev.target.blur();
  });

  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.id === 'q') {
      state.query = el.value;
      document.getElementById('promo').hidden = !!el.value.trim();
      document.getElementById('list').innerHTML = listBlock();
      return;
    }
    const key = el.dataset.field;
    if (!key) return;
    state.form[key] = key === 'phone' ? formatPhoneInput(el, ev.inputType, state.form.phone) : el.value;
    if (state.errors[key]) {
      delete state.errors[key];
      el.closest('.field').classList.remove('err');
      el.setAttribute('aria-invalid', 'false');
    }
  });

  document.addEventListener('focusin', (ev) => {
    const el = ev.target;
    if (el.dataset && el.dataset.field === 'phone' && !el.value) el.value = state.form.phone = '+998 ';
  });

  window.addEventListener('popstate', onPopState);

  // ---------- init ----------
  // Данные из localStorage могли остаться от старой версии каталога — оставляем только валидное
  state.cart = (Array.isArray(state.cart) ? state.cart : []).filter((i) => {
    const p = i && product(i.id);
    return p && p.colors[i.color] && p.sizes.includes(i.size) && Number.isInteger(i.qty) && i.qty > 0;
  }).map((i) => ({ ...i, qty: Math.min(MAX_QTY, i.qty) }));
  state.favs = (Array.isArray(state.favs) ? state.favs : []).filter((id) => product(id));
  if (!I18N[state.lang]) state.lang = 'ru';
  const saved = ls.get('form', {});
  ['name', 'phone', 'address'].forEach((k) => { if (saved && typeof saved[k] === 'string' && saved[k]) state.form[k] = saved[k]; });

  $fbBtn.addEventListener('click', pressMain);

  if (inTG) {
    tg.ready();
    tg.expand();
    try {
      if (tg.isVersionAtLeast('6.1')) tg.setBackgroundColor(BRAND.bg);
      if (tg.isVersionAtLeast('6.9')) tg.setHeaderColor(BRAND.bg); // hex в шапке — только с 6.9
      if (tg.isVersionAtLeast('7.10')) tg.setBottomBarColor(BRAND.bg);
      if (tg.isVersionAtLeast('7.7')) tg.disableVerticalSwipes();
    } catch (e) { /* старый клиент */ }
    tg.MainButton.onClick(pressMain);
    if (nativeBack) tg.BackButton.onClick(back);
  }

  render();
})();
