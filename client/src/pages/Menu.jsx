import { useEffect, useState } from 'react';
import { api, fmtQty } from '../api.js';

const blankRow = () => ({ name: '', quantity: '', unit: 'g' });
const blankForm = () => ({ name: '', instructions: '', prepMinutes: '', bakeMinutes: '', ingredients: [blankRow()] });

export default function Menu() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');

  const load = () => api.menu().then(setItems).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const setRow = (i, patch) =>
    setForm((f) => ({ ...f, ingredients: f.ingredients.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.addMenuItem({
        name: form.name,
        instructions: form.instructions,
        prepMinutes: Number(form.prepMinutes),
        bakeMinutes: Number(form.bakeMinutes),
        ingredients: form.ingredients.map((r) => ({
          name: r.name,
          unit: r.unit,
          quantity: Number(r.quantity),
        })),
      });
      setForm(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    setError('');
    try {
      await api.deleteMenuItem(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="row between">
        <h1>Menu</h1>
        {!form && <button onClick={() => setForm(blankForm())}>Add Item</button>}
      </div>
      {error && <p className="alert error">{error}</p>}

      {form && (
        <form className="card" onSubmit={submit}>
          <h2>New menu item</h2>
          <label>Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <div className="row">
            <label>Prep time (min)<input type="number" min="0" required value={form.prepMinutes} onChange={(e) => setForm({ ...form, prepMinutes: e.target.value })} /></label>
            <label>Bake time (min)<input type="number" min="0" required value={form.bakeMinutes} onChange={(e) => setForm({ ...form, bakeMinutes: e.target.value })} /></label>
          </div>
          <label>Instructions<textarea rows="3" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></label>

          <h3>Ingredients (per batch/unit)</h3>
          {form.ingredients.map((r, i) => (
            <div className="row ingredient-row" key={i}>
              <input placeholder="Ingredient" required value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} />
              <input placeholder="Qty" type="number" min="0" step="any" required value={r.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })} />
              <select value={r.unit} onChange={(e) => setRow(i, { unit: e.target.value })}>
                <option value="g">g</option><option value="ml">ml</option><option value="each">each</option>
              </select>
              {form.ingredients.length > 1 && (
                <button type="button" className="secondary" onClick={() => setForm({ ...form, ingredients: form.ingredients.filter((_, j) => j !== i) })}>✕</button>
              )}
            </div>
          ))}
          <p className="muted">Shelf life and price category are looked up automatically the first time an ingredient is added.</p>
          <div className="row">
            <button type="button" className="secondary" onClick={() => setForm({ ...form, ingredients: [...form.ingredients, blankRow()] })}>+ Ingredient</button>
            <span className="spacer" />
            <button type="button" className="secondary" onClick={() => setForm(null)}>Cancel</button>
            <button type="submit">Save item</button>
          </div>
        </form>
      )}

      {items.length === 0 && !form && <p className="muted">No menu items yet. Add your first one.</p>}
      <div className="grid">
        {items.map((item) => (
          <article className="card" key={item.id}>
            <div className="row between">
              <h2>{item.name}</h2>
              <button className="secondary" onClick={() => remove(item.id)}>Delete</button>
            </div>
            <p className="muted">Prep {item.prepMinutes} min · Bake {item.bakeMinutes} min</p>
            <ul>
              {item.ingredients.map((ri) => (
                <li key={ri.id}>{fmtQty(ri.quantity, ri.ingredient.unit)} {ri.ingredient.name}</li>
              ))}
            </ul>
            {item.instructions && <p>{item.instructions}</p>}
          </article>
        ))}
      </div>
    </>
  );
}
