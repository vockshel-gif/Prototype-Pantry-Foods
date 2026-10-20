/* Pantry Foods prototype — admin panel. */
import PF from './store.js';
import { createTrackMap } from './maps.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (ts) => new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const statusClass = (s) => 'st-' + String(s).toLowerCase().replace(/ /g, '-');
const pill = (s) => `<span class="status-pill ${statusClass(s)}">${esc(s)}</span>`;
const EMOJIS = ['🌭', '🥓', '🍔', '🍗', '🍖', '🥩', '🐟', '🍤', '🦐', '🍛', '🍝', '🍕', '🍚', '🌶️', '🍅', '🧀', '🥫', '🔥', '🎉', '🍱'];
const OPEN = ['Placed', 'Stock check', 'Confirmed'];
const NEXT = {
  Placed: ['Stock check', '🔎 Start stock check'],
  'Stock check': ['Confirmed', '✅ Confirm order'],
  Confirmed: ['Packed', '📦 Mark as packed'],
  Packed: ['Out for delivery', '🛵 Dispatch rider'],
};

const view = $('#view');
const VIEWS = {
  dashboard: ['Dashboard', dashboardView],
  products: ['Products', productsView],
  categories: ['Categories', categoriesView],
  orders: ['Orders', ordersView],
  delivery: ['Delivery options', deliveryView],
  settings: ['Settings', settingsView],
};
let current = 'dashboard';
const loadedAt = Date.now();

function render() {
  current = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'dashboard';
  const [title, fn] = VIEWS[current];
  $('#page-title').textContent = title;
  document.title = `${title} · Pantry Foods Admin`;
  $$('.side-nav a').forEach((a) => a.classList.toggle('active', a.dataset.view === current));
  const waiting = PF.orders().filter((o) => o.status === 'Placed').length;
  $('#pending-count').textContent = waiting || '';
  document.body.classList.remove('side-open');
  fn();
}

// Re-render on live data, but never while someone is typing in the page.
let renderPending = false;
function scheduleRender() {
  const a = document.activeElement;
  if (a && view.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { renderPending = true; return; }
  renderPending = false;
  render();
}
view.addEventListener('focusout', () => setTimeout(() => { if (renderPending) scheduleRender(); }, 0));

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

// Short two-note chime for new orders (browsers only allow sound after the first click).
let audio = null;
document.addEventListener('pointerdown', () => {
  audio = audio || new (window.AudioContext || window.webkitAudioContext)();
  audio.resume();
});
function chime() {
  if (!audio) return;
  const t0 = audio.currentTime;
  [880, 1318].forEach((freq, i) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const t = t0 + i * 0.16;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.45);
  });
}

function thumb(p, cls = '') {
  const cat = PF.category(p.category);
  const inner = p.image ? `<img src="${esc(p.image)}" alt="">` : `<span>${esc(p.emoji || '🍽️')}</span>`;
  return `<div class="thumb ${cls}" style="--tile:${esc((cat && cat.color) || '#EFE6DA')}">${inner}</div>`;
}

/* ---------------- WhatsApp ---------------- */
const trackUrl = (o) => new URL(`../#/track/${o.id}`, location.href).href;

function waMessage(o) {
  const name = o.customer.name.split(' ')[0];
  const link = trackUrl(o);
  const total = PF.money(PF.orderTotals(o).total);
  const pickup = !!o.delivery?.pickup;
  const text = {
    Placed: `Hi ${name}! 👋 Thanks for ordering from Pantry Foods.\nYour order *${o.number}* is in — we’re checking stock with our depot now.\n\nTrack it live: ${link}`,
    'Stock check': `Hi ${name}, we’re checking every item of order *${o.number}* at our depot right now 🔎\n\nFollow along live: ${link}`,
    Confirmed: `Good news ${name}! ✅ Your order *${o.number}* is confirmed.\nTotal: ${total} (${o.payment})\n\nTrack it live: ${link}`,
    Packed: `📦 Your order *${o.number}* is packed in a cool box and ready to go.\n\nTrack it live: ${link}`,
    'Out for delivery': pickup
      ? `🏬 Your order *${o.number}* is ready for pickup at our Narahenpita depot.\nYour pickup PIN is *${o.pin}*.\n\nDetails: ${link}`
      : `🛵 ${o.rider?.name || 'Our rider'} is on the way with your order *${o.number}*!\nYour delivery PIN is *${o.pin}* — share it with the rider.\n\nWatch live on the map: ${link}`,
    Delivered: `✅ Delivered! Thanks for choosing Pantry Foods, ${name}.\nHow did we do? Rate your order here: ${link}`,
    Cancelled: `Hi ${name}, your order *${o.number}* has been cancelled. Call us on ${PF.settings.hotline} if you have any questions.`,
  }[o.status];
  const waiting = o.items.filter((i) => i.status === 'unavailable' && !i.choice);
  const note = waiting.length && OPEN.includes(o.status)
    ? `\n\n⚠️ ${waiting.map((i) => i.name).join(', ')} ${waiting.length > 1 ? 'are' : 'is'} out of stock — please tap the link and choose swap or remove.`
    : '';
  return text + note;
}
const waLink = (o) => `https://wa.me/${PF.phoneDigits(o.customer.phone)}?text=${encodeURIComponent(waMessage(o))}`;

