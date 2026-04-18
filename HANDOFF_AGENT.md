# Agent Handoff — Sustainable Fashion Discovery Platform

> Paste this into a new Claude Code / Cursor / Copilot session before starting work on this repo. The agent uses this as its starting context.

---

## Project

HackPrinceton Spring 2026 submission. Pinterest-style web app for discovering sustainable, secondhand, and vintage clothing. Y2K Windows 98 aesthetic: monospace type, blue/purple accents, pixel flourishes, flat white cards.

**Stack:**
- Frontend: React + TypeScript + Tailwind (Orchids-scaffolded, lives in repo root — dependencies in `node_modules/`)
- Backend: Kizaki (`schema/main.inspire` + TypeScript functions in `src/` with `/** @expose */`)
- Product search: Tavily
- Sustainability reasoning: **LLM360/K2-Think** (32B Qwen2.5-based reasoning model) — self-hosted on Modal via vLLM
- Brand audits: Dedalus Labs

**Branch:** `claude/quirky-heisenberg-c259c4` — a PR is open against `main` on `nandika-k/Hack-Princeton-Spring26`.

---

## Critical architectural decisions (do not re-litigate)

1. **Kizaki, not Supabase.** Original plan listed both; team chose Kizaki for the sponsor prize. Schema is in Inspire language at `schema/main.inspire`. **Inspire syntax docs are 404 on docs.kizaki.ai** — expect `kizaki compile` errors; adjust syntax iteratively.

2. **K2-Think via Modal+vLLM, not HF Serverless.** HF does not host LLM360/K2-Think on Serverless (confirmed on model card: "This model isn't deployed by any Inference Provider"). Modal script in `TEAMMATE_SETUP.md` step 4. Endpoint is OpenAI-compatible `/v1/chat/completions`.

3. **Live-first with graceful fallback.** Each `@expose` function tries live upstream first, falls back to mock/heuristic instead of throwing. Demo invariant: ECO badges always render, feed always populated.

4. **Windows teammate (Nandika) can't run Kizaki CLI.** Kizaki CLI is macOS/Linux only. The teammate with a Mac runs backend deploy; Nandika does frontend on Windows.

5. **Frontend already exists via Orchids.** Don't scaffold React pages or auth UI from scratch. Use generated Kizaki SDK client (`useAuth()`, `AuthGate`, generated function bindings) to plug into the existing frontend components.

6. **Y2K OS aesthetic is spec'd in IMPLEMENTATION_PLAN.md.** Design tokens at lines 106–226. Don't introduce glassmorphism. Use Share Tech Mono globally. Corner brackets on cards (2px L-shapes, purple TL+BR, blue TR+BL).

---

## File map

```
IMPLEMENTATION_PLAN.md              ← full product spec (547 lines)
TEAMMATE_SETUP.md                   ← macOS deploy steps
HANDOFF_TEAMMATE.md                 ← human handoff doc
HANDOFF_AGENT.md                    ← this file

schema/
  main.inspire                      ← data model (Profile, StylePreference, Board, Pin, Product)
                                      + auth block (email + google)
                                      + per-entity access policies

src/
  aggregate-products.ts             ← @expose aggregateProducts({ query, retailers?, page? })
                                      Tavily search, 1hr Product cache, parallel fetch per retailer
  get-recommendations.ts            ← @expose getRecommendations(page)
                                      getPrincipal → StylePreference → Tavily → mock fallback
  calculate-sustainability.ts       ← @expose calculateSustainability(productId)
                                      Dedalus audit → K2-Think score → persist to Product row
                                      Returns { score, explanation, reasoning, comparison }
                                      Retailer-heuristic fallback if K2-Think unavailable
  lib/
    mockProducts.ts                 ← 22 fallback products (retailer:id format)
  types/
    product.ts                      ← Product, AggregateInput, SustainabilityResult
    board.ts                        ← Board, Pin
    profile.ts                      ← Profile, StylePreference, STYLE_TAGS, OCCASIONS

node_modules/                       ← Orchids-installed deps (React, TS, Vite, Tailwind, etc.)
```

