import { api, fmtDateTime } from '../api.js';
import { notifyDataChanged } from '../dataEvents.js';
import {
  extractWhen, guessHour, matchMenuItem, normalize, parseOrderMessage, piecesFor, resolveWhen, sameDay, tidyName,
} from './parse.js';

// The chat's memory between messages: a half-finished order or a question awaiting yes/no.
export const initialState = { pending: null, lastOrderId: null };

// Every reply is in the voice of Daniel, grandma's husband: warm, unhurried, a little old-fashioned.
export const GREETING =
  'Hello, sweetheart, it\'s Daniel. Just tell me what you need, like "Add an order of 4 muffins for Sarah tomorrow at 2pm", and I\'ll take care of it. Say "help" if you want to know what else I can do.';

const HELP_TEXT = [
  "Here's how I can help, love:",
  '• Add an order: "Add an order of 4 muffins for Sarah tomorrow at 2pm"',
  '• Cancel an order: "Cancel Sarah\'s order" or "Cancel order 5"',
  '• Take back the order I just added: "undo"',
  '• See what\'s coming up: "What\'s due tomorrow?" or "Show orders"',
  '• See what we bake: "Show the menu"',
  "If you forget something, I'll ask. No rush.",
].join('\n');

const NOT_UNDERSTOOD =
  'Sorry, dear, these old ears didn\'t catch that. Try something like "Add an order of 4 muffins for Sarah tomorrow at 2pm", or say "help".';

