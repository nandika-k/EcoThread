# EcoThread

EcoThread is a HackPrinceton 2026 project focused on sustainable fashion discovery. It combines a personalized web app with a Chrome extension so users can find clothing they actually like, understand how sustainable an item is, and make lower-impact shopping decisions without leaving their normal browsing flow.

At a high level, the project does two things:

1. The web app gives users a Pinterest-style feed of fashion listings based on their style preferences, lets them pin items to boards, and shows a sustainability score with plain-English reasoning.
2. The Chrome extension scans supported shopping pages, extracts product details directly from the page, and shows a quick sustainability breakdown in the browser.

The current product-facing name in the UI is **EcoThread**. You may still see older names like **ReWear** or `sustainable-fashion` in package names, comments, or older docs. Those refer to the same project lineage.

Devpost: https://devpost.com/software/ecothread-t6hcsw

## Why this project exists

Fashion sustainability information is usually buried, vague, or missing entirely. EcoThread tries to make that information visible at the moment a person is deciding what to buy.

The project is designed around a simple idea:

- help users discover clothing through taste and style, not just price
- surface sustainability signals in a way that feels approachable instead of academic
- reward secondhand and longer-lasting garments
- make lower-impact shopping feel easier, not harder

## What EcoThread does

### Web app

The web app lets a user:

- sign up or sign in with email
- create a style profile using tags, occasions, and free-form taste notes
- browse a personalized feed of fashion listings
- filter the feed by retailer
- open a product detail modal and view sustainability reasoning
- pin products to themed boards
- revisit saved boards and profile information later

### Chrome extension

The extension lets a user:

- turn the scanner on or off from a popup
- visit a supported product page
- automatically scrape product title, retailer, material, origin, price, image, and description when available
- score the item and display a compact sustainability breakdown
- see the score directly on the extension badge
- fall back to offline heuristics when no live scoring endpoint is configured

### Optional hackathon sidecar

The repo also includes an optional **Photon AI / tag-scanner prototype**. That path is not required for the main web app or extension demo, but it shows how the team experimented with scanning clothing tags from messages and routing them through the same sustainability reasoning pipeline.

## Main user flow

1. A user creates an account and saves style preferences.
2. The app turns those preferences into a recommendation query.
3. A backend aggregation step searches supported retailers, validates the listing data, and caches results.
4. The feed renders those listings in the web app.
5. When a user opens or pins a product, the app calculates or retrieves a sustainability score.
6. The user can save that product to a board for later.
7. Separately, the extension can score an item directly from a retailer page while the user is browsing.

## Tech stack

### Frontend web app

- **React 18** for the UI
- **TypeScript** across the app and extension
- **Vite** for local development and production builds
- **React Router** for page routing
- **TanStack Query** for async data fetching, caching, and infinite feed pagination
- **Tailwind CSS** plus custom styling for the visual design system

### Browser extension

- **Chrome Extension Manifest V3**
- **React** for the popup UI
- **CRXJS Vite Plugin** for building and hot-reloading the extension
- **Content scripts** to inspect retailer product pages
- **Background service worker** to coordinate scoring, caching, and badge updates
- **Chrome storage** for status and per-URL cache

### Backend and data

- **Supabase Auth** for sign-in/sign-up
- **Supabase Postgres** for profiles, style preferences, boards, pins, product cache, and optional tag scans
- **Supabase Edge Functions** for recommendation retrieval, product aggregation, sustainability scoring, and tag analysis
- **Row Level Security (RLS)** so user-owned data stays scoped to the authenticated user

### AI and external services

- **Tavily** for live search-based product aggregation across supported retailers
- **Dedalus Labs** for brand sustainability audit data
- **K2-Think / IFM endpoint** for deeper sustainability reasoning when configured
- **Fallback heuristics** so the app or extension can still function when live AI services are unavailable

### Optional prototype tools

- **Photon / Spectrum / Bun** for the message-based tag-scanner prototype in `photon-bot/`
- A **Kizaki-inspired schema/prototype path** in `schema/` and some `src/` backend files from an earlier iteration of the project

## How the project is built

EcoThread is split into a few clear layers.

### 1. Personalized discovery layer

When a user picks style tags and occasions, the app builds a search phrase from those preferences. That phrase is used to request product recommendations from supported marketplaces. The recommendation logic lives in shared TypeScript utilities and is mirrored by the Supabase edge functions that power the live app.

