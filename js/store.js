/* Pantry Foods prototype — shared data layer backed by Firebase Firestore.
   Every open page keeps a live copy of the catalogue (and, in the admin panel, all
   orders). A change made anywhere — admin laptop or customer phone — reaches every
   other open page within a second or two. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch, runTransaction,
  getDocs, query, where,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { AREAS, DEPOT, DEFAULT_DROP, RIDERS, areaPoint, fetchRoute } from './maps.js';

// Firebase web config — public by design; access is controlled by Firestore security rules.
const app = initializeApp({
  apiKey: 'AIzaSyC7aRFCsUj74kf9CsZlF6AOtq8hJ5oGJZQ',
  authDomain: 'pantyfoodsprotopype.firebaseapp.com',
  projectId: 'pantyfoodsprotopype',
  storageBucket: 'pantyfoodsprotopype.firebasestorage.app',
  messagingSenderId: '1059102963306',
  appId: '1:1059102963306:web:2faa8f9620e6288c09bc13',
});
const db = getFirestore(app);

const STATUSES = ['Placed', 'Stock check', 'Confirmed', 'Packed', 'Out for delivery', 'Delivered', 'Cancelled'];
const CATALOG = ['categories', 'products', 'delivery'];
const state = { categories: [], products: [], delivery: [], orders: [], meta: null };
const listeners = [];
let ready = false;

const token = (n) => Array.from({ length: n }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 31)]).join('');
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'item';
const clean = (o) => JSON.parse(JSON.stringify(o)); // Firestore rejects `undefined` values
const bySort = (a, b) => (a.sort ?? 0) - (b.sort ?? 0);
const newestFirst = (a, b) => (b.createdAt || 0) - (a.createdAt || 0);

function emit(evt) {
  if (ready || evt.error) listeners.forEach((fn) => fn(evt));
}
function report(err) {
  console.error(err);
  emit({ error: err });
}

/** Sri Lankan numbers → international digits for WhatsApp, e.g. "077 123 4567" → "94771234567". */
function phoneDigits(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '94' + d.slice(1);
  else if (d.length === 9) d = '94' + d;
  return d;
}

