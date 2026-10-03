import test from 'node:test';
import assert from 'node:assert/strict';
import { rankOffers, qualityScore, localScore, originTagFor } from './ranking.js';
import { matchRetailer, toLineItem } from './instacart.js';
import { haversineKm } from './location.js';

const now = new Date('2026-10-02T12:00:00Z');
const bakery = { lat: 37.7749, lon: -122.4194, countryCode: 'US' }; // San Francisco

const offer = (id, pricePerUnit, extra = {}, supplier = {}) => ({
  id,
  pricePerUnit,
  currency: 'USD',
  source: 'open_prices',
  labels: [],
  origins: [],
  verified: false,
  observedAt: now,
  ...extra,
  supplier: { id, name: `Store ${id}`, brand: 'Chain', lat: null, lon: null, instacartRetailerKey: null, ...supplier },
});

test('haversineKm measures SF → Oakland at roughly 13 km', () => {
  const km = haversineKm(bakery, { lat: 37.8044, lon: -122.2712 });
  assert.ok(km > 12 && km < 15, `got ${km}`);
});

test('price-only weights rank the cheapest offer first', () => {
  const ranked = rankOffers([offer(1, 0.02), offer(2, 0.01)], { weights: { price: 1, quality: 0, local: 0 }, now });
  assert.deepEqual(ranked.map((o) => o.id), [2, 1]);
  assert.equal(ranked[0].breakdown.price, 1);
  assert.equal(ranked[1].breakdown.price, 0.5);
});

test('a slightly pricier organic, nearby, independent shop can win', () => {
  const chainFar = offer(1, 0.010, {}, { lat: 37.33, lon: -121.89 }); // San Jose, ~68 km
  const localOrganic = offer(2, 0.011, { labels: ['en:organic'], verified: true }, { brand: null, lat: 37.776, lon: -122.42 });
  const ranked = rankOffers([chainFar, localOrganic], { bakery, now });
  assert.equal(ranked[0].id, 2);
});

test('stores beyond maxDistanceKm are dropped, unknown locations kept', () => {
  const far = offer(1, 0.01, {}, { lat: 40.71, lon: -74.0 }); // New York
  const unknown = offer(2, 0.02);
  const ranked = rankOffers([far, unknown], { bakery, maxDistanceKm: 50, now });
  assert.deepEqual(ranked.map((o) => o.id), [2]);
});

test('offers in the bakery currency are preferred over other currencies', () => {
  const eur = offer(1, 0.001, { currency: 'EUR' });
  const usd = offer(2, 0.01);
  assert.deepEqual(rankOffers([eur, usd], { currency: 'USD', now }).map((o) => o.id), [2]);
});

test('preferInstacart puts orderable stores ahead of better-scored ones', () => {
  const cheap = offer(1, 0.01);
  const orderable = offer(2, 0.02, {}, { instacartRetailerKey: 'safeway' });
  assert.deepEqual(rankOffers([cheap, orderable], { now }).map((o) => o.id), [1, 2]);
  assert.deepEqual(rankOffers([cheap, orderable], { preferInstacart: true, now }).map((o) => o.id), [2, 1]);
});

test('qualityScore rewards labels, proof and freshness; fallback stays low', () => {
  const old = new Date(now.getTime() - 400 * 24 * 3600e3);
  assert.equal(qualityScore({ source: 'fallback' }, now), 0.3);
  assert.equal(qualityScore({ source: 'open_prices', labels: [], observedAt: old }, now), 0.4);
  assert.ok(qualityScore({ source: 'open_prices', labels: ['en:organic', 'en:fair-trade'], verified: true, observedAt: now }, now) >= 0.99);
});

test('localScore adds a bonus for locally grown origin', () => {
  const base = offer(1, 0.01, {}, { lat: bakery.lat, lon: bakery.lon });
  const local = offer(2, 0.01, { origins: [originTagFor('US')] }, { lat: bakery.lat, lon: bakery.lon });
  assert.equal(originTagFor('US'), 'en:united-states');
  assert.ok(localScore(local, bakery) >= localScore(base, bakery));
});

test('matchRetailer matches brand or name on whole words only', () => {
  const retailers = [
    { retailer_key: 'safeway', name: 'Safeway' },
    { retailer_key: 'whole-foods', name: 'Whole Foods Market' },
    { retailer_key: 'aldi', name: 'ALDI' },
  ];
  assert.equal(matchRetailer({ name: 'Safeway 1234 Main St', brand: null }, retailers), 'safeway');
  assert.equal(matchRetailer({ name: 'Whole Foods', brand: 'Whole Foods Market' }, retailers), 'whole-foods');
  assert.equal(matchRetailer({ name: 'Aldine Bakery Supply', brand: null }, retailers), null);
  assert.equal(matchRetailer({ name: "Rosa's Corner Shop", brand: null }, retailers), null);
});

test('toLineItem maps base units to Instacart measurement units', () => {
  assert.deepEqual(toLineItem({ ingredient: { name: 'butter', unit: 'g' }, quantity: 454 }).line_item_measurements, [{ quantity: 454, unit: 'gram' }]);
  assert.deepEqual(toLineItem({ ingredient: { name: 'eggs', unit: 'each' }, quantity: 11.5 }).line_item_measurements, [{ quantity: 12, unit: 'each' }]);
});
