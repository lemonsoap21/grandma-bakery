import { useEffect, useState } from 'react';
import { api, fmtDateTime } from '../api.js';
import { useDataChanged } from '../dataEvents.js';

const blankForm = () => ({ customerName: '', deliveryAt: '', items: [{ menuItemId: '', quantity: 1 }] });

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');

  const load = () => Promise.all([api.orders(), api.menu()]).then(([o, m]) => { setOrders(o); setMenu(m); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  useDataChanged(load);

  // Pieces the customer is ordering are counted in the menu item's own unit (e.g. cookies).
  const unitFor = (menuItemId) => {
    const m = menu.find((x) => x.id === Number(menuItemId));
    return m?.batchSize > 1 ? m.batchUnit : '';
  };
  const setItem = (i, patch) =>
    setForm((f) => ({ ...f, items: f.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.addOrder({
        customerName: form.customerName,
        deliveryAt: new Date(form.deliveryAt).toISOString(),
        items: form.items.map((it) => ({ menuItemId: Number(it.menuItemId), quantity: Number(it.quantity) })),
      });
      setForm(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function cancel(id) {
    setError('');
    try {
      await api.cancelOrder(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="row between">
        <h1>Orders</h1>
        {!form && <button onClick={() => setForm(blankForm())} disabled={menu.length === 0}>New Order</button>}
      </div>
      {menu.length === 0 && <p className="muted">Add menu items first so orders have something to reference.</p>}
      {error && <p className="alert error">{error}</p>}

      {form && (
        <form className="card" onSubmit={submit}>
          <h2>New order</h2>
          <div className="row">
            <label>Customer<input required value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></label>
            <label>Delivery date &amp; time<input type="datetime-local" required value={form.deliveryAt} onChange={(e) => setForm({ ...form, deliveryAt: e.target.value })} /></label>
          </div>
          <h3>Items</h3>
          {form.items.map((it, i) => (
            <div className="row" key={i}>
              <select required value={it.menuItemId} onChange={(e) => setItem(i, { menuItemId: e.target.value })}>
                <option value="">Select item…</option>
                {menu.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <input type="number" min="1" step="1" required value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} />
              {unitFor(it.menuItemId) && <span className="muted">{unitFor(it.menuItemId)}</span>}
              {form.items.length > 1 && (
                <button type="button" className="secondary" onClick={() => setForm({ ...form, items: form.items.filter((_, j) => j !== i) })}>✕</button>
              )}
            </div>
          ))}
          <div className="row">
            <button type="button" className="secondary" onClick={() => setForm({ ...form, items: [...form.items, { menuItemId: '', quantity: 1 }] })}>+ Item</button>
            <span className="spacer" />
            <button type="button" className="secondary" onClick={() => setForm(null)}>Cancel</button>
            <button type="submit">Place order</button>
          </div>
        </form>
      )}

      {orders.length === 0 && !form && <p className="muted">No orders yet.</p>}
      {orders.length > 0 && (
        <table>
          <thead><tr><th>Due</th><th>Customer</th><th>Items</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className={o.status === 'CANCELLED' ? 'dim' : ''}>
                <td>{fmtDateTime(o.deliveryAt)}</td>
                <td>{o.customerName}</td>
                <td>{o.items.map((it) => (it.menuItem.batchSize > 1 ? `${it.quantity} ${it.menuItem.batchUnit} · ${it.menuItem.name}` : `${it.quantity}× ${it.menuItem.name}`)).join(', ')}</td>
                <td><span className={`tag ${o.status}`}>{o.status.toLowerCase()}</span></td>
                <td>{o.status === 'OPEN' && <button className="secondary" onClick={() => cancel(o.id)}>Cancel</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
