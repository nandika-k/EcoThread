# Sustainable Fashion Discovery Platform — Implementation Plan

> **Context:** Pinterest-style web app for discovering sustainable, secondhand, and vintage clothing. Y2K aesthetic: light silver-white base, blue and purple accents, pixel flourishes, monospace type, Windows 98-style OS chrome. Built at HackPrinceton Spring 2026.

---

## Stack

| Layer | Tool |
|---|---|
| Frontend | React + TypeScript + Tailwind |
| Backend / DB / Auth | Kizaki (preferred) or Supabase fallback |
| Scaffolding | Orchids (vibe-code UI + backend boilerplate) |
| Product search | Tavily API |
| Sustainability reasoning | IFM (K2 model) |
| Supply chain data | Dedalus Labs agent |
| Optional extras | Eragon, HeyGen, SonarQube |

---

## Sponsor Integration Map

| Sponsor | Role | Priority |
|---|---|---|
| Orchids | AI coding environment — scaffold UI + backend from prompts | Core |
| Tavily | Live product search across secondhand retailers | Core |
| IFM (K2) | Sustainability score generation + style matching | Core |
| Dedalus Labs | Agent that looks up real-time brand sustainability ratings | Core |
| Kizaki | Backend platform (auth, DB, deploy) — replaces Supabase if access confirmed | Core |
| Eragon | Natural-language feed controls ("show me 90s grunge under $40") | Optional |
| HeyGen | Eco-stylist avatar in product detail modal | Optional |
| SonarQube | Pre-submission code quality scan | Optional |

**Cut (no fit):** Knot, GoodLeap, Vallo, Vert, Regeron, Photon, dmodel, Foundr

---

## Database Schema

```sql
-- Extends auth.users
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE style_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id),
  style_tags TEXT[],   -- e.g. ['Y2K', 'Vintage', 'Streetwear']
  occasions TEXT[],    -- e.g. ['Prom', 'Everyday', 'Work']
  style_text TEXT,     -- free-form description
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE boards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  description TEXT,
  occasion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id),
  board_id UUID REFERENCES boards(id),
  product_id TEXT NOT NULL,
  product_data JSONB NOT NULL,
  sustainability_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cache to avoid re-fetching from Tavily
CREATE TABLE products (
  id TEXT PRIMARY KEY,          -- format: 'retailer:product_id'
  retailer TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price DECIMAL,
  currency TEXT,
  image_urls TEXT[],
  product_url TEXT,
  sustainability_score INTEGER,
  score_explanation TEXT,
  metadata JSONB,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pins_user ON pins(user_id);
CREATE INDEX idx_pins_board ON pins(board_id);
CREATE INDEX idx_boards_user ON boards(user_id);
CREATE INDEX idx_products_retailer ON products(retailer);
```

**RLS rules:**
- `profiles`, `style_preferences`, `boards`, `pins`: users read/write own rows only
- `products`: public read, service role write only

---

## Design Tokens

Add to `src/index.css`:

```css
:root {
  /* Base backgrounds — light silver-white, layered */
  --bg-0: #eef2fa;   /* page background */
  --bg-1: #f4f7fd;   /* surface (cards, panels) */
  --bg-2: #fafbff;   /* elevated surface (nav, modals) */
  --bg-3: #dce6f4;   /* subtle wash (card image area) */

  /* Borders */
  --border-dim:    #c8d4e8;   /* default subtle border */
  --border-mid:    #8aa4c8;   /* emphasized border, inputs */
  --border-bright: #4a6898;   /* strong border, focus rings */

  /* Accent — purple (primary CTA, active state, save button) */
  --purple:       #6040c0;
  --purple-light: #8060e0;
  --purple-pale:  #eeebff;   /* button fills, eco chip bg */

  /* Accent — blue (price text, secondary actions, border-left on boards) */
  --blue:       #2060c0;
  --blue-light: #4080e0;
  --blue-pale:  #e0ecff;

  /* Text */
  --text-dark:   #2a3a5a;   /* primary text */
  --text-silver: #8898b0;   /* secondary / muted text */
  --white:       #ffffff;   /* card bg, search bar bg */

  /* Semantic */
  --green:      #1a8040;
  --green-pale: #d8f0e4;
  --amber:      #906000;
  --amber-pale: #faecc0;
  --red:        #a02020;

  /* Typography */
  --font-mono: 'Share Tech Mono', monospace;

  /* Title bar gradient (Windows 98-style chrome) */
  --titlebar-gradient: linear-gradient(90deg, #3050a0, #5040b0);

  /* Pixel accent bar (purple → blue → border repeating) */
  --pixel-bar: repeating-linear-gradient(
    90deg,
    var(--purple) 0px, var(--purple) 4px,
    var(--blue)   4px, var(--blue)   8px,
    var(--border-dim) 8px, var(--border-dim) 10px
  );
}
```