/* ---------------- dashboard ---------------- */
function dashboardView() {
  const orders = PF.orders();
  const live = orders.filter((o) => o.status !== 'Cancelled');
  const revenue = live.reduce((s, o) => s + PF.orderTotals(o).total, 0);
  const startOfDay = new Date().setHours(0, 0, 0, 0);
  const today = orders.filter((o) => o.createdAt >= startOfDay).length;
  const attention = orders.filter((o) => ['Placed', 'Stock check'].includes(o.status)).length;
  const onRoad = orders.filter((o) => o.status === 'Out for delivery').length;
  const products = PF.products(true);
  const low = products.filter((p) => p.stock <= 5).sort((a, b) => a.stock - b.stock);
  const rated = orders.filter((o) => o.rating);
  const avg = rated.length ? rated.reduce((s, o) => s + o.rating.stars, 0) / rated.length : 0;

  view.innerHTML = `
    <div class="stats">
      <div class="stat"><small>Revenue</small><b>${PF.money(revenue)}</b><span>${live.length} active order${live.length === 1 ? '' : 's'}</span></div>
      <div class="stat"><small>Orders today</small><b>${today}</b><span>${orders.length} in total</span></div>
      <div class="stat stat-warn"><small>Needs attention</small><b>${attention}</b><span>New or waiting on a stock check · ${onRoad} on the road</span></div>
      <div class="stat"><small>Customer rating</small><b>${rated.length ? `${avg.toFixed(1)} ★` : '—'}</b><span>${rated.length} review${rated.length === 1 ? '' : 's'}</span></div>
    </div>

    <div class="dash-grid">
      <section class="panel">
        <div class="panel-head"><h3>Recent orders <span class="live-dot" title="Live"></span></h3><a href="#orders" class="link">View all →</a></div>
        ${orders.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>Order</th><th>Customer</th><th>Delivery</th><th class="num">Total</th><th>Status</th></tr></thead>
          <tbody>${orders.slice(0, 6).map((o) => `
            <tr class="clickable${isFresh(o) ? ' row-new' : ''}" data-order="${esc(o.id)}">
              <td><b>${esc(o.number)}</b><small>${fmtDate(o.createdAt)}</small></td>
              <td>${esc(o.customer.name)}</td>
              <td>${esc(o.delivery.name)}</td>
              <td class="num">${PF.money(PF.orderTotals(o).total)}</td>
              <td>${pill(o.status)}</td>
            </tr>`).join('')}</tbody></table></div>` : '<p class="muted pad">No orders yet. Place one from the storefront.</p>'}
      </section>

      <div class="dash-side">
        <section class="panel">
          <div class="panel-head"><h3>Low stock</h3><a href="#products" class="link">Products →</a></div>
          ${low.length ? `<ul class="mini-list">${low.map((p) => `
            <li>${thumb(p, 'sm')}<span><b>${esc(p.name)}</b><small>${esc(p.unit)}</small></span>
              <span class="stock-badge ${p.stock === 0 ? 'zero' : 'low'}">${p.stock} left</span>
              <button class="btn btn-ghost btn-sm" data-edit="${esc(p.id)}">Restock</button></li>`).join('')}</ul>`
            : '<p class="muted pad">Everything is well stocked. 👍</p>'}
        </section>
        <section class="panel">
          <div class="panel-head"><h3>Latest reviews</h3></div>
          ${rated.length ? `<ul class="reviews">${rated.slice(0, 4).map((o) => `
            <li><span class="stars-s">${'★'.repeat(o.rating.stars)}<i>${'★'.repeat(5 - o.rating.stars)}</i></span>
              <b>${esc(o.customer.name)}</b>${o.rating.comment ? `<p>“${esc(o.rating.comment)}”</p>` : ''}</li>`).join('')}</ul>`
            : '<p class="muted pad">No reviews yet.</p>'}
        </section>
      </div>
    </div>`;
}
const isFresh = (o) => o.createdAt > loadedAt - 60000 && o.status === 'Placed' && !o.sample;

/* ---------------- products ---------------- */
const productFilter = { q: '', cat: '' };

function productsView() {
  view.innerHTML = `
    <div class="toolbar">
      <input type="search" class="input" id="p-search" placeholder="Search products…" value="${esc(productFilter.q)}">
      <select class="input" id="p-cat">
        <option value="">All categories</option>
        ${PF.categories().map((c) => `<option value="${esc(c.id)}" ${productFilter.cat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
      <span class="spacer"></span>
      <button class="btn btn-primary" id="p-add">+ Add product</button>
    </div>
    <section class="panel">
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Product</th><th>Category</th><th class="num">Price</th><th class="num">Stock</th><th>Tags</th><th>Visible</th><th></th></tr></thead>
        <tbody id="p-rows"></tbody>
      </table></div>
    </section>`;
  $('#p-search').oninput = (e) => { productFilter.q = e.target.value; drawProducts(); };
  $('#p-cat').onchange = (e) => { productFilter.cat = e.target.value; drawProducts(); };
  $('#p-add').onclick = () => openProduct();
  drawProducts();
}

function drawProducts() {
  const q = productFilter.q.trim().toLowerCase();
  const list = PF.products(true).filter((p) => (!productFilter.cat || p.category === productFilter.cat) && (!q || p.name.toLowerCase().includes(q)));
  $('#p-rows').innerHTML = list.length ? list.map((p) => {
    const cat = PF.category(p.category);
    const off = PF.discountOf(p);
    return `<tr class="${p.active ? '' : 'row-muted'}">
      <td><div class="prod-cell">${thumb(p)}<span><b>${esc(p.name)}</b><small>${esc(p.unit)} · ${esc(p.storage)}</small></span></div></td>
      <td class="nowrap">${cat ? `${esc(cat.emoji)} ${esc(cat.name)}` : '<span class="muted">—</span>'}</td>
      <td class="num">${off ? `<s class="muted">${PF.money(p.price)}</s><b class="sale">${PF.money(PF.priceOf(p))}</b><small class="off">${off}% off</small>` : `<b>${PF.money(p.price)}</b>`}</td>
      <td class="num"><span class="stock-badge ${p.stock === 0 ? 'zero' : p.stock <= 5 ? 'low' : ''}">${p.stock}</span></td>
      <td>${p.bestSeller ? '<span class="tag tag-best">Best</span>' : ''}${p.isNew ? '<span class="tag tag-new">New</span>' : ''}</td>
      <td><label class="switch" title="Show in store"><input type="checkbox" data-toggle="${esc(p.id)}" ${p.active ? 'checked' : ''}><span></span></label></td>
      <td class="actions">
        <button class="btn btn-ghost btn-sm" data-edit="${esc(p.id)}">Edit</button>
        <button class="btn btn-danger-ghost btn-sm" data-delete-product="${esc(p.id)}">Delete</button>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" class="muted pad center">No products match.</td></tr>';
}

const productDialog = $('#product-dialog');
const productForm = $('#product-form');
let editingImage = '';

function openProduct(id) {
  const p = id ? PF.product(id) : null;
  const f = productForm.elements;
  $('#pf-title').textContent = p ? 'Edit product' : 'Add product';
  f.category.innerHTML = PF.categories().map((c) => `<option value="${esc(c.id)}">${esc(c.emoji)} ${esc(c.name)}</option>`).join('');
  productForm.dataset.id = p ? p.id : '';
  f.name.value = p ? p.name : '';
  f.category.value = p ? p.category : productFilter.cat || (PF.categories()[0] || {}).id || '';
  f.unit.value = p ? p.unit : '';
  f.price.value = p ? p.price : '';
  f.salePrice.value = p && p.salePrice ? p.salePrice : '';
  f.stock.value = p ? p.stock : 20;
  f.storage.value = p ? p.storage : 'Frozen';
  f.description.value = p ? p.description : '';
  f.active.checked = p ? p.active : true;
  f.bestSeller.checked = p ? p.bestSeller : false;
  f.isNew.checked = p ? p.isNew : true;
  f.emoji.value = p ? p.emoji : (PF.category(f.category.value) || {}).emoji || '🍽️';
  editingImage = p ? p.image : '';
  $('#pf-error').hidden = true;
  updatePreview();
  productDialog.showModal();
}

function updatePreview() {
  const f = productForm.elements;
  const draft = {
    name: f.name.value || 'Product name', category: f.category.value, emoji: f.emoji.value, image: editingImage,
    price: Number(f.price.value) || 0, salePrice: Number(f.salePrice.value) || null, unit: f.unit.value,
  };
  const off = PF.discountOf(draft);
  $('#pf-preview').innerHTML = `<div class="preview-card">
    ${thumb(draft, 'xl')}
    ${off ? `<span class="badge-off">${off}%<small>OFF</small></span>` : ''}
    <div class="preview-body"><b>${esc(draft.name)}</b><small>${esc(draft.unit)}</small><strong>${PF.money(PF.priceOf(draft))}</strong></div>
  </div>`;
  $('#pf-remove-img').hidden = !editingImage;
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        // Kept small: photos are stored inside the product record in Firestore.
        const scale = Math.min(1, 480 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.78));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

$('#emoji-picks').innerHTML = EMOJIS.map((e) => `<button type="button" data-emoji="${e}">${e}</button>`).join('');
$('#emoji-picks').onclick = (e) => {
  const b = e.target.closest('[data-emoji]');
  if (!b) return;
  productForm.elements.emoji.value = b.dataset.emoji;
  updatePreview();
};
productForm.addEventListener('input', updatePreview);
productForm.addEventListener('change', updatePreview);
$('#pf-file').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    editingImage = await readImage(file);
    updatePreview();
  } catch (err) {
    toast('Could not read that image.');
  }
};
$('#pf-remove-img').onclick = () => { editingImage = ''; updatePreview(); };

productForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = productForm.elements;
  const err = $('#pf-error');
  const price = Number(f.price.value);
  const sale = f.salePrice.value === '' ? null : Number(f.salePrice.value);
  let problem = '';
  if (!productForm.checkValidity()) problem = 'Please fill in name, category, price and stock.';
  else if (sale !== null && sale >= price) problem = 'Sale price must be lower than the regular price (or leave it empty).';
  if (problem) {
    err.textContent = problem;
    err.hidden = false;
    productForm.reportValidity();
    return;
  }
  const id = productForm.dataset.id;
  const existing = id ? PF.product(id) : null;
  PF.upsert('products', {
    id: id || undefined,
    name: f.name.value.trim(), category: f.category.value, unit: f.unit.value.trim(),
    price, salePrice: sale || null, stock: Math.max(0, Math.round(Number(f.stock.value))),
    storage: f.storage.value, description: f.description.value.trim(),
    active: f.active.checked, bestSeller: f.bestSeller.checked, isNew: f.isNew.checked,
    emoji: f.emoji.value.trim() || '🍽️', image: editingImage,
    createdAt: existing ? existing.createdAt : Date.now(),
  });
  productDialog.close();
  toast(id ? 'Product updated' : 'Product added — it’s live in the store');
  render();
});

/* ---------------- categories ---------------- */
function categoriesView() {
  const products = PF.products(true);
  view.innerHTML = `
    <div class="toolbar"><p class="muted">Categories drive the storefront menu, the round category icons and the product tile colours.</p>
      <span class="spacer"></span><button class="btn btn-primary" id="c-add">+ Add category</button></div>
    <div class="cat-grid">${PF.categories().map((c) => {
      const n = products.filter((p) => p.category === c.id).length;
      return `<div class="cat-card">
        <div class="cat-tile" style="--tile:${esc(c.color)}">${esc(c.emoji)}</div>
        <div class="cat-info"><b>${esc(c.name)}</b><small>${n} product${n === 1 ? '' : 's'}</small></div>
        <div class="cat-actions">
          <button class="btn btn-ghost btn-sm" data-edit-cat="${esc(c.id)}">Edit</button>
          <button class="btn btn-danger-ghost btn-sm" data-delete-cat="${esc(c.id)}">Delete</button>
        </div>
      </div>`;
    }).join('')}</div>`;
  $('#c-add').onclick = () => openCategory();
}

const categoryDialog = $('#category-dialog');
const categoryForm = $('#category-form');
function openCategory(id) {
  const c = id ? PF.category(id) : null;
  $('#cf-title').textContent = c ? 'Edit category' : 'Add category';
  categoryForm.dataset.id = c ? c.id : '';
  categoryForm.elements.name.value = c ? c.name : '';
  categoryForm.elements.emoji.value = c ? c.emoji : '🍽️';
  categoryForm.elements.color.value = c ? c.color.toLowerCase() : '#f3eadf';
  categoryDialog.showModal();
}
categoryForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = categoryForm.dataset.id;
  PF.upsert('categories', {
    id: id || undefined,
    name: categoryForm.elements.name.value.trim(),
    emoji: categoryForm.elements.emoji.value.trim(),
    color: categoryForm.elements.color.value,
  });
  categoryDialog.close();
  toast(id ? 'Category updated' : 'Category added');
  render();
});

/* ---------------- orders ---------------- */
const orderFilter = { status: 'All', q: '' };

function ordersView() {
  const orders = PF.orders();
  const counts = { All: orders.length };
  PF.STATUSES.forEach((s) => { counts[s] = orders.filter((o) => o.status === s).length; });
  view.innerHTML = `
    <div class="toolbar">
      <div class="tabs">${['All', ...PF.STATUSES].map((s) => `
        <button class="tab ${orderFilter.status === s ? 'active' : ''}" data-status-tab="${s}">${s}<span>${counts[s]}</span></button>`).join('')}
      </div>
      <span class="spacer"></span>
      <input type="search" class="input" id="o-search" placeholder="Order #, name or phone…" value="${esc(orderFilter.q)}">
    </div>
    <section class="panel">
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Delivery</th><th>Payment</th><th class="num">Total</th><th>Status</th></tr></thead>
        <tbody id="o-rows"></tbody>
      </table></div>
    </section>`;
  $('#o-search').oninput = (e) => { orderFilter.q = e.target.value; drawOrders(); };
  drawOrders();
}

function drawOrders() {
  const q = orderFilter.q.trim().toLowerCase();
  const list = PF.orders().filter((o) => (orderFilter.status === 'All' || o.status === orderFilter.status)
    && (!q || [o.number, o.customer.name, o.customer.phone].join(' ').toLowerCase().includes(q)));
  $('#o-rows').innerHTML = list.length ? list.map((o) => {
    const waiting = o.items.some((i) => i.status === 'unavailable' && !i.choice);
    return `
    <tr class="clickable${isFresh(o) ? ' row-new' : ''}" data-order="${esc(o.id)}">
      <td><b>${esc(o.number)}</b><small>${fmtDate(o.createdAt)}</small>${o.sample ? '<small class="sample">sample</small>' : ''}</td>
      <td><b>${esc(o.customer.name)}</b><small>${esc(o.customer.phone)}</small></td>
      <td>${o.items.reduce((s, i) => s + i.qty, 0)} items${waiting ? '<small class="warn-text">Waiting on customer</small>' : ''}</td>
      <td>${esc(o.delivery.name)}${o.delivery.date ? `<small>${esc(o.delivery.date)} · ${esc(o.delivery.slot)}</small>` : ''}</td>
      <td>${esc(o.payment)}</td>
      <td class="num"><b>${PF.money(PF.orderTotals(o).total)}</b></td>
      <td><select class="status-select ${statusClass(o.status)}" data-status="${esc(o.id)}">${PF.STATUSES.map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" class="muted pad center">No orders here.</td></tr>';
}

/* ---------------- order detail (live) ---------------- */
const orderDialog = $('#order-dialog');
orderDialog.innerHTML = `
  <header class="dlg-head" id="od-head"></header>
  <div class="dlg-body">
    <div id="od-top"></div>
    <div class="od-map-card" id="od-map-card" hidden>
      <div class="od-map-head"><b id="od-eta">Planning the route…</b><span class="live-dot"></span></div>
      <div class="od-map" id="od-map"></div>
    </div>
    <div id="od-bottom"></div>
  </div>
  <footer class="dlg-foot" id="od-foot"></footer>`;
let odMap = null;
let odStatus = null;

function openOrder(id) {
  if (orderDialog.dataset.id !== id) {
    odMap?.destroy();
    odMap = null;
  }
  orderDialog.dataset.id = id;
  odStatus = null;
  refreshOrder();
  if (!orderDialog.open) orderDialog.showModal();
}

function refreshOrder() {
  const o = PF.order(orderDialog.dataset.id);
  if (!o) return;
  const pickup = !!o.delivery?.pickup;
  const editable = OPEN.includes(o.status);
  const t = PF.orderTotals(o);

  $('#od-head').innerHTML = `
    <h2>${esc(o.number)} ${pill(o.status)}</h2>
    <button type="button" class="icon-btn" data-close aria-label="Close">✕</button>`;

  $('#od-top').innerHTML = `
    <div class="wa-bar">
      <div><small>Customer update</small><b>Send “${esc(o.status)}” message to ${esc(o.customer.phone)}</b></div>
      <a class="btn btn-wa" href="${esc(waLink(o))}" target="_blank" rel="noopener">💬 Send on WhatsApp</a>
      <button class="btn btn-ghost btn-sm" data-copy="${esc(trackUrl(o))}">🔗 Copy link</button>
      <a class="btn btn-ghost btn-sm" href="${esc(trackUrl(o))}" target="_blank" rel="noopener">👁 Customer view ↗</a>
    </div>
    <div class="order-grid">
      <div><small>Customer</small><b>${esc(o.customer.name)}</b><span>${esc(o.customer.phone)}</span>${o.customer.email ? `<span>${esc(o.customer.email)}</span>` : ''}</div>
      <div><small>${pickup ? 'Pickup' : 'Deliver to'}</small>${pickup
        ? '<b>Customer collects at the depot</b>'
        : `<b>${esc(o.address?.line || '')}</b><span>${esc(o.address?.city || '')}${o.address?.landmark ? ` · near ${esc(o.address.landmark)}` : ''}</span>${o.location ? '<span>📍 Pinned on map</span>' : ''}`}</div>
      <div><small>Delivery method</small><b>${esc(o.delivery.name)}</b>${o.delivery.date ? `<span>${esc(o.delivery.date)} · ${esc(o.delivery.slot)}</span>` : ''}</div>
      <div><small>Payment</small><b>${esc(o.payment)}</b><span>Placed ${fmtDate(o.createdAt)}</span></div>
    </div>
    ${o.notes ? `<p class="note">📝 ${esc(o.notes)}</p>` : ''}
    ${editable ? '<p class="stock-tip">🔎 <b>Stock check:</b> mark anything the depot doesn’t have as unavailable — the customer chooses swap or remove on their tracking page, live.</p>' : ''}`;

  $('#od-bottom').innerHTML = `
    <div class="table-wrap"><table class="table items">
      <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Line total</th><th>Availability</th></tr></thead>
      <tbody>${o.items.map((i, idx) => `<tr class="${i.choice === 'remove' ? 'row-removed' : ''}">
        <td>${esc(i.emoji || '')} <b class="inline">${esc(i.name)}</b> <small class="inline">${esc(i.unit)}</small></td>
        <td class="num">${i.qty}</td>
        <td class="num">${PF.money(i.price * i.qty)}</td>
        <td>${editable && !i.choice ? `<div class="seg">
            <button class="${i.status !== 'unavailable' ? 'on ok' : ''}" data-avail="${idx}" data-value="ok">✓ In stock</button>
            <button class="${i.status === 'unavailable' ? 'on no' : ''}" data-avail="${idx}" data-value="unavailable">✕ Unavailable</button>
          </div>` : ''}
          ${i.choice === 'swap' ? '<span class="ctag ctag-swap">Customer: swap for similar</span>' : ''}
          ${i.choice === 'remove' ? '<span class="ctag ctag-remove">Customer: remove</span>' : ''}
          ${i.status === 'unavailable' && !i.choice ? '<span class="ctag ctag-wait">Waiting for customer…</span>' : ''}
          ${!editable && i.status !== 'unavailable' ? '<span class="ctag ctag-ok">In stock</span>' : ''}
        </td>
      </tr>`).join('')}</tbody>
      <tfoot>
        <tr><td colspan="3">Subtotal</td><td class="num">${PF.money(t.subtotal)}</td></tr>
        <tr><td colspan="3">Delivery</td><td class="num">${t.deliveryFee ? PF.money(t.deliveryFee) : 'FREE'}</td></tr>
        <tr class="grand"><td colspan="3">Total</td><td class="num">${PF.money(t.total)}</td></tr>
      </tfoot>
    </table></div>
    ${o.rating ? `<div class="review"><span class="stars-s">${'★'.repeat(o.rating.stars)}<i>${'★'.repeat(5 - o.rating.stars)}</i></span>${o.rating.comment ? `<p>“${esc(o.rating.comment)}”</p>` : ''}</div>` : ''}
    <h4 class="hist-title">History</h4>
    <ul class="history">${(o.history || []).map((h) => `<li>${pill(h.status)}<span>${fmtDate(h.at)}</span></li>`).join('')}</ul>`;

  // Footer only changes with the status, so a half-typed PIN isn't wiped by other live updates.
  if (o.status !== odStatus) {
    odStatus = o.status;
    const next = NEXT[o.status];
    const out = o.status === 'Out for delivery';
    $('#od-foot').innerHTML = `
      ${!['Cancelled', 'Delivered'].includes(o.status) ? '<button class="btn btn-danger-ghost" data-set-status="Cancelled">Cancel order</button>' : ''}
      <span class="spacer"></span>
      <select class="input" id="od-status" aria-label="Status">${PF.STATUSES.map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <button class="btn btn-ghost" id="od-apply">Set</button>
      ${next ? `<button class="btn btn-primary" data-set-status="${next[0]}">${pickup && next[0] === 'Out for delivery' ? '🏬 Ready for pickup' : next[1]} →</button>` : ''}
      ${out ? `<div class="pin-entry">
          <input class="input" id="od-pin" inputmode="numeric" maxlength="4" placeholder="PIN" aria-label="Customer PIN">
          <button class="btn btn-primary" id="od-complete">✓ ${pickup ? 'Mark collected' : 'Complete delivery'}</button>
        </div>` : ''}`;
  }

  // Live map for deliveries on the road.
  const showMap = !!o.route && !pickup && ['Out for delivery', 'Delivered'].includes(o.status);
  $('#od-map-card').hidden = !showMap;
  if (showMap) {
    if (!odMap) {
      odMap = createTrackMap($('#od-map'), (tk) => {
        $('#od-eta').textContent = tk.delivered ? 'Delivered ✓'
          : tk.arrived ? `${o.rider?.name || 'Rider'} has arrived — ask the customer for their PIN`
            : `${o.rider?.name || 'Rider'} · arriving in ${tk.minutes} min · ${tk.km.toFixed(1)} km`;
      });
    }
    odMap.setOrder(o);
  } else if (odMap) {
    odMap.destroy();
    odMap = null;
  }
}

orderDialog.addEventListener('close', () => {
  odMap?.destroy();
  odMap = null;
  if (renderPending) scheduleRender();
});

async function setStatus(id, status, button) {
  const o = PF.order(id);
  if (!o) return;
  if (button) { button.disabled = true; button.textContent = status === 'Out for delivery' ? 'Planning route…' : 'Saving…'; }
  await PF.setOrderStatus(id, status);
  toast(`${o.number} → ${status}${['Confirmed', 'Out for delivery', 'Delivered'].includes(status) ? ' · send the WhatsApp update' : ''}`);
  render();
  if (orderDialog.open && orderDialog.dataset.id === id) refreshOrder();
}

/* ---------------- delivery ---------------- */
function deliveryView() {
  const orders = PF.orders();
  view.innerHTML = `
    <div class="callout">
      <span class="callout-ico">🧪</span>
      <div><b>Placeholder delivery options.</b> These exist so checkout works end-to-end. We’ll decide the real delivery model together. Every
      option here is editable and changes show up in checkout right away.</div>
    </div>
    <div class="toolbar"><span class="spacer"></span><button class="btn btn-primary" id="d-add">+ Add delivery option</button></div>
    <div class="dl-grid">${PF.deliveryOptions(true).map((d) => {
      const used = orders.filter((o) => o.delivery.id === d.id).length;
      return `<form class="dl-card ${d.enabled ? '' : 'is-off'}" data-dl="${esc(d.id)}">
        <div class="dl-head">
          <label class="switch" title="Offer at checkout"><input type="checkbox" name="enabled" ${d.enabled ? 'checked' : ''}><span></span></label>
          <input class="dl-name" name="name" value="${esc(d.name)}" required aria-label="Option name">
          <span class="dl-kind">${d.pickup ? '🏬 Pickup' : '🚚 Delivery'}</span>
        </div>
        <label>Description<textarea name="description" rows="2">${esc(d.description)}</textarea></label>
        <div class="row3">
          <label>Fee (Rs.)<input type="number" name="fee" min="0" step="1" value="${d.fee}"></label>
          <label>Free over (Rs.)<input type="number" name="freeOver" min="0" step="1" value="${d.freeOver}" title="0 = never free"></label>
          <label>ETA label<input name="eta" value="${esc(d.eta)}"></label>
        </div>
        <label class="check"><input type="checkbox" name="schedule" ${d.schedule ? 'checked' : ''}> Customer picks a date &amp; time slot</label>
        <label class="check"><input type="checkbox" name="pickup" ${d.pickup ? 'checked' : ''}> Pickup option (no address needed)</label>
        <div class="dl-foot">
          <small class="muted">Used in ${used} order${used === 1 ? '' : 's'}</small>
          <span class="spacer"></span>
          <button type="button" class="btn btn-danger-ghost btn-sm" data-delete-dl="${esc(d.id)}">Delete</button>
          <button type="submit" class="btn btn-primary btn-sm">Save</button>
        </div>
      </form>`;
    }).join('')}</div>

    <section class="panel slots-panel">
      <div class="panel-head"><h3>Time slots</h3></div>
      <div class="pad">
        <p class="muted">Offered for options where the customer picks a date &amp; time slot. Enter one slot per line.</p>
        <textarea class="input" id="slots" rows="5">${esc(PF.slots.join('\n'))}</textarea>
        <button class="btn btn-primary" id="save-slots">Save time slots</button>
      </div>
    </section>`;

  $('#d-add').onclick = () => {
    PF.upsert('delivery', { name: 'New delivery option', description: 'Describe the area, timing and packaging.', fee: 500, freeOver: 0, eta: '1–2 days', schedule: false, pickup: false, enabled: false });
    toast('Option added — it stays hidden until you switch it on');
    render();
  };
  $('#save-slots').onclick = () => {
    const slots = $('#slots').value.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!slots.length) return toast('Add at least one time slot');
    PF.saveSlots(slots);
    toast('Time slots saved');
  };
  $$('.dl-card').forEach((form) => {
    form.elements.enabled.onchange = () => {
      PF.upsert('delivery', { id: form.dataset.dl, enabled: form.elements.enabled.checked });
      form.classList.toggle('is-off', !form.elements.enabled.checked);
      toast(form.elements.enabled.checked ? 'Shown at checkout' : 'Hidden from checkout');
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      const f = form.elements;
      PF.upsert('delivery', {
        id: form.dataset.dl, name: f.name.value.trim() || 'Untitled option', description: f.description.value.trim(),
        fee: Math.max(0, Number(f.fee.value) || 0), freeOver: Math.max(0, Number(f.freeOver.value) || 0), eta: f.eta.value.trim(),
        schedule: f.schedule.checked, pickup: f.pickup.checked, enabled: f.enabled.checked,
      });
      toast('Delivery option saved');
      document.activeElement?.blur();
      render();
    };
  });
}

/* ---------------- settings ---------------- */
function settingsView() {
  view.innerHTML = `
    <section class="panel">
      <div class="panel-head"><h3>Store details</h3></div>
      <form class="pad fields" id="settings-form">
        <label>Hotline number<input class="input" name="hotline" value="${esc(PF.settings.hotline)}"></label>
        <label>Announcement bar<input class="input" name="announcement" value="${esc(PF.settings.announcement)}"></label>
        <div><button class="btn btn-primary">Save</button></div>
      </form>
    </section>
    <section class="panel">
      <div class="panel-head"><h3>About this prototype</h3></div>
      <div class="pad">
        <ul class="about">
          <li>Products, orders and delivery options are stored online (Firebase), so every phone and laptop sees the same data, live.</li>
          <li>WhatsApp messages are sent from your own WhatsApp: the button opens WhatsApp with the message already written.</li>
          <li>The rider on the map is simulated: a 30-second drive along a real road route from the depot.</li>
          <li>There’s no login or payment gateway yet. Those come after the prototype is approved.</li>
        </ul>
      </div>
    </section>
    <section class="panel danger">
      <div class="panel-head"><h3>Demo data</h3></div>
      <div class="pad">
        <p class="muted"><b>Clear demo orders</b> deletes every order (including any real phone numbers used while testing). <b>Reset</b> also restores the sample products, categories and delivery options.</p>
        <div class="btn-row">
          <button class="btn btn-danger-ghost" id="clear-orders">Clear demo orders</button>
          <button class="btn btn-danger" id="reset">Reset everything to sample data</button>
        </div>
      </div>
    </section>`;
  $('#settings-form').onsubmit = (e) => {
    e.preventDefault();
    PF.saveSettings({ hotline: e.target.elements.hotline.value.trim(), announcement: e.target.elements.announcement.value.trim() });
    toast('Settings saved');
  };
  $('#clear-orders').onclick = async (e) => {
    if (!confirm('Delete every order? This can’t be undone.')) return;
    e.target.disabled = true;
    silenceAlerts();
    await PF.clearOrders();
    toast('All orders cleared');
    render();
  };
  $('#reset').onclick = async (e) => {
    if (!confirm('Reset all data? Products, categories, delivery options and orders you added will be lost.')) return;
    e.target.disabled = true;
    e.target.textContent = 'Resetting…';
    silenceAlerts();
    await PF.reset();
    toast('Demo data restored');
    render();
  };
}

/* ---------------- live alerts ---------------- */
let known = new Map();
let quietUntil = 0;
const signature = (o) => ({ choices: o.items.map((i) => i.choice || '').join('|'), rated: !!o.rating });
function silenceAlerts() { quietUntil = Date.now() + 5000; }

function checkAlerts() {
  const quiet = Date.now() < quietUntil;
  PF.orders().forEach((o) => {
    const before = known.get(o.id);
    const now = signature(o);
    if (!quiet) {
      if (!before) {
        chime();
        toast(`🔔 New order ${o.number} from ${o.customer.name}`);
        $('.side-nav a[data-view="orders"]').classList.add('flash');
        setTimeout(() => $('.side-nav a[data-view="orders"]').classList.remove('flash'), 4000);
      } else if (before.choices !== now.choices) {
        chime();
        toast(`💬 ${o.customer.name} answered about an unavailable item on ${o.number}`);
      } else if (!before.rated && now.rated) {
        toast(`⭐ ${o.customer.name} rated ${o.number}: ${o.rating.stars}/5`);
      }
    }
    known.set(o.id, now);
  });
}

/* ---------------- global events ---------------- */
document.addEventListener('click', (e) => {
  const t = e.target;
  const closeBtn = t.closest('[data-close]');
  if (closeBtn) { closeBtn.closest('dialog').close(); return; }

  const edit = t.closest('[data-edit]');
  if (edit) { openProduct(edit.dataset.edit); return; }

  const del = t.closest('[data-delete-product]');
  if (del) {
    const p = PF.product(del.dataset.deleteProduct);
    if (p && confirm(`Delete “${p.name}”? You can hide it with the Visible switch instead if you might bring it back.`)) {
      PF.remove('products', p.id);
      toast('Product deleted');
      render();
    }
    return;
  }

  const editCat = t.closest('[data-edit-cat]');
  if (editCat) { openCategory(editCat.dataset.editCat); return; }

  const delCat = t.closest('[data-delete-cat]');
  if (delCat) {
    const c = PF.category(delCat.dataset.deleteCat);
    const n = PF.products(true).filter((p) => p.category === c.id).length;
    if (n) { alert(`“${c.name}” still has ${n} product${n === 1 ? '' : 's'}. Move or delete them first.`); return; }
    if (confirm(`Delete the “${c.name}” category?`)) { PF.remove('categories', c.id); toast('Category deleted'); render(); }
    return;
  }

  const delDl = t.closest('[data-delete-dl]');
  if (delDl) {
    const d = PF.deliveryOption(delDl.dataset.deleteDl);
    if (d && confirm(`Delete the “${d.name}” delivery option? Past orders keep their delivery details.`)) {
      PF.remove('delivery', d.id);
      toast('Delivery option deleted');
      render();
    }
    return;
  }

  const tab = t.closest('[data-status-tab]');
  if (tab) { orderFilter.status = tab.dataset.statusTab; ordersView(); return; }

  const setBtn = t.closest('[data-set-status]');
  if (setBtn) {
    const status = setBtn.dataset.setStatus;
    if (status === 'Cancelled' && !confirm('Cancel this order?')) return;
    setStatus(orderDialog.dataset.id, status, setBtn);
    return;
  }
  if (t.closest('#od-apply')) { setStatus(orderDialog.dataset.id, $('#od-status').value, t.closest('#od-apply')); return; }

  if (t.closest('#od-complete')) {
    const o = PF.order(orderDialog.dataset.id);
    const pin = $('#od-pin');
    if (pin.value.trim() !== String(o.pin)) {
      pin.classList.add('shake');
      setTimeout(() => pin.classList.remove('shake'), 500);
      toast('That PIN doesn’t match — ask the customer for the 4-digit PIN on their tracking page');
      return;
    }
    setStatus(o.id, 'Delivered', t.closest('#od-complete'));
    return;
  }

  const avail = t.closest('[data-avail]');
  if (avail) {
    const o = PF.order(orderDialog.dataset.id);
    const idx = Number(avail.dataset.avail);
    const items = o.items.map((it, i) => (i === idx ? { ...it, status: avail.dataset.value } : it));
    PF.updateOrder(o.id, { items });
    refreshOrder();
    if (avail.dataset.value === 'unavailable') toast('Marked unavailable — send the WhatsApp update so the customer can choose');
    return;
  }

  const copy = t.closest('[data-copy]');
  if (copy) {
    navigator.clipboard?.writeText(copy.dataset.copy).then(() => toast('Tracking link copied'), () => toast(copy.dataset.copy));
    return;
  }

  if (t.closest('select, input, button, a, label')) return;
  const row = t.closest('[data-order]');
  if (row) openOrder(row.dataset.order);
});

document.addEventListener('change', (e) => {
  const toggle = e.target.closest('[data-toggle]');
  if (toggle) {
    PF.upsert('products', { id: toggle.dataset.toggle, active: toggle.checked });
    toast(toggle.checked ? 'Now visible in store' : 'Hidden from store');
    drawProducts();
    return;
  }
  const sel = e.target.closest('[data-status]');
  if (sel) {
    sel.blur();
    setStatus(sel.dataset.status, sel.value);
  }
});

// Close dialogs when clicking the backdrop.
$$('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

$('#menu-toggle').onclick = () => document.body.classList.toggle('side-open');
$('#side-scrim').onclick = () => document.body.classList.remove('side-open');

view.innerHTML = '<div class="boot"><div class="spinner"></div><p>Connecting to the store database…</p></div>';

PF.onChange((evt) => {
  if (evt.error) { toast('Connection problem — changes may not be saved. Check your internet and refresh.'); return; }
  if (evt.name === 'orders') checkAlerts();
  scheduleRender();
  if (orderDialog.open) refreshOrder();
});

PF.start({ orders: true }).then(() => {
  PF.orders().forEach((o) => known.set(o.id, signature(o)));
  render();
  window.addEventListener('hashchange', render);
}).catch((err) => {
  view.innerHTML = `<div class="callout"><span class="callout-ico">🔌</span><div><b>Can’t reach the database.</b>
    Check your internet connection, and that the Firestore database exists and its rules allow access.<br><small class="muted">${esc(err.message || err)}</small></div></div>`;
});
