import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGameStore, hashCreatorToken } from "../src/store.mjs";

test("GameStore enforces creator ownership, clone, and never persists personal AI settings in DB", () => {
  const dir = mkdtempSync(join(tmpdir(), "ludo-store-"));
  try {
    const dbPath = join(dir, "test.db");
    const store = createGameStore(dbPath);

    // S9: Personal AI settings are NEVER stored in the backend SQLite database
    assert.equal(typeof store.saveSettings, "undefined");
    assert.equal(typeof store.getSettings, "undefined");

    const aliceHash = hashCreatorToken("alice-secret-token");
    const bobHash = hashCreatorToken("bob-secret-token");

    // S1: Seeded library has at least 1 playable starter game (owned by 'system')
    const initialGames = store.listGames({ viewerHash: aliceHash, isAdmin: false });
    assert.ok(initialGames.length >= 1, "Expected seeded starter games");
    assert.equal(initialGames[0].canEdit, false, "Regular user cannot edit system starter game");

    const adminList = store.listGames({ viewerHash: aliceHash, isAdmin: true });
    assert.equal(adminList[0].canEdit, true, "Admin can edit system starter game");

    // S2: Alice creates a new game
    const created = store.createGame({
      title: "Neon Dodge",
      prompt: "Create a neon dodging arcade game",
      html: "<!DOCTYPE html><html><body><canvas id='c'></canvas></body></html>",
      provider: "ollama",
      model: "qwen2.5-coder:7b",
      ownerHash: aliceHash,
    });
    assert.ok(created.id);
    assert.equal(created.title, "Neon Dodge");
    assert.equal(created.revisions.length, 1);
    assert.equal(store.canModifyGame(created.id, { viewerHash: aliceHash, isAdmin: false }), true);
    assert.equal(store.canModifyGame(created.id, { viewerHash: bobHash, isAdmin: false }), false);
    assert.equal(store.canModifyGame(created.id, { viewerHash: bobHash, isAdmin: true }), true);

    // S9: Bob clones Alice's game and becomes the owner of the cloned game
    const cloned = store.cloneGame(created.id, {
      ownerHash: bobHash,
      newTitle: "Neon Dodge (Bob Remix)",
    });
    assert.ok(cloned.id);
    assert.notEqual(cloned.id, created.id);
    assert.equal(cloned.title, "Neon Dodge (Bob Remix)");
    assert.equal(store.canModifyGame(cloned.id, { viewerHash: bobHash, isAdmin: false }), true);
    assert.equal(store.canModifyGame(cloned.id, { viewerHash: aliceHash, isAdmin: false }), false);

    // S3: Modify game (adds revision and updates current HTML/title)
    const modified = store.updateGame(created.id, {
      title: "Neon Dodge Turbo",
      prompt: "Make the player ship faster and add shields",
      html: "<!DOCTYPE html><html><body><canvas id='c' data-turbo='1'></canvas></body></html>",
    });
    assert.equal(modified.title, "Neon Dodge Turbo");
    assert.ok(modified.html.includes("data-turbo='1'"));
    assert.equal(modified.revisions.length, 2);

    // S3: Restore a previous revision
    const firstRevId = modified.revisions[modified.revisions.length - 1].id;
    const restored = store.restoreRevision(created.id, firstRevId);
    assert.ok(!restored.html.includes("data-turbo='1'"));

    // S4: Delete game
    const deleted = store.deleteGame(created.id);
    assert.equal(deleted, true);
    assert.equal(store.getGame(created.id), null);

    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
