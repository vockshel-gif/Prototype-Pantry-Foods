/* Pantry Foods prototype — storefront (hash-routed single page). */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shortMoney = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-US');
  const fmtDate = (ts) => new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const app = $('#app');
  const CART_KEY = 'pantryfoods:cart';
  const PAYMENTS = [
    { id: 'Cash on Delivery', icon: '💵', note: 'Pay in cash when your order arrives.' },
    { id: 'Card on Delivery', icon: '💳', note: 'Our rider carries a card machine.' },
    { id: 'Bank Transfer', icon: '🏦', note: 'We’ll SMS our bank details after you order.' },
    { id: 'Pay Online (demo)', icon: '🔒', note: 'Simulated — no card details are collected in this prototype.' },
  ];
  const CITIES = ['Colombo 01', 'Colombo 02', 'Colombo 03', 'Colombo 04', 'Colombo 05', 'Colombo 06', 'Colombo 07', 'Colombo 08',
    'Colombo 10', 'Dehiwala', 'Mount Lavinia', 'Nugegoda', 'Rajagiriya', 'Battaramulla', 'Kotte', 'Maharagama', 'Wattala', 'Negombo', 'Kandy'];
  const MOMENTS = [
    { title: 'For Breakfast', sub: 'Sausages & ham', emoji: '🍳', cat: 'sausages', bg: '#FCE8D5' },
    { title: 'For the Grill', sub: 'Patties & franks', emoji: '🔥', cat: 'patties', bg: '#F9D9CF' },
    { title: 'For Lunchboxes', sub: 'Nuggets & strips', emoji: '🍱', cat: 'crumbed', bg: '#FDF0C9' },
    { title: 'For Parties', sub: 'Party packs', emoji: '🎉', cat: 'packs', bg: '#EBDDF2' },
    { title: 'For Quick Dinners', sub: 'Heat & eat meals', emoji: '⏱️', cat: 'ready', bg: '#E3EACB' },
    { title: 'For the Pantry', sub: 'Rice, spices & sauces', emoji: '🥫', cat: 'pantry', bg: '#EADFCF' },
  ];

  let currentView = '';

  /* ---------------- cart ---------------- */
  let cart = readCart();
  function readCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch (e) { return []; }
  }
  function writeCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* ignore */ }
    renderCart();
    if (currentView === 'checkout') route();
  }
  const cartLines = () => cart.map((l) => ({ ...l, p: PF.product(l.id) })).filter((l) => l.p && l.p.active);
  const cartCount = () => cartLines().reduce((s, l) => s + l.qty, 0);
  const cartSubtotal = () => cartLines().reduce((s, l) => s + PF.priceOf(l.p) * l.qty, 0);

  function addToCart(id, qty = 1) {
    const p = PF.product(id);
    if (!p || p.stock <= 0) return;
    const line = cart.find((l) => l.id === id);
    const next = Math.min(p.stock, (line ? line.qty : 0) + qty);
    if (line) line.qty = next;
    else cart.push({ id, qty: next });
    writeCart();
    toast(`<b>${esc(p.name)}</b> added to cart`);
    const badge = $('#cart-count');
    badge.classList.remove('bump');
    void badge.offsetWidth;
    badge.classList.add('bump');
  }
  function setQty(id, qty) {
    const p = PF.product(id);
    const line = cart.find((l) => l.id === id);
    if (!line) return;
    if (qty <= 0) cart = cart.filter((l) => l.id !== id);
    else line.qty = Math.min(qty, p ? p.stock : qty);
    writeCart();
  }

  function freeDeliveryHint(subtotal) {
    const o = PF.deliveryOptions().filter((d) => d.freeOver > 0 && !d.pickup).sort((a, b) => a.freeOver - b.freeOver)[0];
    if (!o) return '';
    const pct = Math.min(100, (subtotal / o.freeOver) * 100);
    const msg = subtotal >= o.freeOver
      ? `🎉 You’ve unlocked free <b>${esc(o.name)}</b>!`
      : `Add <b>${PF.money(o.freeOver - subtotal)}</b> more for free ${esc(o.name)}`;
    return `<div class="free-hint"><p>${msg}</p><div class="bar"><span style="width:${pct}%"></span></div></div>`;
  }

  function renderCart() {
    $('#cart-count').textContent = cartCount();
    const lines = cartLines();
    const sub = cartSubtotal();
    if (!lines.length) {
      $('#drawer-body').innerHTML = `<div class="empty"><div class="empty-ico">🛒</div><p>Your cart is empty.</p><a href="#/" class="btn btn-primary">Start shopping</a></div>`;
      $('#drawer-foot').innerHTML = '';
      return;
    }
    $('#drawer-body').innerHTML = freeDeliveryHint(sub) + lines.map((l) => `
      <div class="line">
        ${thumb(l.p, 'line-thumb')}
        <div class="line-info">
          <a href="#/product/${l.p.id}" class="line-name">${esc(l.p.name)}</a>
          <small>${esc(l.p.unit)} · ${PF.money(PF.priceOf(l.p))}</small>
          <div class="line-row">${stepper(l.p.id, l.qty, l.p.stock)}<strong>${PF.money(PF.priceOf(l.p) * l.qty)}</strong></div>
        </div>
        <button class="icon-btn line-remove" data-remove="${l.p.id}" aria-label="Remove ${esc(l.p.name)}">✕</button>
      </div>`).join('');
    $('#drawer-foot').innerHTML = `
      <div class="sum-row"><span>Subtotal</span><strong>${PF.money(sub)}</strong></div>
      <small class="muted">Delivery is calculated at checkout.</small>
      <a href="#/checkout" class="btn btn-primary btn-block btn-lg">Checkout</a>`;
  }

  const stepper = (id, qty, max) => `<div class="stepper">
      <button data-qty="${id}" data-delta="-1" aria-label="Decrease">−</button><span>${qty}</span>
      <button data-qty="${id}" data-delta="1" aria-label="Increase" ${qty >= max ? 'disabled' : ''}>+</button></div>`;

  function openDrawer() {
    document.body.classList.add('drawer-open');
    $('#drawer').setAttribute('aria-hidden', 'false');
  }
  function closeDrawer() {
    document.body.classList.remove('drawer-open');
    $('#drawer').setAttribute('aria-hidden', 'true');
  }

  /* ---------------- building blocks ---------------- */
  function thumb(p, cls = '') {
    const cat = PF.category(p.category);
    const inner = p.image
      ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`
      : `<span class="ph-emoji" aria-hidden="true">${esc(p.emoji || '🍽️')}</span>`;
    return `<div class="ph ${cls}" style="--tile:${esc((cat && cat.color) || '#EFE6DA')}">${inner}</div>`;
  }
  const storageChip = (p) => `<span class="storage s-${esc(String(p.storage).toLowerCase())}">${esc(p.storage)}</span>`;
  const tags = (p) => (p.isNew ? '<span class="tag tag-new">New</span>' : '') + (p.bestSeller ? '<span class="tag tag-best">Best Seller</span>' : '');

  function card(p) {
    const off = PF.discountOf(p);
    const out = p.stock <= 0;
    return `<article class="card${out ? ' is-out' : ''}">
      <a href="#/product/${p.id}" class="card-media" aria-label="${esc(p.name)}">
        ${thumb(p)}
        ${off ? `<span class="badge-off">${off}%<small>OFF</small></span>` : ''}
        <span class="tags">${tags(p)}</span>
      </a>
      <div class="card-body">
        ${storageChip(p)}
        <a href="#/product/${p.id}" class="card-title">${esc(p.name)}</a>
        <div class="card-unit">${esc(p.unit)}</div>
        <div class="price">${off ? `<s>${PF.money(p.price)}</s>` : ''}<strong>${PF.money(PF.priceOf(p))}</strong></div>
        <button class="btn btn-add" data-add="${p.id}" ${out ? 'disabled' : ''}>${out ? 'Out of stock' : 'Add to cart'}</button>
      </div>
    </article>`;
  }

  function section(title, list, link, scroll) {
    if (!list.length) return '';
    return `<section class="container block">
      <div class="block-head"><h2>${title}</h2>${link ? `<a href="${link}" class="see-all">View all →</a>` : ''}</div>
      <div class="${scroll ? 'rail' : 'grid'}">${list.map(card).join('')}</div>
    </section>`;
  }

  function notFound(msg) {
    app.innerHTML = `<div class="container narrow"><div class="empty big"><div class="empty-ico">🤷</div><h2>Not found</h2><p>${esc(msg)}</p><a href="#/" class="btn btn-primary">Back to home</a></div></div>`;
  }

  /* ---------------- views ---------------- */
  function home() {
    const all = PF.products();
    const deals = all.filter((p) => PF.discountOf(p));
    const best = all.filter((p) => p.bestSeller);
    const fresh = all.filter((p) => p.isNew);
    const cats = PF.categories();
    const moments = MOMENTS.filter((m) => PF.category(m.cat));
    const topCats = cats.map((c) => ({ c, items: all.filter((p) => p.category === c.id) }))
      .filter((x) => x.items.length).sort((a, b) => b.items.length - a.items.length).slice(0, 3);

    app.innerHTML = `
      <section class="container hero">
        <div class="hero-main">
          <div class="hero-copy">
            <span class="eyebrow">Freshly frozen · Delivered cold</span>
            <h1>Good food, ready when you are.</h1>
            <p>Sausages, cold cuts, burger patties and pantry staples — packed in cool boxes and delivered to your door.</p>
            <div class="hero-cta">
              <a class="btn btn-mustard btn-lg" href="#/deals">Shop Super Deals</a>
              <a class="btn btn-outline-light btn-lg" href="#/category/packs">Party Packs</a>
            </div>
          </div>
          <div class="hero-art" aria-hidden="true">
            <div class="plate"><span class="e1">🌭</span><span class="e2">🍔</span><span class="e3">🍗</span><span class="e4">🥓</span><span class="e5">🍤</span></div>
          </div>
        </div>
        <div class="hero-side">
          <a class="promo promo-a" href="#/category/patties"><span class="promo-ico">🔥</span><div><b>Weekend BBQ</b><small>Patties &amp; franks for the grill</small></div></a>
          <a class="promo promo-b" href="#/checkout"><span class="promo-ico">🚚</span><div><b>Same-day delivery</b><small>Order before 2 PM in Colombo</small></div></a>
        </div>
      </section>

      <section class="container">
        <div class="cat-circles">${cats.map((c) => `
          <a href="#/category/${c.id}" class="cat-circle">
            <span class="circle" style="--tile:${esc(c.color)}">${esc(c.emoji)}</span>
            <span>${esc(c.name)}</span>
          </a>`).join('')}
        </div>
      </section>

      ${section('Super Deals', deals, '#/deals', true)}

      ${moments.length ? `<section class="container block">
        <div class="moments">${moments.map((m) => `
          <a href="#/category/${m.cat}" class="moment" style="--bg:${m.bg}">
            <span class="moment-emoji">${m.emoji}</span><b>${m.title}</b><small>${m.sub}</small>
          </a>`).join('')}
        </div>
      </section>` : ''}

      ${section('Best Sellers', best)}

      <section class="container block">
        <div class="banner">
          <div>
            <span class="eyebrow">Our promise</span>
            <h2>From our kitchen to your freezer in 24 hours</h2>
            <p>Authentic German &amp; Italian recipes with a Sri Lankan twist — made in small batches and kept cold all the way to your door.</p>
            <a href="#/search?q=" class="btn btn-primary btn-lg">Shop all products</a>
          </div>
          <div class="banner-art" aria-hidden="true">❄️📦</div>
        </div>
      </section>

      ${section('New Arrivals', fresh)}

      ${topCats.length ? `<section class="container block">
        <div class="mini-cols">${topCats.map(({ c, items }) => `
          <div class="mini-col">
            <div class="mini-head" style="--tile:${esc(c.color)}"><span>${esc(c.emoji)}</span><h3>${esc(c.name)}</h3><a href="#/category/${c.id}">View all</a></div>
            ${items.slice(0, 4).map((p) => `
              <a class="mini-item" href="#/product/${p.id}">${thumb(p, 'mini-thumb')}
                <span><b>${esc(p.name)}</b><small>${esc(p.unit)}</small><strong>${PF.money(PF.priceOf(p))}</strong></span>
              </a>`).join('')}
          </div>`).join('')}
        </div>
      </section>` : ''}`;
  }

  function listing({ title, emoji, color, crumbs, products, empty }) {
    app.innerHTML = `
      <div class="container">
        <nav class="crumbs"><a href="#/">Home</a>${crumbs.map((c) => `<span>/</span>${esc(c)}`).join('')}</nav>
        <div class="list-hero" style="--tile:${esc(color || '#F3EADF')}">
          <span class="list-emoji">${esc(emoji || '🛒')}</span>
          <div><h1>${esc(title)}</h1><p>${products.length} product${products.length === 1 ? '' : 's'}</p></div>
        </div>
        <div class="toolbar">
          <div class="chips">${['All', 'Frozen', 'Chilled', 'Ambient'].map((s) => `<button class="chip${s === 'All' ? ' active' : ''}" data-storage="${s}">${s}</button>`).join('')}</div>
          <label class="sort">Sort by
            <select id="sort">
              <option value="featured">Featured</option>
              <option value="low">Price: low to high</option>
              <option value="high">Price: high to low</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
        </div>
        <div class="grid" id="list-grid"></div>
      </div>`;

    let storage = 'All';
    let sort = 'featured';
    const rank = (p) => (p.bestSeller ? 2 : 0) + (p.isNew ? 1 : 0);
    const draw = () => {
      let list = products.filter((p) => storage === 'All' || p.storage === storage);
      if (sort === 'low') list = [...list].sort((a, b) => PF.priceOf(a) - PF.priceOf(b));
      else if (sort === 'high') list = [...list].sort((a, b) => PF.priceOf(b) - PF.priceOf(a));
      else if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
      else list = [...list].sort((a, b) => rank(b) - rank(a));
      $('#list-grid').innerHTML = list.length
        ? list.map(card).join('')
        : `<div class="empty wide"><div class="empty-ico">🔍</div><p>${esc(empty || 'No products match this filter.')}</p></div>`;
    };
    $$('.chip', app).forEach((b) => {
      b.onclick = () => {
        storage = b.dataset.storage;
        $$('.chip', app).forEach((x) => x.classList.toggle('active', x === b));
        draw();
      };
    });
    $('#sort').onchange = (e) => { sort = e.target.value; draw(); };
    draw();
  }

  function categoryView(id) {
    const cat = PF.category(id);
    if (!cat) return notFound('That category doesn’t exist any more.');
    listing({ title: cat.name, emoji: cat.emoji, color: cat.color, crumbs: [cat.name], products: PF.products().filter((p) => p.category === id) });
  }

  function searchView(q) {
    q = (q || '').trim();
    $('#search-input').value = q;
    const needle = q.toLowerCase();
    const list = PF.products().filter((p) => {
      const cat = PF.category(p.category);
      return [p.name, p.description, p.unit, cat && cat.name].join(' ').toLowerCase().includes(needle);
    });
    listing({
      title: q ? `Results for “${q}”` : 'All products', emoji: '🔍', crumbs: [q ? 'Search' : 'All products'],
      products: list, empty: 'Nothing found. Try “sausage”, “nuggets” or “rice”.',
    });
  }

  function productView(id) {
    const p = PF.product(id);
    if (!p || !p.active) return notFound('This product is no longer available.');
    const cat = PF.category(p.category);
    const off = PF.discountOf(p);
    const related = PF.products().filter((x) => x.category === p.category && x.id !== p.id).slice(0, 4);
    const stock = p.stock <= 0 ? '<span class="stock out">Out of stock</span>'
      : p.stock <= 5 ? `<span class="stock low">Only ${p.stock} left</span>` : '<span class="stock in">In stock</span>';
    const opts = PF.deliveryOptions();
    let qty = 1;

    app.innerHTML = `
      <div class="container">
        <nav class="crumbs"><a href="#/">Home</a><span>/</span>${cat ? `<a href="#/category/${cat.id}">${esc(cat.name)}</a><span>/</span>` : ''}${esc(p.name)}</nav>
        <div class="pdp">
          <div class="pdp-media">${thumb(p, 'ph-xl')}${off ? `<span class="badge-off big">${off}%<small>OFF</small></span>` : ''}</div>
          <div class="pdp-info">
            <div class="pdp-tags">${tags(p)}${storageChip(p)}</div>
            <h1>${esc(p.name)}</h1>
            <p class="muted">${esc(p.unit)}</p>
            <div class="price big">${off ? `<s>${PF.money(p.price)}</s>` : ''}<strong>${PF.money(PF.priceOf(p))}</strong>
              ${off ? `<span class="save">You save ${PF.money(p.price - PF.priceOf(p))}</span>` : ''}</div>
            ${stock}
            <p class="pdp-desc">${esc(p.description)}</p>
            <div class="pdp-buy">
              <div class="stepper big"><button id="pdp-minus" aria-label="Decrease">−</button><span id="pdp-qty">1</span><button id="pdp-plus" aria-label="Increase">+</button></div>
              <button class="btn btn-primary btn-lg" id="pdp-add" ${p.stock <= 0 ? 'disabled' : ''}>Add to cart</button>
              <button class="btn btn-dark btn-lg" id="pdp-buy" ${p.stock <= 0 ? 'disabled' : ''}>Buy now</button>
            </div>
            ${opts.length ? `<div class="pdp-delivery">
              <h4>Delivery options</h4>
              <ul>${opts.map((o) => `<li><span>${o.pickup ? '🏬' : '🚚'} <b>${esc(o.name)}</b> · ${esc(o.eta)}</span><span>${o.fee ? PF.money(o.fee) : 'Free'}</span></li>`).join('')}</ul>
            </div>` : ''}
          </div>
        </div>
      </div>
      ${section('You may also like', related)}`;

    const setPdpQty = (n) => {
      qty = Math.max(1, Math.min(n, Math.max(1, p.stock)));
      $('#pdp-qty').textContent = qty;
    };
    $('#pdp-minus').onclick = () => setPdpQty(qty - 1);
    $('#pdp-plus').onclick = () => setPdpQty(qty + 1);
    $('#pdp-add').onclick = () => addToCart(p.id, qty);
    $('#pdp-buy').onclick = () => { addToCart(p.id, qty); location.hash = '#/checkout'; };
  }

  function checkoutView() {
    const lines = cartLines();
    if (!lines.length) {
      app.innerHTML = `<div class="container narrow"><div class="empty big"><div class="empty-ico">🛒</div><h2>Your cart is empty</h2>
        <p>Add a few things before checking out.</p><a class="btn btn-primary" href="#/">Browse products</a></div></div>`;
      return;
    }
    const sub = cartSubtotal();
    const opts = PF.deliveryOptions();
    const today = new Date();
    const tomorrow = new Date(Date.now() + 864e5);
    const maxDate = new Date(Date.now() + 14 * 864e5);

    app.innerHTML = `
      <div class="container">
        <nav class="crumbs"><a href="#/">Home</a><span>/</span>Checkout</nav>
        <h1 class="page-title">Checkout</h1>
        <form class="checkout" id="checkout-form">
          <div class="co-main">
            <section class="co-card">
              <h3>Contact details</h3>
              <div class="fields two">
                <label>Full name *<input name="name" required autocomplete="name"></label>
                <label>Mobile number *<input name="phone" type="tel" required pattern="[0-9+ ]{9,15}" placeholder="07X XXX XXXX" autocomplete="tel"></label>
                <label class="span2">Email (for your receipt)<input name="email" type="email" autocomplete="email"></label>
              </div>
            </section>

            <section class="co-card">
              <h3>Delivery method</h3>
              ${opts.length ? `<div class="options">${opts.map((o, i) => `
                <label class="option">
                  <input type="radio" name="delivery" value="${esc(o.id)}" ${i === 0 ? 'checked' : ''}>
                  <span class="option-body">
                    <span class="option-top"><b>${o.pickup ? '🏬' : '🚚'} ${esc(o.name)}</b><span class="option-fee" data-fee="${esc(o.id)}"></span></span>
                    <small>${esc(o.description)}</small>
                    <small class="eta">⏱ ${esc(o.eta)}${o.freeOver ? ` · Free over ${shortMoney(o.freeOver)}` : ''}</small>
                  </span>
                </label>`).join('')}</div>`
                : `<p class="alert">Online delivery isn’t available right now. Please call ${esc(PF.settings.hotline)} to order.</p>`}
            </section>

            <section class="co-card" id="address-card">
              <h3>Delivery address</h3>
              <div class="fields two">
                <label class="span2">Street address *<input name="line" required autocomplete="street-address" placeholder="House no. and street"></label>
                <label>City / area *<input name="city" required list="cities" placeholder="e.g. Colombo 05"></label>
                <label>Landmark<input name="landmark" placeholder="Near…"></label>
              </div>
              <datalist id="cities">${CITIES.map((c) => `<option value="${c}">`).join('')}</datalist>
            </section>

            <section class="co-card" id="schedule-card">
              <h3 id="schedule-title">Choose a date &amp; time</h3>
              <div class="fields two">
                <label>Date *<input type="date" name="date" min="${localISO(today)}" max="${localISO(maxDate)}" value="${localISO(tomorrow)}"></label>
                <label>Time slot *<select name="slot">${PF.slots.map((s) => `<option>${esc(s)}</option>`).join('')}</select></label>
              </div>
            </section>

            <section class="co-card">
              <h3>Payment</h3>
              <div class="options">${PAYMENTS.map((pm, i) => `
                <label class="option">
                  <input type="radio" name="payment" value="${esc(pm.id)}" ${i === 0 ? 'checked' : ''}>
                  <span class="option-body"><span class="option-top"><b>${pm.icon} ${esc(pm.id)}</b></span><small>${esc(pm.note)}</small></span>
                </label>`).join('')}
              </div>
            </section>

            <section class="co-card">
              <h3>Order notes</h3>
              <textarea name="notes" rows="3" placeholder="Gate code, delivery instructions, gift message…"></textarea>
            </section>
          </div>

          <aside class="co-summary">
            <h3>Order summary</h3>
            <div class="sum-lines">${lines.map((l) => `
              <div class="sum-line">${thumb(l.p, 'sum-thumb')}<div><b>${esc(l.p.name)}</b><small>${esc(l.p.unit)} × ${l.qty}</small></div><span>${PF.money(PF.priceOf(l.p) * l.qty)}</span></div>`).join('')}
            </div>
            <div class="sum-row"><span>Subtotal</span><span>${PF.money(sub)}</span></div>
            <div class="sum-row"><span id="sum-delivery-label">Delivery</span><span id="sum-delivery">—</span></div>
            <div class="sum-row total"><span>Total</span><strong id="sum-total">${PF.money(sub)}</strong></div>
            <button class="btn btn-primary btn-block btn-lg" type="submit" ${opts.length ? '' : 'disabled'}>Place order</button>
            <p class="fineprint">🔒 Prototype — no payment is taken and nothing leaves this browser.</p>
          </aside>
        </form>
      </div>`;

    const form = $('#checkout-form');
    const selected = () => PF.deliveryOption((form.querySelector('input[name="delivery"]:checked') || {}).value);
    const update = () => {
      opts.forEach((o) => {
        const fee = PF.deliveryFee(o, sub);
        $(`[data-fee="${CSS.escape(o.id)}"]`).textContent = fee ? PF.money(fee) : 'FREE';
      });
      const opt = selected();
      if (!opt) return;
      const fee = PF.deliveryFee(opt, sub);
      $('#address-card').hidden = !!opt.pickup;
      form.line.required = form.city.required = !opt.pickup;
      $('#schedule-card').hidden = !opt.schedule;
      form.date.required = !!opt.schedule;
      $('#schedule-title').textContent = opt.pickup ? 'Choose a pickup date & time' : 'Choose a delivery date & time';
      $('#sum-delivery-label').textContent = opt.pickup ? 'Pickup' : 'Delivery';
      $('#sum-delivery').textContent = fee ? PF.money(fee) : 'FREE';
      $('#sum-total').textContent = PF.money(sub + fee);
    };
    form.addEventListener('change', update);
    update();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const opt = selected();
      if (!opt) return;
      const fd = new FormData(form);
      const val = (k) => String(fd.get(k) || '').trim();
      const items = cartLines();
      const subtotal = cartSubtotal();
      const fee = PF.deliveryFee(opt, subtotal);
      const order = PF.placeOrder({
        customer: { name: val('name'), phone: val('phone'), email: val('email') },
        address: opt.pickup ? null : { line: val('line'), city: val('city'), landmark: val('landmark') },
        notes: val('notes'),
        items: items.map((l) => ({ id: l.p.id, name: l.p.name, unit: l.p.unit, emoji: l.p.emoji, price: PF.priceOf(l.p), qty: l.qty })),
        subtotal, deliveryFee: fee, total: subtotal + fee,
        delivery: { id: opt.id, name: opt.name, pickup: !!opt.pickup, date: opt.schedule ? val('date') : '', slot: opt.schedule ? val('slot') : '' },
        payment: val('payment'),
      });
      cart = [];
      currentView = '';
      writeCart();
      location.hash = '#/order/' + order.id;
    });
  }

  const stepLabel = (s, pickup) => (pickup && s === 'Out for delivery' ? 'Ready for pickup' : pickup && s === 'Delivered' ? 'Collected' : s);

  function orderCard(o) {
    const pickup = o.delivery.pickup || (PF.deliveryOption(o.delivery.id) || {}).pickup;
    return `<div class="order-card">
      <div class="order-meta">
        <div><small>Order</small><b>${esc(o.id)}</b></div>
        <div><small>Placed</small><b>${fmtDate(o.createdAt)}</b></div>
        <div><small>${pickup ? 'Pickup' : 'Delivery'}</small><b>${esc(o.delivery.name)}</b>${o.delivery.date ? `<small>${esc(o.delivery.date)} · ${esc(o.delivery.slot)}</small>` : ''}</div>
        <div><small>Payment</small><b>${esc(o.payment)}</b></div>
      </div>
      ${o.address ? `<p class="order-addr">📍 ${esc(o.address.line)}, ${esc(o.address.city)}</p>` : ''}
      <div class="sum-lines">${o.items.map((i) => {
        const p = PF.product(i.id);
        const t = p ? thumb(p, 'sum-thumb') : `<div class="ph sum-thumb"><span class="ph-emoji">${esc(i.emoji || '🍽️')}</span></div>`;
        return `<div class="sum-line">${t}<div><b>${esc(i.name)}</b><small>${esc(i.unit)} × ${i.qty}</small></div><span>${PF.money(i.price * i.qty)}</span></div>`;
      }).join('')}</div>
      <div class="sum-row"><span>Subtotal</span><span>${PF.money(o.subtotal)}</span></div>
      <div class="sum-row"><span>${pickup ? 'Pickup' : 'Delivery'}</span><span>${o.deliveryFee ? PF.money(o.deliveryFee) : 'FREE'}</span></div>
      <div class="sum-row total"><span>Total</span><strong>${PF.money(o.total)}</strong></div>
    </div>`;
  }

  function timeline(o) {
    if (o.status === 'Cancelled') return '<p class="alert">This order was cancelled. Please call our hotline if this is unexpected.</p>';
    const pickup = o.delivery.pickup || (PF.deliveryOption(o.delivery.id) || {}).pickup;
    const steps = PF.STATUSES.filter((s) => s !== 'Cancelled');
    const at = Object.fromEntries((o.history || []).map((h) => [h.status, h.at]));
    const cur = steps.indexOf(o.status);
    return `<ol class="timeline">${steps.map((s, i) => `
      <li class="${i < cur ? 'done' : i === cur ? 'current' : ''}">
        <span class="dot">${i <= cur ? '✓' : i + 1}</span><b>${stepLabel(s, pickup)}</b><small>${at[s] ? fmtDate(at[s]) : ''}</small>
      </li>`).join('')}</ol>`;
  }

  function confirmationView(id) {
    const o = PF.order(id);
    if (!o) return notFound('We couldn’t find that order.');
    app.innerHTML = `<div class="container narrow">
      <div class="confirm">
        <div class="confirm-check">✓</div>
        <h1>Thank you, ${esc(o.customer.name.split(' ')[0])}!</h1>
        <p>Your order <b>${esc(o.id)}</b> has been placed. We’ll call you on <b>${esc(o.customer.phone)}</b> to confirm.</p>
        <div class="confirm-actions">
          <a class="btn btn-primary" href="#/track?id=${encodeURIComponent(o.id)}">Track this order</a>
          <a class="btn btn-ghost" href="#/">Continue shopping</a>
        </div>
      </div>
      ${orderCard(o)}
    </div>`;
  }

  function trackView(id) {
    const o = id ? PF.order(id) : null;
    const samples = PF.orders().slice(0, 3).map((x) => `<a href="#/track?id=${encodeURIComponent(x.id)}">${esc(x.id)}</a>`).join(', ');
    app.innerHTML = `<div class="container narrow">
      <nav class="crumbs"><a href="#/">Home</a><span>/</span>Order status</nav>
      <h1 class="page-title">Order status</h1>
      <form class="track-form" id="track-form">
        <input name="order" placeholder="Order number, e.g. PF-1002" value="${esc(id || '')}" required aria-label="Order number">
        <button class="btn btn-primary" type="submit">Track</button>
      </form>
      ${id && !o ? `<p class="alert">No order found for “${esc(id)}”. Check the number on your confirmation.</p>` : ''}
      ${o ? `<p class="status-line">Current status: <span class="status-pill st-${esc(o.status.toLowerCase().replace(/ /g, '-'))}">${esc(o.status)}</span></p>${timeline(o)}${orderCard(o)}`
        : !id && samples ? `<p class="muted">Try a recent order: ${samples}</p>` : ''}
    </div>`;
    $('#track-form').onsubmit = (e) => {
      e.preventDefault();
      location.hash = '#/track?id=' + encodeURIComponent(e.target.elements.order.value.trim());
    };
  }

  /* ---------------- chrome, routing & events ---------------- */
  function renderChrome() {
    const cats = PF.categories();
    $('#catnav-links').innerHTML = cats.slice(0, 5).map((c) => `<a href="#/category/${c.id}" data-nav="category/${c.id}">${esc(c.name)}</a>`).join('')
      + '<a href="#/deals" class="deals-link" data-nav="deals">Super Deals</a>';
    $('#cat-dropdown').innerHTML = cats.map((c) => `<a href="#/category/${c.id}"><span>${esc(c.emoji)}</span>${esc(c.name)}</a>`).join('');
    $('#footer-cats').innerHTML = cats.map((c) => `<li><a href="#/category/${c.id}">${esc(c.name)}</a></li>`).join('');
    $('#hotline').textContent = PF.settings.hotline;
    $('#footer-hotline').textContent = PF.settings.hotline;
    $('#announcement').textContent = PF.settings.announcement;

    const paid = PF.deliveryOptions().filter((o) => !o.pickup && o.fee > 0);
    const free = PF.deliveryOptions().filter((o) => !o.pickup && o.freeOver > 0).map((o) => o.freeOver);
    $('#usp-delivery').textContent = paid.length
      ? `Starts from ${shortMoney(Math.min(...paid.map((o) => o.fee)))}${free.length ? ` · free over ${shortMoney(Math.min(...free))}` : ''}`
      : 'Free delivery on every order';
  }

  function route() {
    const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
    const parts = path.split('/').filter(Boolean);
    const params = new URLSearchParams(query);
    const view = parts[0] || 'home';
    const changed = location.hash !== route.lastHash;
    route.lastHash = location.hash;
    currentView = view;
    closeDrawer();
    $('#cat-dropdown').classList.remove('open');

    switch (view) {
      case 'category': categoryView(decodeURIComponent(parts[1] || '')); break;
      case 'deals':
        listing({ title: 'Super Deals', emoji: '🏷️', color: '#F9D9CF', crumbs: ['Super Deals'],
          products: PF.products().filter((p) => PF.discountOf(p)), empty: 'No deals running right now — check back soon.' });
        break;
      case 'search': searchView(params.get('q')); break;
      case 'product': productView(decodeURIComponent(parts[1] || '')); break;
      case 'checkout': checkoutView(); break;
      case 'order': confirmationView(decodeURIComponent(parts[1] || '')); break;
      case 'track': trackView(params.get('id')); break;
      default: home();
    }
    $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === path));
    if (changed) window.scrollTo({ top: 0, behavior: 'instant' });
  }

  let toastTimer;
  function toast(html) {
    const t = $('#toast');
    t.innerHTML = html;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  document.addEventListener('click', (e) => {
    const t = e.target;
    const add = t.closest('[data-add]');
    if (add) { e.preventDefault(); addToCart(add.dataset.add); return; }
    const q = t.closest('[data-qty]');
    if (q) {
      const line = cart.find((l) => l.id === q.dataset.qty);
      if (line) setQty(line.id, line.qty + Number(q.dataset.delta));
      return;
    }
    const rm = t.closest('[data-remove]');
    if (rm) { setQty(rm.dataset.remove, 0); return; }
    if (t.closest('#cart-btn')) { openDrawer(); return; }
    if (t.closest('#drawer-close') || t === $('#scrim')) { closeDrawer(); return; }
    if (t.closest('#drawer a')) closeDrawer();

    const dd = $('#cat-dropdown');
    const menuBtn = t.closest('#cat-menu-btn');
    if (menuBtn) {
      dd.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', dd.classList.contains('open'));
    } else if (!t.closest('#cat-dropdown') || t.closest('a')) {
      dd.classList.remove('open');
      $('#cat-menu-btn').setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  $('#search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    location.hash = '#/search?q=' + encodeURIComponent($('#search-input').value.trim());
  });
  $('#newsletter-form').addEventListener('submit', (e) => {
    e.preventDefault();
    e.target.reset();
    toast('Thanks for subscribing! <small>(demo — nothing was sent)</small>');
  });

  // Admin panel open in another tab? Reflect its changes live (but never wipe a half-filled checkout).
  PF.onExternalChange(() => {
    renderChrome();
    renderCart();
    if (currentView !== 'checkout') route();
  });

  window.addEventListener('hashchange', route);
  renderChrome();
  renderCart();
  route();
})();
