import { useCallback, useEffect, useState } from 'react';
import { api, fmtDateTime, fmtMoney, fmtQty } from '../api.js';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      setData(await api.dashboard());
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function refreshPrices() {
    setBusy(true);
    try {
      await api.refreshPrices();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <p className="alert error">{error}</p>;
  if (!data) return <p className="muted">Planning your week…</p>;

  const { schedule, needs, purchases, conflicts } = data;

  return (
    <>
      <div className="row between">
        <h1>Dashboard</h1>
        <div className="row">
          <button className="secondary" onClick={load}>Refresh</button>
          <button onClick={refreshPrices} disabled={busy}>{busy ? 'Fetching prices…' : 'Update prices'}</button>
        </div>
      </div>
      {error && <p className="alert error">{error}</p>}

      {conflicts.length > 0 && (
        <section className="alert warn">
          <strong>⚠️ Timing conflicts</strong>
          <ul>{conflicts.map((c, i) => <li key={i}>{c.message}</li>)}</ul>
        </section>
      )}

      <section>
        <h2>Production schedule</h2>
        {schedule.length === 0 ? (
          <p className="muted">No upcoming orders.</p>
        ) : (
          <table>
            <thead><tr><th>Start baking</th><th>Item</th><th>Qty</th><th>Customer</th><th>Due</th></tr></thead>
            <tbody>
              {schedule.map((s, i) => (
                <tr key={i}>
                  <td>{fmtDateTime(s.bakeStart)}</td><td>{s.item}</td><td>{s.quantity}</td>
                  <td>{s.customerName}</td><td>{fmtDateTime(s.deliveryAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Ingredient needs &amp; cheapest store</h2>
        {needs.length === 0 ? (
          <p className="muted">Nothing to source yet.</p>
        ) : (
          <table>
            <thead><tr><th>Ingredient</th><th>Total needed</th><th>Cheapest store</th><th>Price</th><th>Source</th></tr></thead>
            <tbody>
              {needs.map((n) => (
                <tr key={n.ingredientId}>
                  <td>{n.name}</td>
                  <td>{fmtQty(n.totalQuantity, n.unit)}</td>
                  <td>{n.cheapest?.supplier ?? '—'}</td>
                  <td>{n.cheapest ? `${fmtMoney(n.cheapest.pricePerUnit * (n.unit === 'each' ? 1 : 1000))} / ${n.unit === 'each' ? 'each' : n.unit === 'g' ? 'kg' : 'L'}` : '—'}</td>
                  <td><span className={`tag ${n.cheapest?.source}`}>{n.cheapest?.source === 'open_prices' ? 'Open Prices' : 'Sample'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Purchase schedule</h2>
        {purchases.length === 0 ? (
          <p className="muted">No purchases scheduled.</p>
        ) : (
          <table>
            <thead><tr><th>Order at</th><th>Ingredient</th><th>Qty</th><th>Supplier</th><th>Cost</th><th>Arrives by</th><th>Status</th></tr></thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id}>
                  <td>{fmtDateTime(p.orderAt)}</td>
                  <td>{p.ingredient.name}</td>
                  <td>{fmtQty(p.quantity, p.ingredient.unit)}</td>
                  <td>{p.supplier.name}</td>
                  <td>{fmtMoney(p.totalCost)}</td>
                  <td>{fmtDateTime(p.arriveBy)}</td>
                  <td><span className={`tag ${p.status}`}>{p.status.toLowerCase()}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