---

## Secrets (set via `kizaki secrets set`)

| Secret | Purpose | Required |
|---|---|---|
| `TAVILY_API_KEY` | Product search | Yes |
| `DEDALUS_API_KEY` | Brand audits | Yes |
| `IFM_API_URL` | Modal K2-Think endpoint (`.../v1/chat/completions`) | Yes |
| `IFM_API_KEY` | Can be `"dummy"` — vLLM doesn't enforce auth | Yes |
| `HEYGEN_API_KEY` | Avatar (optional Phase 6 stretch) | No |
| `ERAGON_API_KEY` | NL filters (optional Phase 8 stretch) | No |

---

## What's left to do (ordered)

1. **Run `kizaki compile` on macOS** — fix Inspire syntax errors
2. **`kizaki migrate plan` + `apply`** — create tables
3. **Deploy K2-Think on Modal** (script in TEAMMATE_SETUP.md)
4. **Wire generated Kizaki SDK into the frontend:**
   - Import `useAuth`, `AuthGate`, `getRecommendations`, `calculateSustainability` from generated package
   - Replace any mock hooks in existing frontend components
   - Protect routes with `AuthGate`
5. **Build remaining frontend per IMPLEMENTATION_PLAN.md phases 3–8** (if not already scaffolded by Orchids):
   - `ProfileSetup.tsx` — style tag + occasion multi-select
   - `Feed.tsx` with `MasonryGrid` + `ProductCard`
   - `ProductDetailModal.tsx` with K2-Think reasoning in green eco block
   - `Boards.tsx`, `BoardDetail.tsx` — pinning flow
   - `Navigation.tsx` with Y2K `TitleBar`, pixel-bar, `SearchBar`
6. **Seed 3 demo accounts** (Phase 9 in IMPLEMENTATION_PLAN.md)

---

## Gotchas / do-not-do

- **Don't switch off K2-Think.** The sponsor prize is specifically for LLM360/K2-Think. Even if it's slow, keep it. Fallback is for resilience only.
- **Don't remove mock fallback.** User explicitly wants live-first with mock safety net.
- **Don't use HF Serverless Inference API.** K2-Think isn't hosted there. Must be Modal/Cerebras/self-host.
- **Don't introduce glassmorphism.** Flat white cards with 1px borders, per IMPLEMENTATION_PLAN.md.
- **Don't add new abstractions.** The three server functions are deliberately flat files. No "service layer", no factory patterns.
- **Don't commit secrets.** `kizaki secrets set` only. Scan any diff before committing.
- **Don't bypass Kizaki's access policies** by reading via `principal.id` when the policy already filters. Trust the DB layer.
- **Don't assume the Inspire schema syntax is final** — it'll need adjustments after first `kizaki compile`.
- **Don't run `kizaki init` in the repo root** — it may overwrite `schema/main.inspire`. If needed, init in a sibling dir and cherry-pick generated config files.

---

## Current demo behavior

| Scenario | Result |
|---|---|
| All services healthy | Live Tavily feed + K2-Think reasoning in modal |
| Tavily 4xx/5xx | Feed falls back to 22 mock products |
| K2-Think down | Scores use retailer heuristic (secondhand=65, new=35) |
| Dedalus down | K2-Think still runs without brand data |
| Everything down | Mock products + heuristic scores — app looks functional |

Failures log to `console.warn` and surface in `kizaki logs`.

---

## When you need more context

- Product/design spec → read `IMPLEMENTATION_PLAN.md` (full source of truth)
- Deploy steps → `TEAMMATE_SETUP.md`
- Kizaki platform API → https://docs.kizaki.ai (note: Inspire language reference pages return 404)
- K2-Think model → https://huggingface.co/LLM360/K2-Think
- Tavily API → https://docs.tavily.com

## Owner

Repo: nandika-k/Hack-Princeton-Spring26
