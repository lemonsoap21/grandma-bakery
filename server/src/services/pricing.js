import { prisma } from '../db.js';
import { config } from '../config.js';
import { askWithWebSearch } from './claude.js';

// Grocery shelf prices move slowly, and each lookup is a paid web search.
const STALE_MS = 7 * 24 * 3600e3;

// Used when the web lookup finds no prices (or no API key is configured).
const FALLBACK_STORES = [
  { key: 'fallback:sample-mart', name: 'Sample Mart', leadTimeHours: 12, factor: 1 },
  { key: 'fallback:corner-grocer', name: 'Corner Grocer', leadTimeHours: 4, factor: 1.15 },
];

// Rough per-unit defaults for ingredients created from the UI without a price.
export const DEFAULT_FALLBACK_PRICE = { g: 0.01, ml: 0.005, each: 0.3 };

// Package sizes, converted to the ingredient's base unit (g, ml or each). Weight and volume are
// treated as interchangeable at 1 g ≈ 1 ml, which is close enough for pricing.
const SIZE_IN_BASE = {
  g: { g: 1, kg: 1000, ml: 1, l: 1000 },
  ml: { ml: 1, l: 1000, g: 1, kg: 1000 },
  each: { item: 1, each: 1 },
};

/** Package price ÷ package size, in the ingredient's base unit; null if the units don't match. */
export function pricePerBaseUnit({ price, size, sizeUnit }, unit) {
  const factor = SIZE_IN_BASE[unit]?.[String(sizeUnit).toLowerCase()];
  return factor && price > 0 && size > 0 ? price / (size * factor) : null;
}

/** Ask Claude to search current Canadian grocery prices for one ingredient. */
async function searchPrices(ingredient) {
  // Ignore the .env.example placeholder so the model doesn't stop to ask where the bakery is.
  const address = config.bakeryAddress.includes('your_bakery_address') ? '' : config.bakeryAddress.trim();
  const near = address ? ` near ${address}` : '';
  const sizeUnits = ingredient.unit === 'each' ? '"item"' : '"g", "kg", "ml" or "L"';
  const reply = await askWithWebSearch({
    key: 'prices',
    maxSearches: 3,
    maxTokens: 2048,
    timeoutMs: 60000,
    system:
      `You find current regular shelf prices for raw baking ingredients at grocery stores in Canada${near}, ` +
      `in ${config.currency}. Search store websites or flyers (e.g. Walmart, Real Canadian Superstore, No Frills, Costco, Metro, Sobeys). ` +
      `For each store, report one common package exactly as listed: its price and its size. Do not do any unit conversions. ` +
      `Only include prices you actually found, at most 5 stores. Never ask questions: if the location is vague, use national chain prices. ` +
      `Finish with only JSON: {"prices": [{"store": "<store name>", "product": "<product name>", "price": <package price>, ` +
      `"size": <number>, "size_unit": ${sizeUnits}}]}.`,
    prompt: `Ingredient: ${ingredient.name}`,
  });
  if (!reply) return [];
  const found = (Array.isArray(reply.prices) ? reply.prices : [])
    .map((p) => ({
      store: String(p.store ?? '').trim(),
      pricePerUnit: pricePerBaseUnit({ price: Number(p.price), size: Number(p.size), sizeUnit: p.size_unit }, ingredient.unit),
    }))
    .filter((p) => p.store && p.pricePerUnit);
  return dropLowOutliers(found);
}

/**
 * Drop prices under half the median. A misread package size or unit shows up as an
 * implausibly cheap price, and it would otherwise always win "cheapest supplier".
 */
export function dropLowOutliers(prices) {
  if (prices.length < 3) return prices;
  const sorted = prices.map((p) => p.pricePerUnit).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return prices.filter((p) => p.pricePerUnit >= median / 2);
}

// Stable pseudo lead time (4–24h) since real delivery lead times are simulated.
function simulatedLeadTime(key) {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 4 + (h % 6) * 4;
}

const storeKey = (name) => `web:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

async function upsertPrice({ ingredientId, supplierId, pricePerUnit, source }) {
  const data = { pricePerUnit, currency: config.currency, source, observedAt: new Date(), fetchedAt: new Date() };
  await prisma.price.upsert({
    where: { ingredientId_supplierId: { ingredientId, supplierId } },
    update: data,
    create: { ingredientId, supplierId, ...data },
  });
}

/** Save web-search prices; returns the supplier ids that now have a price. */
async function saveWebPrices(ingredient, found) {
  const supplierIds = [];
  // Cheapest first, so a store listed twice (e.g. two package sizes) keeps its best price.
  for (const { store, pricePerUnit } of [...found].sort((a, b) => a.pricePerUnit - b.pricePerUnit)) {
    const key = storeKey(store);
    if (key === 'web:') continue;
    const supplier = await prisma.supplier.upsert({
      where: { key },
      update: {},
      create: { key, name: store, leadTimeHours: simulatedLeadTime(key) },
    });
    if (supplierIds.includes(supplier.id)) continue;
    await upsertPrice({ ingredientId: ingredient.id, supplierId: supplier.id, pricePerUnit, source: 'web_search' });
    supplierIds.push(supplier.id);
  }
  return supplierIds;
}

async function saveFallbackPrices(ingredient) {
  const supplierIds = [];
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
      source: 'fallback',
    });
    supplierIds.push(supplier.id);
  }
  return supplierIds;
}

/**
 * Pull fresh prices for one ingredient, falling back to sample prices, and drop any
 * older prices from stores that weren't in this refresh. Returns how many real prices were saved.
 */
export async function refreshPrices(ingredient) {
  let found;
  try {
    found = await searchPrices(ingredient);
  } catch (err) {
    // Keep whatever we had rather than replacing real prices because of a failed lookup.
    console.warn(`[pricing] web price lookup failed for ${ingredient.name}: ${err.message}`);
    await prisma.price.deleteMany({ where: { ingredientId: ingredient.id, currency: { not: config.currency } } });
    const existing = await prisma.price.count({ where: { ingredientId: ingredient.id, currency: config.currency } });
    if (existing === 0) await saveFallbackPrices(ingredient);
    return 0;
  }
  let supplierIds = await saveWebPrices(ingredient, found);
  const live = supplierIds.length;
  if (live === 0) supplierIds = await saveFallbackPrices(ingredient);
  await prisma.price.deleteMany({ where: { ingredientId: ingredient.id, supplierId: { notIn: supplierIds } } });
  return live;
}

/** Refresh prices only when nothing is cached or the cache is stale. */
export async function ensurePrices(ingredient) {
  const newest = await prisma.price.findFirst({
    where: { ingredientId: ingredient.id, currency: config.currency },
    orderBy: { fetchedAt: 'desc' },
  });
  if (!newest || Date.now() - newest.fetchedAt.getTime() > STALE_MS) {
    await refreshPrices(ingredient);
  }
}

export function cheapestSupplier(ingredientId) {
  return prisma.price.findFirst({
    where: { ingredientId, currency: config.currency },
    orderBy: { pricePerUnit: 'asc' },
    include: { supplier: true },
  });
}
