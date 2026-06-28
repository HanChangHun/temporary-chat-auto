(() => {
  "use strict";

  const INLINE_TOGGLE_ID = "temporary-chat-auto-inline-toggle";
  const TEMPORARY_PARAM = "temporary-chat";
  // NOTE: keep this in sync with DEFAULT_OPTIONS in popup.js (the content
  // script and the popup do not share a module).
  const DEFAULT_OPTIONS = {
    enabled: true,
    redirectNewChats: true,
    patchNewChatLinks: true,
    clickVisibleToggle: true,
    debug: false
  };

  const NEW_CHAT_TEXT = [
    "new chat",
    "새 채팅",
    "새로운 채팅",
    "新建聊天",
    "新しいチャット"
  ];

  const TEMPORARY_CHAT_TEXT = [
    "temporary chat",
    "임시 채팅",
    "臨時聊天",
    "临时聊天",
    "一時チャット"
  ];

  // Leading-edge throttle for the heavy apply work; URL poll cadence for SPA
  // navigations that do not emit a navigation event.
  const APPLY_THROTTLE_MS = 250;
  const URL_POLL_INTERVAL_MS = 500;

  let options = { ...DEFAULT_OPTIONS };
  let lastHref = location.href;
  let lastApplyAt = 0;
  let inlineToggleSyncId = 0;
  let applyScheduled = false;
  let havePatchedAnchors = false;

  const log = (...args) => {
    if (options.debug) {
      console.debug("[Temporary Chat Auto]", ...args);
    }
  };

  const storageGet = (defaults) =>
    new Promise((resolve) => {
      if (!chrome?.storage?.sync) {
        resolve(defaults);
        return;
      }

      chrome.storage.sync.get(defaults, (items) => {
        resolve(chrome.runtime?.lastError ? defaults : items);
      });
    });

  // The popup only exposes the master `enabled` switch; the other three
  // behaviors are always-on internals. Force them true here so a stale `false`
  // left in storage by an older multi-toggle build can never silently disable
  // a behavior with no UI to turn it back on.
  const normalizeOptions = (items) => ({
    ...DEFAULT_OPTIONS,
    ...items,
    redirectNewChats: true,
    patchNewChatLinks: true,
    clickVisibleToggle: true
  });

  const refreshOptions = async () => {
    options = normalizeOptions(await storageGet(DEFAULT_OPTIONS));
    scheduleInlineToggleSync();
    return options;
  };

  const isSupportedOrigin = (url) =>
    url.origin === "https://chatgpt.com" || url.origin === "https://chat.openai.com";

  // Treat the param as present unless it is explicitly disabled, so a value
  // ChatGPT might normalize differently (e.g. "1", or a bare key) does not
  // trigger an endless re-redirect to "...=true".
  const hasTemporaryParam = (url) => {
    const value = url.searchParams.get(TEMPORARY_PARAM);
    return value !== null && value !== "false";
  };

  const isConversationOrUtilityPath = (pathname) => {
    const utilityPrefixes = [
      "/api",
      "/auth",
      "/backend-api",
      "/c/",
      "/gpts",
      "/logout",
      "/pricing",
      "/public-api",
      "/search",
      "/share/",
      "/signin",
      "/settings"
    ];

    if (utilityPrefixes.some((prefix) => pathname.startsWith(prefix))) {
      return true;
    }

    return /\/c\/[0-9a-f-]{8,}/i.test(pathname);
  };

  const isLikelyNewChatPath = (url) => {
    if (!isSupportedOrigin(url) || isConversationOrUtilityPath(url.pathname)) {
      return false;
    }

    return url.pathname === "/" || url.pathname === "" || /^\/g\/[^/]+\/?$/.test(url.pathname);
  };

  const withTemporaryParam = (href) => {
    try {
      const url = new URL(href, location.href);

      if (!isLikelyNewChatPath(url)) {
        return null;
      }

      url.searchParams.set(TEMPORARY_PARAM, "true");
      return url.href;
    } catch {
      return null;
    }
  };

  const containsAny = (value, needles) => {
    const normalized = value.replace(/\s+/g, " ").trim().toLowerCase();
    return needles.some((needle) => normalized.includes(needle));
  };

  const getElementText = (element) => {
    const parts = [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.textContent
    ];

    return parts.filter(Boolean).join(" ");
  };

  const isVisible = (element) => {
    if (!element || !(element instanceof Element)) {
      return false;
    }

    const rect = element.getBoundingClientRect();

    // Cheap geometry test first; only pay for getComputedStyle (forces a style
    // recalc) on elements that actually have a box.
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    const style = getComputedStyle(element);

    return (
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      Number(style.opacity || "1") > 0
    );
  };

  const installInlineToggleStyles = () => {
    if (document.querySelector(`#${INLINE_TOGGLE_ID}-styles`)) {
      return;
    }

    const style = document.createElement("style");
    style.id = `${INLINE_TOGGLE_ID}-styles`;
    style.textContent = `
      #${INLINE_TOGGLE_ID} {
        position: fixed;
        z-index: 2147483000;
        display: flex;
        align-items: center;
        gap: 6px;
        min-height: 28px;
        padding: 4px 6px 4px 10px;
        border: 1px solid rgba(15, 118, 110, 0.22);
        border-radius: 999px;
        color: #0f172a;
        background: rgba(255, 255, 255, 0.94);
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.16);
        font: 600 12px/1.2 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
        backdrop-filter: blur(12px);
      }

      #${INLINE_TOGGLE_ID}[hidden] {
        display: none;
      }

      #${INLINE_TOGGLE_ID} button {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        margin: 0;
        padding: 0;
        border: 0;
        color: inherit;
        background: transparent;
        font: 650 12px/1.2 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        cursor: pointer;
      }

      #${INLINE_TOGGLE_ID} .temporary-chat-auto-switch {
        position: relative;
        width: 32px;
        height: 18px;
        border-radius: 999px;
        background: #94a3b8;
        transition: background 120ms ease;
      }

      #${INLINE_TOGGLE_ID} .temporary-chat-auto-knob {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 14px;
        height: 14px;
        border-radius: 999px;
        background: #ffffff;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.35);
        transition: transform 120ms ease;
      }

      #${INLINE_TOGGLE_ID}.is-enabled .temporary-chat-auto-switch {
        background: #0f766e;
      }

      #${INLINE_TOGGLE_ID}.is-enabled .temporary-chat-auto-knob {
        transform: translateX(14px);
      }

      @media (prefers-color-scheme: dark) {
        #${INLINE_TOGGLE_ID} {
          border-color: rgba(45, 212, 191, 0.24);
          color: #f8fafc;
          background: rgba(24, 24, 27, 0.92);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        }
      }
    `;

    document.documentElement.append(style);
  };

  const createInlineToggle = () => {
    installInlineToggleStyles();

    let container = document.querySelector(`#${INLINE_TOGGLE_ID}`);

    if (container) {
      return container;
    }

    container = document.createElement("div");
    container.id = INLINE_TOGGLE_ID;
    container.innerHTML = `
      <button type="button" aria-label="Toggle automatic Temporary Chat" aria-pressed="true">
        <span>자동</span>
        <span class="temporary-chat-auto-switch" aria-hidden="true">
          <span class="temporary-chat-auto-knob"></span>
        </span>
      </button>
    `;

    container.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    });

    container.querySelector("button").addEventListener("click", () => {
      setEnabled(!options.enabled);
    });

    document.documentElement.append(container);
    return container;
  };

  const anchorMatchesTemporary = (element) =>
    !!element &&
    element.isConnected &&
    !element.closest(`#${INLINE_TOGGLE_ID}`) &&
    isVisible(element) &&
    containsAny(getElementText(element), TEMPORARY_CHAT_TEXT);

  let cachedAnchor = null;

  // Anchor the inline toggle to ChatGPT's own Temporary Chat control (the
  // dashed-bubble button in the top bar), not to the big centered heading.
  // That control is present on both the new-chat home and the temporary-chat
  // screen, and uses a stable spot, so the toggle stops jumping around.
  const findTemporaryChatAnchor = () => {
    if (anchorMatchesTemporary(cachedAnchor)) {
      return cachedAnchor;
    }

    const candidates = Array.from(
      document.querySelectorAll("button, [role='button'], [role='switch'], a[href]")
    ).filter(anchorMatchesTemporary);

    cachedAnchor =
      candidates
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .sort(
          (a, b) =>
            a.rect.top - b.rect.top ||
            a.rect.width * a.rect.height - b.rect.width * b.rect.height
        )[0]?.element || null;

    return cachedAnchor;
  };

  const syncInlineToggle = () => {
    const container = createInlineToggle();
    const button = container.querySelector("button");
    const anchor = findTemporaryChatAnchor();

    container.classList.toggle("is-enabled", options.enabled);
    button.setAttribute("aria-pressed", String(options.enabled));
    button.title = options.enabled ? "자동 임시 채팅 켜짐" : "자동 임시 채팅 꺼짐";

    const toggleWidth = container.offsetWidth || 74;
    const toggleHeight = container.offsetHeight || 28;

    if (!anchor) {
      // No ChatGPT control found. Still keep the toggle visible (top-right) on
      // new-chat screens so it never silently disappears; hide it elsewhere.
      let onNewChatPage = false;
      try {
        onNewChatPage = isLikelyNewChatPath(new URL(location.href));
      } catch {
        onNewChatPage = false;
      }

      if (!onNewChatPage) {
        container.hidden = true;
        return;
      }

      container.hidden = false;
      container.style.top = "12px";
      container.style.left = "";
      container.style.right = "72px";
      return;
    }

    container.hidden = false;
    const anchorRect = anchor.getBoundingClientRect();
    const gap = 10;

    // Sit just to the left of ChatGPT's Temporary Chat button; flip to its
    // right only when there is no room on the left.
    let left = anchorRect.left - toggleWidth - gap;
    if (left < 8) {
      left = Math.min(anchorRect.right + gap, window.innerWidth - toggleWidth - 8);
    }

    const top = Math.min(
      Math.max(8, anchorRect.top + (anchorRect.height - toggleHeight) / 2),
      window.innerHeight - toggleHeight - 8
    );

    container.style.top = `${Math.round(top)}px`;
    container.style.left = `${Math.round(left)}px`;
    container.style.right = "";
  };

  const scheduleInlineToggleSync = () => {
    if (inlineToggleSyncId) {
      return;
    }

    inlineToggleSyncId = window.requestAnimationFrame(() => {
      inlineToggleSyncId = 0;
      syncInlineToggle();
    });
  };

  const setEnabled = (enabled) => {
    const nextOptions = normalizeOptions({ ...options, enabled });
    options = nextOptions;
    scheduleInlineToggleSync();

    const afterSave = () => {
      if (chrome.runtime?.lastError) {
        log("Failed to save enabled state", chrome.runtime.lastError.message);
        options = normalizeOptions({ ...options, enabled: !enabled });
        scheduleInlineToggleSync();
        return;
      }

      if (enabled) {
        applyTemporaryChatMode("inline-toggle");
        return;
      }

      restorePatchedLinks();
    };

    if (!chrome.storage?.sync) {
      afterSave();
      return;
    }

    // Persist only the master switch. The other flags are always-on internals
    // (forced true in normalizeOptions), so writing them on every click would
    // only burn the storage.sync write quota and make rapid toggling fail.
    chrome.storage.sync.set({ enabled }, afterSave);
  };

  const getExplicitCheckedState = (element) => {
    const ariaChecked = element.getAttribute("aria-checked");
    const ariaPressed = element.getAttribute("aria-pressed");
    const dataState = element.getAttribute("data-state");

    if (ariaChecked === "true" || ariaPressed === "true" || dataState === "checked") {
      return true;
    }

    if (ariaChecked === "false" || ariaPressed === "false" || dataState === "unchecked") {
      return false;
    }

    if (element instanceof HTMLInputElement && element.type === "checkbox") {
      return element.checked;
    }

    return null;
  };

  const dispatchTrustedLikeClick = (element) => {
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1 }));
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    element.click();
  };

  const findVisibleTemporaryToggle = () => {
    const controls = Array.from(
      document.querySelectorAll(
        [
          "button",
          "input[type='checkbox']",
          "[role='checkbox']",
          "[role='menuitemcheckbox']",
          "[role='switch']"
        ].join(",")
      )
    );

    for (const control of controls) {
      // Never treat our own inline toggle as a ChatGPT control to click.
      if (control.closest(`#${INLINE_TOGGLE_ID}`)) {
        continue;
      }

      if (!isVisible(control)) {
        continue;
      }

      const label = [
        getElementText(control),
        control.closest("label")?.textContent,
        control.closest("[role='menuitem'], [role='menuitemcheckbox']")?.textContent
      ]
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      // A real toggle's label is short; a long string means we matched a big
      // container's text and would click the wrong control.
      if (label.length > 80 || !containsAny(label, TEMPORARY_CHAT_TEXT)) {
        continue;
      }

      if (getExplicitCheckedState(control) === false) {
        return control;
      }
    }

    return null;
  };

  const clickTemporaryToggleIfClearlyOff = () => {
    if (!options.clickVisibleToggle) {
      return false;
    }

    const toggle = findVisibleTemporaryToggle();

    if (!toggle) {
      return false;
    }

    log("Clicking visible temporary chat toggle");
    dispatchTrustedLikeClick(toggle);
    return true;
  };

  const patchAnchor = (anchor) => {
    const temporaryHref = withTemporaryParam(anchor.href);

    if (!temporaryHref || anchor.href === temporaryHref) {
      return false;
    }

    if (!anchor.dataset.temporaryChatAutoOriginalHref) {
      anchor.dataset.temporaryChatAutoOriginalHref = anchor.getAttribute("href") || anchor.href;
    }

    anchor.href = temporaryHref;
    havePatchedAnchors = true;
    return true;
  };

  const restorePatchedLinks = () => {
    // Nothing patched yet (e.g. extension started disabled): avoid a pointless
    // full-document query on every mutation while disabled.
    if (!havePatchedAnchors) {
      return;
    }

    for (const anchor of document.querySelectorAll("a[data-temporary-chat-auto-original-href]")) {
      anchor.setAttribute("href", anchor.dataset.temporaryChatAutoOriginalHref);
      delete anchor.dataset.temporaryChatAutoOriginalHref;
    }

    havePatchedAnchors = false;
  };

  const patchNewChatLinks = () => {
    if (!options.patchNewChatLinks) {
      return 0;
    }

    let patched = 0;

    for (const anchor of document.querySelectorAll("a[href]")) {
      const href = anchor.getAttribute("href") || "";

      // Sidebar conversation links are the bulk of anchors on the page and can
      // never be a new chat; skip them before the costly text read.
      if (href.startsWith("/c/")) {
        continue;
      }

      const looksLikeRootNewChat =
        href === "/" ||
        href.startsWith("/?") ||
        href.startsWith("https://chatgpt.com/?") ||
        href.startsWith("https://chat.openai.com/?");

      // Short-circuit: only read aria-label/title/textContent when the cheap
      // href shape did not already identify a root new-chat link.
      if ((looksLikeRootNewChat || containsAny(getElementText(anchor), NEW_CHAT_TEXT)) && patchAnchor(anchor)) {
        patched += 1;
      }
    }

    if (patched) {
      log("Patched new chat links", patched);
    }

    return patched;
  };

  const shouldIgnoreModifiedClick = (event) =>
    event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

  const navigateToTemporaryChat = () => {
    const temporaryHref = withTemporaryParam(location.origin + "/");

    if (temporaryHref) {
      location.assign(temporaryHref);
    }
  };

  const onCapturedClick = (event) => {
    if (!options.enabled) {
      return;
    }

    const anchor = event.target.closest?.("a[href]");

    if (anchor && options.patchNewChatLinks) {
      const patched = patchAnchor(anchor);

      if (patched && !shouldIgnoreModifiedClick(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        location.assign(anchor.href);
      }

      return;
    }

    const button = event.target.closest?.("button, [role='button']");

    if (!button || shouldIgnoreModifiedClick(event)) {
      return;
    }

    if (containsAny(getElementText(button), NEW_CHAT_TEXT)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      navigateToTemporaryChat();
    }
  };

  const applyTemporaryChatMode = (reason = "apply") => {
    scheduleInlineToggleSync();

    if (!options.enabled) {
      restorePatchedLinks();
      return;
    }

    const now = Date.now();

    if (now - lastApplyAt < APPLY_THROTTLE_MS) {
      return;
    }

    lastApplyAt = now;
    patchNewChatLinks();

    try {
      const currentUrl = new URL(location.href);
      const temporaryHref = withTemporaryParam(currentUrl.href);

      if (
        options.redirectNewChats &&
        temporaryHref &&
        temporaryHref !== currentUrl.href &&
        isLikelyNewChatPath(currentUrl) &&
        !hasTemporaryParam(currentUrl)
      ) {
        log("Redirecting to temporary chat URL", reason, temporaryHref);
        location.replace(temporaryHref);
        return;
      }
    } catch {
      return;
    }

    clickTemporaryToggleIfClearlyOff();
  };

  const watchLocationChanges = () => {
    window.setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        applyTemporaryChatMode("url-change");
      }
    }, URL_POLL_INTERVAL_MS);
  };

  // ChatGPT mutates the DOM constantly while a response streams. Coalesce a
  // burst of mutations into a single apply per animation frame so the throttled
  // heavy work and the layout-reading toggle sync are not re-run dozens of
  // times per second.
  const scheduleApply = (reason) => {
    if (applyScheduled) {
      return;
    }

    applyScheduled = true;
    window.requestAnimationFrame(() => {
      applyScheduled = false;
      applyTemporaryChatMode(reason);
    });
  };

  const watchDomChanges = () => {
    const observer = new MutationObserver(() => {
      scheduleApply("dom-change");
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  };

  const installMessageHandler = () => {
    chrome.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
      if (message?.type !== "TEMPORARY_CHAT_AUTO_APPLY") {
        return false;
      }

      refreshOptions().then(() => applyTemporaryChatMode("popup"));
      sendResponse({ ok: true });
      return false;
    });
  };

  const installStorageHandler = () => {
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area !== "sync") {
        return;
      }

      let changed = false;

      for (const key of Object.keys(DEFAULT_OPTIONS)) {
        if (changes[key]) {
          options[key] = changes[key].newValue;
          changed = true;
        }
      }

      if (changed) {
        if (!options.enabled) {
          restorePatchedLinks();
          scheduleInlineToggleSync();
          return;
        }

        options = normalizeOptions(options);
        scheduleInlineToggleSync();
        applyTemporaryChatMode("settings-change");
      }
    });
  };

  const init = async () => {
    options = normalizeOptions(await storageGet(DEFAULT_OPTIONS));

    document.addEventListener("click", onCapturedClick, true);
    window.addEventListener("resize", scheduleInlineToggleSync);
    window.addEventListener("scroll", scheduleInlineToggleSync, true);
    installMessageHandler();
    installStorageHandler();
    watchLocationChanges();
    watchDomChanges();
    applyTemporaryChatMode("init");
  };

  init().catch((error) => {
    console.warn("[Temporary Chat Auto] Failed to initialize", error);
  });
})();
