// Understands simple bakery instructions without any AI service, so the chat costs nothing to run.
// It recognises a small set of everyday phrasings ("4 muffins for Sarah tomorrow at 2pm"); the
// conversation in respond.js asks follow-up questions for anything left out.

const NUMBER_WORDS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, hundred: 100,
};
const NUM = `\\d+|${Object.keys(NUMBER_WORDS).sort((x, y) => y.length - x.length).join('|')}`;
// Hours may be spelled out, which is how speech recognition often writes them ("at two p.m.").
const HOUR = '\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve';
const toNumber = (word) => (/^\d+$/.test(word) ? Number(word) : NUMBER_WORDS[word.toLowerCase()]);

const WEEKDAYS = [
  ['sunday', 'sun'], ['monday', 'mon'], ['tuesday', 'tues', 'tue'], ['wednesday', 'wed'],
  ['thursday', 'thurs', 'thur', 'thu'], ['friday', 'fri'], ['saturday', 'sat'],
];
const MONTHS = [
  ['january', 'jan'], ['february', 'feb'], ['march', 'mar'], ['april', 'apr'], ['may'], ['june', 'jun'],
  ['july', 'jul'], ['august', 'aug'], ['september', 'sept', 'sep'], ['october', 'oct'], ['november', 'nov'],
  ['december', 'dec'],
];
const WEEKDAY_RE = WEEKDAYS.flat().join('|');
const MONTH_RE = MONTHS.flat().join('|');
const indexIn = (table, word) => table.findIndex((names) => names.includes(word.toLowerCase()));

// Little words that lead into a date or time ("due on", "ready by", "this coming") are removed with it.
const LEAD = '(?:\\b(?:due|ready|on|at|by|for|around|before|this|next|coming)\\s+)*';
const re = (source) => new RegExp(source, 'i');

const dayFrom = (date) => ({ y: date.getFullYear(), m: date.getMonth(), d: date.getDate() });
const addDays = (now, n) => {
  const date = new Date(now);
  date.setDate(date.getDate() + n);
  return dayFrom(date);
};
// Returns the day only if it exists (no "February 30").
const validDay = (y, m, d) => {
  const date = new Date(y, m, d);
  return date.getMonth() === m && date.getDate() === d ? { y, m, d } : null;
};

/** Turns an hour said without am/pm into a bakery-sensible 24h hour. */
export function guessHour(hour, period = null) {
  if (hour >= 13) return hour;
  if (period === 'morning') return hour === 12 ? 12 : hour;
  if (period) return hour === 12 ? 12 : hour + 12;
  if (hour >= 1 && hour <= 6) return hour + 12; // "at 3" means 3pm in a bakery
  return hour;
}

/**
 * Finds a delivery day and time in the text. Returns `{ day, time, rest }` where day is
 * `{ y, m, d }` (month 0-based) or null, time is `{ h, min }` or null, and rest is the text with
 * the date and time words removed.
 */
