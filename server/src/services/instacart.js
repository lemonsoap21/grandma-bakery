import { config } from '../config.js';

/**
 * Client for the Instacart Developer Platform (IDP) API.
 * https://docs.instacart.com/developer_platform_api/
 *
 * What the public API can do:
 *   - list retailers near a postal code (GET /idp/v1/retailers)
 *   - create a shopping-list page link (POST /idp/v1/products/products_link)
 * It does not return product prices and cannot check out on someone's behalf;
 * the person opening the link picks the store and pays on Instacart.
 */

const RETAILER_TTL_MS = 24 * 3600e3;
const UNIT_NAMES = { g: 'gram', ml: 'milliliter', each: 'each' };

export const isInstacartConfigured = () => Boolean(config.instacart.apiKey);

async function request(path, { method = 'GET', body } = {}) {
  if (!isInstacartConfigured()) throw new Error('INSTACART_API_KEY is not set');
  const res = await fetch(`${config.instacart.baseUrl}${path}`, {
    method,
    signal: AbortSignal.timeout(10000),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.instacart.apiKey}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.errors?.[0]?.message ?? data.error?.message ?? data.message ?? '';
    throw new Error(`Instacart ${method} ${path} responded ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return data;
}

const retailerCache = new Map(); // "US:94103" → { at, retailers }

/** Retailers Instacart serves near a postal code: [{ retailer_key, name, retailer_logo_url }]. */
export async function getNearbyRetailers(postalCode, countryCode = 'US') {
  if (!postalCode) return [];
  const cacheKey = `${countryCode}:${postalCode}`;
  const hit = retailerCache.get(cacheKey);
  if (hit && Date.now() - hit.at < RETAILER_TTL_MS) return hit.retailers;

  const query = new URLSearchParams({ postal_code: postalCode, country_code: countryCode });
  const data = await request(`/idp/v1/retailers?${query}`);
  const retailers = data.retailers ?? [];
  retailerCache.set(cacheKey, { at: Date.now(), retailers });
  return retailers;
}

export const normalizeStoreName = (name) =>
  String(name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|inc|llc|co|store|stores|supermarket|market|grocery|groceries)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Match an OpenStreetMap store to an Instacart retailer by brand or name.
 * Returns the retailer_key, or null when nothing matches confidently.
 */
export function matchRetailer({ name, brand }, retailers) {
  const candidates = [brand, name].map(normalizeStoreName).filter((s) => s.length >= 3);
  for (const retailer of retailers) {
    const r = normalizeStoreName(retailer.name);
    if (r.length < 3) continue;
    for (const c of candidates) {
      if (c === r) return retailer.retailer_key;
      // "safeway 1234 main st" ↔ "safeway"; require a whole-word prefix to avoid "aldi" ↔ "aldine"
      if (c.startsWith(`${r} `) || r.startsWith(`${c} `)) return retailer.retailer_key;
    }
  }
  return null;
}

/** Build an Instacart line item for a purchase in the ingredient's base unit. */
export function toLineItem({ ingredient, quantity }) {
  const unit = UNIT_NAMES[ingredient.unit] ?? 'each';
  const amount = ingredient.unit === 'each' ? Math.ceil(quantity) : Math.round(quantity * 100) / 100;
  return {
    name: ingredient.name,
    display_text: ingredient.name,
    line_item_measurements: [{ quantity: amount, unit }],
  };
}

/** Create a shopping-list page and return its URL. */
export async function createShoppingListLink({ title, lineItems, instructions = [] }) {
  const body = {
    title,
    link_type: 'shopping_list',
    expires_in: 30,
    instructions,
    line_items: lineItems,
  };
  if (config.instacart.linkbackUrl) {
    body.landing_page_configuration = { partner_linkback_url: config.instacart.linkbackUrl };
  }
  const data = await request('/idp/v1/products/products_link', { method: 'POST', body });
  if (!data.products_link_url) throw new Error('Instacart did not return a products_link_url');
  return data.products_link_url;
}
