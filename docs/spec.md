# Platform specification

Ludo Game-On-Demand is a local-hosted, mobile-first web platform for creating and playing
self-contained HTML5 games with local or cloud AI providers. Each requirement below records the
behavior as implemented and the command that verifies it.

Run the full suite with `pnpm test`. Individual test files are listed per requirement.

---

## S1 — Prompt area and game library

**Requirement.** A prompt area to describe a game, and a library area listing the games already
created.

**Behavior.** Two views, Prompt and Library, backed by a SQLite store using `node:sqlite`. A new
database is seeded with three playable templates so the library is usable on first boot: Ludo Blitz
Royal, Neon Star Dodger and Neon Memory Match.

**Verification.** `node --test tests/store.test.mjs tests/api.test.mjs`

---

## S2 — Create a game from a prompt

**Requirement.** Create a game by asking for it.

**Behavior.** `POST /api/games/generate` builds the creation prompt, calls the configured provider
with the caller's per-request settings, extracts the HTML payload and stores a self-contained
single-file game with canvas/DOM rendering, touch and keyboard input, score tracking and Web Audio
effects. With no provider configured, the deterministic template generator produces the game.
Creating from raw HTML (`POST /api/games`) also exists, but is admin-only because it injects
arbitrary code.

**Verification.** `node --test tests/prompt-engine.test.mjs tests/api.test.mjs`

---

## S3 — Edit or modify a game

**Requirement.** Edit or modify an existing game.

**Behavior.** Two paths: a follow-up AI instruction (`POST /api/games/:id/modify`) or a direct edit
of the title, description or HTML source (`PUT /api/games/:id`). Both append a revision, and any
revision can be restored (`POST /api/games/:id/restore`). Only the creator or an admin may write.

**Verification.** `node --test tests/store.test.mjs tests/api.test.mjs`

---

## S4 — Delete a game

**Requirement.** Delete games.

**Behavior.** `DELETE /api/games/:id` removes the game and its revisions through the foreign-key
cascade. Only the creator or an admin may delete.

**Verification.** `node --test tests/store.test.mjs tests/api.test.mjs`

---

## S5 — Select and play

**Requirement.** Select a game and play it, with working interaction.

**Behavior.** Games are served at `/play/:id` and embedded in an iframe sandboxed with
`allow-scripts allow-pointer-lock allow-modals`. The sandbox deliberately omits `allow-same-origin`,
so the frame runs in an opaque origin. The play view is activated before the frame loads and the
game canvas receives focus on load, so taps and key presses reach the game.

**Verification.** `pnpm test` (`tests/ui.test.mjs`)

---

## S6 — Web, local-hosted, mobile-first

**Requirement.** A web application, hosted locally, with a mobile-first approach.

**Behavior.** A PWA served over HTTP with configurable `HOST` and `PORT` (default `0.0.0.0:3000`),
a web manifest, and a bottom navigation bar for thumb reach: Library, Prompt, Play and Setup.

**Verification.** `node --test tests/ui.test.mjs tests/api.test.mjs`

---

## S7 — Local or cloud AI providers

**Requirement.** Use local models or a hosted API.