### 2. Listing aggregation layer

The app does not rely on one retailer API. Instead, it aggregates product links from multiple retail or resale sources, normalizes titles, prices, URLs, and images, and filters out invalid or obviously irrelevant results. Listings are cached in the `products` table so repeated searches are faster and cheaper.

### 3. Sustainability scoring layer

When a product needs a sustainability score, the backend first checks whether a usable score is already cached. If not, it can:

- look up brand-level sustainability context through Dedalus
- ask a reasoning model for a structured score and explanation
- fall back to retailer/material heuristics when live services are unavailable

This fallback behavior matters for a hackathon demo because it means the product can still show results even if the external model endpoint is down.

### 4. Saved-content layer

Boards and pins are stored in Supabase. When a user saves a product, the app stores a snapshot of the product plus the sustainability score at save time. That makes the board experience stable even if the source listing changes later.

### 5. Extension layer

The extension watches supported product pages, scrapes visible details from the DOM, sends the data to the background worker, and either:

- calls a live scoring API, or
- computes a heuristic sustainability breakdown locally

The popup then renders the result and the badge color updates to reflect the score.

## Architecture overview

```text
                           +----------------------+
                           |      Web App         |
                           | React + Vite + TS    |
                           +----------+-----------+
                                      |
                                      v
                           +----------------------+
                           |  Supabase Auth/DB    |
                           | profiles, boards,    |
                           | pins, products       |
                           +----------+-----------+
                                      |
                                      v
                           +----------------------+
                           | Supabase Functions   |
                           | get-recommendations  |
                           | aggregate-products   |
                           | calculate-score      |
                           | analyze-tag          |
                           +----+-----------+-----+
                                |           |
                                v           v
                          +----------+   +---------+
                          | Tavily   |   | Dedalus |
                          +----------+   +---------+
                                |
                                v
                          +--------------+
                          | K2 / IFM API |
                          +--------------+


Browser page ---> content script ---> background worker ---> popup UI
                                  \-> optional live score API
                                  \-> otherwise local heuristic scoring
```

## Repository layout

This is the practical map to the repo as it exists today:

| Path | Purpose |
|---|---|
| `src/` | Main React web app source |
| `src/pages.tsx` | Main pages: auth, feed, boards, profile |
| `src/components/` | Layout, chrome, cards, modals, visual system |
| `src/hooks/useProductFeed.ts` | Infinite feed query logic |
| `src/lib/rewear-store.ts` | Main client-side data access layer for the web app |
| `src/lib/recommendationQuery.ts` | Query-building logic from style preferences |
| `src/lib/listingValidation.ts` | Listing normalization, filtering, validation, and image/price extraction |
| `src/integrations/supabase/` | Supabase client and generated types |
| `extension/` | Chrome extension app |
| `extension/src/content/` | Scrapers and DOM extraction logic |
| `extension/src/background/` | Background service worker |
| `extension/src/popup/` | Popup React UI |
| `extension/src/lib/api.ts` | Extension scoring client and heuristic fallback |
| `supabase/functions/` | Edge functions used by the local/demo backend |
| `supabase/migrations/` | Database schema and migrations |
| `schema/` | Earlier schema/prototype artifacts |
| `photon-bot/` | Optional message-based tag-scanner prototype |

## Supported retailers and sources

### Web app aggregation path

The live recommendation pipeline currently targets:

- Depop
- Vinted
- eBay
- ThredUp
- Vestiaire Collective
- Whatnot

### Extension page scanning path

The extension manifest and scrapers currently include support for:

- Depop
- Vinted
- eBay
- ThredUp
- Vestiaire Collective
- Whatnot
- Zara
- H&M
- Shein
- ASOS
- Urban Outfitters
- Nordstrom
- Revolve
- Amazon
- Shopify stores
- Macy's
- Barbour
- Quince
- American Eagle

The extension also includes a generic scraper that tries to use standard product-page metadata when a dedicated site adapter is not present.

## Prerequisites

To run the project comfortably, install the following first:

- **Node.js 20+** and **npm**
- **Google Chrome** or another Chromium browser that supports loading unpacked extensions
- **Supabase CLI**
- **Docker Desktop** or another Docker environment supported by local Supabase

Optional, only if you want the prototype tag-scanner path:

- **Bun**
- a **Photon / Spectrum** project configuration

### Notes about the current repo state

