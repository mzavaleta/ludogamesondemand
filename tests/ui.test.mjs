import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer } from "../src/server.mjs";

test("Mobile-first PWA frontend serves index.html, manifest.json, styles.css, and app.js with required sections", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ludo-ui-"));
  const dbPath = join(dir, "ui-test.db");

  const { server, store } = createAppServer({ dbPath });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const indexRes = await fetch(`${base}/`);
    assert.equal(indexRes.status, 200);
    const html = await indexRes.text();

    // S1, S5, S6: Verify mobile viewport, bottom navigation, prompt area, library area, sandboxed play iframe, and settings
    assert.ok(html.includes('name="viewport"'), "Expected mobile viewport meta tag");
    assert.ok(html.includes('id="view-library"'), "Expected library view section");
    assert.ok(html.includes('id="view-create"'), "Expected prompt/create view section");
    assert.ok(html.includes('id="view-play"'), "Expected play view section");
    assert.ok(html.includes('id="view-settings"'), "Expected AI settings view section");
    assert.ok(html.includes('sandbox="allow-scripts'), "Expected sandboxed game runner iframe");

    const manifestRes = await fetch(`${base}/manifest.json`);
    assert.equal(manifestRes.status, 200);
    const manifest = await manifestRes.json();
    assert.equal(manifest.display, "standalone");

    const jsRes = await fetch(`${base}/app.js`);
    assert.equal(jsRes.status, 200);
    const jsText = await jsRes.text();
    const storageRes = await fetch(`${base}/js/storage.mjs`);
    assert.equal(storageRes.status, 200);
    const storageText = await storageRes.text();
    const apiRes = await fetch(`${base}/js/api.mjs`);
    assert.equal(apiRes.status, 200);
    const apiText = await apiRes.text();
    const themeRes = await fetch(`${base}/js/theme.mjs`);
    assert.equal(themeRes.status, 200);
    const themeText = await themeRes.text();
    const playerRes = await fetch(`${base}/js/player.mjs`);
    assert.equal(playerRes.status, 200);
    const playerText = await playerRes.text();
    const navRes = await fetch(`${base}/js/navigation.mjs`);
    assert.equal(navRes.status, 200);
    const navText = await navRes.text();
    const settingsRes = await fetch(`${base}/js/settings.mjs`);
    assert.equal(settingsRes.status, 200);
    const settingsText = await settingsRes.text();
    const viewsRes = await fetch(`${base}/js/views.mjs`);
    assert.equal(viewsRes.status, 200);
    const viewsText = await viewsRes.text();
    assert.ok(viewsText.includes("/api/games/generate"));
    assert.ok(viewsText.includes("/modify"));

    const cssRes = await fetch(`${base}/styles.css`);
    assert.equal(cssRes.status, 200);
    assert.match(
      cssRes.headers.get("cache-control") || "",
      /no-cache/,
      "Static assets must not be heuristically cached by the browser"
    );

    // S5 bugfix verification: dedicated /play/:id HTML endpoint renders standalone game HTML,
    // and openGameInPlayer switches view BEFORE mounting iframe src to avoid 0x0 hidden iframe black screen.
    const listRes = await fetch(`${base}/api/games`);
    const { games } = await listRes.json();
    const firstGame = games[0];
    const playRes = await fetch(`${base}/play/${firstGame.id}`);
    assert.equal(playRes.status, 200);
    assert.ok(playRes.headers.get("content-type")?.includes("text/html"));
    const playHtml = await playRes.text();
    assert.ok(playHtml.includes("<!DOCTYPE html>"));

    // Verify openGameInPlayer activates view-play before mounting iframe src
    const openPlayerMatch = viewsText.match(/function openGameInPlayer[\s\S]*?switchView\("view-play",\s*updateUrl\);\s*mountGameIframe\(game,\s*true\);/);
    assert.ok(openPlayerMatch, "Expected switchView('view-play') before mountGameIframe(game, true)");

    // Deep links: /g/:id serves the app shell so a shared link opens that game,
    // while /play/:id keeps serving the raw standalone game above.
    const deepLinkRes = await fetch(`${base}/g/${firstGame.id}`);
    assert.equal(deepLinkRes.status, 200, "Deep links must resolve to the app shell");
    assert.ok(
      (await deepLinkRes.text()).includes('id="view-play"'),
      "Deep links must serve the app shell, not a raw game"
    );
    assert.ok(viewsText.includes("gameIdFromPath"), "Expected /g/:id deep-link parsing in the frontend");
    assert.ok(viewsText.includes("openGameInNewTab"), "Expected the library Play action to open the deep link");
    assert.ok(
      viewsText.includes('card.querySelector(".btn-play").addEventListener("click", () => openGameInNewTab(game))'),
      "Library Play must open the game in its own tab"
    );
    // Rebuilt frames must keep exactly the same containment as the markup.
    assert.ok(
      playerText.includes('setAttribute("sandbox", "allow-scripts allow-pointer-lock allow-modals")'),
      "Rebuilt frames must keep exactly the original sandbox flags (never allow-same-origin)"
    );

    // S8: Setup tab rename ("Setup"), Normal Setup + AI Setup sections, EN/ES i18n with auto-detect,
    // Dark/Light/Auto theme toggle, and Material Design 3 color picker
    assert.ok(html.includes('data-i18n="nav.setup">Setup<'), "Expected bottom nav tab label to be Setup");
    assert.ok(html.includes('id="normalSetupCard"'), "Expected Normal Setup section in Setup view");
    assert.ok(html.includes('id="aiSetupCard"'), "Expected AI Setup section in Setup view");
    assert.ok(html.includes('id="langSelect"'), "Expected language toggle/selector in Normal Setup");
    assert.ok(html.includes('id="themeSelect"'), "Expected theme (auto/dark/light) selector in Normal Setup");
    assert.ok(html.includes('id="accentColorPicker"'), "Expected Material Design color picker in Normal Setup");
    assert.ok(themeText.includes("navigator.language"), "Expected OS/browser language auto-detection");
    assert.ok(themeText.includes("prefers-color-scheme"), "Expected OS/browser theme auto-detection");

    const cssText = await cssRes.text();
    assert.ok(cssText.includes('[data-theme="light"]'), "Expected Material Design light theme tokens in CSS");
    assert.ok(cssText.includes("--md-sys-color-primary"), "Expected Material Design 3 CSS variables");

    // S9: Client-only localStorage settings + Creator Token + dedicated /admin portal + Clone button
    assert.ok(html.includes('id="creatorTokenInput"'), "Expected Creator Token input in Normal Setup");
    assert.ok(!html.includes('id="adminKeyInput"'), "Normal Setup must NOT expose Admin Key input to regular users");
    assert.ok(html.includes('id="view-admin"'), "Expected dedicated /admin view in SPA");
    assert.ok(html.includes('id="adminPortalKeyInput"'), "Expected Admin Key input inside /admin portal");
    assert.ok(viewsText.includes('"/admin"'), "Expected /admin route handling in frontend");
    assert.ok(storageText.includes("localStorage"), "Expected AI & UI settings to be stored locally in browser localStorage");
    assert.ok(apiText.includes("X-Creator-Token"), "Expected X-Creator-Token header on requests");
    assert.ok(viewsText.includes("/clone"), "Expected game clone action in frontend");

    // S10: AI Setup model picker — list provider models instead of a blind text field
    assert.ok(html.includes('id="modelSelect"'), "Expected model <select> in AI Setup");
    assert.ok(html.includes('id="loadModelsBtn"'), "Expected Load models button in AI Setup");
    assert.ok(viewsText.includes("/api/models"), "Expected model listing endpoint usage in frontend");
    assert.ok(viewsText.includes("loadModelsForProvider"), "Expected model loading orchestration in frontend");
    assert.ok(settingsText.includes("__custom__"), "Expected manual model fallback option");

    // S13: export/import — public export, admin-only import, hardened game sandbox
    assert.ok(html.includes('id="importBtn"'), "Expected import button");
    assert.ok(html.includes('id="importFileInput"'), "Expected import file input");
    assert.ok(!html.includes("allow-same-origin"), "Game iframe must not share the app origin");
    assert.ok(viewsText.includes("/export"), "Expected export action in frontend");
    assert.ok(viewsText.includes("/api/games/import"), "Expected import endpoint usage");

    // Nothing here is a login: password managers must not offer to save the AI key.
    assert.match(html, /id="apiKeyInput"[\s\S]{0,200}autocomplete="new-password"/, "API key field must opt out of password saving");
    assert.match(html, /id="adminPortalKeyInput"[\s\S]{0,200}autocomplete="new-password"/, "Admin key field must opt out of password saving");

    // Card actions must share one geometry: a 2-column grid with the primary action full width.
    assert.match(cssText, /\.card-actions \{[^}]*grid-template-columns: repeat\(2,/, "Card actions must use an even grid");
    assert.match(cssText, /\.card-actions > \.btn-play \{[^}]*grid-column: 1 \/ -1/, "Play must span the full row");

    // Player view: title + description on top, actions below in an even grid.
    assert.ok(html.includes('id="playingDescription"'), "Player must show the game description");
    assert.match(cssText, /\.player-toolbar \{[^}]*flex-direction: column/, "Player header stacks above the actions");
    assert.match(cssText, /\.player-actions \{[^}]*grid-template-columns: repeat\(2,/, "Player actions use an even grid");

    // The game frame must never sit under the fixed bottom nav (taps went to the nav,
    // not the canvas). Measure the real toolbar height instead of a fixed dvh offset.
    assert.match(playerText, /function syncPlayerFrameHeight\(\)/, "Player frame height must be measured");
    assert.match(playerText, /els\.bottomNav\.getBoundingClientRect\(\)\.height/, "Frame fit must subtract the real nav height");
    assert.match(cssText, /\.iframe-container:fullscreen/, "Fullscreen must own the whole viewport");
    // A minimum height would push the frame back under the fixed nav on short screens.
    assert.match(cssText, /\.iframe-container \{[^}]*min-height: 0/, "Game frame must not enforce a minimum height");
    assert.match(navText, /body\.classList\.toggle\("is-playing"/, "Play view must expose the cramped-screen state");
    assert.match(cssText, /body\.is-playing \.app-header \{[^}]*display: none/, "Cramped play mode must let the header step aside");
    // Playing gets its own fixed layer, mirroring the layout fullscreen produces.
    assert.match(cssText, /body\.is-playing #view-play\.active \{[^}]*position: fixed/, "Play view must own a fixed layer");

    // S11: read-only prompt viewer — visible & copyable, never editable in place
    assert.ok(html.includes('id="savedPromptView"'), "Expected read-only saved prompt viewer");
    assert.match(html, /id="savedPromptView"[^>]*readonly/, "Saved prompt viewer must be readonly");
    assert.ok(html.includes('id="copySavedPromptBtn"'), "Expected copy prompt button");
    assert.ok(html.includes('id="reuseSavedPromptBtn"'), "Expected reuse-prompt-as-base button");
    assert.ok(viewsText.includes("copyPromptText"), "Expected clipboard helper with fallback");
    assert.ok(viewsText.includes("reusePromptAsBase"), "Expected reuse-as-base handler");
    assert.ok(!html.includes('id="revisionList"') || html.indexOf('id="promptHistoryBlock"') < html.indexOf('id="revisionList"'),
      "Prompt viewer and revision list must live in the always-visible block, not inside the advanced accordion");

    // Verify /admin route serves the SPA entrypoint
    const adminPageRes = await fetch(`${base}/admin`);
    assert.equal(adminPageRes.status, 200);
    const adminPageHtml = await adminPageRes.text();
    assert.ok(adminPageHtml.includes('id="view-admin"'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