Add to `tailwind.config.ts`: extend `colors` with the hex values above using the token names (`bg-0`, `purple`, `blue`, `text-dark`, etc.).

### Font

Import `Share Tech Mono` from Google Fonts — use for all UI text (nav, cards, buttons, status bars, labels). This is the core typographic element of the Y2K OS feel.

```html
<link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap" rel="stylesheet">
```

### Component spec

#### Title bar (all panels/modals)
- Background: `--titlebar-gradient`
- Text: `#e8e0ff`, 10–11px, monospace
- Pixel icon: 9×9px octagon shape, fill `#a090f0`
- Window buttons: `_` `□` `x` — 13×11px, border `rgba(255,255,255,.25)`, bg `rgba(255,255,255,.12)`, x button text color `#ffb0b0`

#### Pixel accent bar
- 2px tall, sits below the nav
- Use `--pixel-bar` background pattern

#### Navigation
- Background: `--bg-2`
- Border-bottom: 1px `--border-dim`
- Wordmark: purple diamonds `◆ ◆ ◆` as placeholder (no product name yet)
- Nav links: 10px monospace, `--text-silver` default, `--purple` + 1px purple underline when active
- Search bar (inline, flush right):
  - Background: `--white`
  - Border: 1px `--border-dim`, border-radius 1px
  - Input: 9px monospace, placeholder color `--border-mid`
  - Search button: transparent bg, border-left 1px `--border-dim`, pixel magnifying glass icon in `--border-mid`
  - Height: ~22px total — slim, matches nav line height

#### Filter chips (below pixel bar)
- Active chip: `--purple` text + border, `--purple-pale` background
- Inactive chip: `--text-silver` text, `--border-dim` border, `--white` background
- 8px monospace text, 1px 6px padding

#### Product card
- Background: `--white`, border: 1px `--border-dim`
- Image area: hatched diagonal pattern using `--bg-0` / `--bg-1`
- Corner brackets: 7×7px L-shaped, 2px solid — top-left `--purple`, top-right `--blue`, bottom-left `--blue`, bottom-right `--purple`
- Pixel flourishes: `◆` (diamond) and `✶` (4-point star) in `--purple-light` / `--blue-light` / `--border-mid` at varying sizes (6–11px)
- ECO badge: top-right, white bg, 1px border, 7px monospace — green for 70+, amber for 40–69, red for <40
- Card body: title 9px dark, subtitle 7px silver, price 9px `--blue`, save icon pixel grid

#### Save button (`SAVE_IT`)
- Background: `--purple-pale`, border: 1px `--purple`
- Text: `--purple`, 9px monospace, prefix `◆`
- Full width preferred in detail modal

#### Boards panel
- Board rows: white bg, border 1px `--border-mid`, left accent border 3px — purple for first board, blue for second, alternating
- "new_board.exe": dashed border `--border-mid`, `--blue` text, `--bg-1` background
- 2×2 cover mosaic: 15×15px tiles using `--bg-0` / `--bg-1` / `--bg-3`

#### Status bar
- Background: `--bg-0`, border-top: 1px `--border-dim`
- Text: 7px monospace `--text-silver`
- Blinking cursor: `▐` with CSS `animation: blink 1.2s step-end infinite`

