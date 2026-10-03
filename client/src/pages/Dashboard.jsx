import { useCallback, useEffect, useState } from 'react';
import { api, fmtDateTime, fmtMoney, fmtQty } from '../api.js';
import CartRuns from './CartRuns.jsx';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning, my love';
  if (h < 18) return 'Good afternoon, sweetheart';
  return 'Good evening, darling';
}

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

  async function fillCartsNow() {
    try {
      setError('');
      await api.fillCartsNow();
      // The agent works in the background; check back for its progress.
      setTimeout(load, 3000);
    } catch (err) {
      setError(err.message);
    }
  }

  // Reload while a cart is being filled, so its result shows up on its own.
  const filling = data?.cartRuns.some((r) => r.status === 'RUNNING');
  useEffect(() => {
    if (!filling) return undefined;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [filling, load]);

  if (error && !data) return <p className="alert error">{error}</p>;
  if (!data) return <p className="empty">Planning your week with love…</p>;

  const { schedule, needs, purchases, conflicts, cartRuns, supplierMode } = data;

  return (
    <>
      <section className="love-note">
        <h1>{greeting()} 💕</h1>
        <p>I've planned everything for your baking this week, so you can just enjoy it. I'll find the best prices and have every ingredient arrive fresh, right when you need it.</p>
      </section>
      <div className="row between">
        <span />
        <div className="row">
          <button className="secondary" onClick={load}>Refresh</button>
          {supplierMode === 'browser' && (
            <button className="secondary" onClick={fillCartsNow} disabled={filling}>{filling ? 'Filling carts…' : 'Fill carts now'}</button>
          )}
          <button onClick={refreshPrices} disabled={busy}>{busy ? 'Finding the best prices for you…' : 'Update prices ♡'}</button>
        </div>
      </div>
      {error && <p className="alert error">{error}</p>}

      {conflicts.length > 0 && (
        <section className="alert warn">
          <strong>A few things need your attention, love</strong>
          <ul>{conflicts.map((c, i) => <li key={i}>{c.message}</li>)}</ul>
        </section>
      )}

      {supplierMode === 'browser' && <CartRuns runs={cartRuns} onChange={load} onError={setError} />}

      <section>
        <h2>What we're baking</h2>
        <p className="section-note">When to start each order so it's ready on time.</p>
        {schedule.length === 0 ? (
          <p className="empty">No orders coming up. Put your feet up, you deserve it.</p>
        ) : (
          <div className="table-wrap">
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
          </div>
        )}
      </section>

      <section>
        <h2>Ingredients I'm getting for you</h2>
        <p className="section-note">Everything you'll need, and the store with the best price.</p>
        {needs.length === 0 ? (
          <p className="empty">Nothing to buy yet. I'll take care of it when orders come in.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ingredient</th><th>Total needed</th><th>Cheapest store</th><th>Price</th><th>Check price</th><th>Source</th></tr></thead>
              <tbody>
                {needs.map((n) => (
                  <tr key={n.ingredientId}>
                    <td>{n.name}</td>
                    <td>{fmtQty(n.totalQuantity, n.unit)}</td>
                    <td>{n.cheapest?.supplier ?? '—'}</td>
                    <td>{n.cheapest ? `${fmtMoney(n.cheapest.pricePerUnit * (n.unit === 'each' ? 1 : 1000))} / ${n.unit === 'each' ? 'each' : n.unit === 'g' ? 'kg' : 'L'}` : '—'}</td>
                    <td>
                      {n.cheapest?.url ? (
                        <a className="listing" href={n.cheapest.url} target="_blank" rel="noopener noreferrer" title={n.cheapest.url}>
                          {n.cheapest.packageInfo ?? 'View listing'} ↗
                        </a>
                      ) : (
                        <span className="muted">{n.cheapest?.packageInfo ?? '—'}</span>
                      )}
                    </td>
                    <td><span className={`tag ${n.cheapest?.source}`}>{n.cheapest?.source === 'web_search' ? 'Web search' : 'Sample'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2>When I'll do the shopping</h2>
        <p className="section-note">I order as late as I can so everything arrives fresh.</p>
        {purchases.length === 0 ? (
          <p className="empty">No shopping planned right now.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Order at</th><th>Ingredient</th><th>Qty</th><th>Supplier</th><th>Cost</th><th>Arrives by</th><th>Status</th></tr></thead>
              <tbody>
                {purchases.map((p) => (
                  <tr key={p.id}>
                    <td>{fmtDateTime(p.orderAt)}</td>
                    <td>{p.ingredient.name}</td>
                    <td>
                      {fmtQty(p.quantity, p.ingredient.unit)}
                      {p.packages ? <span className="muted"> · {p.packages} pkg</span> : null}
                    </td>
                    <td>{p.supplier.name}</td>
                    <td>{fmtMoney(p.totalCost)}</td>
                    <td>{fmtDateTime(p.arriveBy)}</td>
                    <td><span className={`tag ${p.status}`}>{p.status.toLowerCase().replace('_', ' ')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
