(function () {
  'use strict';

  const S = window.STORE;
  const I18N = window.I18N;
  const tg = window.Telegram && window.Telegram.WebApp;
  const inTG = !!(tg && tg.initData);

  // ---------- storage ----------
  const ls = {
    get(k, d) {
      try { const v = localStorage.getItem('shop:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem('shop:' + k, JSON.stringify(v)); } catch (e) { /* приватный режим */ }
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
  const money = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ' + L(S.currency);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const product = (id) => S.products.find((p) => p.id === id);
  const discount = (p) => (p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0);

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

  function fmtPhone(v) {
    let d = v.replace(/\D/g, '');
    if (d.startsWith('998')) d = d.slice(3);
    else if (d.length <= 3 && '998'.startsWith(d)) d = '';
    d = d.slice(0, 9);
    const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
    return '+998 ' + parts.join(' ');
  }

  // ---------- photos ----------
  // ID фото Unsplash превращается в ссылку нужного размера; полный путь/ссылка используется как есть
  function photoUrl(src, w, h) {
    if (/[/.]/.test(src)) return src;
    const dpr = Math.min(2, Math.ceil(window.devicePixelRatio || 1));
    return `https://images.unsplash.com/photo-${src}?w=${w * dpr}&h=${h * dpr}&fit=crop&auto=format&q=70`;
  }

  // Фото выбранного цвета идёт первым, затем общие фото товара
  function gallery(p, ci) {
    const main = (p.colors[ci] || p.colors[0]).photo;
    const list = [main, ...(p.photos || [])].filter(Boolean);
    return [...new Set(list)];
  }

  const img = (src, w, h, cls = '', alt = '') =>
    `<img class="${cls}" src="${photoUrl(src, w, h)}" alt="${esc(alt)}" loading="lazy" decoding="async" onload="this.classList.add('ld')">`;

  // ---------- Telegram ----------
  function haptic(kind) {
    if (!inTG || !tg.HapticFeedback) return;
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

  function applyScheme() {
    const dark = inTG ? tg.colorScheme === 'dark' : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.scheme = dark ? 'dark' : 'light';
  }

  // Главная кнопка: в Telegram — нативная MainButton (цвет из темы), в браузере — своя кнопка внизу
  let mainHandler = null;
  function setMain(text, fn) {
    mainHandler = fn;
    if (inTG) {
      tg.MainButton.setParams({ text, is_active: true, is_visible: true });
    } else {
      $fbBtn.textContent = text;
      $fb.hidden = false;
      document.body.classList.add('has-main');
    }
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
    if (!inTG) return;
    if (state.stack.length) tg.BackButton.show();
    else tg.BackButton.hide();
  }

  let toastTimer;
  function toast(msg, kind = 'ok') {
    $toast.innerHTML = `<span class="toast-ic ${kind}">${kind === 'ok' ? I.check : '!'}</span><span>${msg}</span>`;
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
    verified: '<svg viewBox="0 0 24 24" class="verified"><path d="M12 2l2.4 1.8 3-.2 1 2.8 2.6 1.6-.8 2.9.8 2.9-2.6 1.6-1 2.8-3-.2L12 22l-2.4-1.8-3 .2-1-2.8L3 16l.8-2.9L3 10.2l2.6-1.6 1-2.8 3 .2z"/><path d="M8.5 12.2l2.3 2.3 4.7-4.8" class="vt"/></svg>',
  };

  const isq = (icon, color) => `<span class="isq" style="--c:${color}">${icon}</span>`;
  const COLORS = { blue: '#007aff', green: '#34c759', orange: '#ff9500', purple: '#af52de', red: '#ff3b30' };

  // ---------- shared blocks ----------
  const section = (header, body, footer = '', cls = '') => `
    ${header ? `<div class="sec-h">${header}</div>` : ''}
    <div class="sec ${cls}">${body}</div>
    ${footer ? `<div class="sec-f">${footer}</div>` : ''}`;

  const pageHead = (title, right = '') => `
    <header class="page-head">
      ${!inTG && state.stack.length ? `<button class="back ic" data-action="back" aria-label="${t('back')}">${I.back}</button>` : ''}
      <h1>${title}</h1>${right}
    </header>`;

  const empty = (emoji, title, hint, cta = true) => `
    <div class="empty">
      <div class="emoji">${emoji}</div>
      <b>${title}</b>
      ${hint ? `<p>${hint}</p>` : ''}
      ${cta ? `<button class="btn" data-action="tab" data-tab="home">${t('toCatalog')}</button>` : ''}
    </div>`;

  function card(p) {
    const d = discount(p);
    const fav = state.favs.includes(p.id);
    const badge = d ? `<span class="pill sale">−${d}%</span>` : p.tags && p.tags.includes('new') ? `<span class="pill">${t('new')}</span>` : '';
    return `
      <article class="card" data-action="open" data-id="${p.id}">
        <div class="card-img">
          ${img(gallery(p, 0)[0], 240, 300, 'ph', L(p.name))}
          ${badge}
          <button class="fav ic ${fav ? 'on' : ''}" data-action="fav" data-id="${p.id}" aria-label="${t('favs')}">${I.heart}</button>
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
    const q = state.query.trim().toLowerCase();
    return S.products.filter((p) => {
      if (q) return (p.name.ru + ' ' + p.name.uz).toLowerCase().includes(q);
      if (state.cat === 'all') return true;
      if (state.cat === 'sale') return !!p.oldPrice;
      return p.cat === state.cat;
    });
  }

  function listBlock() {
    const list = filtered();
    const title = state.query.trim() ? t('results') : L(S.categories.find((c) => c.id === state.cat));
    if (!list.length) return empty('🔍', t('nothingFound'), t('nothingFoundHint'), false);
    return `
      <div class="list-head"><span>${title}</span><span>${countLabel(list.length)}</span></div>
      <div class="grid">${list.map(card).join('')}</div>`;
  }

  function viewHome() {
    const searching = !!state.query.trim();
    return `
      <header class="top">
        <div class="avatar">${S.brand[0]}</div>
        <div class="top-text">
          <div class="top-title">${S.brand}${I.verified}</div>
          <div class="top-sub">${t('tagline')}</div>
        </div>
        <div class="seg small">${['ru', 'uz']
          .map((l) => `<button class="${state.lang === l ? 'on' : ''}" data-action="lang" data-v="${l}">${l.toUpperCase()}</button>`)
          .join('')}</div>
      </header>
      <label class="search ic">${I.search}<input id="q" type="search" enterkeyhint="search" placeholder="${t('search')}" value="${esc(state.query)}" autocomplete="off"></label>
      <div id="promo" ${searching ? 'hidden' : ''}>
        <button class="banner" data-action="cat" data-cat="sale">
          ${img(S.banner, 560, 260, 'banner-img')}
          <span class="banner-text">
            <small>${t('bannerKicker')}</small>
            <b>${t('bannerTitle')}</b>
            <span class="banner-cta">${t('bannerCta')}</span>
          </span>
        </button>
        <nav class="folders">${S.categories
          .map((c) => `<button class="folder ${state.cat === c.id ? 'on' : ''}" data-action="cat" data-cat="${c.id}">${L(c)}</button>`)
          .join('')}</nav>
      </div>
      <div id="list">${listBlock()}</div>`;
  }

  function viewFavs() {
    const list = S.products.filter((p) => state.favs.includes(p.id));
    return pageHead(t('favs')) + (list.length ? `<div class="grid">${list.map(card).join('')}</div>` : empty('❤️', t('favsEmpty'), t('favsEmptyHint')));
  }

  function viewProduct() {
    const p = product(state.params.id);
    const sel = state.sel;
    const c = p.colors[sel.color];
    const d = discount(p);
    const fav = state.favs.includes(p.id);
    const photos = gallery(p, sel.color);

    const colorOpts = p.colors.map((x, i) => `
      <button class="color-opt ${i === sel.color ? 'on' : ''}" data-action="color" data-i="${i}">
        <span class="thumb" style="background:${x.hex}">${x.photo ? img(x.photo, 64, 80, 'ph') : ''}</span>
        <span>${L(x)}</span>
      </button>`).join('');

    return `
      <div class="gal-wrap">
        <div class="gal" id="gal">${photos.map((src) => img(src, 560, 700, 'ph', L(p.name))).join('')}</div>
        ${photos.length > 1 ? `<div class="gal-dots" id="gal-dots">${photos.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}
        ${!inTG ? `<button class="float-btn back ic" data-action="back" aria-label="${t('back')}">${I.back}</button>` : ''}
        <button class="float-btn fav ic ${fav ? 'on' : ''}" data-action="fav" data-id="${p.id}" aria-label="${t('favs')}">${I.heart}</button>
      </div>

      <div class="sec pd-info">
        <div class="pd-price">${money(p.price)}${p.oldPrice ? `<s>${money(p.oldPrice)}</s><span class="pill sale">−${d}%</span>` : ''}</div>
        <h1 class="pd-name">${L(p.name)}</h1>
        <div class="pd-sub"><i class="dot-ok"></i>${t('inStock')}</div>
      </div>

      ${section(`${t('color')}: <b>${L(c)}</b>`, `<div class="colors">${colorOpts}</div>`)}
      ${section(`${t('size')}${sel.size ? `: <b>${sel.size}</b>` : ''}`,
        `<div class="sizes" id="sizes">${p.sizes.map((s) => `<button class="sz ${s === sel.size ? 'on' : ''}" data-action="size" data-s="${s}">${s}</button>`).join('')}</div>`)}
      ${section(t('description'), `<p class="pd-desc">${L(p.desc)}</p>`)}
      ${section('', `
        <div class="cell">${isq(I.truck, COLORS.blue)}<div class="cell-main"><div class="cell-title">${t('perkDelivery')}</div><div class="cell-sub">${t('perkDeliverySub')}</div></div></div>
        <div class="cell">${isq(I.shirt, COLORS.purple)}<div class="cell-main"><div class="cell-title">${t('perkFitting')}</div><div class="cell-sub">${t('perkFittingSub')}</div></div></div>
        <div class="cell">${isq(I.swap, COLORS.orange)}<div class="cell-main"><div class="cell-title">${t('perkReturn')}</div><div class="cell-sub">${t('perkReturnSub')}</div></div></div>`,
        '', 'icons gap-top')}`;
  }

  function cartItem(it, idx) {
    const p = product(it.id);
    const c = p.colors[it.color];
    return `
      <div class="cell ci">
        <span class="ci-img" data-action="open" data-id="${p.id}">${img(gallery(p, it.color)[0], 56, 70, 'ph', L(p.name))}</span>
        <div class="cell-main">
          <div class="ci-name">${L(p.name)}</div>
          <div class="cell-sub">${L(c)} · ${it.size}</div>
          <div class="ci-price">${money(p.price * it.qty)}</div>
        </div>
        <div class="stepper">
          <button class="ic ${it.qty === 1 ? 'del' : ''}" data-action="dec" data-idx="${idx}" aria-label="−">${it.qty === 1 ? I.trash : I.minus}</button>
          <span>${it.qty}</span>
          <button class="ic" data-action="inc" data-idx="${idx}" aria-label="+">${I.plus}</button>
        </div>
      </div>`;
  }

  function viewCart() {
    if (!state.cart.length) return pageHead(t('cart')) + empty('🛍️', t('cartEmpty'), t('cartEmptyHint'));
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
    const input = (key, label, attrs) => `
      <label class="cell field ${e[key] ? 'err' : ''}">
        ${label ? `<span class="field-label">${label}</span>` : ''}
        <input data-field="${key}" value="${esc(f[key])}" ${attrs}>
      </label>`;
    const option = (action, value, current, icon, color, title, sub) => `
      <button class="cell opt" data-action="${action}" data-v="${value}">
        ${isq(icon, color)}
        <span class="cell-main"><span class="cell-title">${title}</span><span class="cell-sub">${sub}</span></span>
        <span class="tick ic ${value === current ? 'on' : ''}">${I.check}</span>
      </button>`;
    const fee = cartSum() >= S.delivery.freeFrom ? t('free') : money(S.delivery.fee);

    return `
      ${pageHead(t('checkoutTitle'))}
      ${section(t('contacts'),
        input('name', t('name'), `placeholder="${t('namePh')}" autocomplete="name"`) +
        input('phone', t('phone'), 'type="tel" inputmode="tel" placeholder="+998 90 123 45 67" autocomplete="tel"'))}

      ${section(t('receive'),
        option('method', 'delivery', f.method, I.truck, COLORS.blue, `${t('delivery')} · ${fee}`, t('deliverySub')) +
        option('method', 'pickup', f.method, I.store, COLORS.orange, `${t('pickup')} · ${t('free')}`, `${t('pickupPoint')}, ${t('pickupHours')}`),
        '', 'icons')}

      ${f.method === 'delivery' ? section(t('address'), input('address', '', `placeholder="${t('addressPh')}" autocomplete="street-address"`)) : ''}

      ${section(t('payment'),
        option('pay', 'cash', f.pay, I.cash, COLORS.green, t('pay_cash'), t('pay_cashSub')) +
        option('pay', 'card', f.pay, I.card, COLORS.purple, t('pay_card'), t('pay_cardSub')),
        t('payHint'), 'icons')}

      ${section(t('comment'), `<label class="cell field"><textarea data-field="comment" rows="2" placeholder="${t('commentPh')}">${esc(f.comment)}</textarea></label>`)}

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
      `<button class="tab ic ${state.view === id ? 'on' : ''}" data-action="tab" data-tab="${id}">${icon}${badge ? `<em>${badge}</em>` : ''}<span>${label}</span></button>`;
    $tabbar.innerHTML = tab('home', I.shop, t('home')) + tab('favs', I.heart, t('favs')) + tab('cart', I.bag, t('cart'), n);
  }

  function syncMain() {
    const v = state.view;
    if (v === 'product') {
      const p = product(state.params.id);
      const inCart = state.cart.some((i) => i.id === p.id && i.color === state.sel.color && i.size === state.sel.size);
      if (inCart) setMain(t('goToCart'), () => go('cart'));
      else setMain(`${t('addToCart')} · ${money(p.price)}`, addToCart);
    } else if (v === 'cart' && state.cart.length) {
      setMain(`${t('checkout')} · ${money(cartSum() + deliveryFee())}`, () => go('checkout'));
    } else if (v === 'checkout') {
      setMain(`${t('confirm')} · ${money(cartSum() + deliveryFee())}`, submitOrder);
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

  function go(view, params = {}) {
    if (TABS.includes(view) || view === 'success') state.stack = [];
    else state.stack.push({ view: state.view, params: state.params, y: window.scrollY });
    if (view === 'product') {
      const p = product(params.id);
      state.sel = { color: 0, size: p.sizes.length === 1 ? p.sizes[0] : null };
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
    if (ex) ex.qty++;
    else state.cart.push({ id: p.id, color: sel.color, size: sel.size, qty: 1 });
    saveCart();
    haptic('success');
    toast(t('added'));
    syncMain();
  }

  function toggleFav(id) {
    const i = state.favs.indexOf(id);
    if (i >= 0) state.favs.splice(i, 1);
    else state.favs.push(id);
    ls.set('favs', state.favs);
    haptic('light');
    if (state.view === 'favs') { render(); return; }
    document.querySelectorAll(`.fav[data-id="${id}"]`).forEach((b) => b.classList.toggle('on', i < 0));
  }

  function setCat(id) {
    state.query = '';
    state.cat = id;
    haptic('select');
    if (state.view !== 'home') { go('home'); return; }
    document.querySelectorAll('.folder').forEach((c) => c.classList.toggle('on', c.dataset.cat === id));
    document.getElementById('list').innerHTML = listBlock();
    const folder = document.querySelector('.folder.on');
    if (folder) folder.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  function selectColor(i) {
    state.sel.color = i;
    haptic('select');
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
    const gal = document.getElementById('gal');
    if (gal) gal.scrollLeft = 0;
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
    ls.set('form', { name: f.name, phone: f.phone, address: f.address });
    state.cart = [];
    saveCart();
    haptic('success');
    go('success');
  }

  // ---------- events ----------
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-action]');
    if (!el) return;
    const d = el.dataset;
    switch (d.action) {
      case 'open': haptic('light'); go('product', { id: d.id }); break;
      case 'fav': toggleFav(d.id); break;
      case 'cat': setCat(d.cat); break;
      case 'tab': if (state.view !== d.tab) { haptic('select'); go(d.tab); } break;
      case 'back': back(); break;
      case 'lang': state.lang = d.v; ls.set('lang', d.v); haptic('select'); render(); break;
      case 'color': selectColor(+d.i); break;
      case 'size': state.sel.size = d.s; haptic('select'); render(); break;
      case 'inc': state.cart[+d.idx].qty++; saveCart(); haptic('light'); render(); break;
      case 'dec': {
        const it = state.cart[+d.idx];
        if (it.qty > 1) it.qty--;
        else state.cart.splice(+d.idx, 1);
        saveCart(); haptic('light'); render();
        break;
      }
      case 'clear': ask(t('clearConfirm'), () => { state.cart = []; saveCart(); haptic('warning'); render(); }); break;
      case 'method': state.form.method = d.v; haptic('select'); render(); break;
      case 'pay': state.form.pay = d.v; haptic('select'); render(); break;
    }
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
    if (key === 'phone') el.value = fmtPhone(el.value);
    state.form[key] = el.value;
    if (state.errors[key]) {
      delete state.errors[key];
      el.closest('.field').classList.remove('err');
    }
  });

  document.addEventListener('focusin', (ev) => {
    const el = ev.target;
    if (el.dataset && el.dataset.field === 'phone' && !el.value) el.value = state.form.phone = '+998 ';
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.tagName === 'INPUT') ev.target.blur();
  });

  // ---------- init ----------
  state.cart = state.cart.filter((i) => product(i.id) && product(i.id).colors[i.color]);
  const saved = ls.get('form', {});
  Object.keys(saved).forEach((k) => { if (saved[k]) state.form[k] = saved[k]; });

  applyScheme();
  $fbBtn.addEventListener('click', () => mainHandler && mainHandler());

  if (inTG) {
    document.documentElement.dataset.tg = '1';
    tg.ready();
    tg.expand();
    try {
      if (tg.isVersionAtLeast('6.1')) { tg.setHeaderColor('secondary_bg_color'); tg.setBackgroundColor('secondary_bg_color'); }
      if (tg.isVersionAtLeast('7.10')) tg.setBottomBarColor('secondary_bg_color');
      if (tg.isVersionAtLeast('7.7')) tg.disableVerticalSwipes();
    } catch (e) { /* старый клиент */ }
    tg.MainButton.onClick(() => mainHandler && mainHandler());
    tg.BackButton.onClick(back);
    tg.onEvent('themeChanged', applyScheme);
  } else if (window.matchMedia) {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', applyScheme);
  }

  render();
})();
