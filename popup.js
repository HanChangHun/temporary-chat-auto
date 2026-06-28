(() => {
  "use strict";

  // NOTE: keep this in sync with DEFAULT_OPTIONS in content.js (the popup and
  // the content script do not share a module).
  const DEFAULT_OPTIONS = {
    enabled: true,
    redirectNewChats: true,
    patchNewChatLinks: true,
    clickVisibleToggle: true,
    debug: false
  };

  const enabled = document.querySelector("#enabled");
  const status = document.querySelector("#status");
  const applyNow = document.querySelector("#applyNow");

  const setStatus = (message) => {
    status.textContent = message;
  };

  const loadOptions = () => {
    chrome.storage.sync.get(DEFAULT_OPTIONS, (items) => {
      const values = chrome.runtime.lastError ? DEFAULT_OPTIONS : items;
      enabled.checked = Boolean(values.enabled);
    });
  };

  const saveOption = (event) => {
    const input = event.currentTarget;
    chrome.storage.sync.set({
      enabled: input.checked,
      redirectNewChats: true,
      patchNewChatLinks: true,
      clickVisibleToggle: true
    }, () => {
      if (chrome.runtime.lastError) {
        enabled.checked = !input.checked;
        setStatus("저장 실패");
        return;
      }

      setStatus("저장됨");
    });
  };

  const sendApplyMessage = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      setStatus("활성 탭 없음");
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: "TEMPORARY_CHAT_AUTO_APPLY" }, () => {
      if (chrome.runtime.lastError) {
        setStatus("ChatGPT 탭에서 사용 가능");
        return;
      }

      setStatus("적용됨");
    });
  };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.enabled) {
      enabled.checked = Boolean(changes.enabled.newValue);
      setStatus("저장됨");
    }
  });

  enabled.addEventListener("change", saveOption);
  applyNow.addEventListener("click", sendApplyMessage);
  loadOptions();
})();