**Behavior.** Supported providers are Ollama, LM Studio, OpenAI, Anthropic, Gemini, OpenRouter,
OpenCode Go and any OpenAI-compatible endpoint. Provider settings and API keys live only in the
visitor's browser `localStorage` and travel per request; no endpoint persists them. `GET
/api/presets` and `GET /api/settings` return the static preset catalogue without credentials,
`POST /api/settings/test` checks a provider, and `POST /api/models` lists its catalogue. The
deterministic template generator is the offline fallback for creation.

**Verification.** `node --test tests/prompt-engine.test.mjs tests/api.test.mjs`

---

## S8 — Language, theme and Material Design 3

**Requirement.** English and Spanish with OS/browser detection; light and dark themes with
detection; Material Design 3 styling with selectable colors; Setup split into normal and AI
sections.

**Behavior.** The bottom-nav entry is `Setup` (`Ajustes` in Spanish). The view is split into Normal
Setup and AI Setup. Language is detected from `navigator.language` with a selector in Normal Setup.
Theme follows `prefers-color-scheme` with a manual override. Styling uses `--md-sys-color-*` tokens,
rounded surfaces and an M3 navigation pill, with swatch presets and a custom color picker.

**Verification.** `pnpm test` (`tests/ui.test.mjs`)

---

## S9 — Accountless ownership

**Requirement.** Anyone can create, play and clone a game; only its creator or an admin can edit or
delete it; AI credentials never reach the backend.

**Behavior.** Created and cloned games are bound to `SHA-256(X-Creator-Token)` in `owner_hash`.
`PUT /api/games/:id`, `POST /api/games/:id/modify`, `POST /api/games/:id/restore` and `DELETE
/api/games/:id` return `403` unless the caller is the creator or sends a valid `X-Admin-Key`. The
admin key is entered only on the dedicated `/admin` route. `POST /api/games/:id/clone` is open to
everyone and assigns ownership of the clone to the caller. The legacy settings table is dropped, so
no AI credential is ever stored server-side.

**Verification.** `pnpm test`

---

## S10 — Provider model catalogue

**Requirement.** Pick a model from the list the provider actually exposes instead of typing it.

**Behavior.** AI Setup replaces the blind model field with a populated dropdown. `POST /api/models`
returns the catalogue for Ollama (`/v1/models`, falling back to `/api/tags`), LM Studio, OpenAI,
OpenRouter, Gemini, Anthropic (`/v1/models` with `x-api-key` and `anthropic-version`) and custom
OpenAI-shaped endpoints. The saved model is preserved, and a manual-entry escape hatch (`__custom__`)
keeps working when the endpoint is unreachable. Credentials are forwarded per request only and are
never persisted or echoed.

**Verification.** `pnpm test`

---

## S11 — Read-only prompt viewer

**Requirement.** Inspect a game's stored prompt before resending or editing it, without editing the
saved copy in place.

**Behavior.** The editor shows the stored prompt in a read-only viewer (`#savedPromptView`) with
Copy and "Use as base" actions. Each revision in the history expands to its full, untruncated prompt
in a read-only field, with Copy, Use-as-base and Restore. No code path writes to `savedPromptView`;
"Use as base" only loads text into the new-instruction box, and sending it creates a new revision.
Copy degrades gracefully when the Clipboard API is unavailable in an insecure context.

**Verification.** `pnpm test`

---

## S12 — Fail-closed editing

**Requirement.** A provider failure must never overwrite a working game.

**Behavior.** Editing is all-or-nothing. When the provider fails during `POST
/api/games/:id/modify`, the endpoint returns `502` with the provider message and the stored game
stays byte-identical: no HTML change and no new revision. The template fallback remains available
only for creation, where a generic game is not destructive. Every provider failure is printed to the
server console as a single copy-pasteable `[ai-error]` line carrying endpoint, provider, model,
baseUrl and message, with the API key redacted.

**Verification.** `pnpm test`

---

## S13 — Export, import and containment

**Requirement.** Export a working game from one instance and import it into another, with integrity
guarantees, while no credential ever persists or leaks.

**Behavior.** `GET /api/games/:id/export` returns a `.ludogame.json` envelope (format, version,
metadata, HTML, `sha256` and `hmac`) with `Content-Disposition: attachment`, available to everyone
because the HTML is already public through `/play/:id`. `POST /api/games/import` is admin-only and
rejects packages whose `sha256` does not match, whose `hmac` does not verify against
`LUDO_EXPORT_KEY`, or that exceed 5 MB. An optional `targetId` updates an existing game in place and
appends a revision, so a stable play URL survives iterations. Game HTML is served with a
`connect-src 'none'` CSP and the player iframe does not grant `allow-same-origin`, so untrusted game
code cannot reach `localStorage` or the network. Provider error text is redacted at the origin, so no
API key can appear in logs, prompts, responses or the browser console.

**Verification.** `pnpm test`
