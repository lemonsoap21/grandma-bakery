# 🥐 Daniel

**Bake more, source less.** Daniel turns your bakery's orders into perfectly timed, lowest-cost ingredient deliveries, so everything arrives fresh and on time.

![Hackathon](https://img.shields.io/badge/Hackathon-Socratica%3A%20Making%20Dough-orange)
![React](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB?logo=react&logoColor=white)
![Node.js](https://img.shields.io/badge/Backend-Node.js%20%2B%20Express-339933?logo=node.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Claude](https://img.shields.io/badge/Price%20Data-Claude%20web%20search-green)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

> Built by **Linda Lian**, **Peicheng Yue**, and **Emilee Zhang**.

---

## 📖 Overview

### The Problem
Small bakeries spend hours every week manually figuring out what ingredients they need, comparing prices across stores, and deciding when to buy. If they order too early, ingredients like dairy, eggs, and fresh fruit spoil. If they order too late, they can't bake in time for customer deadlines. Either way, they lose time and money.

### Our Solution
**Daniel** automates the entire sourcing pipeline. Bakeries enter their menu once, and as orders come in, Daniel:

- Calculates exactly how much of each ingredient is needed
- Compares real grocery prices across local stores
- Places orders with the cheapest supplier
- Times each purchase so ingredients arrive **fresh**, but **early enough** to prep and bake before every deadline

---

## ✨ Features

| Feature | What it does |
|---|---|
| 🧾 **Menu Input** | Add each menu item once with its full ingredient list (quantities per batch/unit), cooking and prep instructions, and prep/bake time. |
| 🛒 **Order Intake** | Customers or staff place orders specifying items, quantities, and delivery date/time. |
| 📅 **Order Tracking** | See every item due, how many, and when, as a clear production schedule. |
| ⚖️ **Ingredient Aggregation** | Scales each recipe by order size and totals ingredient needs across all upcoming orders. |
| 💲 **Price Comparison** | Looks up current Canadian grocery prices with Claude web search and finds the cheapest store for each ingredient. |
| 🛒 **Cart Agent** | When an order is due, a Claude-driven browser fills your real store cart with the exact products and package counts. You check out; it never pays. |
| ⏱️ **Smart Order Timing** | Balances shelf life, delivery lead time, and prep/bake time to pick the right moment to order. |

---

## ⚙️ How It Works

1. **Set up the menu.** The bakery enters menu items with ingredients, per-batch quantities, instructions, and prep/bake times.
2. **Receive orders.** A customer or staff member places an order with items, quantities, and a delivery deadline.
3. **Aggregate ingredients.** Daniel scales each recipe by order quantity and sums ingredient needs across all upcoming orders.
4. **Compare prices.** For each ingredient, Daniel looks up current prices at Canadian grocery stores using Claude web search.
5. **Time the order.** The timing algorithm calculates the best window to place each ingredient order.
6. **Place the order.** At the scheduled time, Daniel orders from the cheapest supplier(s).
7. **Deliver to bakery.** Ingredients arrive fresh, with enough time to prep and bake before the customer deadline.

```mermaid
flowchart LR
    A[🧾 Menu Setup<br/>ingredients, quantities,<br/>prep & bake time] --> B[🛒 Order Placed<br/>items, quantity,<br/>delivery deadline]
    B --> C[⚖️ Ingredient Aggregation<br/>scale recipes,<br/>sum across orders]
    C --> D[💲 Price Comparison<br/>current prices via<br/>Claude web search]
    D --> E[⏱️ Timing Algorithm<br/>shelf life, lead time,<br/>prep & bake time]
    E --> F[🤖 Automated Purchase<br/>cheapest supplier]
    F --> G[🚚 Delivered to Bakery]
    G --> H[🥐 Baked & Delivered<br/>to Customer]
```

---

## ⏱️ The Timing Algorithm

Daniel works **backwards from the customer's delivery deadline** to decide when each ingredient should be ordered.

1. **When must baking start?** Subtract the item's prep and bake time from the customer delivery deadline.
2. **When must ingredients arrive?** That baking start time is the latest acceptable ingredient arrival.
3. **When must we order?** Subtract the supplier's delivery lead time. This gives the **latest safe order time**.
4. **Will it stay fresh?** Ingredients shouldn't arrive so early that they spoil before use. Shelf life sets the **earliest sensible arrival time**, which gives an **earliest order time**.
5. **Pick a time in the window.** Daniel orders as late as possible for maximum freshness, but aims for the delivery to land at least a day (24h by default) before baking starts, in case a delivery runs late. If shelf life or the calendar doesn't allow a full day, it gets as close as it can.

### Formula


> **Shared ingredients:** When several orders need the same ingredient, Daniel combines them into one delivery as long as the ingredient will still be fresh for the last order that uses it. If it wouldn't be, Daniel splits the purchase into multiple deliveries.

---

## 🧰 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React + Vite |
| **Backend** | Node.js + Express |
| **Scheduler** | node-cron (runs inside the backend) |
| **Database** | PostgreSQL with Prisma ORM |
| **Price Data** | Claude API with web search, with simulated ordering and delivery |
| **Hosting** | Vercel (frontend), Render (backend + database) |

---

## 🏗️ Architecture

Daniel is made up of these main components:

- **Web Client** (React + Vite): UI for managing menus, placing orders, and viewing the production schedule and sourcing dashboard.
- **API Server** (Node.js + Express): Handles menu, order, and ingredient logic; exposes REST endpoints consumed by the client.
- **Database** (PostgreSQL + Prisma): Stores menu items, recipes, ingredients, orders, suppliers, cached prices, and scheduled purchases.
- **Pricing Service:** Looks up current grocery prices with Claude web search and caches them in the database for a week.
- **Scheduler** (node-cron): Checks for due purchases every few minutes and triggers them at their scheduled time.
- **Purchasing Service:** Places orders through the `SupplierAdapter` interface, which currently simulates purchases and delivery.

```text
[Web Client] ⇄ REST ⇄ [API Server] ⇄ [Database]
                          │
             ┌────────────┼────────────┐
             ▼            ▼            ▼
      [Pricing Svc]  [Scheduler]  [Purchasing Svc]
             │                         │
             ▼                         ▼
  [Claude web search]           [SupplierAdapter]
   current prices + stores       simulated ordering
                                 & delivery lead times
```

The client talks to the server over REST. The Pricing Service looks up current grocery prices with Claude web search and caches them in the database. The scheduler runs inside the server process and reads scheduled purchases from the database. Ordering goes through the `SupplierAdapter` interface, so a real grocer integration can plug in without changing the rest of the app.

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- npm
- PostgreSQL 15+

An [Anthropic API key](https://console.anthropic.com) is needed for live prices and shelf-life lookups. Without one, Daniel uses a 7-day shelf life and sample prices.

### Installation

```bash
# Clone the repo
git clone https://github.com/lemonsoap21/grandma-bakery.git
cd grandma-bakery

# Install dependencies for client and server
npm install
```

### Environment Variables

Copy the example file and fill in your own values:

```bash
cp .env.example .env
```

`.env.example`:

```env
# Server
PORT=4000

# Database
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/daniel

# Claude web search for ingredient shelf life and current grocery prices (optional; without it
# a 7-day shelf life is used and prices fall back to sample stores)
ANTHROPIC_API_KEY=

# Ordering mode: "mock" simulates purchases and delivery; "browser" has the cart agent fill
# your real store carts when orders come due (you check out). Sign in first: npm run agent:login
SUPPLIER_MODE=mock
# Set to true to hide the agent's browser window (stores block hidden browsers more often)
AGENT_HEADLESS=false

# Timing
ORDER_SAFETY_BUFFER_HOURS=24
SCHEDULER_CRON=*/5 * * * *

# Bakery delivery address
BAKERY_DELIVERY_ADDRESS=your_bakery_address_here
```

> ⚠️ Never commit your `.env` file.

### Run Locally

```bash
# Set up the database
npm run db:migrate
npm run db:seed      # optional: loads sample menu items, orders, and fallback prices

# Start the backend (API server + scheduler)
npm run dev:server

# In a second terminal, start the frontend
npm run dev:client
```

Then open http://localhost:5173 in your browser. The API runs at http://localhost:4000.

---

## 🧑‍🍳 Usage

### 1. Add a Menu Item
Go to the **Menu** page and click **Add Item**. Enter the item name, its ingredients with quantities per batch/unit, prep and cooking instructions, and prep/bake time.

![Add Menu Item](./screenshots/add-menu-item.png)

### 2. Place an Order
Go to the **Orders** page and click **New Order**. Select menu items, enter quantities, and set the delivery date and time.

![Place Order](./screenshots/place-order.png)

### 3. View the Dashboard
The **Dashboard** shows your production schedule, aggregated ingredient needs, the cheapest store for each ingredient, when each purchase is scheduled, and any timing conflicts.

![Dashboard](./screenshots/dashboard.png)

### 4. Let the cart agent fill your carts
With `SUPPLIER_MODE=browser`, Daniel fills your store carts for you when each order's time comes. You still place the order.

1. **Sign in once.** Run `npm run agent:login`. It opens the agent's browser on every store you have prices from. Sign in, and set your delivery address and a saved payment method on each store's site, then close the window. The agent reuses this browser profile (`server/.agent-browser`, never committed), so it never sees your passwords.
2. **Turn it on.** Set `SUPPLIER_MODE=browser` in `.env` and restart the server.
3. **Carts get filled.** When purchases come due, the scheduler groups them by store and the agent opens each product page, sets the number of packages and adds it to the cart, then checks the cart. To try it right away, click **Fill carts now** on the dashboard.
4. **You check out.** The dashboard's **Carts ready for checkout** shows what's in each cart, the subtotal, a screenshot and a link to the cart. Check out on the store's site, then click **I placed this order** with the confirmation number. It moves to **Orders placed**.

What the agent will and won't do:
- It only adds the exact linked products. If one is out of stock or different, it adds nothing in its place and says so.
- It never checks out, picks a delivery slot or enters payment. Checkout and payment buttons, checkout pages, card fields and other websites are blocked in code (`server/src/agent/guards.js`), not just by instructions to the model.
- If a store asks it to sign in or shows a captcha, it stops and the cart shows **needs attention**. Run `npm run agent:login` again, then **Try again**.

Each cart costs a little in Claude API usage (Claude Opus 5.5, typically well under a dollar). Big grocers actively block automated browsers, so expect occasional captchas, and automated shopping may go against a store's terms of use.

---

## 🔌 API Integrations

### Claude web search (Anthropic API)

Daniel asks Claude, with its web search tool, for current shelf prices of each ingredient at Canadian grocers (Walmart, Real Canadian Superstore, Costco and others), in CAD. Each store it finds becomes a supplier. Prices are cached for a week, and you can refresh them any time from the dashboard. The same lookup finds each new ingredient's raw shelf life.

| Data | Source | How Daniel uses it |
|---|---|---|
| Prices | ✅ Claude web search | Finds the cheapest store for each ingredient |
| Stores | ✅ Claude web search | Lists the stores it found prices at as suppliers |
| Shelf life | ✅ Claude web search | Sets how early an ingredient can arrive |
| Availability | ⚙️ Simulated | Assumes in stock unless flagged in mock data |
| Delivery lead times | ⚙️ Simulated | Feeds the timing algorithm |
| Ordering | 🛒 Cart agent (or ⚙️ simulated) | The agent fills your real cart and you check out; in `mock` mode purchases are simulated |

### Why the agent stops at the cart
Grocers don't offer public APIs for placing orders, so the cart agent drives a real browser instead (Playwright, with Claude Opus 5.5 choosing each click). Paying is left to you on purpose: you see the cart, delivery slot and total before any money moves.

### Limitations
- Prices come from store websites and flyers found by web search, so they are estimates, not live checkout prices, and can miss sales. Where nothing is found, Daniel falls back to sample prices.
- Each price lookup is a paid API call with a few web searches.

---


## 📄 License

This project is licensed under the MIT License.