- The root app and the extension both have `package.json` files and build independently.
- The PowerShell helper scripts in the repo expect a local Supabase CLI binary at `tools/supabase-cli/supabase.exe`.
- That binary is **not** currently checked into this repo, so the safest path for a new teammate is to install the official Supabase CLI globally and use the `supabase` command directly.
- If you prefer the helper scripts, you can place the CLI binary at the expected location yourself.

## Environment variables

There are three main env surfaces to care about.

### 1. Web app env: `/.env.local`

The frontend expects:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<your-supabase-anon-or-publishable-key>
```

What this does:

- `VITE_SUPABASE_URL` points the React app at your local or hosted Supabase project
- `VITE_SUPABASE_PUBLISHABLE_KEY` allows the browser app to use Supabase auth and database access according to RLS policies

### 2. Edge function secrets: `/supabase/functions/.env.local`

For the Supabase edge functions, the meaningful variables are:

```env
TAVILY_API_KEY=<required-for-live-feed-results>
DEDALUS_API_KEY=<optional-brand-audit-context>
IFM_API_URL=<optional-openai-compatible-model-endpoint>
IFM_API_KEY=<optional-api-key-for-that-endpoint>
IFM_MODEL_ID=<optional-model-override-for-tag-scanner>
```

What these control:

- `TAVILY_API_KEY`: enables real retailer search aggregation for the web feed
- `DEDALUS_API_KEY`: enriches sustainability analysis with brand audit information
- `IFM_API_URL`: enables live reasoning-based scoring instead of pure heuristic fallback
- `IFM_API_KEY`: auth token for that model endpoint if needed
- `IFM_MODEL_ID`: optional override used by the tag-scanner prototype

Important behavior:

- Without **Tavily**, the feed will usually be empty unless you already have cached products in the database.
- Without **Dedalus**, scoring still works, but with less brand context.
- Without **IFM**, scoring falls back to retailer/material heuristics instead of live reasoning.

### 3. Extension env: `/extension/.env` or `/extension/.env.local`

The extension supports:

```env
VITE_REWEAR_API_BASE=
```

Behavior:

- if left blank, the extension still works and uses built-in heuristic scoring
- if set, the extension will try to call `POST {VITE_REWEAR_API_BASE}/calculate-sustainability`

Important caveat:

- The web app backend in this repo uses Supabase edge functions, which are not wired to the extension through this exact base-URL contract out of the box.
- In practice, the easiest way to demo the extension is to run it in heuristic mode unless you already have a compatible HTTP wrapper or deployed endpoint.

### 4. Optional Photon bot env: `/photon-bot/.env`

Only needed if you want to run the message-based tag-scanner prototype:

```env
PHOTON_PROJECT_ID=<your-photon-project-id>
PHOTON_PROJECT_SECRET=<your-photon-project-secret>
SUPABASE_URL=<your-supabase-url>
SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

## First-time setup

From the project root:

```bash
npm install
cd extension
npm install
cd ..
```

Then create the env files described above.

If you do not care about the optional Photon bot, you can ignore `photon-bot/` entirely.

## Running the web app locally

### Step 1. Start local Supabase

Use the official Supabase CLI:

```bash
supabase start
```

If this is your first run, or if you want a clean local database with the repo migrations applied:

```bash
supabase db reset
```

This gives you:

- a local Postgres database
- local Auth
- local API endpoints
- the database schema from `supabase/migrations/`

### Step 2. Serve the edge functions

In a separate terminal:

```bash
supabase functions serve --env-file supabase/functions/.env.local --no-verify-jwt
```

Windows note:

- the repo includes `serve-functions-local.ps1`, but it expects a checked-in Supabase CLI binary
- if you installed Supabase globally, using the raw `supabase` command is simpler

### Step 3. Start the web frontend

In another terminal from the project root:

```bash
npm run dev
```

Vite will print the local URL, usually something like `http://localhost:5173`.

### Step 4. Open the app

When everything is running:

1. open the Vite URL in your browser
2. sign up with a new account, or use one of the seeded demo accounts below
3. complete profile setup
4. browse the feed
5. pin a few products to boards

### Demo logins built into the app

The app contains convenience demo accounts in code:

- `y2k@rewear.dev` / `rewear-demo`
- `academia@rewear.dev` / `rewear-demo`
- `streetwear@rewear.dev` / `rewear-demo`

If a demo account does not already exist, the app tries to bootstrap it automatically when you sign in with the expected password.

