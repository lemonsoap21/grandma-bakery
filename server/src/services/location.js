import { config } from '../config.js';

const USER_AGENT = 'Daniel-Bakery/0.1 (hackathon project)';
const RETRY_AFTER_FAILURE_MS = 3600e3;

/** Great-circle distance in km between two { lat, lon } points. */
export function haversineKm(a, b) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Free OpenStreetMap geocoder. Its usage policy allows ~1 request/second with
// an identifying User-Agent; we geocode once per process and cache the result.
async function geocode(address) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({ q: address, format: 'jsonv2', addressdetails: '1', limit: '1' }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Nominatim responded ${res.status}`);
  const [hit] = await res.json();
  if (!hit) return null;
  return {
    lat: Number(hit.lat),
    lon: Number(hit.lon),
    postalCode: hit.address?.postcode ?? null,
    countryCode: hit.address?.country_code?.toUpperCase() ?? null,
  };
}

let cached = null; // { value, at }

/**
 * The bakery's location: { lat, lon, postalCode, countryCode }, or null when
 * neither coordinates nor a usable address are configured.
 */
export async function getBakeryLocation() {
  if (cached && (cached.value || Date.now() - cached.at < RETRY_AFTER_FAILURE_MS)) return cached.value;

  let value = null;
  if (config.bakeryLat != null && config.bakeryLon != null) {
    value = { lat: config.bakeryLat, lon: config.bakeryLon, postalCode: null, countryCode: null };
  } else if (config.bakeryAddress && !/your_bakery_address/i.test(config.bakeryAddress)) {
    try {
      value = await geocode(config.bakeryAddress);
      if (!value) console.warn('[location] could not geocode BAKERY_DELIVERY_ADDRESS');
    } catch (err) {
      console.warn(`[location] geocoding failed: ${err.message}`);
    }
  }
  if (value) {
    value.postalCode = config.bakeryPostalCode || value.postalCode;
    value.countryCode = value.countryCode ?? config.bakeryCountryCode;
  }
  cached = { value, at: Date.now() };
  return value;
}

/** Postal + country code for Instacart's retailer lookup, even without coordinates. */
export async function getBakeryPostalCode() {
  const loc = await getBakeryLocation();
  return {
    postalCode: config.bakeryPostalCode || loc?.postalCode || null,
    countryCode: config.bakeryCountryCode || loc?.countryCode || 'US',
  };
}
