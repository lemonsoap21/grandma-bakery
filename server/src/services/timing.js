// Pure timing logic: works backwards from the customer deadline. No DB access here.
const HOUR = 3600e3;
const MINUTE = 60e3;

/** bake_start = delivery_deadline − (prep_time + bake_time) */
export function bakeStartFor(deadline, prepMinutes, bakeMinutes) {
  return new Date(deadline.getTime() - (prepMinutes + bakeMinutes) * MINUTE);
}

/**
 * Group uses of one ingredient into deliveries that all stay fresh: a delivery
 * arrives before its earliest bake start, so every use in it must start within
 * `shelfLifeHours` of that first one.
 */
export function groupUsesByFreshness(uses, shelfLifeHours) {
  const sorted = [...uses].sort((a, b) => a.bakeStart - b.bakeStart);
  const groups = [];
  let current = null;
  for (const use of sorted) {
    if (current && use.bakeStart - current[0].bakeStart <= shelfLifeHours * HOUR) {
      current.push(use);
    } else {
      current = [use];
      groups.push(current);
    }
  }
  return groups;
}

/**
 * latest_order_time   = bake_start − supplier_lead_time
 * earliest_order_time = (last_bake_start − shelf_life) − supplier_lead_time
 * order_time          = max(earliest, latest − safety_buffer)
 *
 * Returns { ok: true, orderAt, arriveBy } or { ok: false, reason, ... }.
 */
export function planOrderWindow({ group, leadTimeHours, shelfLifeHours, safetyBufferHours, now }) {
  const starts = group.map((u) => u.bakeStart.getTime());
  const firstBake = Math.min(...starts);
  const lastBake = Math.max(...starts);
  const lead = leadTimeHours * HOUR;

  const latest = firstBake - lead;
  const earliest = lastBake - shelfLifeHours * HOUR - lead;

  if (earliest > latest) {
    return { ok: false, reason: 'shelf_life', latestOrderAt: new Date(latest), earliestOrderAt: new Date(earliest) };
  }
  if (latest < now.getTime()) {
    return { ok: false, reason: 'too_late', latestOrderAt: new Date(latest), earliestOrderAt: new Date(earliest) };
  }

  // Order as late as is safe, but never in the past.
  const orderAt = Math.max(earliest, latest - safetyBufferHours * HOUR, now.getTime());
  return {
    ok: true,
    orderAt: new Date(orderAt),
    arriveBy: new Date(orderAt + lead),
    latestOrderAt: new Date(latest),
    earliestOrderAt: new Date(earliest),
  };
}
