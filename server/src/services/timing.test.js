import test from 'node:test';
import assert from 'node:assert/strict';
import { bakeStartFor, groupUsesByFreshness, planOrderWindow } from './timing.js';

const H = 3600e3;
const t0 = new Date('2026-10-10T12:00:00Z');
const at = (hours) => new Date(t0.getTime() + hours * H);

test('bakeStartFor subtracts prep + bake time from the deadline', () => {
  assert.equal(bakeStartFor(at(0), 30, 90).getTime(), at(-2).getTime());
});

test('groupUsesByFreshness splits uses further apart than the shelf life', () => {
  const uses = [{ bakeStart: at(0) }, { bakeStart: at(10) }, { bakeStart: at(100) }];
  const groups = groupUsesByFreshness(uses, 24);
  assert.deepEqual(groups.map((g) => g.length), [2, 1]);
});

test('planOrderWindow orders as late as possible minus the safety buffer', () => {
  const group = [{ bakeStart: at(0) }];
  const plan = planOrderWindow({ group, leadTimeHours: 10, shelfLifeHours: 72, safetyBufferHours: 2, now: at(-100) });
  assert.ok(plan.ok);
  assert.equal(plan.orderAt.getTime(), at(-12).getTime());
  assert.equal(plan.arriveBy.getTime(), at(-2).getTime());
});

test('planOrderWindow never orders before the earliest fresh time', () => {
  const group = [{ bakeStart: at(0) }, { bakeStart: at(20) }];
  // shelf life 20h, lead 5h: earliest = 20-20-5 = -5h, latest = -5h → exactly -5h
  const plan = planOrderWindow({ group, leadTimeHours: 5, shelfLifeHours: 20, safetyBufferHours: 2, now: at(-100) });
  assert.ok(plan.ok);
  assert.equal(plan.orderAt.getTime(), at(-5).getTime());
});

test('planOrderWindow flags a deadline that is already too close', () => {
  const group = [{ bakeStart: at(0) }];
  const plan = planOrderWindow({ group, leadTimeHours: 10, shelfLifeHours: 72, safetyBufferHours: 2, now: at(-5) });
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'too_late');
});

test('planOrderWindow clamps to now when only the safety buffer has been eaten', () => {
  const group = [{ bakeStart: at(0) }];
  const plan = planOrderWindow({ group, leadTimeHours: 10, shelfLifeHours: 72, safetyBufferHours: 2, now: at(-11) });
  assert.ok(plan.ok);
  assert.equal(plan.orderAt.getTime(), at(-11).getTime());
});

test('planOrderWindow flags a group that cannot stay fresh', () => {
  const group = [{ bakeStart: at(0) }, { bakeStart: at(50) }];
  const plan = planOrderWindow({ group, leadTimeHours: 5, shelfLifeHours: 24, safetyBufferHours: 2, now: at(-100) });
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'shelf_life');
});