export function extractWhen(text, now = new Date()) {
  let rest = ` ${text} `;
  const cut = (pattern) => {
    const m = rest.match(re(pattern));
    if (m) rest = `${rest.slice(0, m.index)} ${rest.slice(m.index + m[0].length)}`;
    return m;
  };

  let day = null;
  let period = null;
  let m;
  if ((m = cut(`${LEAD}\\b(?:the\\s+)?day\\s+after\\s+(?:tomorrow|tmrw)\\b`))) day = addDays(now, 2);
  else if ((m = cut(`${LEAD}\\b(today|tonight)\\b`))) {
    day = addDays(now, 0);
    if (/tonight/i.test(m[1])) period = 'night';
  } else if ((m = cut(`${LEAD}\\b(?:tomorrow|tomorow|tommorow|tommorrow|tmrw|tmr)\\b`))) day = addDays(now, 1);
  else if ((m = cut(`${LEAD}\\bin\\s+(${NUM})\\s+(days?|weeks?)\\b`))) {
    day = addDays(now, toNumber(m[1]) * (/week/i.test(m[2]) ? 7 : 1));
  } else if ((m = cut(`${LEAD}\\b(\\d{4})-(\\d{1,2})-(\\d{1,2})\\b`))) {
    day = validDay(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  } else if (
    (m = cut(`${LEAD}\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`)) ||
    (m = cut(`${LEAD}\\b(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})\\b\\.?`))
  ) {
    const [monthWord, dayNum] = /^\d/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
    const month = indexIn(MONTHS, monthWord);
    let year = now.getFullYear();
    if (new Date(year, month, Number(dayNum), 23, 59) < now) year += 1; // already passed: next year
    day = validDay(year, month, Number(dayNum));
  } else if ((m = cut(`${LEAD}\\bthe\\s+(\\d{1,2})(?:st|nd|rd|th)\\b`))) {
    const dayNum = Number(m[1]);
    const nextMonth = dayNum < now.getDate();
    const base = new Date(now.getFullYear(), now.getMonth() + (nextMonth ? 1 : 0), 1);
    day = validDay(base.getFullYear(), base.getMonth(), dayNum);
  }
  // A weekday can stand alone ("Friday") or sit beside a date ("Friday, Oct 9"); either way remove it.
  if ((m = cut(`${LEAD}\\b(${WEEKDAY_RE})\\b\\.?,?`)) && !day) {
    const diff = (indexIn(WEEKDAYS, m[1]) - now.getDay() + 7) % 7 || 7;
    day = addDays(now, diff);
  }

  if ((m = cut(`${LEAD}\\b(?:in\\s+the\\s+)?(morning|afternoon|evening)\\b|\\bat\\s+night\\b`))) {
    period = (m[1] ?? 'night').toLowerCase();
  }

  let time = null;
  if ((m = cut(`${LEAD}\\b(noon|midday|lunch\\s*time|lunch)\\b`))) time = { h: 12, min: 0 };
  else if ((m = cut(`${LEAD}\\b(${HOUR})(?:[:.](\\d{2}))?\\s*([ap])\\.?\\s*m\\b\\.?`))) {
    const hour = toNumber(m[1]) % 12;
    time = { h: /p/i.test(m[3]) ? hour + 12 : hour, min: Number(m[2] ?? 0) };
  } else if (
    (m = cut(`${LEAD}\\b(${HOUR})(?:[:.](\\d{2}))?\\s*o'?\\s*clock\\b`)) ||
    (m = cut(`${LEAD}\\b(\\d{1,2}):(\\d{2})\\b`)) ||
    (m = cut(`\\b(?:at|by|around|before)\\s+(${HOUR})\\b(?![:.]\\d)`))
  ) {
    time = { h: guessHour(toNumber(m[1]), period), min: Number(m[2] ?? 0) };
  }
  if (time && (time.h > 23 || time.min > 59)) time = null;
  if (!time && period) time = { h: { morning: 9, afternoon: 14, evening: 17, night: 18 }[period], min: 0 };

  return { day, time, rest: rest.replace(/\s+/g, ' ').trim() };
}

/** Combines a day and time into a Date. A time with no day means the next time it comes round. */
export function resolveWhen(day, time, now = new Date()) {
  if (!time) return null;
  if (day) return new Date(day.y, day.m, day.d, time.h, time.min);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), time.h, time.min);
  if (today > now) return today;
  today.setDate(today.getDate() + 1);
  return today;
}

export const sameDay = (date, day) =>
  date.getFullYear() === day.y && date.getMonth() === day.m && date.getDate() === day.d;

// ---- Menu matching ------------------------------------------------------

const STOP = new Set([
  'a', 'an', 'the', 'of', 'some', 'please', 'order', 'orders', 'batch', 'batches', 'dozen', 'x', 'and',
  'with', 'fresh', 'our', 'my', 'your', 'those', 'these', 'them', 'more', 'extra', 'piece', 'pieces', 'tray', 'trays',
]);

