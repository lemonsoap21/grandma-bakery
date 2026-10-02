import { askWithWebSearch } from './claude.js';

export const DEFAULT_SHELF_LIFE_HOURS = 168;
const MAX_SHELF_LIFE_HOURS = 24 * 365 * 3;

/**
 * Ask Claude (with web search) for the typical raw shelf life of a new ingredient, in whole
 * hours. Returns null when no key is configured or the lookup fails, so callers can fall back
 * to a default.
 */
export async function lookupShelfLifeHours(name) {
  try {
    const reply = await askWithWebSearch({
      key: 'days',
      system:
        'You give typical shelf lives of raw baking ingredients as bought from a store, ' +
        'stored properly (pantry, fridge or freezer as normally recommended), unopened or freshly bought, not cooked or prepared. ' +
        'Search the web if needed, then finish with only JSON: {"days": <number>}. Use a conservative typical value.',
      prompt: `Ingredient: ${name}`,
    });
    const days = Number(reply?.answer.days);
    return days > 0 ? Math.min(Math.round(days * 24), MAX_SHELF_LIFE_HOURS) : null;
  } catch (err) {
    console.warn(`[ingredient-info] lookup failed for "${name}":`, err.message);
    return null;
  }
}
