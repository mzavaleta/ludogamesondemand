import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { buildDynamicTemplateGame } from "./prompt-engine.mjs";

export function hashCreatorToken(token) {
  const clean = String(token || "").trim();
  if (!clean) return "";
  return createHash("sha256").update(`ludo-creator:${clean}`).digest("hex");
}

export function createGameStore(dbPath = "./data/ludo.db") {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      html TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'template',
      model TEXT NOT NULL DEFAULT 'built-in',
      owner_hash TEXT NOT NULL DEFAULT 'system',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS revisions (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      html TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
    );

    -- Drop legacy shared settings table so personal AI credentials never live in SQLite
    DROP TABLE IF EXISTS settings;
  `);

  // Ensure owner_hash column exists on pre-existing databases created before T6
  const cols = db.prepare("PRAGMA table_info(games)").all();
  const hasOwnerHash = cols.some((c) => c.name === "owner_hash");
  if (!hasOwnerHash) {
    db.exec(`ALTER TABLE games ADD COLUMN owner_hash TEXT NOT NULL DEFAULT 'system';`);
  }

  // Seed starter games if the library is completely empty
  const countRow = db.prepare("SELECT COUNT(*) as count FROM games").get();
  if (!countRow || countRow.count === 0) {
    const now = new Date().toISOString();
    const starters = [
      {
        title: "Ludo Blitz Royal",
        prompt: "Classic 4-player Ludo board game with dice roll, token captures, and AI opponents",
      },
      {
        title: "Neon Star Dodger",
        prompt: "Cyberpunk neon space arcade dodger with pulse blaster and falling hazards",
      },
      {
        title: "Neon Memory Match",
        prompt: "4x4 arcade icon memory card matching puzzle game",
      },
    ];

    for (const starter of starters) {
      const built = buildDynamicTemplateGame(starter.prompt, starter.title);
      const id = randomUUID();
      db.prepare(
        `INSERT INTO games (id, title, prompt, html, provider, model, owner_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'template', 'built-in-starter', 'system', ?, ?)`
      ).run(id, built.title, starter.prompt, built.html, now, now);

      db.prepare(
        `INSERT INTO revisions (id, game_id, prompt, html, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(randomUUID(), id, starter.prompt, built.html, now);
    }
  } else {
    // Refresh unmodified built-in starter games so template engine fixes apply to existing DBs
    const starterRows = db
      .prepare(`SELECT id, title, prompt FROM games WHERE model = 'built-in-starter'`)
      .all();
    for (const row of starterRows) {
      const built = buildDynamicTemplateGame(row.prompt, row.title);
      db.prepare(`UPDATE games SET html = ? WHERE id = ?`).run(built.html, row.id);
    }
  }

  function getRevisions(gameId) {
    return db
      .prepare(
        `SELECT id, game_id, prompt, html, created_at
         FROM revisions
         WHERE game_id = ?
         ORDER BY created_at DESC, rowid DESC`
      )
      .all(gameId);
  }

  function formatGameRow(row, { viewerHash = "", isAdmin = false } = {}) {
    if (!row) return null;
    const isOwner = Boolean(viewerHash && row.owner_hash && row.owner_hash === viewerHash);
    const canEdit = Boolean(isAdmin || isOwner);
    const { owner_hash, ...safeFields } = row;
    return {
      ...safeFields,
      isOwner,
      canEdit,
      revisions: getRevisions(row.id),
    };
  }

  function getGame(id, auth = {}) {
    const row = db
      .prepare(
        `SELECT id, title, prompt, html, provider, model, owner_hash, created_at, updated_at
         FROM games WHERE id = ?`
      )
      .get(id);
    return formatGameRow(row, auth);
  }

  function canModifyGame(id, { viewerHash = "", isAdmin = false } = {}) {
    const row = db.prepare(`SELECT owner_hash FROM games WHERE id = ?`).get(id);
    if (!row) return false;
    if (isAdmin) return true;
    return Boolean(viewerHash && row.owner_hash && row.owner_hash === viewerHash);
  }

  function listGames(auth = {}) {
    const rows = db
      .prepare(
        `SELECT id, title, prompt, html, provider, model, owner_hash, created_at, updated_at
         FROM games
         ORDER BY updated_at DESC, rowid DESC`
      )
      .all();
    return rows.map((row) => formatGameRow(row, auth));
  }

  function createGame(
    {
      title,
      prompt,
      html,
      provider = "ollama",
      model = "qwen2.5-coder:7b",
      ownerHash = "system",
    },
    auth = {}
  ) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const effectiveOwner = ownerHash || "system";
    db.prepare(
      `INSERT INTO games (id, title, prompt, html, provider, model, owner_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, title, prompt, html, provider, model, effectiveOwner, now, now);

    db.prepare(
      `INSERT INTO revisions (id, game_id, prompt, html, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(randomUUID(), id, prompt, html, now);

    return getGame(id, {
      viewerHash: auth.viewerHash || effectiveOwner,
      isAdmin: auth.isAdmin || false,
    });
  }

  function cloneGame(sourceId, { ownerHash, newTitle } = {}, auth = {}) {
    const source = db
      .prepare(
        `SELECT id, title, prompt, html, provider, model FROM games WHERE id = ?`
      )
      .get(sourceId);
    if (!source) return null;

    const clonedTitle = (newTitle && newTitle.trim()) || `${source.title} (Remix)`;
    return createGame(
      {
        title: clonedTitle,
        prompt: source.prompt,
        html: source.html,
        provider: source.provider,
        model: source.model,
        ownerHash: ownerHash || "system",
      },
      {
        viewerHash: auth.viewerHash || ownerHash,
        isAdmin: auth.isAdmin || false,
      }
    );
  }

  function updateGame(id, { title, prompt, html, provider, model }, auth = {}) {
    const current = db
      .prepare(
        `SELECT id, title, prompt, html, provider, model, owner_hash FROM games WHERE id = ?`
      )
      .get(id);
    if (!current) return null;

    const nextTitle = title !== undefined ? title : current.title;
    const nextPrompt = prompt !== undefined ? prompt : current.prompt;
    const nextHtml = html !== undefined ? html : current.html;
    const nextProvider = provider !== undefined ? provider : current.provider;
    const nextModel = model !== undefined ? model : current.model;
    const now = new Date().toISOString();

    db.prepare(
      `UPDATE games
       SET title = ?, prompt = ?, html = ?, provider = ?, model = ?, updated_at = ?
       WHERE id = ?`
    ).run(nextTitle, nextPrompt, nextHtml, nextProvider, nextModel, now, id);

    if (html !== undefined && html !== current.html) {
      db.prepare(
        `INSERT INTO revisions (id, game_id, prompt, html, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(randomUUID(), id, nextPrompt, nextHtml, now);
    }

    return getGame(id, {
      viewerHash: auth.viewerHash || current.owner_hash,
      isAdmin: auth.isAdmin || false,
    });
  }

  function restoreRevision(gameId, revisionId, auth = {}) {
    const rev = db
      .prepare(`SELECT id, game_id, prompt, html FROM revisions WHERE id = ? AND game_id = ?`)
      .get(revisionId, gameId);
    if (!rev) return null;

    const current = db.prepare(`SELECT owner_hash FROM games WHERE id = ?`).get(gameId);
    const now = new Date().toISOString();
    db.prepare(`UPDATE games SET prompt = ?, html = ?, updated_at = ? WHERE id = ?`).run(
      rev.prompt,
      rev.html,
      now,
      gameId
    );
    return getGame(gameId, {
      viewerHash: auth.viewerHash || current?.owner_hash,
      isAdmin: auth.isAdmin || false,
    });
  }

  function deleteGame(id) {
    const res = db.prepare(`DELETE FROM games WHERE id = ?`).run(id);
    return res.changes > 0;
  }

  function close() {
    db.close();
  }

  return {
    listGames,
    getGame,
    canModifyGame,
    createGame,
    cloneGame,
    updateGame,
    restoreRevision,
    deleteGame,
    close,
  };
}
