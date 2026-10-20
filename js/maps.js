/* Pantry Foods prototype — map helpers.
   Leaflet (global `L`, loaded from a <script> tag) with CARTO/OpenStreetMap tiles,
   and road routes from the public OSRM demo server. */

export const DEPOT = { name: 'Pantry Foods depot', address: 'Narahenpita, Colombo 05', lat: 6.8916, lng: 79.8771 };

/** How long the demo rider takes to drive the whole route. */
export const RIDE_MS = 30000;

export const RIDERS = [
  { name: 'Kasun Perera', bike: 'WP BHK-4521', rating: 4.9 },
  { name: 'Nuwan Jayasinghe', bike: 'WP CAD-7783', rating: 4.8 },
  { name: 'Ishara Fernando', bike: 'WP BFL-2290', rating: 5.0 },
];

/** Approximate centre of each delivery area, used to place the default pin. */
export const AREAS = {
  'Colombo 01': { lat: 6.9344, lng: 79.8428 },
  'Colombo 02': { lat: 6.9205, lng: 79.853 },
  'Colombo 03': { lat: 6.906, lng: 79.853 },
  'Colombo 04': { lat: 6.8935, lng: 79.8556 },
  'Colombo 05': { lat: 6.8846, lng: 79.869 },
  'Colombo 06': { lat: 6.8747, lng: 79.8605 },
  'Colombo 07': { lat: 6.9067, lng: 79.865 },
  'Colombo 08': { lat: 6.9147, lng: 79.8778 },
  'Colombo 10': { lat: 6.9289, lng: 79.8656 },
  Dehiwala: { lat: 6.851, lng: 79.865 },
  'Mount Lavinia': { lat: 6.839, lng: 79.8653 },
  Nugegoda: { lat: 6.8649, lng: 79.8997 },
  Rajagiriya: { lat: 6.9094, lng: 79.894 },
  Battaramulla: { lat: 6.901, lng: 79.918 },
  Kotte: { lat: 6.888, lng: 79.905 },
  Maharagama: { lat: 6.848, lng: 79.9265 },
  Wattala: { lat: 6.989, lng: 79.892 },
  Negombo: { lat: 7.2083, lng: 79.8358 },
  Kandy: { lat: 7.2906, lng: 80.6337 },
};
export const DEFAULT_DROP = AREAS['Colombo 07'];

export function areaPoint(city) {
  const key = Object.keys(AREAS).find((k) => k.toLowerCase() === String(city || '').trim().toLowerCase());
  return key ? { ...AREAS[key] } : null;
}

const round5 = (n) => Math.round(n * 1e5) / 1e5;

function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Road route between two {lat,lng} points: { points: [[lat,lng],…], distance (m), duration (s) }. */
export async function fetchRoute(from, to) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    const route = (await res.json()).routes?.[0];
    if (!route) throw new Error('No route found');
    let points = route.geometry.coordinates.map(([lng, lat]) => [round5(lat), round5(lng)]);
    if (points.length > 500) {
      const step = Math.ceil(points.length / 500);
      points = points.filter((_, i) => i % step === 0 || i === points.length - 1);
    }
    return { points, distance: route.distance, duration: route.duration };
  } catch (err) {
    // Routing server unreachable: draw a gentle curve instead so the demo still works.
    console.warn('Route lookup failed, using a straight-ish line', err);
    const points = [];
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      points.push([round5(from.lat + (to.lat - from.lat) * t + Math.sin(t * Math.PI) * 0.004), round5(from.lng + (to.lng - from.lng) * t)]);
    }
    const distance = haversine([from.lat, from.lng], [to.lat, to.lng]) * 1.3;
    return { points, distance, duration: distance / (22 / 3.6) };
  }
}

function baseMap(el, options = {}) {
  const map = L.map(el, { scrollWheelZoom: false, ...options });
  // Standard OpenStreetMap tiles, greyed out in CSS (.leaflet-tile-pane) so the yellow route stands out.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);
  return map;
}

const pin = (emoji, kind) => L.divIcon({ className: `map-pin map-pin-${kind}`, html: `<span>${emoji}</span>`, iconSize: [40, 40], iconAnchor: [20, 20] });

