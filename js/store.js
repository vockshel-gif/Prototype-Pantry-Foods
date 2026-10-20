/* Pantry Foods prototype — shared data layer.
   Everything lives in localStorage, so the storefront (index.html) and the
   admin panel (admin.html) see the same products, orders and delivery options. */
(function () {
  const KEY = 'pantryfoods:db:v1';
  const STATUSES = ['Pending', 'Confirmed', 'Packed', 'Out for delivery', 'Delivered', 'Cancelled'];
  const listeners = [];

  const uid = (prefix) => prefix + '-' + Math.random().toString(36).slice(2, 8);
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'item';

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
    ];

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
        'Authentic German-style bratwurst seasoned with marjoram and white pepper.', {}),
      P('smoked-chicken-ham', 'Smoked Chicken Ham Slices', 'coldcuts', 1050, null, '200 g', 25, '🥓', 'Chilled',
        'Thin-sliced, ready-to-eat smoked chicken ham for sandwiches and salads.', { new: true }),
      P('beef-pepperoni', 'Beef Pepperoni Slices', 'coldcuts', 1450, 1380, '150 g', 18, '🍕', 'Chilled',
        'Spicy, air-dried pepperoni that crisps beautifully on pizza.', {}),
      P('chicken-salami', 'Chicken Salami', 'coldcuts', 1690, null, '250 g', 4, '🥓', 'Chilled',
        'Italian-style salami with black pepper and garlic. Slice and serve.', {}),
      P('classic-beef-patties', 'Classic Beef Burger Patties', 'patties', 1590, null, '400 g · 4 pcs', 30, '🍔', 'Frozen',
        'Juicy quarter-pound beef patties, perfectly formed for the grill.', { best: true }),
      P('chicken-burger-patties', 'Chicken Burger Patties', 'patties', 1480, 1260, '480 g · 6 pcs', 22, '🍔', 'Frozen',
        'Seasoned chicken patties that cook straight from frozen in 8 minutes.', {}),
      P('chicken-nuggets', 'Crumbed Chicken Nuggets', 'crumbed', 1350, null, '500 g', 50, '🍗', 'Frozen',
        'Golden, crunchy nuggets made with whole chicken breast. A lunchbox favourite.', { best: true }),
      P('crispy-chicken-strips', 'Crispy Chicken Strips', 'crumbed', 1520, null, '400 g', 20, '🍗', 'Frozen',
        'Marinated chicken strips in a spiced crumb. Air-fryer friendly.', { new: true }),
      P('fish-fingers', 'Crumbed Fish Fingers', 'seafood', 990, 890, '300 g · 10 pcs', 26, '🐟', 'Frozen',
        'Flaky white fish in a light golden crumb. Ready in 12 minutes.', {}),
      P('tempura-prawns', 'Tempura Prawns', 'seafood', 2450, null, '250 g · 12 pcs', 9, '🍤', 'Frozen',
        'Butterflied prawns in a crisp tempura batter, great with sweet chilli.', { new: true }),
      P('chicken-lasagna', 'Chicken Lasagna', 'ready', 1750, null, '450 g', 12, '🍝', 'Frozen',
        'Layers of pasta, chicken ragù and béchamel. Heat and eat.', { new: true }),
      P('chicken-curry-rice', 'Chicken Curry & Yellow Rice', 'ready', 1390, null, '400 g', 15, '🍛', 'Frozen',
        'A Sri Lankan-style chicken curry with ghee yellow rice, ready in 6 minutes.', {}),
      P('samba-rice', 'Keeri Samba Rice', 'pantry', 1450, null, '5 kg', 60, '🍚', 'Ambient',
        'Premium aromatic keeri samba, cleaned and sorted.', {}),
      P('roasted-curry-powder', 'Roasted Curry Powder', 'pantry', 520, null, '250 g', 80, '🌶️', 'Ambient',
        'Dark-roasted Sri Lankan curry blend for meat and fish curries.', {}),
      P('tomato-ketchup', 'Tomato Ketchup', 'pantry', 480, 430, '400 g', 70, '🍅', 'Ambient',
        'Thick, tangy tomato ketchup — the essential sausage partner.', {}),
      P('bbq-party-pack', 'BBQ Party Pack', 'packs', 6950, 5990, 'Feeds 8–10', 10, '🔥', 'Frozen',
        'Beef patties, chicken franks, bratwurst and cocktail sausages — everything for a backyard grill.', { best: true }),
    ];

    const delivery = [
      { id: 'standard', name: 'Standard Delivery', description: 'Colombo & suburbs, delivered in insulated cool boxes.',
        fee: 350, freeOver: 10000, eta: '1–2 days', schedule: false, pickup: false, enabled: true },
      { id: 'express', name: 'Express Same-Day', description: 'Order before 2:00 PM for same-day delivery within Colombo.',
        fee: 750, freeOver: 0, eta: 'Today', schedule: false, pickup: false, enabled: true },
      { id: 'scheduled', name: 'Scheduled Time Slot', description: 'Pick a date and a 3-hour window that suits you.',
        fee: 450, freeOver: 15000, eta: 'You choose', schedule: true, pickup: false, enabled: true },
      { id: 'pickup', name: 'Store Pickup', description: 'Collect from our Colombo 05 outlet.',
        fee: 0, freeOver: 0, eta: 'Ready in 2 hours', schedule: true, pickup: true, enabled: true },
    ];

    const line = (id, qty) => {
      const p = products.find((x) => x.id === id);
      return { id, name: p.name, unit: p.unit, emoji: p.emoji, image: '', price: p.salePrice || p.price, qty };
    };
    const sample = (n, hoursAgo, name, phone, city, items, deliveryId, payment, status) => {
      const opt = delivery.find((d) => d.id === deliveryId);
      const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
      const fee = opt.freeOver && subtotal >= opt.freeOver ? 0 : opt.fee;
      const at = now - hoursAgo * hour;
      const history = STATUSES.slice(0, STATUSES.indexOf(status) + 1).map((s, i) => ({ status: s, at: at + i * hour }));
      return {
        id: 'PF-' + n, createdAt: at, customer: { name, phone, email: '' },
        address: opt.pickup ? null : { line: '12 Sample Lane', city }, notes: '',
        items, subtotal, deliveryFee: fee, total: subtotal + fee,
        delivery: { id: opt.id, name: opt.name, date: '', slot: '' }, payment, status, history, sample: true,
      };
    };

    const orders = [
      sample(1003, 2, 'Nimali Perera', '077 123 4567', 'Colombo 05',
        [line('bbq-party-pack', 1), line('tomato-ketchup', 2)], 'express', 'Cash on Delivery', 'Pending'),
      sample(1002, 20, 'Kasun Silva', '071 987 6543', 'Nugegoda',
        [line('chicken-nuggets', 2), line('chicken-frankfurters', 1)], 'standard', 'Card on Delivery', 'Out for delivery'),
      sample(1001, 50, 'Ayesha Fernando', '076 555 0101', 'Dehiwala',
        [line('classic-beef-patties', 3), line('smoked-chicken-ham', 2), line('samba-rice', 1)], 'scheduled', 'Bank Transfer', 'Delivered'),
    ];

    return {
      categories, products, delivery, orders,
      slots: ['9:00 AM – 12:00 PM', '12:00 PM – 3:00 PM', '3:00 PM – 6:00 PM', '6:00 PM – 9:00 PM'],
      settings: {
        hotline: '011 234 5678',
        announcement: 'Delivered cold, island-wide soon · Same-day delivery in Colombo for orders before 2 PM',
      },
      nextOrder: 1004,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* storage unavailable — fall back to in-memory seed */ }
    const fresh = seed();
    persist(fresh);
    return fresh;
  }

  function persist(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      alert('Could not save — browser storage may be full. Try a smaller product photo.');
      return false;
    }
  }

  let db = load();

  // Changes made in another tab (e.g. admin panel open next to the shop).
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    db = load();
    listeners.forEach((fn) => fn());
  });

  const PF = {
    STATUSES,
    uid,
    slug,
    get settings() { return db.settings; },
    get slots() { return db.slots; },

    categories: () => db.categories,
    category: (id) => db.categories.find((c) => c.id === id),
    products: (includeHidden) => (includeHidden ? db.products : db.products.filter((p) => p.active)),
    product: (id) => db.products.find((p) => p.id === id),
    deliveryOptions: (includeDisabled) => (includeDisabled ? db.delivery : db.delivery.filter((d) => d.enabled)),
    deliveryOption: (id) => db.delivery.find((d) => d.id === id),
    orders: () => db.orders,
    order: (id) => db.orders.find((o) => o.id.toLowerCase() === String(id || '').trim().toLowerCase()),

    priceOf: (p) => (p.salePrice && p.salePrice < p.price ? p.salePrice : p.price),
    discountOf: (p) => (p.salePrice && p.salePrice < p.price ? Math.round((1 - p.salePrice / p.price) * 100) : 0),
    deliveryFee: (opt, subtotal) => (opt.freeOver && subtotal >= opt.freeOver ? 0 : Number(opt.fee) || 0),
    money: (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),

    /** Insert or update an item in categories / products / delivery. */
    upsert(collection, item) {
      const list = db[collection];
      if (!item.id) item.id = slug(item.name) + '-' + Math.random().toString(36).slice(2, 5);
      const i = list.findIndex((x) => x.id === item.id);
      if (i >= 0) list[i] = { ...list[i], ...item };
      else list.push(item);
      persist(db);
      return item;
    },
    remove(collection, id) {
      db[collection] = db[collection].filter((x) => x.id !== id);
      persist(db);
    },

    placeOrder(order) {
      order.id = 'PF-' + db.nextOrder++;
      order.createdAt = Date.now();
      order.status = 'Pending';
      order.history = [{ status: 'Pending', at: order.createdAt }];
      order.items.forEach((it) => {
        const p = PF.product(it.id);
        if (p) p.stock = Math.max(0, p.stock - it.qty);
      });
      db.orders.unshift(order);
      persist(db);
      return order;
    },
    setOrderStatus(id, status) {
      const o = PF.order(id);
      if (!o || o.status === status) return;
      o.status = status;
      (o.history = o.history || []).push({ status, at: Date.now() });
      persist(db);
    },

    saveSettings(patch) { Object.assign(db.settings, patch); persist(db); },
    saveSlots(slots) { db.slots = slots; persist(db); },
    reset() { db = seed(); persist(db); },
    onExternalChange(fn) { listeners.push(fn); },
  };

  window.PF = PF;
})();
