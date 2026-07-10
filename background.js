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

const migrateLegacyEnabledKey = (details) => {
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
};

// Manifest content scripts are not injected into tabs that are already open
// when the extension is installed, updated, or reloaded. An update also
// orphans the previous script's world — its chrome.* APIs die while its DOM
// listeners keep running until it notices and stands down (see the orphan
// check in content.js). Re-run the content script in open ChatGPT/Claude tabs
// so the automation and the on-page toggle keep working without a manual
// refresh; content.js guards against running twice in the same world.
const reinjectContentScripts = () => {
  const urls = ["https://chatgpt.com/*", "https://chat.openai.com/*", "https://claude.ai/*"];

  chrome.tabs.query({ url: urls }, (tabs) => {
    if (chrome.runtime.lastError) {
      return;
    }

    for (const tab of tabs || []) {
      if (tab.id === undefined) {
        continue;
      }

      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, files: ["content.js"] },
        () => void chrome.runtime.lastError
      );
    }
  });
};

chrome.runtime.onInstalled.addListener((details) => {
  migrateLegacyEnabledKey(details);
  reinjectContentScripts();
});
