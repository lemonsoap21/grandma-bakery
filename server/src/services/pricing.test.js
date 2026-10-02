import test from 'node:test';
import assert from 'node:assert/strict';
import { dropLowOutliers, pricePerBaseUnit } from './pricing.js';

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
