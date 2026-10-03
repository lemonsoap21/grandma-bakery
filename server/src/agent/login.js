// Opens the cart agent's browser so you can sign in to each store once. The agent reuses
// this browser profile, so it never sees your passwords. Run with `npm run agent:login`.
import { prisma } from '../db.js';
import { openBrowser } from './browser.js';

const prices = await prisma.price.findMany({ where: { url: { not: null } }, select: { url: true } });
await prisma.$disconnect();
const homes = [...new Set(prices.map((p) => new URL(p.url).origin))].sort();

if (homes.length === 0) {
  console.log('No store links yet. Click "Update prices" on the dashboard first, then run this again.');
  process.exit(0);
}

const { context, page } = await openBrowser({ headless: false });
await page.goto(homes[0]).catch(() => {});
for (const home of homes.slice(1)) {
  const tab = await context.newPage();
  await tab.goto(home).catch(() => {});
}

console.log(`Opened ${homes.length} store(s):\n${homes.map((h) => `  ${h}`).join('\n')}`);
console.log('\nIn each tab: sign in, and set your delivery address and a saved payment method on the store site.');
console.log('Close the browser window when you are done. Your sign-ins are saved for the cart agent.');
console.log('(Stop the app server first if a cart is being filled; only one browser can use the profile.)');
await new Promise((resolve) => context.on('close', resolve));
console.log('Saved.');
