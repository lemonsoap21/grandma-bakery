import { prisma } from '../src/db.js';

// Prices are per base unit (g / ml / each) and only used when Open Prices has no data.
const ingredients = [
  { name: 'flour', unit: 'g', shelfLifeHours: 24 * 90, categoryTag: 'en:wheat-flours', fallbackPrice: 0.002 },
  { name: 'butter', unit: 'g', shelfLifeHours: 24 * 14, categoryTag: 'en:butters', fallbackPrice: 0.012 },
  { name: 'sugar', unit: 'g', shelfLifeHours: 24 * 180, categoryTag: 'en:sugars', fallbackPrice: 0.002 },
  { name: 'eggs', unit: 'each', shelfLifeHours: 24 * 21, categoryTag: 'en:eggs', fallbackPrice: 0.4 },
  { name: 'whole milk', unit: 'ml', shelfLifeHours: 24 * 5, categoryTag: 'en:milks', fallbackPrice: 0.0012 },
  { name: 'dark chocolate chips', unit: 'g', shelfLifeHours: 24 * 120, categoryTag: 'en:chocolates', fallbackPrice: 0.014 },
  { name: 'fresh blueberries', unit: 'g', shelfLifeHours: 24 * 3, categoryTag: 'en:blueberries', fallbackPrice: 0.02 },
  { name: 'active dry yeast', unit: 'g', shelfLifeHours: 24 * 180, categoryTag: null, fallbackPrice: 0.03 },
];

const menu = [
  {
    name: 'Butter Croissant (batch of 12)',
    prepMinutes: 180,
    bakeMinutes: 25,
    instructions: 'Laminate the dough with butter, fold three times, rest, shape, proof, then bake at 200°C until golden.',
    recipe: { flour: 750, butter: 400, sugar: 80, 'whole milk': 300, 'active dry yeast': 12, eggs: 1 },
  },
  {
    name: 'Chocolate Chip Cookies (batch of 24)',
    prepMinutes: 20,
    bakeMinutes: 12,
    instructions: 'Cream butter and sugar, beat in eggs, fold in flour and chocolate chips, scoop, bake at 180°C.',
    recipe: { flour: 300, butter: 200, sugar: 200, eggs: 2, 'dark chocolate chips': 250 },
  },
  {
    name: 'Blueberry Muffins (batch of 12)',
    prepMinutes: 25,
    bakeMinutes: 22,
    instructions: 'Mix wet and dry ingredients separately, combine gently, fold in blueberries, bake at 190°C.',
    recipe: { flour: 320, sugar: 150, butter: 100, eggs: 2, 'whole milk': 240, 'fresh blueberries': 200 },
  },
];

async function main() {
  const byName = {};
  for (const data of ingredients) {
    byName[data.name] = await prisma.ingredient.upsert({ where: { name: data.name }, update: {}, create: data });
  }

  const items = [];
  for (const { recipe, ...data } of menu) {
    const item = await prisma.menuItem.upsert({
      where: { name: data.name },
      update: {},
      create: {
        ...data,
        ingredients: {
          create: Object.entries(recipe).map(([name, quantity]) => ({ ingredientId: byName[name].id, quantity })),
        },
      },
    });
    items.push(item);
  }

  // Sample orders relative to now, only when the table is empty.
  if ((await prisma.order.count()) === 0) {
    const days = (n, hour) => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      d.setHours(hour, 0, 0, 0);
      return d;
    };
    await prisma.order.create({
      data: {
        customerName: 'Maple Street Café',
        deliveryAt: days(3, 8),
        items: { create: [{ menuItemId: items[0].id, quantity: 2 }, { menuItemId: items[2].id, quantity: 1 }] },
      },
    });
    await prisma.order.create({
      data: {
        customerName: 'Priya (birthday party)',
        deliveryAt: days(5, 14),
        items: { create: [{ menuItemId: items[1].id, quantity: 3 }, { menuItemId: items[2].id, quantity: 2 }] },
      },
    });
  }

  console.log(`Seeded ${ingredients.length} ingredients, ${menu.length} menu items, sample orders.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
