# Restaurant POS System

## Architecture
- **POS** (`pos/`) — Electron Windows app, works offline, SQLite local DB
- **Back Office** (`backoffice/`) — Firebase web app (Hosting + Firestore + Auth)

---

## Setup

### 1. Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project
3. Enable **Firestore Database** (start in test mode)
4. Enable **Authentication** → Email/Password
5. Enable **Hosting**

### 2. Get Firebase Config
- Firebase Console → Project Settings → Your Apps → Add Web App
- Copy the config object

### 3. Back Office Setup
```bash
cd backoffice

# Paste your Firebase config into index.html (FIREBASE_CONFIG at top of script)
# Update .firebaserc with your project ID

npm install -g firebase-tools
firebase login
firebase deploy
```

### 4. POS Setup
Requirements: Node.js 18+, Python, Visual C++ Build Tools (for native modules)

```bash
cd pos
npm install       # also runs electron-rebuild automatically
npm start         # launch POS
```

To build installer:
```bash
npm run build     # creates installer in pos/dist/
```

---

## First Run

### Back Office
1. Open deployed URL
2. Click "Create Account" to register admin
3. Go to **Menu** → add categories and items
4. Go to **Settings** → configure restaurant name, tax rate, currency

### POS
1. Launch app
2. Go to **Settings** → paste Firebase config → Save & Connect
3. Wait for menu to sync from Firebase (requires internet first time)
4. Enter cashier name + opening cash → Start Shift

---

## Features

### POS (Windows, Offline)
- **4 order types**: Dine-in (table), Takeaway, Delivery, Online
- **Table management** — 12 tables by default
- **Cart** with qty controls, item notes, discounts (% or fixed)
- **Payment** — Cash (with numpad + change calc), Card, Online
- **Receipt printing** — sends to any Windows printer
- **Expenses** — track daily expenses by category
- **Shift Close** — cash count, shift summary
- **Day Close** — Z-report, daily totals locked
- **Firebase sync** — auto-syncs every 30s when online

### Back Office (Cloud)
- **Dashboard** — daily KPIs, orders by type, payment breakdown
- **Menu Management** — categories (with color + sort) + items (toggle available)
- **Orders** — full history with filters by type and date
- **Reports** — date-range sales report, expense report, CSV export
- **Staff** — cashier management
- **Online Orders** — send test online orders to POS

---

## Firestore Collections
| Collection | Description |
|---|---|
| `menu_categories` | Menu categories (synced to POS) |
| `menu_items` | Menu items (synced to POS) |
| `orders` | All billed orders |
| `expenses` | All expenses |
| `shifts` | Shift open/close records |
| `day_closings` | Daily Z-reports |
| `cashiers` | Staff records |
| `online_orders` | Incoming online orders |
| `settings` | Restaurant settings |
