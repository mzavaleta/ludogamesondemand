#!/usr/bin/env node
// Uploads a single-file HTML5 game to a running Ludo Game-On-Demand instance.
// Used by the authoring loop: write the game locally, review it in the browser,
// then push the next version to the dev server so the review URL stays stable.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createHash, createHmac } from "node:crypto";

const USAGE = `Upload a game to a running Ludo instance.

Usage:
  node scripts/upload-game.mjs <game.html> [options]

Options:
  --id <gameId>      Replace an existing game in place (stable review URL).
                     Omit to create a new game.
  --title <title>    Game title. Defaults to the file's <title>, then the filename.
  --prompt <text>    Prompt/description stored with the game.
  --provider <name>  Provider label stored with the game.
  --model <name>     Model label stored with the game.
  --server <url>     Server base URL (default: $LUDO_SERVER or http://localhost:3000).
  --key <adminKey>   Admin passkey (default: $LUDO_ADMIN_KEY or ludo-admin).
  --export-key <k>   Sign the package with this HMAC key (default: $LUDO_EXPORT_KEY).
  --help             Show this help.

Examples:
  node scripts/upload-game.mjs drafts/neon-dodge.html
  node scripts/upload-game.mjs drafts/neon-dodge.html --id 6f1c... `;

const FLAGS = new Set([
  "id",
  "title",
  "prompt",
  "provider",
  "model",
  "server",
  "key",
  "export-key",
]);

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      out._.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (name === "help") {
      out.help = true;
      continue;
    }
    if (!FLAGS.has(name)) throw new Error(`Unknown option: --${name}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for --${name}`);
    }
    out[name] = value;
    i += 1;
  }
  return out;
}

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function deriveTitle(html, file) {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const fromHtml = match?.[1]?.trim();
  if (fromHtml) return fromHtml;
  return basename(file).replace(/\.[^.]+$/, "") || "Imported Game";
}

const args = (() => {
  try {
    return parseArgs(process.argv.slice(2));
  } catch (err) {
    fail(err.message);
  }
})();

if (args.help) {
  console.log(USAGE);
  process.exit(0);
}

const file = args._[0];
if (!file) {
  console.log(USAGE);
  process.exit(1);
}

let html;
try {
  html = readFileSync(file, "utf-8");
} catch (err) {
  fail(`Cannot read ${file}: ${err.message}`);
}

if (!html.trim()) fail(`${file} is empty.`);

const server = (args.server || process.env.LUDO_SERVER || "http://localhost:3000").replace(/\/+$/, "");
const adminKey = args.key || process.env.LUDO_ADMIN_KEY || "ludo-admin";
const exportKey = args["export-key"] || process.env.LUDO_EXPORT_KEY || "";
const sha256 = createHash("sha256").update(html).digest("hex");
const hmac = exportKey ? createHmac("sha256", exportKey).update(sha256).digest("hex") : "";

const game = {};
const title = args.title ?? deriveTitle(html, file);
if (title) game.title = title;
if (args.prompt) game.prompt = args.prompt;
if (args.provider) game.provider = args.provider;
if (args.model) game.model = args.model;

const envelope = {
  format: "ludogame",
  version: 1,
  exportedAt: new Date().toISOString(),
  game,
  html,
  sha256,
  hmac,
};
if (args.id) envelope.targetId = args.id;

let res;
try {
  res = await fetch(`${server}/api/games/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": adminKey,
    },
    body: JSON.stringify(envelope),
  });
} catch (err) {
  fail(`Cannot reach ${server}: ${err.message}. Is the dev server running?`);
}

const body = await res.json().catch(() => ({}));
if (!res.ok) {
  fail(`${res.status} ${body.error || "Import failed."}`);
}

const action = body.updated ? "updated" : "created";
console.log(`✔ ${action} ${body.game.id}`);
console.log(`  title:     ${body.game.title}`);
console.log(`  play:      ${server}/play/${body.game.id}`);
console.log(`  revisions: ${body.game.revisions?.length ?? 1}`);
if (!body.updated) {
  console.log(`\nNext upload: add --id ${body.game.id}`);
}