// Rough singular form so "cookies", "cookie" and "cooky" all compare equal.
const stem = (w) =>
  w.replace(/ies$/, 'y').replace(/ves$/, 'f').replace(/(ch|sh|x|ss)es$/, '$1').replace(/([^s])s$/, '$1').replace(/ie$/, 'y');

export const normalize = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const tokens = (s) =>
  normalize(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP.has(t) && !/^\d+$/.test(t))
    .map(stem);

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return row[b.length];
}

// Exact, abbreviated ("choc" for "chocolate") or a small typo ("muffens").
function wordsMatch(a, b) {
  if (a === b) return true;
  const shorter = Math.min(a.length, b.length);
  if (shorter >= 3 && (a.startsWith(b) || b.startsWith(a))) return true;
  if (shorter >= 4) return editDistance(a, b) <= (shorter >= 7 ? 2 : 1);
  return false;
}

const itemWords = (item) => [
  ...tokens(item.name.replace(/\([^)]*\)/g, ' ')),
  ...(item.batchUnit && item.batchUnit !== 'batch' ? tokens(item.batchUnit) : []),
];

/**
 * Finds the menu item a phrase like "choc chip cookies" refers to.
 * Returns `{ item }`, `{ options }` when several fit equally well, or null.
 */
export function matchMenuItem(phrase, menu) {
  const words = tokens(phrase);
  if (words.length === 0) return null;
  const scored = menu
    .map((item) => {
      const own = [...new Set(itemWords(item))];
      const hits = words.filter((w) => own.some((o) => wordsMatch(w, o))).length;
      const covered = own.filter((o) => words.some((w) => wordsMatch(w, o))).length;
      const precision = hits / words.length;
      return { item, precision, score: precision * 2 + (own.length ? covered / own.length : 0) };
    })
    // Every word must fit ("lemon muffins" is not "Blueberry Muffins"); long phrases may have one extra.
    .filter((s) => s.precision === 1 || (words.length >= 3 && s.precision >= 2 / 3))
    .sort((x, y) => y.score - x.score);
  if (scored.length === 0) return null;
  const best = scored.filter((s) => s.score > scored[0].score - 1e-9);
  return best.length === 1 ? { item: best[0].item } : { options: best.map((s) => s.item) };
}

// ---- Customer & items -----------------------------------------------------

const NOT_A_NAME = /^(?:me|us|myself|now|later|pickup|pick up|delivery|it|that|this|them)$/i;
const PRONOUN = /^(?:i|we|she|he|they|you|the customer|customer|someone|somebody)$/i;

