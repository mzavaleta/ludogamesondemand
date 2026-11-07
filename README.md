# Ludo Game-On-Demand

A local-hosted, mobile-first HTML5 game-on-demand web platform. Generate, modify, manage, and play self-contained 2D/HTML5 casual, board, puzzle, and arcade games using local AI models (Ollama, LM Studio) or cloud APIs (OpenAI, Anthropic, Gemini, OpenRouter).

## Features

1. **Ask & Create Games (`POST /api/games/generate`)**: Prompt-to-HTML5 generator producing single-file games with mobile touch controls, keyboard controls, score tracking, and Web Audio API sound effects.
2. **Edit & Modify Games (`POST /api/games/:id/modify` & `PUT /api/games/:id`)**: Iteratively refine any game via follow-up AI prompts or direct HTML5 source editing, with full revision history and 1-click rollback.
3. **Delete Games (`DELETE /api/games/:id`)**: Manage and clean up your local SQLite game library.
4. **Select & Play (`<iframe sandbox="allow-scripts">`)**: Instant isolated sandbox runner with restart, edit shortcut, and fullscreen toggle.
5. **Mobile-First Material Design 3 Web App (PWA)**: Thumb-friendly bottom navigation bar (**Library**, **Prompt**, **Play**, **Setup**), EN/ES localization with OS auto-detection, Dark/Light/Auto themes, and Material 3 color customization.
6. **Zero-Account Ownership, Clone & Dedicated `/admin` Portal**:
   - Anyone can **Play** any game, **Create** new games, or **Clone** (`POST /api/games/:id/clone`) any existing game into their own editable copy.
   - Only the **Creator** (identified by a browser-local `X-Creator-Token` hashed with SHA-256 into `owner_hash`) or **Admin** (`X-Admin-Key`, configured via `LUDO_ADMIN_KEY`, default `ludo-admin`, unlocked exclusively at `/admin`) can edit or delete a game.
7. **Strict Client-Only AI Credentials**: Personal AI provider settings (`Ollama`, `LM Studio`, `OpenAI`, `Anthropic`, `Gemini`, `OpenRouter`) and API keys live **exclusively in each user's browser `localStorage`** and are never stored or shared in the backend database.
8. **Live Model Picker**: AI Setup lists the models actually available on your provider — Ollama (`/v1/models` → `/api/tags` fallback), LM Studio, OpenAI, OpenRouter, Gemini, Anthropic and **OpenCode Go** — with a manual-entry fallback when the endpoint is unreachable. Credentials are forwarded per-request only and never persisted or echoed.
9. **Portable Game Packages**: `⬇ Export` any game to a `.ludogame.json` envelope carrying metadata, the self-contained HTML, a `sha256` checksum and an HMAC signature. Import is **admin-only** (`/admin`), verifies both, and rebinds the copy to the importing instance — the dev → prod workflow.
10. **Untrusted Game Containment**: game HTML is served with `connect-src 'none'` CSP and runs in an iframe **without** `allow-same-origin`, so a game can never read the app's `localStorage` (where your AI key lives) or reach the network. Provider errors are redacted at the origin, so no credential can land in logs, prompts, responses or the browser console.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `LUDO_DB_PATH` | `./data/ludo.db` | SQLite file |
| `LUDO_ADMIN_KEY` | `ludo-admin` | Admin passkey, unlocked at `/admin` |
| `LUDO_EXPORT_KEY` | _(empty)_ | HMAC secret for `.ludogame` signatures. Set the **same value** on dev and prod to enforce provenance; leave empty to accept unsigned packages. |

## Quick Start

Requires **Node.js 22.5+** and **pnpm** (uses native built-in `node:sqlite`, zero external dependencies required, hardened with `.npmrc` `ignore-scripts=true`).

```bash
# Start the local server (defaults to http://0.0.0.0:3000)
pnpm start

# Run in watch mode during development
pnpm dev

# Run the automated test suite
pnpm test
```
