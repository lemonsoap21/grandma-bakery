import { Router } from 'express';
import { prisma } from './db.js';
import { syncPlan } from './services/planner.js';
import { refreshPrices, DEFAULT_FALLBACK_PRICE } from './services/pricing.js';

export const router = Router();

const UNITS = ['g', 'ml', 'each'];
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const bad = (res, message) => res.status(400).json({ error: message });

// Replanning is best-effort after a change; the dashboard recomputes anyway.
const replan = () => syncPlan().catch((err) => console.warn('[planner] sync failed:', err.message));

const menuInclude = { ingredients: { include: { ingredient: true }, orderBy: { id: 'asc' } } };

// ---- Menu ----------------------------------------------------------------

router.get('/menu', wrap(async (_req, res) => {
  res.json(await prisma.menuItem.findMany({ include: menuInclude, orderBy: { name: 'asc' } }));
}));

router.post('/menu', wrap(async (req, res) => {
  const { name, instructions = '', prepMinutes, bakeMinutes, ingredients } = req.body ?? {};
  if (!name?.trim()) return bad(res, 'Name is required.');
  if (!(prepMinutes >= 0) || !(bakeMinutes >= 0)) return bad(res, 'Prep and bake times must be 0 or more minutes.');
  if (!Array.isArray(ingredients) || ingredients.length === 0) return bad(res, 'Add at least one ingredient.');

  const rows = [];
  for (const row of ingredients) {
    const ingName = row.name?.trim().toLowerCase();
    if (!ingName) return bad(res, 'Every ingredient needs a name.');
    if (!(row.quantity > 0)) return bad(res, `Quantity for "${ingName}" must be greater than 0.`);
    if (!UNITS.includes(row.unit)) return bad(res, `Unit for "${ingName}" must be one of ${UNITS.join(', ')}.`);
    rows.push({ ...row, name: ingName });
  }

  try {
    const item = await prisma.$transaction(async (tx) => {
      const recipe = [];
      for (const row of rows) {
        let ingredient = await tx.ingredient.findUnique({ where: { name: row.name } });
        if (ingredient && ingredient.unit !== row.unit) {
          throw Object.assign(new Error(`"${row.name}" is already tracked in ${ingredient.unit}, not ${row.unit}.`), { status: 400 });
        }
        ingredient ??= await tx.ingredient.create({
          data: {
            name: row.name,
            unit: row.unit,
            shelfLifeHours: row.shelfLifeHours > 0 ? Math.round(row.shelfLifeHours) : 168,
            categoryTag: row.categoryTag?.trim() || null,
            fallbackPrice: DEFAULT_FALLBACK_PRICE[row.unit],
          },
        });
        recipe.push({ ingredientId: ingredient.id, quantity: Number(row.quantity) });
      }
      return tx.menuItem.create({
        data: {
          name: name.trim(),
          instructions,
          prepMinutes: Math.round(prepMinutes),
          bakeMinutes: Math.round(bakeMinutes),
          ingredients: { create: recipe },
        },
        include: menuInclude,
      });
    });
    res.status(201).json(item);
  } catch (err) {
    if (err.status === 400) return bad(res, err.message);
    if (err.code === 'P2002') return res.status(409).json({ error: 'A menu item with that name already exists.' });
    throw err;
  }
}));

router.delete('/menu/:id', wrap(async (req, res) => {
  try {
    await prisma.menuItem.delete({ where: { id: Number(req.params.id) } });
    res.status(204).end();
  } catch (err) {
    if (err.code === 'P2003') return res.status(409).json({ error: 'This item is used by existing orders.' });
    if (err.code === 'P2025') return res.status(404).json({ error: 'Menu item not found.' });
    throw err;
  }
}));

// ---- Orders --------------------------------------------------------------

const orderInclude = { items: { include: { menuItem: true } } };

router.get('/orders', wrap(async (_req, res) => {
  res.json(await prisma.order.findMany({ include: orderInclude, orderBy: { deliveryAt: 'asc' } }));
}));

router.post('/orders', wrap(async (req, res) => {
  const { customerName, deliveryAt, items } = req.body ?? {};
  const deadline = new Date(deliveryAt);
  if (!customerName?.trim()) return bad(res, 'Customer name is required.');
  if (Number.isNaN(deadline.getTime())) return bad(res, 'A valid delivery date and time is required.');
  if (deadline <= new Date()) return bad(res, 'Delivery must be in the future.');
  if (!Array.isArray(items) || items.length === 0) return bad(res, 'Add at least one item.');
  if (items.some((i) => !Number.isInteger(i.menuItemId) || !(i.quantity >= 1) || !Number.isInteger(i.quantity))) {
    return bad(res, 'Each item needs a menu item and a whole-number quantity.');
  }

  try {
    const order = await prisma.order.create({
      data: {
        customerName: customerName.trim(),
        deliveryAt: deadline,
        items: { create: items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })) },
      },
      include: orderInclude,
    });
    await replan();
    res.status(201).json(order);
  } catch (err) {
    if (err.code === 'P2003') return bad(res, 'One of the menu items does not exist.');
    throw err;
  }
}));

router.delete('/orders/:id', wrap(async (req, res) => {
  try {
    await prisma.order.update({ where: { id: Number(req.params.id) }, data: { status: 'CANCELLED' } });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Order not found.' });
    throw err;
  }
  await replan();
  res.status(204).end();
}));

// ---- Prices & dashboard --------------------------------------------------

router.post('/prices/refresh', wrap(async (_req, res) => {
  const ingredients = await prisma.ingredient.findMany();
  let live = 0;
  for (const ingredient of ingredients) live += (await refreshPrices(ingredient)) > 0 ? 1 : 0;
  await replan();
  res.json({ ingredients: ingredients.length, withLivePrices: live });
}));

router.get('/dashboard', wrap(async (_req, res) => {
  const { orders, needs, conflicts } = await syncPlan();
  const purchases = await prisma.purchase.findMany({
    include: { ingredient: true, supplier: true },
    orderBy: { orderAt: 'asc' },
  });

  const schedule = orders
    .flatMap((order) =>
      order.items.map((item) => ({
        orderId: order.id,
        customerName: order.customerName,
        deliveryAt: order.deliveryAt,
        item: item.menuItem.name,
        quantity: item.quantity,
        bakeStart: new Date(order.deliveryAt.getTime() - (item.menuItem.prepMinutes + item.menuItem.bakeMinutes) * 60e3),
      })),
    )
    .sort((a, b) => a.bakeStart - b.bakeStart);

  res.json({ schedule, needs, purchases, conflicts });
}));

router.get('/health', (_req, res) => res.json({ ok: true }));