#### Eco score detail block (product modal)
- Background: `--green-pale`, border: 1px `--green`
- Text: `--green`, 7–8px monospace
- Amber equivalent for mid scores, red for low

---

## File Structure

```
src/
  contexts/
    AuthContext.tsx
  pages/
    Auth.tsx
    ProfileSetup.tsx
    Feed.tsx
    Boards.tsx
    BoardDetail.tsx
    Profile.tsx
  components/
    Navigation.tsx
    ProtectedRoute.tsx
    ProductCard.tsx
    MasonryGrid.tsx
    PinButton.tsx
    BoardSelector.tsx
    CreateBoardModal.tsx
    BoardCard.tsx
    ProductDetailModal.tsx
    SearchBar.tsx
  hooks/
    useAuth.ts
    useProductFeed.ts
  lib/
    supabase.ts        (or kizaki.ts)
  types/
    product.ts
    board.ts
    profile.ts

supabase/
  migrations/
    001_initial_schema.sql
  functions/
    aggregate-products/index.ts
    get-recommendations/index.ts
    calculate-sustainability/index.ts
```

---

## Phase 1 — Scaffold (1 hr)

**Goal:** Working app shell with auth, routing, and empty pages.

### Prompt for Orchids
> "Build a React + TypeScript app with Supabase auth. Pages: /auth (login/signup), /profile-setup, /feed, /boards, /boards/:id, /profile. Light Y2K OS aesthetic: background #eef2fa, white cards, blue accent #2060c0, purple accent #6040c0. All UI text in Share Tech Mono monospace font. Protect all routes except /auth — redirect unauthenticated users to /auth."

### Manual steps after scaffolding
- Wire `ProtectedRoute` to check `style_preferences` — if empty, redirect to `/profile-setup`
- Add `AuthContext` with `useSession`, `signIn`, `signUp`, `signOut`
- Run `001_initial_schema.sql` migration

---

## Phase 2 — Design System (45 min)

**Goal:** Y2K tokens + reusable components locked in before building UI.

- Add CSS tokens from the Design Tokens section above to `src/index.css`
- Import `Share Tech Mono` from Google Fonts — apply globally
- Build `MasonryGrid` using CSS Grid `auto-flow: dense` — no library needed
- Build reusable `TitleBar` component (gradient bg, pixel icon, window buttons)
- Add `pixel-bar` div component (2px repeating purple/blue/border stripe)
- Add `save` button variant to `button.tsx` — purple-pale bg, purple border, monospace text
- Remove glassmorphism — not part of approved design. Use flat white cards with border instead.

---

## Phase 3 — Profile Setup (45 min)

**Goal:** Users can set style preferences before seeing the feed.

### `ProfileSetup.tsx`
- Step 1: Display name (optional), avatar upload (optional)
- Step 2: Multi-select style tags (`Y2K`, `Vintage 90s`, `Streetwear`, `Boho`, `Dark Academia`, `Cottagecore`, `Minimalist`) + occasions (`Prom`, `Wedding`, `Everyday`, `Work`, `Date Night`)
- On submit: insert into `style_preferences`, redirect to `/feed`

---

## Phase 4 — Product Aggregation (2 hrs)

**Goal:** Real product data flowing into the feed. Start with mocks, replace with Tavily.

### Step 1 — Mock data first
Hardcode 20–30 products in `src/lib/mockProducts.ts` with realistic titles, images, prices, retailer names, and placeholder sustainability scores. Get the feed UI working before touching any API.

### Step 2 — Edge function: `aggregate-products`

```typescript
// Input
type AggregateInput = {
  query: string;          // e.g. "Y2K mini skirt"
  retailers?: string[];   // default: all
  page?: number;
}

// Process
// 1. Construct search URL per retailer
// 2. Call Tavily in parallel for each retailer
// 3. Parse and normalize results into ProductSchema
// 4. Upsert into products table (skip if last_updated < 1hr)
// 5. Return normalized array

// Retailers to query via Tavily:
// Depop, Vinted, eBay (secondhand), ThredUp, Vestiaire Collective, Whatnot
```