const YES = /^\s*(?:y|yes|yeah|yep|yup|sure|ok|okay|please do|do it|go ahead|confirm|correct|right)\b/i;
const NO = /^\s*(?:n|no|nope|nah|don'?t|do not|stop|never ?mind|keep it|leave it)\b/i;
const HELP = /^\s*(?:help|\?|what can you do|commands|how does this work|how do i)\b/i;
const NEVERMIND = /^\s*(?:no|nope|never ?mind|forget (?:it|that|about it)|start over|stop|cancel(?: (?:that|it|this|the order))?)\s*[.!]*\s*$/i;
const UNDO = /^\s*(?:undo|oops|cancel (?:that|it|the last (?:one|order)|my last order)|take (?:that|it) back)\b/i;
const MENU_EDIT = /\b(?:add|new|create|put|remove|delete|take off|change)\b[\s\S]*\bmenu\b|\bmenu items?\b/i;
const CANCEL = /\b(?:cancel|remove|delete|scrap|drop|call off)\b/i;
const MENU = /\bmenu\b|\bwhat (?:can|do) (?:i|we|you) (?:make|bake|sell)\b/i;
const LIST =
  /\b(?:show|list|see|view|what'?s|what is|what are|which|any|upcoming|how many)\b[\s\S]*\b(?:orders?|due|coming up|schedule|baking|bake)\b|^\s*(?:orders?|schedule|what'?s due)\s*\??\s*$/i;
const ADD = /\b(?:add|new|place|put|make|create|book|take|order|ordered|wants?|needs?|would like|i'?d like)\b/i;
const MORE = /\b(?:too|also|as well)\b/i;

const fmtDay = ({ y, m, d }) => new Date(y, m, d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

const describeLine = ({ menuItem, quantity }) =>
  menuItem.batchSize > 1 ? `${quantity} ${menuItem.batchUnit} of ${menuItem.name}` : `${quantity} × ${menuItem.name}`;
const describeItems = (items) => items.map(describeLine).join(', ');
const describeOrder = (o) => `#${o.id} for ${o.customerName}, due ${fmtDateTime(o.deliveryAt)}: ${describeItems(o.items)}`;

const comparable = (s) => normalize(s).replace(/[^a-z0-9]+/g, ' ').trim();
const namesMatch = (a, b) => {
  const [x, y] = [comparable(a), comparable(b)];
  return Boolean(x && y) && (x.includes(y) || y.includes(x));
};

/**
 * Answers one chat message. Returns `{ reply, state }`; pass the state back in with the next
 * message so follow-up answers ("Sarah", "tomorrow at 2") fill in the order being built.
 */
export async function respond(message, state = initialState, now = new Date()) {
  const text = message.trim();
  if (!text) return { reply: "I'm listening, dear. What can I do for you?", state };

  if (state.pending?.kind === 'confirmCancel') {
    if (YES.test(text)) return cancelOrder(state.pending.order, state);
    if (NO.test(text)) return { reply: "Alright, I'll leave that order be.", state: { ...state, pending: null } };
    state = { ...state, pending: null }; // she moved on; treat this as a new request
  }
  if (HELP.test(text)) return { reply: HELP_TEXT, state };
  if (state.pending?.kind === 'draft' && NEVERMIND.test(text)) {
    return { reply: "No trouble at all, love. I won't add it.", state: { ...state, pending: null } };
  }
  if (UNDO.test(text)) return undo(state);
  if (MENU_EDIT.test(text)) {
    return { reply: "I'm afraid I can't change the menu, dear. You'll want the Menu page for that.", state };
  }
  if (CANCEL.test(text)) return startCancel(text, { ...state, pending: null }, now);
  if (MENU.test(text)) return showMenu(state);
  if (LIST.test(text)) return listOrders(text, state, now);
  return draftOrder(text, state, now);
}

// ---- Adding orders ----------------------------------------------------------

const emptyDraft = () => ({ kind: 'draft', items: [], choices: [], customerName: null, day: null, time: null, asked: [] });

// Picks one of the offered items from "the blueberry ones", "2" or "the second one".
function pickOption(text, options) {
  const ordinal = text.match(/^\s*(?:the\s+|number\s+|#)?(\d+|first|second|third|fourth|1st|2nd|3rd|4th)\b/i);
  if (ordinal) {
    const index = { first: 1, second: 2, third: 3, fourth: 4 }[ordinal[1].toLowerCase()] ?? parseInt(ordinal[1], 10);
    return options[index - 1] ?? null;
  }
  const whole = matchMenuItem(text, options);
  if (whole?.item) return whole.item;
  const hits = new Set(text.split(/\s+/).map((word) => matchMenuItem(word, options)?.item).filter(Boolean));
  return hits.size === 1 ? [...hits][0] : null;
}

// Reads a reply to "Who is the order for?" such as "it's for Mrs. Lee".
function nameFromAnswer(rest) {
  let t = rest.replace(/\b(?:please|thanks|thank you|okay|ok)\b/gi, ' ').trim();
  const lead = /^(?:it'?s|it is|that'?s|this is|the order is|order is|the customer is|customer is|(?:her|his|their|the) name is|name is|called|for|from)\s+/i;
  while (lead.test(t)) t = t.replace(lead, '');
  const name = tidyName(t);
  if (!name || /\d/.test(name) || name.split(' ').length > 6 || YES.test(name) || NO.test(name)) return null;
  return name;
}

async function draftOrder(text, state, now) {
  const menu = await api.menu();
  if (menu.length === 0) {
    return { reply: "Our menu's empty, dear, so there's nothing to order yet. Add a few items on the Menu page first.", state };
  }
  const p = parseOrderMessage(text, menu, now);
  const prev = state.pending?.kind === 'draft' ? state.pending : null;
  const mentionsItems = p.items.length + p.ambiguous.length > 0;
  const fresh = !prev || (mentionsItems && ADD.test(text) && !MORE.test(text));

  if (fresh && !mentionsItems && !ADD.test(text) && !p.unknown.some((u) => u.quantity != null)) {
    return { reply: NOT_UNDERSTOOD, state };
  }

  const draft = fresh
    ? emptyDraft()
    : { ...prev, items: prev.items.map((i) => ({ ...i })), choices: [...prev.choices] };
  const notes = [];
  let answeredChoice = false;

  // Reply to "Which one do you mean?"
  if (!fresh && draft.asked.includes('choice') && draft.choices.length) {
    const [choice, ...others] = draft.choices;
    const item = pickOption(text, choice.options);
    if (item) {
      draft.items.push({ menuItem: item, quantity: piecesFor(item, choice) });
      draft.choices = others;
      answeredChoice = true;
    }
  }

  if (!answeredChoice) {
    for (const line of p.items) {
      const same = draft.items.find((i) => i.menuItem.id === line.menuItem.id);
      if (same && !fresh) same.quantity = line.quantity ?? same.quantity;
      else draft.items.push({ ...line });
    }
    draft.choices.push(...p.ambiguous);
    if (p.number != null) {
      const missing = draft.items.find((i) => i.quantity == null);
      if (missing && draft.asked.includes('quantity')) missing.quantity = p.number;
      else if (draft.asked.includes('time') && !p.time && p.number <= 23) draft.time = { h: guessHour(p.number), min: 0 };
    }
    const nothingFound = draft.items.length === 0 && draft.choices.length === 0;
    for (const u of p.unknown) {
      if (u.quantity != null || (fresh && nothingFound)) notes.push(`Hmm, I don't see "${u.phrase}" on our menu.`);
    }
  }

  if (p.customerName) draft.customerName = p.customerName;
  else if (!fresh && !draft.customerName && draft.asked.includes('customer') && !answeredChoice && !mentionsItems) {
    draft.customerName = nameFromAnswer(p.rest);
  }
  if (p.day) draft.day = p.day;
  if (p.time) draft.time = p.time;

  // Ask for whatever is still missing, one topic at a time.
  const ask = (question, asked) => {
    const known = draft.items.filter((i) => i.quantity != null);
    const ack = known.length ? `Alright, ${describeItems(known)}${draft.customerName ? ` for ${draft.customerName}` : ''}.` : '';
    return {
      reply: [...notes, ack, question].filter(Boolean).join(' '),
      state: { ...state, pending: { ...draft, asked } },
    };
  };

  if (draft.choices.length) {
    const { options } = draft.choices[0];
    return ask(`Which ones do you mean, dear: ${options.map((o, i) => `${i + 1}. ${o.name}`).join(', ')}?`, ['choice']);
  }
  if (draft.items.length === 0) {
    const examples = menu.slice(0, 2).map((m) => `"4 ${m.name.replace(/\s*\([^)]*\)/g, '')}"`).join(' or ');
    return ask(`What would you like to order, love? For example ${examples}.`, ['items']);
  }
  const missing = draft.items.find((i) => i.quantity == null);
  if (missing) {
    const { menuItem } = missing;
    return ask(`And how many ${menuItem.batchSize > 1 ? `${menuItem.batchUnit} of ` : ''}${menuItem.name} would you like?`, ['quantity']);
  }

  const needs = [];
  if (!draft.customerName) needs.push('customer');
  if (!draft.time) needs.push('time');
  if (needs.length) {
    const whenQuestion = draft.day ? `what time on ${fmtDay(draft.day)}` : 'when should it be ready';
    const question = !needs.includes('time')
      ? 'And who is this order for?'
      : needs.includes('customer')
        ? `Who's it for, and ${whenQuestion}?`
        : `${whenQuestion[0].toUpperCase()}${whenQuestion.slice(1)}?${draft.day ? '' : ' For example "tomorrow at 2pm".'}`;
    return ask(question, needs);
  }

  const deliveryAt = resolveWhen(draft.day, draft.time, now);
  if (deliveryAt <= now) {
    draft.day = null;
    draft.time = null;
    return ask(`${fmtDateTime(deliveryAt)} has already come and gone, dear. When should it be ready?`, ['time']);
  }

  try {
    const order = await api.addOrder({
      customerName: draft.customerName,
      deliveryAt: deliveryAt.toISOString(),
      items: draft.items.map((i) => ({ menuItemId: i.menuItem.id, quantity: i.quantity })),
    });
    notifyDataChanged();
    return {
      reply: [
        ...notes,
        `All done, sweetheart. Order #${order.id} for ${order.customerName}: ${describeItems(draft.items)}, due ${fmtDateTime(order.deliveryAt)}.`,
        'If I got anything wrong, just say "undo".',
      ].join(' '),
      state: { pending: null, lastOrderId: order.id },
    };
  } catch (err) {
    return { reply: `Oh dear, I couldn't add that order: ${err.message}`, state: { ...state, pending: null } };
  }
}

// ---- Cancelling orders ------------------------------------------------------

// "cancel Sarah's order", "cancel the order for Sarah", "cancel Sarah" → "Sarah"
function cancelTarget(rest) {
  const t = rest
    .replace(/^\s*(?:please\s+)?(?:(?:can|could|would) you\s+)?(?:cancel|remove|delete|scrap|drop|call off)\s*/i, '')
    .replace(/\b(?:please|thanks|thank you)\b/gi, ' ')
    .trim();
  const m =
    t.match(/^(?:the\s+)?(.+?)['’]s\s+orders?\b/i) ||
    t.match(/\borders?\s+(?:for|from|of|by)\s+(.+)$/i) ||
    t.match(/^(?:the\s+)?(.+?)\s+orders?\b/i) ||
    t.match(/^(?:for|from)\s+(.+)$/i);
  const name = tidyName(m ? m[1] : t.replace(/\b(?:the|an?|my|orders?)\b/gi, ' '));
  return name || null;
}

async function startCancel(text, state, now) {
  const orders = (await api.orders()).filter((o) => o.status === 'OPEN');
  const number = text.match(/(?:#\s*|\b(?:order|number|no\.?)\s+#?\s*)(\d+)\b/i);
  let matches;
  let label;
  if (number) {
    matches = orders.filter((o) => o.id === Number(number[1]));
    label = `#${number[1]}`;
  } else {
    const { day, rest } = extractWhen(text, now);
    const name = cancelTarget(rest);
    if (!name && !day) {
      return {
        reply: 'Which order should I cancel, dear? Tell me the name or the order number, like "cancel Sarah\'s order" or "cancel order 5".',
        state,
      };
    }
    matches = orders.filter(
      (o) => (!name || namesMatch(o.customerName, name)) && (!day || sameDay(new Date(o.deliveryAt), day)),
    );
    label = [name && `for ${name}`, day && `on ${fmtDay(day)}`].filter(Boolean).join(' ');
  }

  if (matches.length === 0) return { reply: `I looked, love, but I can't find an open order ${label}.`, state };
  if (matches.length > 1) {
    return {
      reply: `I found ${matches.length} open orders ${label}:\n${matches.map((o) => `• ${describeOrder(o)}`).join('\n')}\nWhich one, dear? Say for example "cancel order ${matches[0].id}".`,
      state,
    };
  }
  const [order] = matches;
  return {
    reply: `Just to be sure, cancel order ${describeOrder(order)}? Say yes or no.`,
    state: { ...state, pending: { kind: 'confirmCancel', order } },
  };
}

async function cancelOrder(order, state) {
  try {
    await api.cancelOrder(order.id);
  } catch (err) {
    return { reply: `Oh dear, I couldn't cancel that order: ${err.message}`, state: { ...state, pending: null } };
  }
  notifyDataChanged();
  return {
    reply: `There we go. Order #${order.id} for ${order.customerName} is cancelled.`,
    state: { pending: null, lastOrderId: state.lastOrderId === order.id ? null : state.lastOrderId },
  };
}

async function undo(state) {
  if (!state.lastOrderId) {
    return { reply: "There's nothing to undo, dear. I haven't added any orders yet.", state: { ...state, pending: null } };
  }
  try {
    await api.cancelOrder(state.lastOrderId);
  } catch (err) {
    return { reply: `Oh dear, I couldn't undo that: ${err.message}`, state: { ...state, pending: null } };
  }
  notifyDataChanged();
  return { reply: `No harm done. I've cancelled order #${state.lastOrderId}.`, state: { pending: null, lastOrderId: null } };
}

// ---- Looking things up ------------------------------------------------------

async function listOrders(text, state, now) {
  const { day } = extractWhen(text, now);
  const on = day ? ` on ${fmtDay(day)}` : '';
  const upcoming = (await api.orders()).filter(
    (o) => o.status === 'OPEN' && new Date(o.deliveryAt) > now && (!day || sameDay(new Date(o.deliveryAt), day)),
  );
  if (upcoming.length === 0) return { reply: `Nothing coming up${on}, love. You can put your feet up.`, state };
  const shown = upcoming.slice(0, 10).map((o) => `• ${describeOrder(o)}`);
  const more = upcoming.length > 10 ? `\n…and ${upcoming.length - 10} more on the Orders page.` : '';
  return { reply: `Here's what's coming up${on}:\n${shown.join('\n')}${more}`, state };
}

async function showMenu(state) {
  const menu = await api.menu();
  if (menu.length === 0) return { reply: "Our menu's empty, dear. You can add items on the Menu page.", state };
  const lines = menu.map((m) => `• ${m.name}${m.batchSize > 1 ? ` (ordered in ${m.batchUnit})` : ''}`);
  return { reply: `Here's what we bake, love:\n${lines.join('\n')}`, state };
}