## Running the extension locally

The extension can be run in two different modes.

### Mode A: fastest path, no live backend required

This is the easiest and most reliable local demo path.

1. leave `VITE_REWEAR_API_BASE` blank in `extension/.env` or `extension/.env.local`
2. from `extension/`, run:

```bash
npm run dev
```

3. open `chrome://extensions`
4. enable **Developer mode**
5. click **Load unpacked**
6. choose the `extension/dist/` folder
7. pin the extension in Chrome
8. open a supported product page and turn the scanner on

In this mode, the extension scores items locally using heuristic logic from `extension/src/lib/api.ts`.

### Mode B: live API scoring

If you already have a compatible scoring endpoint:

1. set `VITE_REWEAR_API_BASE`
2. rebuild or rerun the extension
3. load `extension/dist/`

The extension expects a base URL that supports:

```text
POST /calculate-sustainability
```

with a request body shaped like:

```json
{
  "item": {
    "url": "...",
    "retailer": "...",
    "title": "...",
    "brand": "...",
    "price": 42,
    "currency": "USD",
    "image_url": "...",
    "description": "...",
    "material": "...",
    "origin": "...",
    "scraped_at": 1234567890
  }
}
```

and a response that can be normalized into the extension's `SustainabilityBreakdown` shape.

### Extension dev workflow tips

- Popup UI changes generally reload quickly with the Vite/CRXJS dev flow.
- Content-script and service-worker changes often require clicking the **Reload** button on the extension card in `chrome://extensions`.
- If the popup says no item was found, make sure you are on a supported product page rather than a category page or homepage.

## Running both together for the full demo

If you want to demo the whole project as a system:

1. install root and extension dependencies
2. create the env files
3. run `supabase start`
4. run `supabase functions serve --env-file supabase/functions/.env.local --no-verify-jwt`
5. run `npm run dev` from the repo root
6. run `npm run dev` from `extension/`
7. load `extension/dist/` into Chrome
8. open the web app in one tab and supported retailer pages in another

Recommended demo split:

- use the **web app** to show onboarding, feed personalization, saving to boards, and sustainability detail
- use the **extension** to show in-context browsing and fast scoring on retail pages

## How recommendations work

The recommendation path is roughly:

1. style tags and occasions are saved in `style_preferences`
2. the app converts those preferences into a search query
3. `get-recommendations` invokes `aggregate-products`
4. `aggregate-products` queries supported retailer domains through Tavily
5. raw search results are validated and normalized
6. valid results are cached in the `products` table
7. the frontend sorts, filters, and renders the results

Some useful implementation details:

- Depop and Vinted queries can be diversified into "top" and "bottom" fashion buckets to avoid overly repetitive results
- listing URLs are normalized and tracking parameters are stripped
- prices are extracted heuristically from retailer text when not explicitly available
- images are normalized and scored to prefer real product photos over logos, icons, or static assets

## How sustainability scoring works

The scoring path is roughly:

1. the frontend requests a sustainability score for a product
2. the backend checks whether a non-fallback score already exists in `products`
3. if needed, it optionally enriches the item with brand-audit context from Dedalus
4. if configured, it calls a reasoning model endpoint for a structured score and explanation
5. if the model is unavailable, it falls back to retailer/material heuristics
6. the result is returned to the UI and sometimes cached back onto the product record

The score output shown to users typically includes:

- numeric score
- one-line explanation
- reasoning text
- estimated carbon comparison
- inferred fabric type
- inferred item condition

## Database model

The main tables created by the Supabase migrations are:

| Table | Purpose |
|---|---|
| `profiles` | one profile per authenticated user |
| `style_preferences` | style tags, occasions, and free-form taste note |
| `boards` | user-created collections |
| `pins` | saved products linked to boards |
| `products` | cached listing aggregation results and score metadata |
| `tag_scans` | optional records created by the tag-scanner prototype |

Security model summary:

- user-owned tables use **Row Level Security**
- users can only read and mutate their own profiles, preferences, boards, and pins
- the `products` table is publicly readable but server-written
- `tag_scans` is intended for server-side use only

## Important files to read if you are onboarding

If you are new to the codebase, start here:

### Web app

- `src/pages.tsx`
- `src/components/chrome.tsx`
- `src/hooks/useProductFeed.ts`
- `src/lib/rewear-store.ts`
- `src/lib/recommendationQuery.ts`
- `src/lib/listingValidation.ts`

