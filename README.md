# LO10 — Database Locking Techniques

A React-based slide deck with an **interactive transaction demo** and a **synced presenter notes** panel, covering:

1. Database Transactions (ACID)
2. Different Data Types
3. Processing Large Datasets
4. Locking in Database Transactions

The deck is 10 slides matching the LO10 design (navy / amber / teal theme), and the **demo** lets you step two transactions (T1 / T2) through every locking technique — Shared, Exclusive, Update, Intent, Optimistic, Pessimistic, and a full Deadlock scenario.

## How to run

You have two options. Both render the exact same project — they only differ in the build pipeline.

### Option A — Zero-install (recommended for the demo today)

The page uses React + Babel via CDN, so no `npm install` is needed. But because it loads `.jsx` files via `fetch`, opening the HTML directly with `file://` will be blocked by Chrome — you need a tiny local HTTP server. A pure-PowerShell one is included:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

That serves the folder at <http://localhost:8080/> and opens it in your browser.

(If port 8080 is busy: `... .\serve.ps1 -Port 8090`)

### Option B — Vite (when Node.js is installed)

```powershell
npm install
npm run dev
```

Vite serves at <http://localhost:5173/>. Use this if you want HMR while editing slides.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `→` `Space` `PgDn` | Next slide |
| `←` `PgUp` | Previous slide |
| `Home` / `End` | First / last slide |
| `N` | Toggle presenter notes panel |
| `S` | Toggle "Sync notes with current slide" |
| `D` | Open the live transaction demo |
| `P` | Open a separate presenter window (mirrors current slide) |
| `F` | Toggle fullscreen |
| `Esc` | Close demo overlay |

## Presenter notes — the sync option

The notes panel lives on the right side of the deck. By default it follows the current slide. Use the **"Sync with current slide"** checkbox at the bottom of the panel to:

- **ON (default)** — notes always show whatever slide is on screen.
- **OFF** — notes pause; you can browse ahead with `◀ ▶` to peek at upcoming notes without changing what the audience sees. Click **Re-sync** to snap back.

Press `P` (or click **Presenter view**) to pop the notes into a separate window — useful when projecting. The window auto-syncs via `localStorage`.

## Project layout

```
.
├── index.html          # Entry, loads React + Babel via CDN
├── styles.css          # All slide + demo styles
├── src/
│   ├── notes.js        # Presenter notes per slide
│   ├── slides.jsx      # The 10 slide components
│   ├── demos.jsx       # The interactive transaction sandbox
│   └── app.jsx         # App shell, navigation, sync logic
├── serve.ps1           # PowerShell HTTP server (no Node needed)
├── package.json        # For the optional Vite path
└── vite.config.js      # For the optional Vite path
```

## Editing the deck

- **Slide content** — edit `src/slides.jsx`. Each slide is a small React component.
- **Speaker notes** — edit the strings in `src/notes.js`; the array order matches the slide order.
- **Demo scenarios** — `src/demos.jsx` defines one scripted scenario per locking technique. Each step is a state-transition function, so you can extend or rewrite a scenario without touching the rest of the demo.