**Important:** Cache aggressively. Tavily has rate limits and hackathon wifi is unreliable.

### Product schema (TypeScript)

```typescript
type Product = {
  id: string;              // 'retailer:external_id'
  retailer: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  image_urls: string[];
  product_url: string;
  sustainability_score: number | null;
  score_explanation: string | null;
}
```

---

## Phase 5 — Sustainability Scoring (2 hrs)

**Goal:** Each product gets a 0–100 score with a one-line explanation.

### Edge function: `calculate-sustainability`

```typescript
// Step 1 — Dedalus agent: real-time brand audit
// Use Dedalus with a Google Search tool to look up the brand on Good On You
// or similar sustainability rating databases.
// Output: { brand_rating, certifications[], notes }

// Step 2 — IFM (K2): reason over the data and generate score
// Prompt IFM with:
//   - product.description
//   - product.retailer (secondhand = baseline carbon reduction)
//   - dedalus.brand_rating
//   - dedalus.certifications
// Ask IFM to output:
//   - score: 0-100
//   - explanation: one sentence, plain English
//   - comparison: "saves ~X kg CO₂ vs buying new"

// Step 3 — Store result
// UPDATE products SET sustainability_score = ..., score_explanation = ... WHERE id = ...
```

**Score color coding in UI:** 70–100 = green, 40–69 = yellow, 0–39 = red.

---

## Phase 6 — Feed UI (2 hrs)

**Goal:** Pinterest-style masonry feed with working cards.

### `useProductFeed.ts`
```typescript
// React Query infinite query
// Calls get-recommendations edge function
// get-recommendations: fetches user style_preferences, passes to aggregate-products
// Returns paginated ProductCard[]
```

### `ProductCard.tsx`
- White card, 1px `--border-dim` border
- Image area: hatched diagonal CSS background pattern (`--bg-0` / `--bg-1`)
- Corner brackets: 7×7px L-shapes in purple (TL, BR) and blue (TR, BL), 2px solid
- Pixel flourishes: `◆` and `✶` characters scattered on image, sized 6–11px, in `--purple-light` / `--blue-light` / `--border-mid`
- ECO badge: absolute top-right, white bg, 1px colored border, 7px monospace — green ≥70, amber 40–69, red <40
- Card body: title 9px `--text-dark`, subtitle 7px `--text-silver`, price 9px `--blue`
- Save icon: pixel 3×3 grid SVG in `--blue` / `--border-dim`
- No hover glassmorphism — keep flat, add a 1px `--border-mid` border on hover instead

### `ProductDetailModal.tsx`
- Same image area style as card, with all 4 corner brackets
- Full sustainability breakdown: `ECO_SCORE: XX / 100 ◆` in green monospace on `--green-pale` background
- CO₂ savings line + sourcing notes below in smaller muted green
- `◆ SAVE_IT` button: `--purple-pale` bg, `--purple` border + text, full width
- `OPEN` button: `--border-dim` border, `--text-silver` text, beside save button
- Optional (HeyGen): avatar embed below score block

---

## Phase 7 — Pinning + Boards (1.5 hrs)

**Goal:** Users can save items to boards.

### Save flow
1. User clicks save icon on `ProductCard`
2. `BoardSelector` modal opens — shows existing boards + "Create new board" option
3. On select: insert into `pins`, cache product in `products` if not already there
4. Optimistic UI update + toast notification

### `Boards.tsx`
- Grid of `BoardCard` components
- Each `BoardCard`: name, occasion tag, saved count, 2×2 cover mosaic (15×15px tiles)
- Board rows: white bg, left accent border 3px — alternate purple / blue per board

### `BoardDetail.tsx`
- Path label at top: `C:\users\boards\board-name\_` with blinking cursor
- Masonry grid using same `ProductCard` component
- Edit board button (name, description, occasion)
- Remove saved item (with confirmation)

---

## Phase 8 — Search + Navigation (1 hr)

