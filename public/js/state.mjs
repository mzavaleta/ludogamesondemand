import { loadLocalBrowserState } from "./storage.mjs";

const initialLocal = loadLocalBrowserState();

export const state = {
  games: [],
  currentGame: null,
  settings: initialLocal.settings,
  creatorToken: initialLocal.creatorToken,
  adminKey: initialLocal.adminKey,
  isAdmin: false,
  presets: {},
  searchQuery: "",
};