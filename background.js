// One-time migration: v0.1.6 and earlier stored a single "enabled" key that
// controlled every supported site. When upgrading from one of those versions,
// seed the Claude key from it so the upgrade preserves the user's explicit
// choice instead of re-enabling Claude automation. Never run for later
// versions, where "enabled" already means ChatGPT-only.
const SPLIT_VERSION = [0, 1, 7];

const isPreSplitVersion = (version) => {
  const parts = String(version || "").split(".").map(Number);

  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }

  for (let i = 0; i < 3; i += 1) {
    if (parts[i] !== SPLIT_VERSION[i]) {
      return parts[i] < SPLIT_VERSION[i];
    }
  }

  return false;
};

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== "update" || !isPreSplitVersion(details.previousVersion)) {
    return;
  }

  chrome.storage.sync.get(["enabled", "claudeEnabled"], (items) => {
    if (chrome.runtime.lastError) {
      return;
    }

    if (items.claudeEnabled === undefined && typeof items.enabled === "boolean") {
      chrome.storage.sync.set({ claudeEnabled: items.enabled });
    }
  });
});
