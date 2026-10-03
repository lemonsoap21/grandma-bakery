import { useState } from 'react';
import { api, fmtDateTime, fmtMoney } from '../api.js';

// The cart agent's work: carts it is filling, carts ready for the baker to check out,
// failed runs, and the orders the baker has confirmed.
export default function CartRuns({ runs, onChange, onError }) {
  const active = runs.filter((r) => ['RUNNING', 'READY', 'FAILED'].includes(r.status));
  const ordered = runs.filter((r) => r.status === 'ORDERED');

  return (
    <>
      <section>
        <h2>Carts ready for checkout</h2>
        {active.length === 0 ? (
          <p className="muted">No carts waiting. The agent fills a store's cart when its order time comes.</p>
        ) : (
          <div className="grid">
            {active.map((run) => <CartCard key={run.id} run={run} onChange={onChange} onError={onError} />)}
          </div>
        )}
      </section>

      {ordered.length > 0 && (
        <section>
          <h2>Orders placed</h2>
          <table>
            <thead><tr><th>Ordered</th><th>Store</th><th>Items</th><th>Total</th><th>Confirmation #</th><th>Arrives by</th></tr></thead>
            <tbody>
              {ordered.map((run) => (
                <tr key={run.id}>
                  <td>{fmtDateTime(run.orderedAt)}</td>
                  <td>{run.supplier.name}</td>
                  <td>{run.purchases.map((p) => p.ingredient.name).join(', ')}</td>
                  <td>{run.cartTotal ? fmtMoney(run.cartTotal) : '—'}</td>
                  <td>{run.confirmationId ?? '—'}</td>
                  <td>{fmtDateTime(arriveBy(run))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

function CartCard({ run, onChange, onError }) {
  const [confirmation, setConfirmation] = useState('');
  const [total, setTotal] = useState('');
  const [busy, setBusy] = useState(false);

  async function act(fn) {
    setBusy(true);
    try {
      await fn();
      await onChange();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const items = Array.isArray(run.items) && run.items.length > 0 ? run.items : null;
  return (
    <article className="card">
      <div className="row between">
        <h3>{run.supplier.name}</h3>
        <span className={`tag ${run.status}`}>{LABEL[run.status]}</span>
      </div>
      <p className="muted">
        Needs to arrive by {fmtDateTime(arriveBy(run))}
        {run.cartTotal ? ` · Cart subtotal ${fmtMoney(run.cartTotal)}` : ''}
      </p>
      {run.status === 'RUNNING' ? (
        <p>The agent is filling this cart in its browser window…</p>
      ) : (
        <p>{run.summary}</p>
      )}

      {items ? (
        <ul>
          {items.map((it, i) => (
            <li key={i} className={it.packages_in_cart < it.packages_requested ? 'warn-text' : ''}>
              {it.packages_in_cart} of {it.packages_requested} × {it.product}
              {it.price_each ? ` (${fmtMoney(it.price_each)} each)` : ''}
              {it.note ? ` — ${it.note}` : ''}
            </li>
          ))}
        </ul>
      ) : (
        <ul>
          {run.purchases.map((p) => (
            <li key={p.id}>{p.packages ?? '?'} × {p.packageInfo ?? p.ingredient.name}</li>
          ))}
        </ul>
      )}

      <div className="row">
        {run.cartUrl && <a href={run.cartUrl} target="_blank" rel="noopener noreferrer">Open cart ↗</a>}
        {run.screenshot && (
          <a href={`/api/agent-screenshots/${run.screenshot}`} target="_blank" rel="noopener noreferrer">Screenshot ↗</a>
        )}
      </div>

      {run.status === 'READY' && (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => api.markCartOrdered(run.id, { confirmationId: confirmation, total: Number(total) || undefined }));
          }}
        >
          <input placeholder="Confirmation # (optional)" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
          <input placeholder="Order total" type="number" min="0" step="0.01" value={total} onChange={(e) => setTotal(e.target.value)} />
          <button type="submit" disabled={busy}>I placed this order</button>
        </form>
      )}
      {['READY', 'FAILED'].includes(run.status) && (
        <div className="row">
          <button className="secondary" disabled={busy} onClick={() => act(() => api.retryCart(run.id))}>
            {run.status === 'READY' ? 'Discard & refill later' : 'Try again'}
          </button>
        </div>
      )}
    </article>
  );
}

const LABEL = { RUNNING: 'filling…', READY: 'ready to check out', FAILED: 'needs attention' };

const arriveBy = (run) => run.purchases.reduce((min, p) => (p.arriveBy < min ? p.arriveBy : min), run.purchases[0]?.arriveBy);
