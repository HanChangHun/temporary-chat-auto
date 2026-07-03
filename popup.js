(() => {
  "use strict";

  const status = document.querySelector("#status");
  const applyNow = document.querySelector("#applyNow");
  // Checkbox element id -> storage key. ChatGPT keeps the legacy "enabled"
  // key so existing installs preserve their preference.
  const TOGGLES = [
    { input: document.querySelector("#chatgptEnabled"), key: "enabled" },
    { input: document.querySelector("#claudeEnabled"), key: "claudeEnabled" }
  ];
  const DEFAULT_MESSAGES = {
    extensionActionTitle: "Temporary Chat Auto",
    popupApplyButton: "Apply to current tab",
    popupChatgptToggleDescription: "Open new ChatGPT conversations in Temporary Chat.",
    popupChatgptToggleTitle: "ChatGPT · Temporary Chat",
    popupClaudeToggleDescription: "Open new Claude conversations in Incognito.",
    popupClaudeToggleTitle: "Claude · Incognito",
    popupSupportLink: "Support development",
    statusApplied: "Applied",
    statusNoActiveTab: "No active tab",
    statusOpenChatGptTab: "Open a ChatGPT or Claude tab",
    statusReady: "Ready",
    statusSaveFailed: "Save failed",
    statusSaved: "Saved"
  };

  const t = (key) => {
    try {
      return chrome.i18n?.getMessage(key) || DEFAULT_MESSAGES[key] || "";
    } catch {
      return DEFAULT_MESSAGES[key] || "";
    }
  };

  const applyMessages = () => {
    const language = chrome.i18n?.getUILanguage?.() || "en";
    document.documentElement.lang = language.split("-")[0] || "en";
    document.title = t("extensionActionTitle");

    for (const element of document.querySelectorAll("[data-i18n]")) {
      element.textContent = t(element.dataset.i18n);
    }
  };

  const setStatus = (message) => {
    status.textContent = message;
  };

  const loadOptions = () => {
    chrome.storage.sync.get({ enabled: true, claudeEnabled: true }, (items) => {
      for (const toggle of TOGGLES) {
        toggle.input.checked = Boolean(chrome.runtime.lastError ? true : items[toggle.key]);
      }
    });
  };

  const saveOption = (toggle) => {
    chrome.storage.sync.set({ [toggle.key]: toggle.input.checked }, () => {
      if (chrome.runtime.lastError) {
        toggle.input.checked = !toggle.input.checked;
        setStatus(t("statusSaveFailed"));
        return;
      }

      setStatus(t("statusSaved"));
    });
  };

  const sendApplyMessage = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      setStatus(t("statusNoActiveTab"));
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: "TEMPORARY_CHAT_AUTO_APPLY" }, () => {
      if (chrome.runtime.lastError) {
        setStatus(t("statusOpenChatGptTab"));
        return;
      }

      setStatus(t("statusApplied"));
    });
  };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") {
      return;
    }

    for (const toggle of TOGGLES) {
      if (changes[toggle.key]) {
        toggle.input.checked = Boolean(changes[toggle.key].newValue);
        setStatus(t("statusSaved"));
      }
    }
  });

  for (const toggle of TOGGLES) {
    toggle.input.addEventListener("change", () => saveOption(toggle));
  }
  applyNow.addEventListener("click", sendApplyMessage);
  applyMessages();
  loadOptions();
})();
