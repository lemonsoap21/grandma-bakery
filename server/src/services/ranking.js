import { haversineKm } from './location.js';

/**
 * Scores every store's offer for one ingredient on price, quality and how
 * local it is, then sorts best-first. Pure: no DB or network access.
 *
 * Each score is 0–1:
 *   price   cheapest offer / this offer (cheapest = 1)
 *   quality organic / fair-trade labels, photo-verified price, recent observation
 *   local   distance to the bakery, independent (non-chain) shop, locally sourced origin
 */

const DAY_MS = 24 * 3600e3;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
/** "US" → "en:united-states", the Open Food Facts origin tag for that country. */
export function originTagFor(countryCode) {
  if (!countryCode) return null;
  try {
    return `en:${regionNames.of(countryCode.toUpperCase()).toLowerCase().replace(/[^a-z]+/g, '-')}`;
  } catch {
    return null;
  }
}

export function qualityScore(offer, now = new Date()) {
  if (offer.source === 'fallback') return 0.3; // sample data: no quality signal
  const labels = offer.labels ?? [];
  let score = 0.4;
  if (labels.some((l) => l.includes('organic'))) score += 0.3;
  if (labels.some((l) => /fair-?trade/.test(l))) score += 0.1;
  if (offer.verified) score += 0.1;
  const ageDays = (now - new Date(offer.observedAt)) / DAY_MS;
  if (ageDays <= 30) score += 0.1;
  else if (ageDays <= 90) score += 0.05;
  return clamp01(score);
}

export function distanceTo(supplier, bakery) {
  if (!bakery || supplier.lat == null || supplier.lon == null) return null;
  return haversineKm(bakery, { lat: supplier.lat, lon: supplier.lon });
}

export function localScore(offer, bakery) {
  const { supplier } = offer;
  const km = distanceTo(supplier, bakery);
  // 0 km → 1, 5 km → 0.5, 15 km → 0.25
  let score = km == null ? 0.4 : 1 / (1 + km / 5);
  if (offer.source === 'open_prices' && !supplier.brand) score += 0.15; // independent shop
  const originTag = originTagFor(bakery?.countryCode);
  if (originTag && (offer.origins ?? []).includes(originTag)) score += 0.1;
  return clamp01(score);
}

/**
 * offers:  Price rows with `supplier` included.
 * options: { weights, bakery, currency, maxDistanceKm, preferInstacart, now }
 * Returns offers sorted best-first, each with { score, breakdown, distanceKm, orderable }.
 */
export function rankOffers(offers, { weights, bakery = null, currency, maxDistanceKm, preferInstacart = false, now = new Date() } = {}) {
  let pool = offers.filter((o) => o.pricePerUnit > 0);

  // Prices in a different currency can't be compared fairly.
  if (currency && pool.some((o) => o.currency === currency)) pool = pool.filter((o) => o.currency === currency);

  pool = pool.map((o) => ({ ...o, distanceKm: distanceTo(o.supplier, bakery) }));
  if (maxDistanceKm != null) pool = pool.filter((o) => o.distanceKm == null || o.distanceKm <= maxDistanceKm);
  if (pool.length === 0) return [];

  const w = { price: 0.5, quality: 0.25, local: 0.25, ...weights };
  const total = w.price + w.quality + w.local || 1;
  const cheapest = Math.min(...pool.map((o) => o.pricePerUnit));

  const ranked = pool.map((o) => {
    const breakdown = {
      price: cheapest / o.pricePerUnit,
      quality: qualityScore(o, now),
      local: localScore(o, bakery),
    };
    const score = (w.price * breakdown.price + w.quality * breakdown.quality + w.local * breakdown.local) / total;
    return { ...o, score, breakdown, orderable: Boolean(o.supplier.instacartRetailerKey) };
  });

  // When ordering through Instacart, stores it can actually reach come first.
  return ranked.sort((a, b) => (preferInstacart ? b.orderable - a.orderable : 0) || b.score - a.score || a.pricePerUnit - b.pricePerUnit);
}