**Goal:** Users can filter and search the feed.

### `Navigation.tsx`
- `TitleBar` component at top: gradient purple-blue, `.exe` filename, window buttons
- 2px pixel-bar stripe below title bar
- Nav row: white bg, `--border-dim` bottom border
- Wordmark: `◆ ◆ ◆` in `--purple` (no product name yet)
- Links: Feed, Boards, Profile — monospace, silver default, purple + underline when active
- Search bar flush right (see spec below)

### `SearchBar.tsx`
- Container: `--white` background, 1px `--border-dim` border, border-radius 1px, ~22px height
- Input: 9px monospace, `--text-dark`, placeholder `--border-mid`, no outline
- Search button: transparent bg, 1px `--border-dim` left border, pixel magnifying glass SVG (circle + line) in `--border-mid`
- No bold borders, no colored background — integrates flush with the nav
- Debounced 300ms, wires to Tavily aggregate function
- Filter chips row below pixel-bar: active = purple, inactive = silver/white

### Optional — Eragon natural language control
Add a text input above the feed: "Describe what you're looking for..."
Eragon translates the prompt into structured filter params and re-queries.

---

## Phase 9 — Demo Prep (1 hr)

**Goal:** Clean demo loop, no live-data surprises.

### Seed 3 demo accounts
Create accounts with pre-filled style preferences and pinned boards:
- **Y2K girlhood** — tags: Y2K, Vintage 90s / occasion: Date Night
- **Dark academia** — tags: Minimalist, Vintage / occasion: Everyday
- **Streetwear** — tags: Streetwear / occasion: Everyday

### Demo loop (60 seconds)
1. Sign up with email
2. Select style tags + occasion
3. Feed loads with Tavily-sourced products
4. Tap a card → ProductDetailModal shows IFM sustainability score + Dedalus brand audit
5. Pin item to a board
6. View board

### SonarQube (optional)
Run a scan on edge functions before submission. Include the report in the README to show code quality discipline.

---

## API Keys Needed

Store all secrets in Supabase/Kizaki secrets manager — never in code.

| Key | Used for |
|---|---|
| `TAVILY_API_KEY` | Product search across retailers |
| `IFM_API_KEY` | Sustainability scoring + style matching |
| `DEDALUS_API_KEY` | Brand sustainability agent |
| `HEYGEN_API_KEY` | Eco-stylist avatar (optional) |
| `ERAGON_API_KEY` | NL feed controls (optional) |

---

## Build Order

```
Phase 1 — Scaffold (Orchids)         ~1 hr
Phase 2 — Design system              ~45 min
Phase 3 — Profile setup              ~45 min
Phase 4 — Product aggregation        ~2 hrs   ← mock data first
Phase 5 — Sustainability scoring     ~2 hrs   ← core demo moment
Phase 6 — Feed UI                    ~2 hrs
Phase 7 — Pinning + boards           ~1.5 hrs
Phase 8 — Search + nav               ~1 hr
Phase 9 — Demo prep                  ~1 hr
─────────────────────────────────────────────
Total                                ~12 hrs
```

---

## Verification Checklist

- [ ] Sign up → redirected to profile setup
- [ ] Style preferences save to DB
- [ ] Feed loads with products (mock or Tavily)
- [ ] Sustainability score ECO badge renders on each card (color-coded)
- [ ] Corner brackets + pixel flourishes appear on card images
- [ ] ProductDetailModal shows IFM explanation in green eco block
- [ ] `◆ SAVE_IT` button opens BoardSelector
- [ ] Save persists to DB, board cover mosaic updates
- [ ] Search bar is slim, white, monospace — integrates with nav
- [ ] Filter chips work below pixel-bar
- [ ] Board rows show alternating purple/blue left border
- [ ] `C:\users\boards\` path label with blinking cursor in boards view
- [ ] Share Tech Mono applied globally
- [ ] Y2K OS chrome (title bars, pixel bar, status bar) consistent across all pages
- [ ] Responsive on mobile
- [ ] No API keys in client-side code
