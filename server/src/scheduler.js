import cron from 'node-cron';
import { prisma } from './db.js';
import { config } from './config.js';
import { getAdapter } from './services/purchasing.js';
import { syncPlan } from './services/planner.js';
import { failInterruptedRuns, fillDueCarts } from './agent/carts.js';

/** Place every purchase whose time has come, and mark arrived ones delivered. */
export async function runDuePurchases(now = new Date()) {
  if (config.supplierMode === 'browser') {
    // The cart agent fills carts; the baker checks out and marks them ordered on the dashboard.
    await fillDueCarts({ now });
  } else {
    await placeMockOrders(now);
  }
  await prisma.purchase.updateMany({
    where: { status: 'PLACED', arriveBy: { lte: now } },
    data: { status: 'DELIVERED' },
  });
}

async function placeMockOrders(now) {
  const adapter = getAdapter();
  const due = await prisma.purchase.findMany({
    where: { status: 'SCHEDULED', orderAt: { lte: now } },
    include: { supplier: true, ingredient: true },
  });

  for (const purchase of due) {
    try {
      const { confirmationId, expectedArrival } = await adapter.placeOrder({
        purchase,
        supplier: purchase.supplier,
        ingredient: purchase.ingredient,
      });
      await prisma.purchase.update({
        where: { id: purchase.id },
        data: { status: 'PLACED', confirmationId, arriveBy: expectedArrival, placedAt: now },
      });
      console.log(`[scheduler] placed ${purchase.quantity}${purchase.ingredient.unit} ${purchase.ingredient.name} with ${purchase.supplier.name}`);
    } catch (err) {
      console.error(`[scheduler] failed to place purchase ${purchase.id}: ${err.message}`);
    }
  }
}

export function startScheduler() {
  failInterruptedRuns().catch((err) => console.error('[scheduler] could not clean up cart runs:', err));
  cron.schedule(config.schedulerCron, async () => {
    try {
      await syncPlan(); // keeps timing current as the clock moves
      await runDuePurchases();
    } catch (err) {
      console.error('[scheduler] tick failed:', err);
    }
  });
  console.log(`[scheduler] running on "${config.schedulerCron}"`);
}
