import { prisma } from '../db.js';
import { config } from '../config.js';
import { bakeStartFor, groupUsesByFreshness, planOrderWindow } from './timing.js';
import { ensurePrices, cheapestSupplier } from './pricing.js';

/**
 * Aggregate ingredient needs across all upcoming orders, compare prices and
 * work out when each purchase should be placed. Reads only; see syncPlan().
 */
export async function computePlan(now = new Date()) {
  const orders = await prisma.order.findMany({
    where: { status: 'OPEN', deliveryAt: { gt: now } },
    include: { items: { include: { menuItem: { include: { ingredients: { include: { ingredient: true } } } } } } },
  });

  // Order items already covered by a placed or delivered purchase aren't re-planned.
  const done = await prisma.purchase.findMany({
    where: { status: { in: ['PLACED', 'DELIVERED'] } },
    select: { ingredientId: true, orderItemIds: true },
  });
  const covered = new Set(done.flatMap((p) => p.orderItemIds.map((id) => `${p.ingredientId}:${id}`)));

  // ingredientId → { ingredient, uses[] }
  const byIngredient = new Map();
  for (const order of orders) {
    for (const item of order.items) {
      const { menuItem } = item;
      const bakeStart = bakeStartFor(order.deliveryAt, menuItem.prepMinutes, menuItem.bakeMinutes);
      for (const ri of menuItem.ingredients) {
        const entry = byIngredient.get(ri.ingredientId) ?? { ingredient: ri.ingredient, uses: [] };
        entry.uses.push({
          orderItemId: item.id,
          orderId: order.id,
          customerName: order.customerName,
          itemName: menuItem.name,
          quantity: item.quantity * ri.quantity,
          bakeStart,
          deadline: order.deliveryAt,
        });
        byIngredient.set(ri.ingredientId, entry);
      }
    }
  }

  const needs = [];
  const planned = [];
  const conflicts = [];

  for (const { ingredient, uses } of byIngredient.values()) {
    await ensurePrices(ingredient);
    const best = await cheapestSupplier(ingredient.id);

    needs.push({
      ingredientId: ingredient.id,
      name: ingredient.name,
      unit: ingredient.unit,
      totalQuantity: uses.reduce((sum, u) => sum + u.quantity, 0),
      cheapest: best && {
        supplier: best.supplier.name,
        pricePerUnit: best.pricePerUnit,
        currency: best.currency,
        source: best.source,
      },
    });

    const remaining = uses.filter((u) => !covered.has(`${ingredient.id}:${u.orderItemId}`));
    if (remaining.length === 0) continue;

    if (!best) {
      conflicts.push({ ingredient: ingredient.name, reason: 'no_price', message: `No price found for ${ingredient.name}.` });
      continue;
    }

    for (const group of groupUsesByFreshness(remaining, ingredient.shelfLifeHours)) {
      const window = planOrderWindow({
        group,
        leadTimeHours: best.supplier.leadTimeHours,
        shelfLifeHours: ingredient.shelfLifeHours,
        safetyBufferHours: config.safetyBufferHours,
        now,
      });
      const orderIds = [...new Set(group.map((u) => u.orderId))];

      if (!window.ok) {
        conflicts.push({
          ingredient: ingredient.name,
          reason: window.reason,
          orderIds,
          latestOrderAt: window.latestOrderAt,
          message:
            window.reason === 'too_late'
              ? `${ingredient.name} should have been ordered by ${window.latestOrderAt.toISOString()} to make orders ${orderIds.join(', ')} (${best.supplier.leadTimeHours}h delivery).`
              : `${ingredient.name} can't stay fresh for orders ${orderIds.join(', ')}; deadlines are further apart than its ${ingredient.shelfLifeHours}h shelf life.`,
        });
        continue;
      }

      const quantity = group.reduce((sum, u) => sum + u.quantity, 0);
      planned.push({
        ingredientId: ingredient.id,
        supplierId: best.supplierId,
        quantity,
        unitPrice: best.pricePerUnit,
        totalCost: quantity * best.pricePerUnit,
        currency: best.currency,
        orderAt: window.orderAt,
        arriveBy: window.arriveBy,
        orderItemIds: group.map((u) => u.orderItemId),
      });
    }
  }

  return { orders, needs, planned, conflicts };
}

/** Recompute the plan and replace all not-yet-placed purchases with it. */
export async function syncPlan(now = new Date()) {
  const plan = await computePlan(now);
  await prisma.$transaction([
    prisma.purchase.deleteMany({ where: { status: 'SCHEDULED' } }),
    prisma.purchase.createMany({ data: plan.planned }),
  ]);
  return plan;
}