function seed() {
  const now = Date.now();
  const hour = 3600 * 1000;

  const categories = [
    { id: 'sausages', name: 'Sausages & Franks', emoji: '🌭', color: '#F7D9C4' },
    { id: 'coldcuts', name: 'Cold Cuts', emoji: '🥓', color: '#F4CFCB' },
    { id: 'patties', name: 'Burger Patties', emoji: '🍔', color: '#F6E3A9' },
    { id: 'crumbed', name: 'Crumbed Range', emoji: '🍗', color: '#F9E6BE' },
    { id: 'seafood', name: 'Seafood', emoji: '🐟', color: '#D3E7EF' },
    { id: 'ready', name: 'Ready Meals', emoji: '🍛', color: '#E3EACB' },
    { id: 'pantry', name: 'Pantry Staples', emoji: '🥫', color: '#EADFCF' },
    { id: 'packs', name: 'Party Packs', emoji: '🎉', color: '#EBDDF2' },
  ].map((c, i) => ({ ...c, sort: i }));

  const P = (id, name, category, price, salePrice, unit, stock, emoji, storage, description, flags = {}) => ({
    id, name, category, price, salePrice, unit, stock, emoji, image: '', storage, description,
    bestSeller: !!flags.best, isNew: !!flags.new, active: true, createdAt: now,
  });

  const products = [
    P('chicken-cocktail-sausages', 'Chicken Cocktail Sausages', 'sausages', 1250, 1125, '500 g', 40, '🌭', 'Frozen',
      'Bite-sized smoked chicken sausages, perfect for devilled dishes, breakfast plates and party sticks.', { best: true }),
    P('chicken-frankfurters', 'Chicken Frankfurters', 'sausages', 2150, null, '1 kg · 20 pcs', 32, '🌭', 'Frozen',
      'Classic long franks with a gentle smoky finish. Grill, pan-fry or boil in minutes.', { best: true }),
    P('pork-bratwurst', 'Pork Bratwurst', 'sausages', 1890, null, '400 g · 6 pcs', 14, '🌭', 'Frozen',
      'Authentic German-style bratwurst seasoned with marjoram and white pepper.'),
    P('smoked-chicken-ham', 'Smoked Chicken Ham Slices', 'coldcuts', 1050, null, '200 g', 25, '🥓', 'Chilled',
      'Thin-sliced, ready-to-eat smoked chicken ham for sandwiches and salads.', { new: true }),
    P('beef-pepperoni', 'Beef Pepperoni Slices', 'coldcuts', 1450, 1380, '150 g', 18, '🍕', 'Chilled',
      'Spicy, air-dried pepperoni that crisps beautifully on pizza.'),
    P('chicken-salami', 'Chicken Salami', 'coldcuts', 1690, null, '250 g', 4, '🥓', 'Chilled',
      'Italian-style salami with black pepper and garlic. Slice and serve.'),
    P('classic-beef-patties', 'Classic Beef Burger Patties', 'patties', 1590, null, '400 g · 4 pcs', 30, '🍔', 'Frozen',
      'Juicy quarter-pound beef patties, perfectly formed for the grill.', { best: true }),
    P('chicken-burger-patties', 'Chicken Burger Patties', 'patties', 1480, 1260, '480 g · 6 pcs', 22, '🍔', 'Frozen',
      'Seasoned chicken patties that cook straight from frozen in 8 minutes.'),
    P('chicken-nuggets', 'Crumbed Chicken Nuggets', 'crumbed', 1350, null, '500 g', 50, '🍗', 'Frozen',
      'Golden, crunchy nuggets made with whole chicken breast. A lunchbox favourite.', { best: true }),
    P('crispy-chicken-strips', 'Crispy Chicken Strips', 'crumbed', 1520, null, '400 g', 20, '🍗', 'Frozen',
      'Marinated chicken strips in a spiced crumb. Air-fryer friendly.', { new: true }),
    P('fish-fingers', 'Crumbed Fish Fingers', 'seafood', 990, 890, '300 g · 10 pcs', 26, '🐟', 'Frozen',
      'Flaky white fish in a light golden crumb. Ready in 12 minutes.'),
    P('tempura-prawns', 'Tempura Prawns', 'seafood', 2450, null, '250 g · 12 pcs', 9, '🍤', 'Frozen',
      'Butterflied prawns in a crisp tempura batter, great with sweet chilli.', { new: true }),
    P('chicken-lasagna', 'Chicken Lasagna', 'ready', 1750, null, '450 g', 12, '🍝', 'Frozen',
      'Layers of pasta, chicken ragù and béchamel. Heat and eat.', { new: true }),
    P('chicken-curry-rice', 'Chicken Curry & Yellow Rice', 'ready', 1390, null, '400 g', 15, '🍛', 'Frozen',
      'A Sri Lankan-style chicken curry with ghee yellow rice, ready in 6 minutes.'),
    P('samba-rice', 'Keeri Samba Rice', 'pantry', 1450, null, '5 kg', 60, '🍚', 'Ambient',
      'Premium aromatic keeri samba, cleaned and sorted.'),
    P('roasted-curry-powder', 'Roasted Curry Powder', 'pantry', 520, null, '250 g', 80, '🌶️', 'Ambient',
      'Dark-roasted Sri Lankan curry blend for meat and fish curries.'),
    P('tomato-ketchup', 'Tomato Ketchup', 'pantry', 480, 430, '400 g', 70, '🍅', 'Ambient',
      'Thick, tangy tomato ketchup — the essential sausage partner.'),
    P('bbq-party-pack', 'BBQ Party Pack', 'packs', 6950, 5990, 'Feeds 8–10', 10, '🔥', 'Frozen',
      'Beef patties, chicken franks, bratwurst and cocktail sausages — everything for a backyard grill.', { best: true }),
  ].map((p, i) => ({ ...p, sort: i }));

  const delivery = [
    { id: 'standard', name: 'Standard Delivery', description: 'Colombo & suburbs, delivered in insulated cool boxes.',
      fee: 350, freeOver: 10000, eta: '1–2 days', schedule: false, pickup: false, enabled: true },
    { id: 'express', name: 'Express Same-Day', description: 'Order before 2:00 PM for same-day delivery within Colombo.',
      fee: 750, freeOver: 0, eta: 'Today', schedule: false, pickup: false, enabled: true },
    { id: 'scheduled', name: 'Scheduled Time Slot', description: 'Pick a date and a 3-hour window that suits you.',
      fee: 450, freeOver: 15000, eta: 'You choose', schedule: true, pickup: false, enabled: true },
    { id: 'pickup', name: 'Depot Pickup', description: `Collect from our depot in ${DEPOT.address}.`,
      fee: 0, freeOver: 0, eta: 'Ready in 2 hours', schedule: true, pickup: true, enabled: true },
  ].map((d, i) => ({ ...d, sort: i }));

  const line = (id, qty) => {
    const p = products.find((x) => x.id === id);
    return { id, name: p.name, unit: p.unit, emoji: p.emoji, price: p.salePrice || p.price, qty, status: 'ok', choice: null };
  };
  const sample = (n, tok, hoursAgo, name, phone, city, items, deliveryId, payment, status, extra = {}) => {
    const opt = delivery.find((d) => d.id === deliveryId);
    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const fee = opt.freeOver && subtotal >= opt.freeOver ? 0 : opt.fee;
    const at = now - hoursAgo * hour;
    return {
      id: `PF-${n}-${tok}`, number: `PF-${n}`, createdAt: at, customer: { name, phone, email: '' },
      address: { line: '12 Sample Lane', city, landmark: '' }, location: AREAS[city], notes: '',
      items, subtotal, deliveryFee: fee, total: subtotal + fee,
      delivery: { id: opt.id, name: opt.name, pickup: false, date: '', slot: '' }, payment, status,
      history: STATUSES.slice(0, STATUSES.indexOf(status) + 1).map((s, i) => ({ status: s, at: at + i * hour * 0.4 })),
      pin: String(1000 + n), rider: null, route: null, rating: null, sample: true, ...extra,
    };
  };

  const orders = [
    sample(1003, 'demo3', 1, 'Nimali Perera', '077 123 4567', 'Colombo 07',
      [line('bbq-party-pack', 1), line('tomato-ketchup', 2)], 'express', 'Cash on Delivery', 'Placed'),
    sample(1002, 'demo2', 20, 'Kasun Silva', '071 987 6543', 'Nugegoda',
      [line('chicken-nuggets', 2), line('chicken-frankfurters', 1)], 'standard', 'Card on Delivery', 'Confirmed'),
    sample(1001, 'demo1', 50, 'Ayesha Fernando', '076 555 0101', 'Dehiwala',
      [line('classic-beef-patties', 3), line('smoked-chicken-ham', 2), line('samba-rice', 1)], 'scheduled', 'Bank Transfer', 'Delivered',
      { rating: { stars: 5, comment: 'Sausages arrived frozen solid — great packing!', at: now - 40 * hour } }),
  ];

  const meta = {
    settings: {
      hotline: '011 234 5678',
      announcement: 'Delivered cold from our Colombo depot · Track every order live on WhatsApp',
    },
    slots: ['9:00 AM – 12:00 PM', '12:00 PM – 3:00 PM', '3:00 PM – 6:00 PM', '6:00 PM – 9:00 PM'],
    nextOrder: 1004,
  };

  return { categories, products, delivery, orders, meta };
}

