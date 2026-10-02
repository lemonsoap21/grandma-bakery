import test from 'node:test';
import assert from 'node:assert/strict';
import { dropLowOutliers, isProductPage, pricePerBaseUnit } from './pricing.js';

const at = (...prices) => prices.map((pricePerUnit, i) => ({ store: `s${i}`, pricePerUnit }));

test('dropLowOutliers removes a price far below the others', () => {
  assert.deepEqual(dropLowOutliers(at(0.11, 0.25, 0.33, 0.33, 0.37)).map((p) => p.pricePerUnit), [0.25, 0.33, 0.33, 0.37]);
});

test('dropLowOutliers keeps everything when prices are close or too few to judge', () => {
  assert.equal(dropLowOutliers(at(1.0, 1.17, 1.8, 1.99)).length, 4);
  assert.equal(dropLowOutliers(at(0.1, 5)).length, 2);
});

test('pricePerBaseUnit divides the package price by its size in base units', () => {
  assert.equal(pricePerBaseUnit({ price: 9.88, size: 10, sizeUnit: 'kg' }, 'g'), 9.88 / 10000);
  assert.equal(pricePerBaseUnit({ price: 5.49, size: 43, sizeUnit: 'mL' }, 'ml'), 5.49 / 43);
  assert.equal(pricePerBaseUnit({ price: 4.5, size: 12, sizeUnit: 'item' }, 'each'), 4.5 / 12);
});

test('pricePerBaseUnit rejects sizes that do not fit the ingredient unit', () => {
  assert.equal(pricePerBaseUnit({ price: 4.5, size: 12, sizeUnit: 'item' }, 'g'), null);
  assert.equal(pricePerBaseUnit({ price: 4.5, size: 0, sizeUnit: 'kg' }, 'g'), null);
});

test('isProductPage accepts single-product pages on store sites', () => {
  for (const url of [
    'https://www.walmart.ca/en/ip/Great-Value-Salted-Butter/6000200237828',
    'https://www.nofrills.ca/en/3-25-homogenized-milk/p/20160571_EA',
    'https://www.metro.ca/en/online-grocery/aisles/pantry/baking-ingredients/chocolate-cocoa/dark-chocolate-chips/p/059749976367',
    'https://www.costco.ca/kirkland-signature-all-purpose-flour.product.100123.html',
    'https://voila.ca/products/123456EA/details',
  ]) assert.ok(isProductPage(url), url);
});

test('isProductPage rejects category pages, flyers, deal sites and junk', () => {
  for (const url of [
    'https://www.walmart.ca/en/browse/grocery/pantry-food/baking-ingredients-supplies/flour-meals/10019_6000194326346',
    'https://www.redflagdeals.com/flyers/sugar-sales/',
    'https://flipp.com/en-ca/waterloo-on/item/123-sugar',
    'https://www.nofrills.ca/en/food/pantry/c/27985',
    'not a url',
    null,
  ]) assert.ok(!isProductPage(url), String(url));
});
