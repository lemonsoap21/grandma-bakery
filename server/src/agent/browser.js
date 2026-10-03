import fs from 'node:fs';
import { chromium } from 'playwright';
import { config } from '../config.js';

/**
 * Open the agent's browser with its own saved profile, so store logins made with
 * `npm run agent:login` carry over. Only one process can use the profile at a time.
 */
export async function openBrowser({ headless = config.agentHeadless } = {}) {
  fs.mkdirSync(config.agentProfileDir, { recursive: true });
  const context = await chromium.launchPersistentContext(config.agentProfileDir, {
    headless,
    viewport: { width: 1280, height: 900 },
    locale: 'en-CA',
    timezoneId: 'America/Toronto',
  });
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

const MAX_CONTROLS = 200;
const MAX_TEXT = 5000;

/**
 * Describe the page for the model: its URL and title, the visible text, and every visible
 * interactive element tagged with a number the click/type tools refer to.
 */
export async function snapshot(page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  const view = await page.evaluate(
    ({ maxControls, maxText }) => {
      document.querySelectorAll('[data-agent-ref]').forEach((el) => el.removeAttribute('data-agent-ref'));
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
      };
      const clean = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
      const selector =
        'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=spinbutton], [role=combobox], [role=checkbox], [role=tab], [role=menuitem], [role=option]';
      const lines = [];
      let ref = 0;
      for (const el of document.querySelectorAll(selector)) {
        if (!visible(el)) continue;
        if (ref >= maxControls) break;
        el.setAttribute('data-agent-ref', String(++ref));
        const tag = el.tagName.toLowerCase();
        const label = clean(el.getAttribute('aria-label') || el.innerText || el.placeholder || el.title || el.name, 80);
        let line = `[${ref}] ${el.getAttribute('role') || tag}${tag === 'input' ? `(${el.type})` : ''} "${label}"`;
        if (['input', 'select', 'textarea'].includes(tag)) line += ` value="${clean(el.value, 40)}"`;
        if (tag === 'a') line += ` -> ${clean(el.getAttribute('href'), 100)}`;
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') line += ' (disabled)';
        lines.push(line);
      }
      return {
        url: location.href,
        title: document.title,
        text: clean(document.body?.innerText, maxText),
        controls: lines.join('\n'),
      };
    },
    { maxControls: MAX_CONTROLS, maxText: MAX_TEXT },
  );
  return `URL: ${view.url}\nTitle: ${view.title}\n\nPage text:\n${view.text}\n\nControls:\n${view.controls || '(none)'}`;
}

/** What the guards need to know about the element tagged `ref`, or null if it's gone. */
export async function describeRef(page, ref) {
  const el = page.locator(`[data-agent-ref="${Number(ref)}"]`).first();
  if ((await el.count()) === 0) return null;
  return el.evaluate((node) => ({
    text: (node.innerText || '').trim().slice(0, 200),
    label: node.getAttribute('aria-label') || node.labels?.[0]?.innerText || node.placeholder || '',
    value: node.value ?? '',
    id: node.id,
    name: node.getAttribute('name') ?? '',
    type: node.getAttribute('type') ?? '',
    autocomplete: node.getAttribute('autocomplete') ?? '',
    href: node.closest('a')?.href ?? '',
    action: node.closest('form')?.action ?? '',
  }));
}

/** Give a click or navigation a moment to settle before the next snapshot. */
export async function settle(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
}
