# Handoff — Sustainable Fashion Discovery Platform

> For the teammate picking up backend deployment on macOS.

## TL;DR

The backend is scaffolded (schema + 3 server functions + types + mock fallback). Your job is to get it running on your Mac, deploy K2-Think on Modal, and wire everything together. Frontend work happens in parallel on the other side.

Branch: `claude/quirky-heisenberg-c259c4` (already on GitHub — a PR is open)

---

## What's already done

- `schema/main.inspire` — full data model (Profile, StylePreference, Board, Pin, Product) with auth + per-user access policies
- `src/aggregate-products.ts` — Tavily search across Depop, Vinted, eBay, ThredUp, Vestiaire, Whatnot (1hr cache)
- `src/get-recommendations.ts` — personalized feed (live Tavily → mock fallback)
- `src/calculate-sustainability.ts` — Dedalus brand audit + K2-Think scoring (live → retailer-heuristic fallback)
- `src/lib/mockProducts.ts` — 22 fallback products so demo never shows empty state
- `src/types/` — shared TypeScript types

## What you need to do

### ✅ 1. Install Kizaki CLI (~5 min)
```bash
brew install --cask kizakicorp/tap/kizaki
kizaki login
```

### ✅ 2. Clone and verify (~2 min)
```bash
git clone <repo-url>
cd Hack-Princeton-Spring26
git checkout claude/quirky-heisenberg-c259c4
ls schema/ src/
```

### ✅ 3. Deploy K2-Think on Modal (~15 min)
This is the critical one. K2-Think 32B isn't on any free hosted API, so we self-host. Full script in [TEAMMATE_SETUP.md](TEAMMATE_SETUP.md) step 4.

```bash
pip install modal
modal token new
# Create k2_server.py from TEAMMATE_SETUP.md
modal deploy k2_server.py
```

Copy the Modal URL that gets printed.

### ✅ 4. Register all secrets (~2 min)
```bash
kizaki secrets set TAVILY_API_KEY=<tavily-key>
kizaki secrets set DEDALUS_API_KEY=<dedalus-key>
kizaki secrets set IFM_API_URL=<your-modal-url>/v1/chat/completions
kizaki secrets set IFM_API_KEY=dummy
```

### ✅ 5. Schema + DB (~5 min)
```bash
kizaki compile
kizaki migrate plan
kizaki migrate apply
```

**Expect compile errors** on `schema/main.inspire` — the Inspire syntax pages are 404 on docs.kizaki.ai, so the schema was written from best interpretation of the other docs. Fix syntax errors as they come, using the Kizaki studio for reference.

### ✅ 6. Local smoke test (~5 min)
```bash
kizaki dev
```
Sign up via dev login → call `getRecommendations(0)` → should get live Tavily products → call `calculateSustainability(<id>)` → should get K2-Think reasoning chain in `kizaki logs`.

### ✅ 7. Deploy (~3 min)
```bash
kizaki deploy
```
Live URL: `<app>-hackprincetonspring26.kizaki.ai`

### ✅ 8. Pre-warm Modal right before demo (~2 min)
Fire one throwaway curl (command in TEAMMATE_SETUP.md step 7). First cold-start takes ~90s; after warm, 5–10s per product.

---

## Priority order if time runs short

1. **Kizaki compile + migrate** (blocks everything)
2. **Tavily + Dedalus keys set** (frontend devs need feed to render)
3. **Modal K2-Think deploy** (sponsor prize hinges on this)
4. `kizaki deploy` for the live URL

If Modal deploy fails, **don't panic**. The code has a retailer-heuristic fallback that still renders ECO badges. You lose the K2-Think reasoning in the product modal but the demo still works end-to-end.

---

## Demo invariants (what stays true even if things fail)

| Failure | What still works |
|---|---|
| Tavily down | Feed uses 22 mock products (still looks populated) |
| K2-Think down | Scores are retailer-heuristic (65/35); badges still render |
| Dedalus down | K2-Think still scores without brand data |
| All three down | App still works on mock + heuristic |

The ECO badge **always** renders. The app **never** shows a broken state.

---

## Gotchas

- **Kizaki CLI is macOS/Linux only** — Nandika is on Windows, that's why you have this job
- **Inspire syntax docs are 404** — schema might need syntax tweaks after `kizaki compile`
- **Modal container sleeps after 5 min idle** — always pre-warm before demoing or first call takes 90s
- **Tavily free tier = 1000 searches/mo** — 1hr cache is enabled; don't loop-test
- **API keys live only in `kizaki secrets`** — never commit to git, never put in frontend code

---

## Cost watch

- Modal A100-80GB: ~$3.60/hr active → ~$18 over hackathon if you idle properly
- Tavily free tier: fine for demo
- Dedalus: sponsor credits (ask them)

Modal gives $30 free credits/month — should cover the entire hackathon if you let the container idle out.

---

## Who does what

- **You (teammate):** Kizaki deploy + Modal + secrets + smoke test
- **Nandika:** Frontend (Y2K UI, Orchids-generated components, pinning/boards)
- **Anyone:** Demo script + seed accounts (Phase 9 in IMPLEMENTATION_PLAN.md)

---

## Where to look

- Full backend setup: [TEAMMATE_SETUP.md](TEAMMATE_SETUP.md)
- Full product spec: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)
- Agent handoff (if you want Claude/Cursor/Copilot to pick up context): [HANDOFF_AGENT.md](HANDOFF_AGENT.md)

Ping Nandika if stuck more than 15 min on any one step.