### Extension

- `extension/src/popup/Popup.tsx`
- `extension/src/background/service-worker.ts`
- `extension/src/content/content-script.ts`
- `extension/src/lib/api.ts`
- `extension/src/lib/messages.ts`
- `extension/src/lib/storage.ts`

### Backend

- `supabase/functions/get-recommendations/index.ts`
- `supabase/functions/aggregate-products/index.ts`
- `supabase/functions/calculate-sustainability/index.ts`
- `supabase/functions/analyze-tag/index.ts`
- `supabase/migrations/20260418165055_initial_schema.sql`

## Optional prototype: Photon AI tag scanner

This is optional and not needed for the core app demo.

The prototype flow is:

1. a user sends a clothing-tag image through the Photon/Spectrum channel
2. `photon-bot/index.ts` forwards the image URL to the Supabase `analyze-tag` function
3. the edge function runs multimodal extraction/scoring logic
4. the bot sends back a formatted sustainability response

Run it only if you have Bun and the Photon credentials set up:

```bash
cd photon-bot
npm install
bun run dev
```

If Bun is not installed, skip this directory entirely.

## Troubleshooting

### The web app crashes on startup with a Supabase env error

Cause:

- `/.env.local` is missing or incomplete

Fix:

- add `VITE_SUPABASE_URL`
- add `VITE_SUPABASE_PUBLISHABLE_KEY`
- restart Vite

### Sign-in works, but the feed is empty

Possible causes:

- Supabase edge functions are not being served
- `TAVILY_API_KEY` is missing or invalid
- you are using a clean DB with no cached products and no live search access

Fix:

- verify `supabase functions serve` is running
- verify `supabase/functions/.env.local` contains a valid Tavily key
- try again after checking the function logs

### The feed loads but sustainability scores look generic

Cause:

- the IFM/K2 endpoint is not configured, so the app is using heuristic fallback scoring

Fix:

- set `IFM_API_URL`
- set `IFM_API_KEY` if your endpoint requires auth

### The extension popup says it cannot find an item

Cause:

- you are not on a supported product-detail page
- the page is still loading dynamic content
- the scanner is turned off

Fix:

- turn the scanner on
- reload the retailer page
- wait a second for SPA content to settle
- test on a direct product page instead of a category page

### The extension loads but does not show live scores

Cause:

- `VITE_REWEAR_API_BASE` is blank, or
- the configured endpoint does not match the extension's expected route/response

Fix:

- use heuristic mode intentionally, or
- point the extension at a compatible live API

### The helper PowerShell scripts fail

Cause:

- they expect a local Supabase CLI binary that is not checked into the repo

Fix:

- use the globally installed `supabase` command directly, or
- add `tools/supabase-cli/supabase.exe` yourself

## Known rough edges

Because this is a hackathon project, there are a few things worth knowing up front:

- the naming is a little mixed between EcoThread, ReWear, and older prototype labels
- the extension's live API contract is not fully unified with the Supabase web app backend
- the repo contains experimental prototype paths in addition to the main demo path
- external AI/search services are optional but strongly affect the quality of the demo

None of that prevents the project from being run locally, but it helps to know which path is the "real" one:

- **main web app path**: React + Supabase
- **main extension path**: Chrome extension with heuristic mode or optional live API mode
- **optional prototype path**: Photon / tag-scanning experiment

## Suggested demo checklist

If you are handing this off to a teammate before a demo, this is the shortest reliable checklist:

1. install Node and Supabase CLI
2. install root and extension dependencies
3. create `/.env.local`
4. create `/supabase/functions/.env.local`
5. run `supabase start`
6. run `supabase functions serve --env-file supabase/functions/.env.local --no-verify-jwt`
7. run `npm run dev` from the repo root
8. run `npm run dev` from `extension/`
9. load `extension/dist/` into Chrome
10. test one web-app flow and one extension flow before the actual demo

## Credits and hackathon context

EcoThread was built for **HackPrinceton 2026** as a fashion sustainability project that blends:

- personalized discovery
- browser-native product analysis
- sustainability scoring
- live retail aggregation
- hackathon-friendly fallbacks for resilience under demo conditions

If you are continuing work on this project after the hackathon, the best next step is to unify the extension and web-app scoring backends behind one clean API surface and add a root `.env.example` that mirrors the setup documented here.