async function writeAll(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
}

async function seedDatabase() {
  const data = seed();
  const ops = [];
  [...CATALOG, 'orders'].forEach((name) => data[name].forEach(({ id, ...rest }) => {
    ops.push((b) => b.set(doc(db, name, id), clean(rest)));
  }));
  ops.push((b) => b.set(doc(db, 'meta', 'store'), clean(data.meta)));
  await writeAll(ops);
}

async function deleteCollection(name) {
  const snap = await getDocs(collection(db, name));
  await writeAll(snap.docs.map((d) => (b) => b.delete(d.ref)));
}

let starting = null;

/** Connect to Firestore. The admin panel also streams every order ({ orders: true }). */
function start({ orders = false } = {}) {
  if (starting) return starting;
  starting = new Promise((resolve, reject) => {
    const names = [...CATALOG, ...(orders ? ['orders'] : [])];
    let waiting = names.length + 1;
    const arrived = () => { if (--waiting === 0) resolve(); };
    const fail = (err) => { reject(err); report(err); };

    names.forEach((name) => {
      let first = true;
      onSnapshot(collection(db, name), (snap) => {
        state[name] = snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort(name === 'orders' ? newestFirst : bySort);
        if (first) { first = false; arrived(); } else emit({ name, changes: snap.docChanges().map((c) => ({ type: c.type, id: c.doc.id })) });
      }, fail);
    });

    let first = true;
    onSnapshot(doc(db, 'meta', 'store'), (snap) => {
      state.meta = snap.exists() ? snap.data() : null;
      if (first) { first = false; arrived(); } else emit({ name: 'meta' });
    }, fail);
  }).then(async () => {
    if (!state.meta) await seedDatabase();
    ready = true;
  });
  return starting;
}

