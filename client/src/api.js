async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export const api = {
  menu: () => request('/menu'),
  addMenuItem: (body) => request('/menu', { method: 'POST', body }),
  deleteMenuItem: (id) => request(`/menu/${id}`, { method: 'DELETE' }),
  orders: () => request('/orders'),
  addOrder: (body) => request('/orders', { method: 'POST', body }),
  cancelOrder: (id) => request(`/orders/${id}`, { method: 'DELETE' }),
  dashboard: () => request('/dashboard'),
  refreshPrices: () => request('/prices/refresh', { method: 'POST' }),
};

export const fmtDateTime = (value) =>
  new Date(value).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export const fmtMoney = (value, currency = 'USD') =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);

export const fmtQty = (value, unit) => `${Math.round(value * 100) / 100} ${unit}`;
