# 🥐 Daniel

**Bake more, source less.** Daniel turns your bakery's orders into perfectly timed, lowest-cost ingredient deliveries, so everything arrives fresh and on time.

![Hackathon](https://img.shields.io/badge/Hackathon-Socratica%3A%20Making%20Dough-orange)
![React](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB?logo=react&logoColor=white)
![Node.js](https://img.shields.io/badge/Backend-Node.js%20%2B%20Express-339933?logo=node.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Open Prices](https://img.shields.io/badge/Price%20Data-Open%20Prices-green)
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
| 💲 **Price Comparison** | Pulls real grocery prices from the Open Prices API and finds the cheapest store for each ingredient. |
| 🤖 **Automated Purchasing** | Places ingredient orders with the cheapest supplier(s) for delivery to the bakery (simulated in this version). |
| ⏱️ **Smart Order Timing** | Balances shelf life, delivery lead time, and prep/bake time to pick the right moment to order. |

---

## ⚙️ How It Works

1. **Set up the menu.** The bakery enters menu items with ingredients, per-batch quantities, instructions, and prep/bake times.
2. **Receive orders.** A customer or staff member places an order with items, quantities, and a delivery deadline.
3. **Aggregate ingredients.** Daniel scales each recipe by order quantity and sums ingredient needs across all upcoming orders.
4. **Compare prices.** For each ingredient, Daniel looks up real prices from nearby stores using the Open Prices API.
5. **Time the order.** The timing algorithm calculates the best window to place each ingredient order.
6. **Place the order.** At the scheduled time, Daniel orders from the cheapest supplier(s).
7. **Deliver to bakery.** Ingredients arrive fresh, with enough time to prep and bake before the customer deadline.

```mermaid
flowchart LR
    A[🧾 Menu Setup<br/>ingredients, quantities,<br/>prep & bake time] --> B[🛒 Order Placed<br/>items, quantity,<br/>delivery deadline]
    B --> C[⚖️ Ingredient Aggregation<br/>scale recipes,<br/>sum across orders]
    C --> D[💲 Price Comparison<br/>real prices from<br/>Open Prices]
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
5. **Pick a time in the window.** Daniel orders as late as possible for maximum freshness, minus a safety buffer in case a delivery runs late.

### Formula

```text
bake_start          = delivery_deadline − (prep_time + bake_time)
latest_order_time   = bake_start − supplier_lead_time
earliest_order_time = (bake_start − shelf_life) − supplier_lead_time

order_time = max(earliest_order_time, latest_order_time − safety_buffer)

valid if: earliest_order_time ≤ latest_order_time
```

## 🧰 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React + Vite |
| **Backend** | Node.js + Express |
| **Scheduler** | node-cron (runs inside the backend) |
| **Database** | PostgreSQL with Prisma ORM |
| **Price Data** | Open Prices API (Open Food Facts), with simulated ordering and delivery |
| **Hosting** | Vercel (frontend), Render (backend + database) |

---

## 🏗️ Architecture

Daniel is made up of these main components:

- **Web Client** (React + Vite): UI for managing menus, placing orders, and viewing the production schedule and sourcing dashboard.
- **API Server** (Node.js + Express): Handles menu, order, and ingredient logic; exposes REST endpoints consumed by the client.
- **Database** (PostgreSQL + Prisma): Stores menu items, recipes, ingredients, orders, suppliers, cached prices, and scheduled purchases.
- **Pricing Service:** Pulls real prices and store locations from the Open Prices API and caches them in the database.
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
     [Open Prices API]          [SupplierAdapter]
     real prices + stores        simulated ordering
                                 & delivery lead times
```

The client talks to the server over REST. The Pricing Service pulls real prices and store locations from the Open Prices API and caches them in the database. The scheduler runs inside the server process and reads scheduled purchases from the database. Ordering goes through the `SupplierAdapter` interface, so a real grocer integration can plug in without changing the rest of the app.

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- npm
- PostgreSQL 15+

No API keys are needed. Open Prices is free to read from.

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

# Price data (Open Prices requires no API key for reading)
OPEN_PRICES_BASE_URL=https://prices.openfoodfacts.org/api

# Ordering mode: "mock" simulates purchases and delivery
SUPPLIER_MODE=mock

# Timing
ORDER_SAFETY_BUFFER_HOURS=2
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

---

## 🔌 API Integrations

### Open Prices (Open Food Facts)

[Open Prices](https://prices.openfoodfacts.org) is an open, crowdsourced database of real grocery prices from stores around the world. No API key is required for reading data. API docs: https://prices.openfoodfacts.org/api/docs

| Data | Source | How Daniel uses it |
|---|---|---|
| Prices | ✅ Open Prices | Finds the cheapest store for each ingredient |
| Store locations | ✅ Open Prices (via OpenStreetMap) | Lists real nearby stores as suppliers |
| Price history | ✅ Open Prices | Uses the most recent reported price per store |
| Availability | ⚙️ Simulated | Assumes in stock unless flagged in mock data |
| Delivery lead times | ⚙️ Simulated | Feeds the timing algorithm |
| Ordering | ⚙️ Simulated | Purchases are recorded in our database |

### Why ordering is simulated
Grocers don't offer public APIs for placing orders, so Daniel uses real price data with a simulated ordering layer. All ordering goes through our `SupplierAdapter` interface, so a real grocer integration can be added without changing the rest of the app.

### Limitations
- Open Prices is crowdsourced, so coverage varies by region and product. Where an ingredient has no recent price data, Daniel falls back to sample prices.
- Prices reflect what shoppers reported, which may not match a store's current shelf price.

### Attribution
Price data from [Open Prices](https://prices.openfoodfacts.org) by Open Food Facts, available under the [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/).

---


## 📄 License

This project is licensed under the MIT License.
