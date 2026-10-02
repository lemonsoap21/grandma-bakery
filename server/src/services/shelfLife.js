import { config } from '../config.js';

export const DEFAULT_SHELF_LIFE_HOURS = 168;
const MAX_SHELF_LIFE_HOURS = 24 * 365 * 3;

/**
 * Ask Claude (with web search) for the typical shelf life of an ingredient in its raw, unopened
 * form. Returns whole hours, or null when no key is configured or the lookup fails,
 * so callers can fall back to a default.
 */
export async function lookupShelfLifeHours(name) {
  if (!config.anthropicApiKey) return null;
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
        model: config.shelfLifeModel,
        max_tokens: 1024,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }],
        system:
          'You give typical shelf lives of raw baking ingredients as bought from a store, ' +
          'stored properly (pantry, fridge or freezer as normally recommended), unopened or freshly bought, not cooked or prepared. ' +
          'Search the web if needed, then finish with only JSON: {"days": <number>}. Use a conservative typical value.',
        messages: [{ role: 'user', content: `Ingredient: ${name}` }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API responded ${res.status}`);
    const json = await res.json();
    // The reply mixes search blocks and text; the answer is the last JSON object in the text.
    const text = (json.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    const match = text.match(/\{[^{}]*"days"[^{}]*\}(?![\s\S]*\{[^{}]*"days")/);
    const days = Number(JSON.parse(match?.[0] ?? 'null')?.days);
    if (!(days > 0)) return null;
    return Math.min(Math.round(days * 24), MAX_SHELF_LIFE_HOURS);
  } catch (err) {
    console.warn(`[shelf-life] lookup failed for "${name}":`, err.message);
    return null;
  }
}
