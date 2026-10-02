import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') });

export const config = {
  port: Number(process.env.PORT ?? 4000),
  openPricesBaseUrl: process.env.OPEN_PRICES_BASE_URL ?? 'https://prices.openfoodfacts.org/api',
  supplierMode: process.env.SUPPLIER_MODE ?? 'mock',
  safetyBufferHours: Number(process.env.ORDER_SAFETY_BUFFER_HOURS ?? 2),
  schedulerCron: process.env.SCHEDULER_CRON ?? '*/5 * * * *',
  bakeryAddress: process.env.BAKERY_DELIVERY_ADDRESS ?? '',
};
