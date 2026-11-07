export const STORAGE_KEYS = {
  UI: "ludo_ui_settings_v1",
  AI: "ludo_ai_settings_v1",
  CREATOR_TOKEN: "ludo_creator_token_v1",
  ADMIN_KEY: "ludo_admin_key_v1",
};

export function generateRandomCreatorToken() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return `creator-${globalThis.crypto.randomUUID()}`;
  }
  return `creator-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function loadLocalBrowserState() {
  let ui = {};
  let ai = {};
  let creatorToken = "";
  let adminKey = "";
  try {
    ui = JSON.parse(localStorage.getItem(STORAGE_KEYS.UI) || "{}");
    ai = JSON.parse(localStorage.getItem(STORAGE_KEYS.AI) || "{}");
    creatorToken = localStorage.getItem(STORAGE_KEYS.CREATOR_TOKEN) || "";
    adminKey = localStorage.getItem(STORAGE_KEYS.ADMIN_KEY) || "";
  } catch {
    // Ignore storage read errors in restricted environments
  }
  if (!creatorToken) {
    creatorToken = generateRandomCreatorToken();
    try {
      localStorage.setItem(STORAGE_KEYS.CREATOR_TOKEN, creatorToken);
    } catch {}
  }

  return {
    settings: {
      provider: ai.provider || "ollama",
      baseUrl: ai.baseUrl !== undefined ? ai.baseUrl : "http://localhost:11434/v1",
      model: ai.model || "qwen2.5-coder:7b",
      apiKey: ai.apiKey || "",
      fallbackToTemplate: ai.fallbackToTemplate !== false,
      language: ui.language || "auto",
      theme: ui.theme || "auto",
      accentColor: ui.accentColor || "#00c896",
    },
    creatorToken,
    adminKey,
  };
}

export function saveLocalBrowserSettings(state) {
  try {
    localStorage.setItem(
      STORAGE_KEYS.UI,
      JSON.stringify({
        language: state.settings.language,
        theme: state.settings.theme,
        accentColor: state.settings.accentColor,
      })
    );
    localStorage.setItem(
      STORAGE_KEYS.AI,
      JSON.stringify({
        provider: state.settings.provider,
        baseUrl: state.settings.baseUrl,
        model: state.settings.model,
        apiKey: state.settings.apiKey,
        fallbackToTemplate: state.settings.fallbackToTemplate,
      })
    );
    localStorage.setItem(STORAGE_KEYS.CREATOR_TOKEN, state.creatorToken);
    localStorage.setItem(STORAGE_KEYS.ADMIN_KEY, state.adminKey);
  } catch {
    // Ignore quota errors
  }
}