const PF = {
  STATUSES,
  start,
  phoneDigits,
  get settings() { return state.meta?.settings || {}; },
  get slots() { return state.meta?.slots || []; },

  categories: () => state.categories,
  category: (id) => state.categories.find((c) => c.id === id),
  products: (includeHidden) => (includeHidden ? state.products : state.products.filter((p) => p.active)),
  product: (id) => state.products.find((p) => p.id === id),
  deliveryOptions: (includeDisabled) => (includeDisabled ? state.delivery : state.delivery.filter((d) => d.enabled)),
  deliveryOption: (id) => state.delivery.find((d) => d.id === id),
  orders: () => state.orders,
  order: (id) => state.orders.find((o) => o.id === id),

  priceOf: (p) => (p.salePrice && p.salePrice < p.price ? p.salePrice : p.price),
  discountOf: (p) => (p.salePrice && p.salePrice < p.price ? Math.round((1 - p.salePrice / p.price) * 100) : 0),
  deliveryFee: (opt, subtotal) => (opt.freeOver && subtotal >= opt.freeOver ? 0 : Number(opt.fee) || 0),
  money: (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  /** Totals after the customer removed any unavailable items. */
  orderTotals(o) {
    const subtotal = (o.items || []).filter((i) => i.choice !== 'remove').reduce((s, i) => s + i.price * i.qty, 0);
    return { subtotal, deliveryFee: o.deliveryFee || 0, total: subtotal + (o.deliveryFee || 0) };
  },

  /** Insert or update a category / product / delivery option. Updates the local copy instantly. */
  upsert(collectionName, item) {
    const { id: givenId, ...data } = item;
    const id = givenId || `${slug(item.name)}-${token(3)}`;
    const list = state[collectionName];
    const i = list.findIndex((x) => x.id === id);
    if (i < 0 && data.sort == null) data.sort = Date.now();
    if (i >= 0) list[i] = { ...list[i], ...data };
    else list.push({ ...data, id });
    setDoc(doc(db, collectionName, id), clean(data), { merge: true }).catch(report);
    return { ...data, id };
  },
  remove(collectionName, id) {
    state[collectionName] = state[collectionName].filter((x) => x.id !== id);
    deleteDoc(doc(db, collectionName, id)).catch(report);
  },

  /** Saves the order with the next order number and a private tracking id. */
  placeOrder(order) {
    const metaRef = doc(db, 'meta', 'store');
    return runTransaction(db, async (tx) => {
      const meta = await tx.get(metaRef);
      const refs = order.items.map((i) => doc(db, 'products', i.id));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      const n = meta.data()?.nextOrder || 1001;
      const now = Date.now();
      const full = {
        ...order, number: `PF-${n}`, createdAt: now, status: 'Placed', history: [{ status: 'Placed', at: now }],
        pin: String(1000 + Math.floor(Math.random() * 9000)), rider: null, route: null, rating: null,
      };
      const id = `${full.number}-${token(5)}`;
      tx.update(metaRef, { nextOrder: n + 1 });
      snaps.forEach((s, i) => {
        if (s.exists()) tx.update(refs[i], { stock: Math.max(0, (s.data().stock || 0) - order.items[i].qty) });
      });
      tx.set(doc(db, 'orders', id), clean(full));
      return { ...full, id };
    });
  },

  /** Live updates for a single order (customer tracking page). Returns an unsubscribe function. */
  watchOrder(id, callback) {
    return onSnapshot(doc(db, 'orders', id),
      (snap) => callback(snap.exists() ? { ...snap.data(), id: snap.id } : null),
      (err) => { report(err); callback(null); });
  },

  /** Look up a tracking id from the order number plus the WhatsApp number used at checkout. */
  async findOrder(number, phone) {
    const snap = await getDocs(query(collection(db, 'orders'), where('number', '==', number.trim().toUpperCase())));
    const hit = snap.docs.find((d) => phoneDigits(d.data().customer?.phone) === phoneDigits(phone));
    return hit ? hit.id : null;
  },

  updateOrder(id, patch) {
    const local = PF.order(id);
    if (local) Object.assign(local, patch);
    return updateDoc(doc(db, 'orders', id), clean(patch)).catch(report);
  },

  /** Moves an order to a new stage. Dispatching a delivery also plans the route and assigns a rider. */
  async setOrderStatus(id, status) {
    const o = PF.order(id);
    if (!o || o.status === status) return;
    const patch = { status, history: [...(o.history || []), { status, at: Date.now() }] };
    if (status === 'Out for delivery') {
      if (!o.delivery?.pickup && !o.route) {
        const to = o.location || areaPoint(o.address?.city) || DEFAULT_DROP;
        const route = await fetchRoute(DEPOT, to);
        Object.assign(patch, {
          route: JSON.stringify(route.points),
          routeDistance: Math.round(route.distance),
          routeDuration: Math.round(route.duration),
          rider: RIDERS[Math.floor(Math.random() * RIDERS.length)],
        });
      }
      patch.outForDeliveryAt = Date.now();
      patch.history[patch.history.length - 1].at = patch.outForDeliveryAt;
    }
    return PF.updateOrder(id, patch);
  },

  saveSettings(patch) {
    const settings = { ...PF.settings, ...patch };
    state.meta = { ...state.meta, settings };
    updateDoc(doc(db, 'meta', 'store'), { settings: clean(settings) }).catch(report);
  },
  saveSlots(slots) {
    state.meta = { ...state.meta, slots };
    updateDoc(doc(db, 'meta', 'store'), { slots }).catch(report);
  },
  async clearOrders() { await deleteCollection('orders'); },
  async reset() {
    for (const name of [...CATALOG, 'orders']) await deleteCollection(name);
    await seedDatabase();
  },

  onChange(fn) { listeners.push(fn); },
};

window.PF = PF; // handy for poking around in the browser console
export default PF;
