import { config } from '../config.js';

/**
 * Ask Claude a question it may answer using web search, and return the last JSON object in its
 * reply that has `key` (e.g. "days" or "prices"). Returns null when no API key is configured;
 * throws when the request fails or the reply has no such JSON.
 */
export async function askWithWebSearch({ system, prompt, key, maxSearches = 2, maxTokens = 1024, timeoutMs = 30000 }) {
  if (!config.anthropicApiKey) return null;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.ingredientLookupModel,
      max_tokens: maxTokens,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: maxSearches,
          user_location: { type: 'approximate', country: 'CA' },
        },
      ],
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API responded ${res.status}`);
  const json = await res.json();
  // The reply mixes search blocks and text; the answer is the last JSON object in the text.
  const text = (json.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const found = lastJsonWithKey(text, key);
  if (!found) throw new Error(`no JSON with "${key}" in reply: ${JSON.stringify(text.slice(0, 300))}`);
  return found;
}

function lastJsonWithKey(text, key) {
  for (let start = text.lastIndexOf('{'); start >= 0; start = text.lastIndexOf('{', start - 1)) {
    for (let end = text.indexOf('}', start); end >= 0; end = text.indexOf('}', end + 1)) {
      try {
        const value = JSON.parse(text.slice(start, end + 1));
        if (value && typeof value === 'object' && key in value) return value;
      } catch {
        // Not a complete object yet; try the next closing brace.
      }
    }
  }
  return null;
}
