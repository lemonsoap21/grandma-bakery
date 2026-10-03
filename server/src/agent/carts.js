import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { fillCart } from './cartAgent.js';

let running = false;

/**
 * Fill store carts for scheduled purchases whose order time has come (or all scheduled
 * purchases when `all` is set), one browser run per store. Runs one batch at a time.
 * Returns the number of cart runs started, or null if a batch was already running.
 */
export async function fillDueCarts({ now = new Date(), all = false } = {}) {
  if (running) return null;
  running = true;
  try {
    const due = await prisma.purchase.findMany({
      where: { status: 'SCHEDULED', ...(all ? {} : { orderAt: { lte: now } }) },
      include: { supplier: true, ingredient: true },
      orderBy: { arriveBy: 'asc' },
    });
    const bySupplier = Map.groupBy(due, (p) => p.supplierId);
    let runs = 0;
    for (const purchases of bySupplier.values()) {
      const linked = purchases.filter((p) => p.productUrl && p.packages > 0);
      const unlinked = purchases.filter((p) => !(p.productUrl && p.packages > 0));
      if (unlinked.length) {
        await recordFailure(
          unlinked,
          'These items have no product page or package size (for example, sample prices), so the agent cannot add them. Click "Update prices", then Try again.',
        );
        runs++;
      }
      if (linked.length) {
        await runCart(linked);
        runs++;
      }
    }
    return runs;
  } finally {
    running = false;
  }
}

async function runCart(purchases) {
  const supplier = purchases[0].supplier;
  const run = await prisma.cartRun.create({ data: { supplierId: supplier.id } });
  await prisma.purchase.updateMany({
    where: { id: { in: purchases.map((p) => p.id) } },
    data: { status: 'PREPARING', cartRunId: run.id },
  });

  // Two deliveries of the same product due together become one cart line.
  const byUrl = new Map();
  for (const p of purchases) {
    const line = byUrl.get(p.productUrl) ?? { product: p.packageInfo ?? p.ingredient.name, url: p.productUrl, packages: 0 };
    line.packages += p.packages;
    byUrl.set(p.productUrl, line);
  }

  console.log(`[cart-agent] run ${run.id}: filling ${supplier.name} cart with ${byUrl.size} item(s)`);
  const result = await fillCart({
    store: supplier.name,
    items: [...byUrl.values()],
    arriveBy: purchases[0].arriveBy,
    onStep: ({ step, tool, error }) => console.log(`[cart-agent] run ${run.id} step ${step}: ${tool}${error ? ` (${error})` : ''}`),
  });

  let screenshot = null;
  if (result.screenshot) {
    fs.mkdirSync(config.agentScreenshotDir, { recursive: true });
    screenshot = `cart-run-${run.id}.png`;
    fs.writeFileSync(path.join(config.agentScreenshotDir, screenshot), result.screenshot);
  }
  await prisma.$transaction([
    prisma.cartRun.update({
      where: { id: run.id },
      data: {
        status: result.status,
        summary: result.summary,
        items: result.items,
        cartUrl: result.cartUrl,
        cartTotal: result.cartTotal,
        screenshot,
        steps: result.steps,
        finishedAt: new Date(),
      },
    }),
    prisma.purchase.updateMany({
      where: { cartRunId: run.id },
      data: { status: result.status === 'READY' ? 'CART_READY' : 'CART_FAILED' },
    }),
  ]);
  console.log(`[cart-agent] run ${run.id}: ${result.status} after ${result.steps} steps. ${result.summary}`);
}

async function recordFailure(purchases, summary) {
  const run = await prisma.cartRun.create({
    data: { supplierId: purchases[0].supplierId, status: 'FAILED', summary, finishedAt: new Date() },
  });
  await prisma.purchase.updateMany({
    where: { id: { in: purchases.map((p) => p.id) } },
    data: { status: 'CART_FAILED', cartRunId: run.id },
  });
}

/** Runs left RUNNING by a server restart can't finish; mark them failed so they can be retried. */
export async function failInterruptedRuns() {
  const stuck = await prisma.cartRun.findMany({ where: { status: 'RUNNING' }, select: { id: true } });
  for (const { id } of stuck) {
    await prisma.$transaction([
      prisma.cartRun.update({
        where: { id },
        data: { status: 'FAILED', summary: 'The server restarted while this cart was being filled.', finishedAt: new Date() },
      }),
      prisma.purchase.updateMany({ where: { cartRunId: id }, data: { status: 'CART_FAILED' } }),
    ]);
  }
}

/** The baker placed the order: record it and mark its purchases ordered. */
export async function markOrdered(runId, { confirmationId, total }) {
  const run = await prisma.cartRun.findUnique({ where: { id: runId } });
  if (!run) return null;
  const now = new Date();
  await prisma.$transaction([
    prisma.cartRun.update({
      where: { id: runId },
      data: {
        status: 'ORDERED',
        confirmationId: confirmationId?.trim() || null,
        ...(total > 0 && { cartTotal: total }),
        orderedAt: now,
      },
    }),
    prisma.purchase.updateMany({
      where: { cartRunId: runId },
      data: { status: 'PLACED', confirmationId: confirmationId?.trim() || null, placedAt: now },
    }),
  ]);
  return true;
}

/**
 * Drop a ready or failed cart's purchases so the planner schedules them again (due now, so the
 * next scheduler tick fills a fresh cart). The run stays in the history as DISMISSED.
 */
export async function retryRun(runId) {
  const run = await prisma.cartRun.findUnique({ where: { id: runId } });
  if (!run) return null;
  if (!['READY', 'FAILED'].includes(run.status)) return false;
  await prisma.$transaction([
    prisma.purchase.deleteMany({ where: { cartRunId: runId, status: { in: ['CART_READY', 'CART_FAILED'] } } }),
    prisma.cartRun.update({ where: { id: runId }, data: { status: 'DISMISSED' } }),
  ]);
  return true;
}
