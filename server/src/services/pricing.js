import { prisma } from '../db.js';
import { config } from '../config.js';

const STALE_MS = 24 * 3600e3;

// Used when Open Prices has no recent data for an ingredient.
const FALLBACK_STORES = [
  { key: 'fallback:sample-mart', name: 'Sample Mart', leadTimeHours: 12, factor: 1 },
  { key: 'fallback:corner-grocer', name: 'Corner Grocer', leadTimeHours: 4, factor: 1.15 },
];

// Rough per-unit defaults for ingredients created from the UI without a price.
export const DEFAULT_FALLBACK_PRICE = { g: 0.01, ml: 0.005, each: 0.3 };

async function fetchOpenPrices(categoryTag) {
  const url = new URL(`${config.openPricesBaseUrl}/v1/prices`);
  url.search = new URLSearchParams({ category_tag: categoryTag, order_by: '-date', size: '50' }).toString();
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { 'User-Agent': 'Daniel-Bakery/0.1 (hackathon project)' },
  });
  if (!res.ok) throw new Error(`Open Prices responded ${res.status}`);
  const json = await res.json();
  return json.items ?? [];
}

/** Convert a reported price into a price per base unit (g, ml, each). */
function toBasePrice(item, unit) {
  const price = Number(item.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  const per = item.price_per ?? 'KILOGRAM';
  if (unit === 'each') return per === 'UNIT' ? price : null;
  // Per kg → per g; liquids are treated as 1 kg ≈ 1 L.
  return per === 'KILOGRAM' ? price / 1000 : null;
}

// Stable pseudo lead time (4–24h) since real delivery lead times are simulated.
function simulatedLeadTime(key) {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 4 + (h % 6) * 4;
}

async function upsertPrice({ ingredientId, supplierId, pricePerUnit, currency, source, observedAt }) {
  const data = { pricePerUnit, currency, source, observedAt, fetchedAt: new Date() };
  await prisma.price.upsert({
    where: { ingredientId_supplierId: { ingredientId, supplierId } },
    update: data,
    create: { ingredientId, supplierId, ...data },
  });
}

async function refreshFromOpenPrices(ingredient) {
  if (!ingredient.categoryTag) return 0;
  const items = await fetchOpenPrices(ingredient.categoryTag);
  const seen = new Set();
  let saved = 0;
  for (const item of items) {
    const loc = item.location;
    if (!loc?.osm_id) continue;
    const key = `osm:${loc.osm_type ?? 'node'}:${loc.osm_id}`;
    if (seen.has(key)) continue; // newest price per store only
    const pricePerUnit = toBasePrice(item, ingredient.unit);
    if (pricePerUnit == null) continue;
    seen.add(key);
    const name = loc.osm_name ?? loc.osm_display_name ?? key;
    const supplier = await prisma.supplier.upsert({
      where: { key },
      update: { name },
      create: { key, name, address: loc.osm_display_name ?? null, leadTimeHours: simulatedLeadTime(key) },
    });
    await upsertPrice({
      ingredientId: ingredient.id,
      supplierId: supplier.id,
      pricePerUnit,
      currency: item.currency ?? 'USD',
      source: 'open_prices',
      observedAt: new Date(item.date ?? Date.now()),
    });
    saved++;
  }
  return saved;
}

async function refreshFallback(ingredient) {
  for (const store of FALLBACK_STORES) {
    const supplier = await prisma.supplier.upsert({
      where: { key: store.key },
      update: {},
      create: { key: store.key, name: store.name, leadTimeHours: store.leadTimeHours },
    });
    await upsertPrice({
      ingredientId: ingredient.id,
      supplierId: supplier.id,
      pricePerUnit: ingredient.fallbackPrice * store.factor,
      currency: 'USD',
      source: 'fallback',
      observedAt: new Date(),
    });
  }
}

/** Pull fresh prices for one ingredient, falling back to sample prices. */
export async function refreshPrices(ingredient) {
  let saved = 0;
  try {
    saved = await refreshFromOpenPrices(ingredient);
  } catch (err) {
    console.warn(`[pricing] Open Prices lookup failed for ${ingredient.name}: ${err.message}`);
  }
  if (saved === 0) await refreshFallback(ingredient);
  return saved;
}

/** Refresh prices only when nothing is cached or the cache is stale. */
export async function ensurePrices(ingredient) {
  const newest = await prisma.price.findFirst({
    where: { ingredientId: ingredient.id },
    orderBy: { fetchedAt: 'desc' },
  });
  if (!newest || Date.now() - newest.fetchedAt.getTime() > STALE_MS) {
    await refreshPrices(ingredient);
  }
}

export function cheapestSupplier(ingredientId) {
  return prisma.price.findFirst({
    where: { ingredientId },
    orderBy: { pricePerUnit: 'asc' },
    include: { supplier: true },
  });
}
