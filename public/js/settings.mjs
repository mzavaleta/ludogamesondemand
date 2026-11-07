import { state } from "./state.mjs";
import { t, applyThemeAndColors } from "./theme.mjs";
import { saveLocalBrowserSettings } from "./storage.mjs";
import { api } from "./api.mjs";

let els = null;

export function initSettings(elsRef) {
  els = elsRef;
}

export const CUSTOM_MODEL = "__custom__";

export function renderProviderBadge() {
  if (!state.settings || !els) return;
  const p = state.settings.provider || "ollama";
  const m = state.settings.model || "default";
  els.activeProviderBadge.textContent = `AI: ${p} (${m})`;
}

/** Reflects the current <select> choice into the model state and toggles manual entry. */
export function syncModelFields() {
  const isCustom = els.modelSelect.value === CUSTOM_MODEL;
  els.modelInput.classList.toggle("hidden", !isCustom);

  if (isCustom) {
    els.modelInput.value = state.settings.model || "";
    if (document.activeElement !== els.modelInput) els.modelInput.focus();
  } else if (els.modelSelect.value) {
    state.settings.model = els.modelSelect.value;
  }
}

/**
 * Rebuilds the model dropdown.
 */
export function renderModelOptions(models, currentModel, { authoritative = false } = {}) {
  const available = [...models].filter(Boolean);
  let selected = currentModel;
  let missing = null;

  if (authoritative) {
    if (selected && !available.includes(selected)) {
      missing = selected;
      selected = available[0] || "";
    }
  } else if (selected && !available.includes(selected)) {
    available.unshift(selected);
  }

  els.modelSelect.innerHTML = "";

  for (const id of available) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = id;
    els.modelSelect.appendChild(option);
  }

  const customOption = document.createElement("option");
  customOption.value = CUSTOM_MODEL;
  customOption.textContent = t("setup.customModelOption");
  els.modelSelect.appendChild(customOption);

  els.modelSelect.value = selected && available.includes(selected) ? selected : available[0] || CUSTOM_MODEL;
  els.modelInput.value = selected || available[0] || "";
  syncModelFields();

  return missing;
}

/** Reads the model currently chosen, whether from the dropdown or the manual field. */
export function getSelectedModel() {
  if (els.modelSelect.value === CUSTOM_MODEL) {
    return els.modelInput.value.trim();
  }
  return els.modelSelect.value.trim() || els.modelInput.value.trim() || state.settings.model || "";
}

// Hint under the model picker. Kept as a key + params so a language switch can re-render it.
let modelHintState = { key: "setup.modelHintAuto", vars: {}, suffix: "" };

export function setModelHint(key, vars = {}, suffix = "") {
  modelHintState = { key, vars, suffix };
  renderModelHint();
}

export function renderModelHint() {
  els.modelHint.textContent =
    t(modelHintState.key, modelHintState.vars) + (modelHintState.suffix ? ` (${modelHintState.suffix})` : "");
}