export const tidyName = (name) => {
  const clean = name.replace(/^[\s,.:;!?'"-]+|[\s,.:;!?'"-]+$/g, '').replace(/\s+/g, ' ');
  return clean === clean.toLowerCase() ? clean.replace(/(^|\s)(\p{L})/gu, (_, s, c) => s + c.toUpperCase()) : clean;
};

/** Pulls the customer out of "for Sarah" or "Sarah wants …". Returns `{ name, rest }`. */
export function extractCustomer(text, menu) {
  for (const m of text.matchAll(/\bfor\s+(.+?)(?=\s+(?:for|and|with|please)\b|\s*[,!?;]|\s*\.?\s*$)/gi)) {
    const candidate = tidyName(m[1].replace(/^the\s+/, ''));
    if (!candidate || NOT_A_NAME.test(candidate) || /\border\b/i.test(candidate)) continue;
    if (re(`^(?:${NUM})\\b`).test(candidate) || matchMenuItem(candidate, menu)) continue;
    return { name: candidate, rest: `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`.trim() };
  }
  const m = text.match(/^\s*(.+?)\s+(?:wants|ordered|needs|would like|is ordering|asked for)\b/i);
  if (m) {
    const candidate = tidyName(m[1]);
    if (candidate && !PRONOUN.test(candidate) && candidate.split(' ').length <= 4 && !/\d/.test(candidate)) {
      return { name: candidate, rest: text.slice(text.indexOf(m[1]) + m[1].length).trim() };
    }
  }
  return { name: null, rest: text };
}

const FILLER = [
  /\b(?:please|pls|thanks|thank you|okay|ok|hi|hello|hey)\b/gi,
  /\b(?:can|could|would|will) you\b/gi,
  /\b(?:i|we)(?:'d| would)? (?:need|want|like)(?: to)?\b/gi,
  /\b(?:add|create|place|put in|put|make|book|take|enter|get)\b/gi,
  /\b(?:(?:an?|another|the|new)\s+)?(?:new\s+)?orders?(?:\s+(?:of|for|with))?\b/gi,
  /\b(?:ordered|wants|needs|would like|is ordering|asked for)\b/gi,
  /\bto (?:the|my) (?:orders?|list)\b/gi,
  /\b(?:too|also|as well)\b/gi,
];

const QTY = re(
  `^(?:(half)\\s+(?:a\\s+)?dozen|(${NUM})\\s+dozen|(dozen)|(${NUM})\\s*(?:batch(?:es)?|trays?)|(\\d+)\\s*x\\b|(${NUM}))\\b\\s*(?:of\\s+)?`,
);

/**
 * Reads "4 muffins and 2 dozen cookies" into order lines.
 * Returns `{ items: [{ menuItem, quantity|null }], ambiguous: [{ quantity, options }], unknown: [phrase], number }`
 * where `number` is set when the whole message is just a quantity ("6", "a dozen").
 */
export function extractItems(text, menu) {
  let clean = text.replace(/[:!?"()]/g, ' ').replace(/\.(?!\d)/g, ' ');
  for (const filler of FILLER) clean = clean.replace(filler, ' ');
  const result = { items: [], ambiguous: [], unknown: [], number: null };

  const chunks = clean.split(/\s*(?:,|;|&|\+|\band\b|\bplus\b)\s*/i).map((c) => c.trim()).filter(Boolean);
  for (const raw of chunks) {
    const chunk = raw.replace(/^of\s+/i, '');
    const q = chunk.match(QTY);
    let quantity = null;
    let batches = 1;
    if (q) {
      if (q[1]) quantity = 6;
      else if (q[2]) quantity = toNumber(q[2]) * 12;
      else if (q[3]) quantity = 12;
      else if (q[4]) [quantity, batches] = [1, toNumber(q[4])];
      else quantity = toNumber(q[5] ?? q[6]);
    }
    const phrase = q ? chunk.slice(q[0].length).trim() : chunk;
    if (!phrase) {
      if (quantity != null && chunks.length === 1) result.number = quantity * batches;
      continue;
    }
    const match = matchMenuItem(phrase, menu);
    const line = { quantity: quantity == null ? null : quantity * batches, batched: Boolean(q?.[4]) };
    if (match?.item) result.items.push({ menuItem: match.item, quantity: piecesFor(match.item, line) });
    else if (match?.options) result.ambiguous.push({ ...line, options: match.options });
    else if (tokens(phrase).length > 0) result.unknown.push({ phrase, quantity: line.quantity });
  }
  return result;
}

/** "2 batches" of a 12-piece recipe is 24 pieces; orders are counted in pieces. */
export const piecesFor = (item, { quantity, batched }) =>
  quantity == null ? null : quantity * (batched ? item.batchSize || 1 : 1);

/** Everything an order message can contain, read in one pass. */
export function parseOrderMessage(text, menu, now = new Date()) {
  const { day, time, rest: afterWhen } = extractWhen(text, now);
  const { name, rest } = extractCustomer(afterWhen, menu);
  return { day, time, customerName: name, rest, ...extractItems(rest, menu) };
}