/** Draggable "drop a pin" map for checkout. */
export function createPinPicker(el, start, onMove) {
  const map = baseMap(el).setView([start.lat, start.lng], 14);
  const marker = L.marker([start.lat, start.lng], { draggable: true, icon: pin('🏠', 'home') }).addTo(map);
  let touched = false;
  const report = () => {
    const p = marker.getLatLng();
    onMove({ lat: round5(p.lat), lng: round5(p.lng) });
  };
  marker.on('dragend', () => { touched = true; report(); });
  map.on('click', (e) => { touched = true; marker.setLatLng(e.latlng); report(); });
  return {
    /** Move the pin (ignored once the customer has placed it themselves, unless forced). */
    moveTo(p, force) {
      if (touched && !force) return;
      if (force) touched = true;
      marker.setLatLng([p.lat, p.lng]);
      map.setView([p.lat, p.lng], 15);
      report();
    },
    refresh() { map.invalidateSize(); },
    destroy() { map.remove(); },
  };
}

/** Live delivery map: yellow route from the depot, rider driving it in RIDE_MS. */
export function createTrackMap(el, onTick) {
  const map = baseMap(el, { zoomControl: false });
  const casing = L.polyline([], { color: '#4a3b12', weight: 10, opacity: 0.45, lineCap: 'round', lineJoin: 'round' }).addTo(map);
  const travelled = L.polyline([], { color: '#a99f95', weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }).addTo(map);
  const ahead = L.polyline([], { color: '#ffc21a', weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round' }).addTo(map);
  L.marker([DEPOT.lat, DEPOT.lng], { icon: pin('🏬', 'depot'), title: DEPOT.name }).addTo(map);
  const home = L.marker([DEPOT.lat, DEPOT.lng], { icon: pin('🏠', 'home') }).addTo(map);
  const rider = L.marker([DEPOT.lat, DEPOT.lng], { icon: pin('🛵', 'rider'), zIndexOffset: 1000 }).addTo(map);

  let order = null;
  let routeKey = null;
  let pts = [];
  let cum = [0];
  let raf = 0;
  let lastFrame = 0;

  function along(p) {
    const target = p * cum[cum.length - 1];
    let i = 1;
    while (i < cum.length && cum[i] < target) i++;
    if (i >= cum.length) return { point: pts[pts.length - 1], index: pts.length - 1 };
    const a = pts[i - 1];
    const b = pts[i];
    const t = (target - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    return { point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], index: i - 1 };
  }

  function step() {
    const delivered = order.status === 'Delivered';
    const progress = delivered ? 1 : Math.min(1, Math.max(0, (Date.now() - (order.outForDeliveryAt || Date.now())) / RIDE_MS));
    const { point, index } = along(progress);
    rider.setLatLng(point);
    travelled.setLatLngs([...pts.slice(0, index + 1), point]);
    ahead.setLatLngs([point, ...pts.slice(index + 1)]);
    const left = 1 - progress;
    onTick?.({
      progress,
      arrived: progress >= 1,
      delivered,
      minutes: Math.max(1, Math.ceil((left * (order.routeDuration || 600)) / 60)),
      km: (left * (order.routeDistance || 3000)) / 1000,
    });
    return progress >= 1;
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (ts - lastFrame < 50) return;
    lastFrame = ts;
    if (step()) { cancelAnimationFrame(raf); raf = 0; }
  }

  return {
    setOrder(o) {
      order = o;
      if (o.route !== routeKey) {
        routeKey = o.route;
        pts = JSON.parse(o.route || '[]');
        if (!pts.length) return;
        cum = [0];
        for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversine(pts[i - 1], pts[i]));
        casing.setLatLngs(pts);
        home.setLatLng(pts[pts.length - 1]);
        map.fitBounds(L.latLngBounds(pts), { padding: [36, 36] });
      }
      if (!pts.length) return;
      cancelAnimationFrame(raf);
      if (!step()) raf = requestAnimationFrame(loop);
    },
    refresh() {
      map.invalidateSize();
      if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [36, 36] });
    },
    destroy() { cancelAnimationFrame(raf); map.remove(); },
  };
}
