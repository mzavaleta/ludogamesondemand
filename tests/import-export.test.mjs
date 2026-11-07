import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer } from "../src/server.mjs";
import { hashCreatorToken } from "../src/store.mjs";

const ADMIN = "test-admin-key";
const EXPORT_KEY = "test-export-secret";

test("export produces a verifiable package and only an admin can import it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ludo-io-"));
  const dbPath = join(dir, "io.db");

  const { server, store } = createAppServer({ dbPath, adminKey: ADMIN, exportKey: EXPORT_KEY });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const adminHeaders = {
    "Content-Type": "application/json",
    "X-Creator-Token": "admin-browser",
    "X-Admin-Key": ADMIN,
  };
  const userHeaders = { "Content-Type": "application/json", "X-Creator-Token": "user-browser" };

  const html = '<!DOCTYPE html><html><body><canvas id="g"></canvas><script>1+1</script></body></html>';

  try {
    // 1. Raw-HTML creation is admin-only (option B)
    const denied = await fetch(`${base}/api/games`, {
      method: "POST",
      headers: userHeaders,
      body: JSON.stringify({ title: "Nope", html }),
    });
    assert.equal(denied.status, 403);

    const created = await fetch(`${base}/api/games`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ title: "Exportable Game", prompt: "make it", html }),
    });
    assert.equal(created.status, 201);
    const { game } = await created.json();

    // 2. Export is public and returns a downloadable envelope with matching sha256
    const exportRes = await fetch(`${base}/api/games/${game.id}/export`);
    assert.equal(exportRes.status, 200);
    assert.match(exportRes.headers.get("content-disposition") || "", /ludogame\.json/);
    const envelope = await exportRes.json();
    assert.equal(envelope.format, "ludogame");
    assert.equal(envelope.version, 1);
    assert.equal(envelope.html, html);
    assert.equal(envelope.sha256.length, 64);
    assert.equal(envelope.hmac.length, 64, "Signature must be present when LUDO_EXPORT_KEY is set");

    // 3. Import requires admin
    const importDenied = await fetch(`${base}/api/games/import`, {
      method: "POST",
      headers: userHeaders,
      body: JSON.stringify(envelope),
    });
    assert.equal(importDenied.status, 403);

    // 4. Admin import succeeds and the copy belongs to the importer
    const imported = await fetch(`${base}/api/games/import`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify(envelope),
    });
    assert.equal(imported.status, 201);
    const importedBody = await imported.json();
    assert.notEqual(importedBody.game.id, game.id);
    assert.equal(importedBody.game.html, html);
    assert.equal(importedBody.game.canEdit, true);
    assert.equal(importedBody.signed, true);

    // 5. Tampered HTML is rejected by the integrity check
    const tampered = { ...envelope, html: html.replace("1+1", "1+2") };
    const tamperedRes = await fetch(`${base}/api/games/import`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify(tampered),
    });
    assert.equal(tamperedRes.status, 400);
    assert.match((await tamperedRes.json()).error, /sha256/i);

    // 6. A valid checksum with a forged signature is rejected
    const forged = { ...envelope, hmac: "0".repeat(64) };
    const forgedRes = await fetch(`${base}/api/games/import`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify(forged),
    });
    assert.equal(forgedRes.status, 400);
    assert.match((await forgedRes.json()).error, /signature/i);

    // 7. An unsigned package is rejected when the server requires signatures
    const unsigned = { ...envelope, hmac: "" };
    const unsignedRes = await fetch(`${base}/api/games/import`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify(unsigned),
    });
    assert.equal(unsignedRes.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("importing with targetId replaces a game in place and keeps its history", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ludo-upsert-"));
  const dbPath = join(dir, "upsert.db");
  const { server, store } = createAppServer({ dbPath, adminKey: ADMIN, exportKey: EXPORT_KEY });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const authorHeaders = {
    "Content-Type": "application/json",
    "X-Creator-Token": "game-author",
    "X-Admin-Key": ADMIN,
  };
  const otherAdminHeaders = {
    "Content-Type": "application/json",
    "X-Creator-Token": "other-admin",
    "X-Admin-Key": ADMIN,
  };

  const htmlV1 = '<!DOCTYPE html><html><body><canvas id="v1"></canvas></body></html>';
  const htmlV2 = '<!DOCTYPE html><html><body><canvas id="v2"></canvas></body></html>';

  try {
    const createdRes = await fetch(`${base}/api/games`, {
      method: "POST",
      headers: authorHeaders,
      body: JSON.stringify({ title: "Loop Game", prompt: "v1", html: htmlV1 }),
    });
    assert.equal(createdRes.status, 201);
    const { game } = await createdRes.json();

    // A second game stands in for "the next version" produced outside the app.
    const donorRes = await fetch(`${base}/api/games`, {
      method: "POST",
      headers: authorHeaders,
      body: JSON.stringify({ title: "Donor", prompt: "v2", html: htmlV2 }),
    });
    const donor = (await donorRes.json()).game;
    const envelope = await (await fetch(`${base}/api/games/${donor.id}/export`)).json();

    // 1. Importing against targetId updates the game instead of creating a copy.
    const upsertRes = await fetch(`${base}/api/games/import`, {
      method: "POST",
      headers: otherAdminHeaders,
      body: JSON.stringify({ ...envelope, targetId: game.id }),
    });
    assert.equal(upsertRes.status, 200);
    const upserted = await upsertRes.json();
    assert.equal(upserted.updated, true);
    assert.equal(upserted.game.id, game.id);
    assert.equal(upserted.game.html, htmlV2);
    assert.equal(upserted.game.title, "Donor");
    assert.equal(upserted.game.revisions.length, 2, "an upload must append one revision");
    assert.equal(upserted.game.isOwner, false, "the owner must not be rebound to the importer");

    // 2. The original creator keeps ownership.
    const originalView = store.getGame(game.id, { viewerHash: hashCreatorToken("game-author") });
    assert.equal(originalView.isOwner, true);

    // 3. An unknown target is rejected instead of silently creating a copy.
    const missingRes = await fetch(`${base}/api/games/import`, {
      method: "POST",
      headers: otherAdminHeaders,
      body: JSON.stringify({ ...envelope, targetId: "does-not-exist" }),
    });
    assert.equal(missingRes.status, 404);

    // 4. Without targetId the original create behaviour is unchanged.
    const plainRes = await fetch(`${base}/api/games/import`, {
      method: "POST",
      headers: otherAdminHeaders,
      body: JSON.stringify(envelope),
    });
    assert.equal(plainRes.status, 201);
    assert.notEqual((await plainRes.json()).game.id, game.id);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("game iframe responses are locked down with a no-network CSP", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ludo-csp-"));
  const dbPath = join(dir, "csp.db");
  const { server, store } = createAppServer({ dbPath, adminKey: ADMIN });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    const list = await (await fetch(`${base}/api/games`)).json();
    const res = await fetch(`${base}/play/${list.games[0].id}`);
    assert.equal(res.status, 200);
    const csp = res.headers.get("content-security-policy") || "";
    assert.match(csp, /connect-src 'none'/, "Games must not be able to make network requests");
    assert.match(csp, /form-action 'none'/);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
