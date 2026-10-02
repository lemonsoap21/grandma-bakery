import { config } from '../config.js';

export const DEFAULT_SHELF_LIFE_HOURS = 168;
const MAX_SHELF_LIFE_HOURS = 24 * 365 * 3;
const CATEGORY_TAG = /^[a-z]{2}:[a-z0-9-]+$/;

/**
 * Ask Claude (with web search) about a new ingredient: its typical raw shelf life and its
 * Open Food Facts category tag (used to find prices). Either field is null when unknown, and
 * both are null when no key is configured or the lookup fails, so callers can fall back to defaults.
 */
export async function lookupIngredientInfo(name) {
  const none = { shelfLifeHours: null, categoryTag: null };
  if (!config.anthropicApiKey) return none;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.ingredientLookupModel,
        max_tokens: 1024,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
        system:
          'You describe raw baking ingredients as bought from a store. For the ingredient given, find: ' +
          '"days", the typical shelf life of the raw ingredient stored properly (pantry, fridge or freezer as normally recommended), ' +
          'unopened or freshly bought, not cooked or prepared (use a conservative typical value); and ' +
          '"category", the most fitting Open Food Facts category tag in English, lowercase with hyphens, like "en:butters", ' +
          '"en:wheat-flours" or "en:chicken-eggs" (null if unsure). ' +
          'Search the web if needed, then finish with only JSON: {"days": <number>, "category": "<tag or null>"}.',
        messages: [{ role: 'user', content: `Ingredient: ${name}` }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API responded ${res.status}`);
    const json = await res.json();
    // The reply mixes search blocks and text; the answer is the last JSON object in the text.
    const text = (json.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    const match = text.match(/\{[^{}]*"days"[^{}]*\}(?![\s\S]*\{[^{}]*"days")/);
    const info = JSON.parse(match?.[0] ?? 'null') ?? {};
    const days = Number(info.days);
    const category = typeof info.category === 'string' ? info.category.trim().toLowerCase() : '';
    return {
      shelfLifeHours: days > 0 ? Math.min(Math.round(days * 24), MAX_SHELF_LIFE_HOURS) : null,
      categoryTag: CATEGORY_TAG.test(category) ? category : null,
    };
  } catch (err) {
    console.warn(`[ingredient-info] lookup failed for "${name}":`, err.message);
    return none;
  }
}
