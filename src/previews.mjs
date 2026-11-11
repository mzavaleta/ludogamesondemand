// Preview (thumbnail) storage for the game library.
//
// A preview is an authored artifact: the owner or an admin captures the running
// game and the bytes land here, next to the SQLite database. No decoder lives on
// the server, so the image is validated by container magic bytes and stored as
// received; everything that needs pixels (cropping, resizing) happens in the
// browser before upload.

import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

/** 512 KB keeps a library of dozens of games in the low single-digit megabytes. */
export const PREVIEW_MAX_BYTES = 512 * 1024;

/** @type {Record<string, string>} */
const EXT_BY_TYPE = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" };
/** @type {Record<string, string>} */
const TYPE_BY_EXT = { webp: "image/webp", png: "image/png", jpg: "image/jpeg" };
const DATA_URL = /^data:(image\/(?:webp|png|jpeg));base64,([A-Za-z0-9+/=\s]+)$/;

/** @param {unknown} id @returns {boolean} */
function isSafeId(id) {
  return typeof id === "string" && /^[A-Za-z0-9._-]{1,80}$/.test(id) && !id.startsWith(".");
}

/** @param {Buffer} buffer @param {string} type @returns {boolean} */
function sniff(buffer, type) {
  if (buffer.length < 12) return false;
  if (type === "image/png") {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  if (type === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (type === "image/webp") {
    return (
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  return false;
}

/** @param {string} file @returns {void} */
function unlinkQuiet(file) {
  try {
    unlinkSync(file);
  } catch {
    /* already gone */
  }
}

/**
 * @param {string} dbPath
 * @returns {{
 *   save: (id: string, dataUrl: unknown) => { ok: true } | { ok: false, error: string },
 *   stat: (id: string) => { version: string, mtimeMs: number } | null,
 *   read: (id: string) => { body: Buffer, type: string, etag: string, version: string } | null,
 *   remove: (id: string) => void,
 *   dir: string,
 * }}
 */
export function createPreviewStore(dbPath = "./data/ludo.db") {
  const dir = join(dirname(dbPath), "previews");

  /** @param {string} id @param {string} ext @returns {string} */
  function pathFor(id, ext) {
    return join(dir, `${id}.${ext}`);
  }

  /** @param {string} id @param {unknown} dataUrl @returns {{ ok: true } | { ok: false, error: string }} */
  function save(id, dataUrl) {
    if (!isSafeId(id)) return { ok: false, error: "Invalid game id." };
    if (typeof dataUrl !== "string") {
      return { ok: false, error: "Preview must be a base64 image data URL." };
    }
    const match = DATA_URL.exec(dataUrl.trim());
    if (!match) {
      return { ok: false, error: "Preview must be a base64 WebP, PNG or JPEG image." };
    }
    const type = match[1];
    const body = Buffer.from(match[2], "base64");
    if (!body.length) return { ok: false, error: "Preview image is empty." };
    if (body.length > PREVIEW_MAX_BYTES) {
      return { ok: false, error: "Preview image is too large (max 512 KB)." };
    }
    if (!sniff(body, type)) {
      return { ok: false, error: "Preview image data does not match its declared type." };
    }

    const ext = EXT_BY_TYPE[type];
    mkdirSync(dir, { recursive: true });
    const tmp = join(dir, `.${id}.${randomUUID()}.tmp`);
    writeFileSync(tmp, body);
    // Drop any previous encoding so a game never keeps two previews.
    for (const other of Object.values(EXT_BY_TYPE)) {
      if (other !== ext) unlinkQuiet(pathFor(id, other));
    }
    renameSync(tmp, pathFor(id, ext));
    return { ok: true };
  }

  /** @param {string} id @returns {{ version: string, mtimeMs: number } | null} */
  function stat(id) {
    if (!isSafeId(id)) return null;
    for (const ext of Object.values(EXT_BY_TYPE)) {
      try {
        const info = statSync(pathFor(id, String(ext)));
        if (info.isFile()) {
          return { version: String(Math.round(info.mtimeMs)), mtimeMs: info.mtimeMs };
        }
      } catch {
        /* try the next encoding */
      }
    }
    return null;
  }

  /** @param {string} id @returns {{ body: Buffer, type: string, etag: string, version: string } | null} */
  function read(id) {
    if (!isSafeId(id)) return null;
    for (const [ext, type] of Object.entries(TYPE_BY_EXT)) {
      const file = pathFor(id, ext);
      try {
        const info = statSync(file);
        if (!info.isFile()) continue;
        return {
          body: readFileSync(file),
          type,
          etag: `"${Math.round(info.mtimeMs)}-${info.size}"`,
          version: String(Math.round(info.mtimeMs)),
        };
      } catch {
        /* try the next encoding */
      }
    }
    return null;
  }

  /** @param {string} id @returns {void} */
  function remove(id) {
    if (!isSafeId(id)) return;
    for (const ext of Object.values(EXT_BY_TYPE)) unlinkQuiet(pathFor(id, String(ext)));
  }

  return { save, stat, read, remove, dir };
}
