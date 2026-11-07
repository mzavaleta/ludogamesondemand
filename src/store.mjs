import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { buildDynamicTemplateGame } from "./prompt-engine.mjs";

/**
 * @typedef {Object} GameRow
 * @property {string} id
 * @property {string} title
 * @property {string} prompt
 * @property {string} html
 * @property {string} provider
 * @property {string} model
 * @property {string} owner_hash
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} RevisionRow
 * @property {string} id
 * @property {string} game_id
 * @property {string} prompt
 * @property {string} html
 * @property {string} created_at
 */

/**
 * @typedef {Object} AuthContext
 * @property {string} [viewerHash]
 * @property {boolean} [isAdmin]
 */

/**
 * @param {string} token
 * @returns {string}
 */
export function hashCreatorToken(token) {
  const clean = String(token || "").trim();
  if (!clean) return "";
  return createHash("sha256").update(`ludo-creator:${clean}`).digest("hex");
}

/**
 * @param {string} [dbPath]
 * @returns {{
 *   listGames: (auth?: AuthContext) => any[],
 *   getGame: (id: string, auth?: AuthContext) => any,
 *   canModifyGame: (id: string, auth?: AuthContext) => boolean,
 *   createGame: (input: any, auth?: AuthContext) => any,
 *   cloneGame: (sourceId: string, opts?: any, auth?: AuthContext) => any,
 *   updateGame: (id: string, input: any, auth?: AuthContext) => any,
 *   restoreRevision: (gameId: string, revisionId: string, auth?: AuthContext) => any,
 *   deleteGame: (id: string) => boolean,
 *   close: () => void,
 * }}
 */
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
    /** @type {any[]} */
    const starterRows = db
      .prepare(`SELECT id, title, prompt FROM games WHERE model = 'built-in-starter'`)
      .all();
    for (const row of starterRows) {
      const built = buildDynamicTemplateGame(row.prompt, row.title);
      db.prepare(`UPDATE games SET html = ? WHERE id = ?`).run(built.html, row.id);
    }
  }

  /** @param {string} gameId @returns {RevisionRow[]} */
  function getRevisions(gameId) {
    /** @type {any} */
    const rows = db
      .prepare(
        `SELECT id, game_id, prompt, html, created_at
         FROM revisions
         WHERE game_id = ?
         ORDER BY created_at DESC, rowid DESC`
      )
      .all(gameId);
    return rows;
  }

  /**
   * @param {GameRow | null} row
   * @param {{ viewerHash?: string, isAdmin?: boolean }} [auth]
   * @returns {any}
   */
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

  /** @param {string} id @param {AuthContext} [auth] @returns {any} */
  function getGame(id, auth = {}) {
    /** @type {any} */
    const row = db
      .prepare(
        `SELECT id, title, prompt, html, provider, model, owner_hash, created_at, updated_at
         FROM games WHERE id = ?`
      )
      .get(id);
    return formatGameRow(row, auth);
  }

  /** @param {string} id @param {AuthContext} [auth] @returns {boolean} */
  function canModifyGame(id, { viewerHash = "", isAdmin = false } = {}) {
    /** @type {any} */
    const row = db.prepare(`SELECT owner_hash FROM games WHERE id = ?`).get(id);
    if (!row) return false;
    if (isAdmin) return true;
    return Boolean(viewerHash && row.owner_hash && row.owner_hash === viewerHash);
  }

  /** @param {AuthContext} [auth] @returns {any[]} */
  function listGames(auth = {}) {
    /** @type {any[]} */
    const rows = db
      .prepare(
        `SELECT id, title, prompt, html, provider, model, owner_hash, created_at, updated_at
         FROM games
         ORDER BY updated_at DESC, rowid DESC`
      )
      .all();
    return rows.map((row) => formatGameRow(row, auth));
  }

  /**
   * @param {{ title: string, prompt: string, html: string, provider?: string, model?: string, ownerHash?: string }} input
   * @param {AuthContext} [auth]
   * @returns {any}
   */
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

  /**
   * @param {string} sourceId
   * @param {{ ownerHash?: string, newTitle?: string }} [opts]
   * @param {AuthContext} [auth]
   * @returns {any}
   */
  function cloneGame(sourceId, { ownerHash, newTitle } = {}, auth = {}) {
    /** @type {any} */
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

  /**
   * @param {string} id
   * @param {{ title?: string, prompt?: string, html?: string, provider?: string, model?: string }} input
   * @param {AuthContext} [auth]
   * @returns {any}
   */
  function updateGame(id, { title, prompt, html, provider, model }, auth = {}) {
    /** @type {any} */
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

  /** @param {string} gameId @param {string} revisionId @param {AuthContext} [auth] @returns {any} */
  function restoreRevision(gameId, revisionId, auth = {}) {
    /** @type {any} */
    const rev = db
      .prepare(`SELECT id, game_id, prompt, html FROM revisions WHERE id = ? AND game_id = ?`)
      .get(revisionId, gameId);
    if (!rev) return null;

    /** @type {any} */
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

  /** @param {string} id @returns {boolean} */
  function deleteGame(id) {
    const res = db.prepare(`DELETE FROM games WHERE id = ?`).run(id);
    return res.changes > 0;
  }

  /** @returns {void} */
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
