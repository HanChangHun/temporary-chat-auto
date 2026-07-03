(() => {
  "use strict";

  const enabled = document.querySelector("#enabled");
  const status = document.querySelector("#status");
  const applyNow = document.querySelector("#applyNow");
  const DEFAULT_MESSAGES = {
    extensionActionTitle: "Temporary Chat Auto",
    popupApplyButton: "Apply to current tab",
    popupAutoDescription: "Open new ChatGPT conversations in Temporary Chat and new Claude conversations in Incognito.",
    popupAutoTitle: "Auto Temporary Chat",
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
    chrome.storage.sync.get({ enabled: true }, (items) => {
      const value = chrome.runtime.lastError ? true : items.enabled;
      enabled.checked = Boolean(value);
    });
  };

  const saveOption = (event) => {
    const input = event.currentTarget;
    chrome.storage.sync.set({ enabled: input.checked }, () => {
      if (chrome.runtime.lastError) {
        enabled.checked = !input.checked;
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
    if (area === "sync" && changes.enabled) {
      enabled.checked = Boolean(changes.enabled.newValue);
      setStatus(t("statusSaved"));
    }
  });

  enabled.addEventListener("change", saveOption);
  applyNow.addEventListener("click", sendApplyMessage);
  applyMessages();
  loadOptions();
})();
