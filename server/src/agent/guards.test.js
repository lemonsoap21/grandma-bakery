import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedSite, isCheckoutControl, isCheckoutUrl, isPaymentField, siteOf } from './guards.js';

test('isCheckoutControl blocks every way of starting checkout or paying', () => {
  for (const el of [
    { text: 'Checkout' },
    { text: 'Check out' },
    { text: 'Proceed to checkout' },
    { text: 'Place order' },
    { text: 'Place your order' },
    { label: 'Complete purchase' },
    { value: 'Pay now' },
    { text: 'Buy now' },
    { text: 'Continue to payment' },
    { id: 'checkout-button' },
    { text: 'Go', href: '/checkout/delivery' },
    { text: 'Submit', action: 'https://www.walmart.ca/checkout' },
    { text: 'Apple Pay' },
  ]) assert.ok(isCheckoutControl(el), JSON.stringify(el));
});

test('isCheckoutControl allows the cart-filling controls', () => {
  for (const el of [
    { text: 'Add to cart' },
    { label: 'Increase quantity' },
    { text: 'View cart', href: '/en/cart' },
    { text: 'Search' },
    { text: 'Remove' },
    { text: 'Accept cookies' },
  ]) assert.ok(!isCheckoutControl(el), JSON.stringify(el));
});

test('isCheckoutUrl matches checkout and payment pages only', () => {
  assert.ok(isCheckoutUrl('https://www.walmart.ca/checkout'));
  assert.ok(isCheckoutUrl('https://www.nofrills.ca/en/checkout/review?x=1'));
  assert.ok(isCheckoutUrl('/payment'));
  assert.ok(!isCheckoutUrl('https://www.walmart.ca/en/cart'));
  assert.ok(!isCheckoutUrl('https://www.nofrills.ca/en/all-purpose-flour/p/20022248_EA'));
  assert.ok(!isCheckoutUrl(null));
});

test('isPaymentField catches card inputs', () => {
  assert.ok(isPaymentField({ autocomplete: 'cc-number' }));
  assert.ok(isPaymentField({ label: 'Card number' }));
  assert.ok(isPaymentField({ name: 'cvv' }));
  assert.ok(!isPaymentField({ label: 'Quantity', type: 'number' }));
  assert.ok(!isPaymentField({ label: 'Search products' }));
});

test('isAllowedSite keeps the agent on the store sites of this run', () => {
  const sites = new Set([siteOf('www.nofrills.ca')]);
  assert.ok(isAllowedSite('https://www.nofrills.ca/en/cart', sites));
  assert.ok(isAllowedSite('https://accounts.nofrills.ca/login', sites));
  assert.ok(!isAllowedSite('https://www.walmart.ca/en/cart', sites));
  assert.ok(!isAllowedSite('javascript:alert(1)', sites));
  assert.ok(!isAllowedSite('file:///etc/passwd', sites));
});
