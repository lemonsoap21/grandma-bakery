// Hard limits on what the cart agent may do in the browser. These run in code before every
// action, so they hold no matter what the model decides or what a web page tells it.

// Buttons and links that move from "cart" toward paying. The agent fills carts; the baker checks out.
const CHECKOUT_TEXT =
  /check\s*-?\s*out|place\s+(your\s+)?order|submit\s+order|complete\s+(your\s+)?(order|purchase)|confirm\s+(and\s+pay|order|purchase)|pay\s+now|buy\s+now|proceed\s+to\s+(payment|pay)|review\s+(your\s+)?order|continue\s+to\s+payment|express\s+pay|apple\s+pay|google\s+pay|paypal/i;

// Pages the agent must never be on.
const CHECKOUT_PATH = /\/(checkout|payment|pay|order-?review|place-?order|billing)(\/|$|\?|#)/i;

// Card and payment inputs.
const PAYMENT_FIELD = /card|cc-?(number|csc|exp|name)|cvv|cvc|security\s*code|expir|billing|iban|routing/i;

/**
 * True when an element would start checkout or payment. `el` holds what the page says about the
 * element: { text, label, value, id, name, href, action }.
 */
export function isCheckoutControl(el) {
  const words = [el.text, el.label, el.value, el.id, el.name].filter(Boolean).join(' ');
  return CHECKOUT_TEXT.test(words) || isCheckoutUrl(el.href) || isCheckoutUrl(el.action);
}

/** True for checkout/payment pages. */
export function isCheckoutUrl(url) {
  if (!url) return false;
  try {
    return CHECKOUT_PATH.test(new URL(url, 'https://x.invalid').pathname);
  } catch {
    return false;
  }
}

/** True for card or other payment inputs: { label, id, name, autocomplete, type }. */
export function isPaymentField(el) {
  if (String(el.autocomplete ?? '').startsWith('cc-')) return true;
  return PAYMENT_FIELD.test([el.label, el.id, el.name, el.autocomplete].filter(Boolean).join(' '));
}

/** The registrable part of a host, e.g. www.nofrills.ca → nofrills.ca. */
export function siteOf(hostname) {
  return hostname.toLowerCase().split('.').slice(-2).join('.');
}

/** True when `url` is http(s) on one of the store sites this run is allowed to use. */
export function isAllowedSite(url, sites) {
  try {
    const { protocol, hostname } = new URL(url);
    return (protocol === 'https:' || protocol === 'http:') && sites.has(siteOf(hostname));
  } catch {
    return false;
  }
}
