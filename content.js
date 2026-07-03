(() => {
  "use strict";

  const INLINE_TOGGLE_ID = "temporary-chat-auto-inline-toggle";
  const DEFAULT_OPTIONS = {
    enabled: true,
    debug: false
  };
  const DEFAULT_MESSAGES = {
    inlineToggleAriaLabel: "Toggle automatic Temporary Chat",
    inlineToggleAriaLabelIncognito: "Toggle automatic Incognito chat",
    inlineToggleLabel: "Auto",
    inlineToggleTitleOff: "Automatic Temporary Chat off",
    inlineToggleTitleOffIncognito: "Automatic Incognito chat off",
    inlineToggleTitleOn: "Automatic Temporary Chat on",
    inlineToggleTitleOnIncognito: "Automatic Incognito chat on"
  };

  const NEW_CHAT_TEXT = [
    "new chat",
    "새 채팅",
    "새로운 채팅",
    "新建聊天",
    "新しいチャット"
  ];

  // Per-site behavior: which query param forces the private mode, which paths
  // count as a new chat, and which on-page control the inline toggle anchors to.
  const SITE_CONFIGS = [
    {
      origins: ["https://chatgpt.com", "https://chat.openai.com"],
      param: "temporary-chat",
      paramValue: "true",
      newChatBasePath: "/",
      // Existing installs already store the ChatGPT preference under
      // "enabled"; keep the legacy key so upgrades preserve it.
      storageKey: "enabled",
      inlineMessages: {
        ariaLabel: "inlineToggleAriaLabel",
        titleOn: "inlineToggleTitleOn",
        titleOff: "inlineToggleTitleOff"
      },
      controlText: ["temporary chat", "임시 채팅", "臨時聊天", "临时聊天", "一時チャット"],
      // ChatGPT sometimes renders the temporary-chat switch already on screen;
      // clicking it is a safe fallback beyond the URL param.
      clickToggle: true,
      // The in-conversation Temporary Chat marker is a plain <div> (icon +
      // label), not a button, so the interactive anchor scan cannot see it;
      // scan this header container for it instead.
      indicatorContainerSelector: "[data-testid='thread-header-right-actions-container']",
      utilityPrefixes: [
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
      ],
      conversationPattern: /\/c\/[0-9a-f-]{8,}/i,
      isNewChatPath: (pathname) =>
        pathname === "/" || pathname === "" || /^\/g\/[^/]+\/?$/.test(pathname),
      isNewChatHref: (href) =>
        href === "/" ||
        href.startsWith("/?") ||
        href.startsWith("https://chatgpt.com/?") ||
        href.startsWith("https://chat.openai.com/?")
    },
    {
      origins: ["https://claude.ai"],
      param: "incognito",
      // claude.ai enables Incognito on the bare param ("?incognito=").
      paramValue: "",
      newChatBasePath: "/new",
      storageKey: "claudeEnabled",
      inlineMessages: {
        ariaLabel: "inlineToggleAriaLabelIncognito",
        titleOn: "inlineToggleTitleOnIncognito",
        titleOff: "inlineToggleTitleOffIncognito"
      },
      controlText: ["incognito", "시크릿"],
      clickToggle: false,
      utilityPrefixes: [
        "/api",
        "/artifacts",
        "/chat/",
        "/login",
        "/magic-link",
        "/oauth",
        "/project",
        "/recents",
        "/settings",
        "/share/"
      ],
      conversationPattern: /\/chat\/[0-9a-f-]{8,}/i,
      isNewChatPath: (pathname) => pathname === "/new" || pathname === "/new/",
      isNewChatHref: (href) =>
        href === "/new" || href.startsWith("/new?") || href.startsWith("https://claude.ai/new")
    }
  ];

  const getSiteForUrl = (url) =>
    SITE_CONFIGS.find((site) => site.origins.includes(url.origin)) || null;

  const PAGE_SITE = getSiteForUrl(new URL(location.href));

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

  const t = (key) => {
    try {
      return chrome.i18n?.getMessage(key) || DEFAULT_MESSAGES[key] || "";
    } catch {
      return DEFAULT_MESSAGES[key] || "";
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

  // Each site reads and writes only its own storage key (the ChatGPT
  // preference lives under the legacy "enabled" key), so the per-site
  // toggles stay independent.
  const readSiteOptions = async () => {
    const items = await storageGet({
      [PAGE_SITE.storageKey]: DEFAULT_OPTIONS.enabled,
      debug: DEFAULT_OPTIONS.debug
    });

    return {
      enabled: Boolean(items[PAGE_SITE.storageKey]),
      debug: Boolean(items.debug)
    };
  };

  const refreshOptions = async () => {
    options = await readSiteOptions();
    scheduleInlineToggleSync();
    return options;
  };

  // Treat the param as present unless it is explicitly disabled, so a value
  // the site might normalize differently (e.g. "1", or a bare key) does not
  // trigger an endless re-redirect.
  const hasTemporaryParam = (url) => {
    const site = getSiteForUrl(url);

    if (!site) {
      return false;
    }

    const value = url.searchParams.get(site.param);
    return value !== null && value !== "false";
  };

  const isConversationOrUtilityPath = (site, pathname) =>
    site.utilityPrefixes.some((prefix) => pathname.startsWith(prefix)) ||
    site.conversationPattern.test(pathname);

  const isLikelyNewChatPath = (url) => {
    const site = getSiteForUrl(url);

    if (!site || isConversationOrUtilityPath(site, url.pathname)) {
      return false;
    }

    return site.isNewChatPath(url.pathname);
  };

  const withTemporaryParam = (href) => {
    try {
      const url = new URL(href, location.href);

      if (!isLikelyNewChatPath(url)) {
        return null;
      }

      const site = getSiteForUrl(url);
      url.searchParams.set(site.param, site.paramValue);
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
      <button type="button" aria-pressed="true">
        <span class="temporary-chat-auto-label"></span>
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
    containsAny(getElementText(element), PAGE_SITE.controlText);

  let cachedAnchor = null;
  let anchorResizeObserver = null;
  let observedAnchor = null;

  // The anchor pill can grow/shrink via pure CSS (e.g. hover expands it to
  // show its label), which emits no DOM mutations; watch its size directly so
  // the toggle is repositioned instead of being overlapped by the wider pill.
  const observeAnchorResize = (anchor) => {
    if (observedAnchor === anchor || typeof ResizeObserver !== "function") {
      return;
    }

    if (!anchorResizeObserver) {
      anchorResizeObserver = new ResizeObserver(() => scheduleInlineToggleSync());
    }

    anchorResizeObserver.disconnect();
    observedAnchor = anchor;

    if (anchor) {
      anchorResizeObserver.observe(anchor);
    }
  };

  // Non-interactive indicator variant: scan the site's header actions
  // container for a short-text match. Nested wrappers around the label all
  // match, so pick the largest one — the outermost wrapper, icon included —
  // to anchor left of the whole indicator instead of just its text node.
  const findIndicatorAnchor = () => {
    if (!PAGE_SITE.indicatorContainerSelector) {
      return null;
    }

    const container = document.querySelector(PAGE_SITE.indicatorContainerSelector);

    if (!container) {
      return null;
    }

    const matches = [container, ...container.querySelectorAll("div, span")].filter((element) => {
      if (element.closest(`#${INLINE_TOGGLE_ID}`) || !isVisible(element)) {
        return false;
      }

      const text = getElementText(element).replace(/\s+/g, " ").trim();

      // A long string means the element wraps unrelated header content.
      return text.length <= 80 && containsAny(text, PAGE_SITE.controlText);
    });

    return matches
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .sort(
        (a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height
      )[0]?.element || null;
  };

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
        )[0]?.element || findIndicatorAnchor();

    return cachedAnchor;
  };

  const syncInlineToggle = () => {
    const container = createInlineToggle();
    const button = container.querySelector("button");
    const label = container.querySelector(".temporary-chat-auto-label");
    const anchor = findTemporaryChatAnchor();
    observeAnchorResize(anchor);

    if (label) {
      label.textContent = t("inlineToggleLabel");
    }
    container.classList.toggle("is-enabled", options.enabled);
    button.setAttribute("aria-label", t(PAGE_SITE.inlineMessages.ariaLabel));
    button.setAttribute("aria-pressed", String(options.enabled));
    button.title = options.enabled
      ? t(PAGE_SITE.inlineMessages.titleOn)
      : t(PAGE_SITE.inlineMessages.titleOff);

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

    // Measure after unhiding: a hidden container reports zero and the 74px
    // fallback is narrower than the rendered toggle, shifting it onto the pill.
    const toggleWidth = container.offsetWidth || 74;
    const toggleHeight = container.offsetHeight || 28;
    const anchorRect = anchor.getBoundingClientRect();
    const gap = 10;

    // Sit just to the left of ChatGPT's Temporary Chat button; flip to its
    // right when the left lacks room, and drop below the button when neither
    // side fits, so the toggle never covers it.
    let left = anchorRect.left - toggleWidth - gap;
    let top = anchorRect.top + (anchorRect.height - toggleHeight) / 2;

    if (left < 8) {
      if (anchorRect.right + gap + toggleWidth <= window.innerWidth - 8) {
        left = anchorRect.right + gap;
      } else {
        left = Math.max(8, Math.min(anchorRect.right - toggleWidth, window.innerWidth - toggleWidth - 8));
        top = anchorRect.bottom + gap;
      }
    }

    top = Math.min(Math.max(8, top), window.innerHeight - toggleHeight - 8);

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
    options = { ...options, enabled };
    scheduleInlineToggleSync();

    const afterSave = () => {
      if (chrome.runtime?.lastError) {
        log("Failed to save enabled state", chrome.runtime.lastError.message);
        options = { ...options, enabled: !enabled };
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

    // The site's `enabled` flag is the only persisted setting; writing just
    // that key keeps the storage.sync write volume minimal so rapid toggling
    // never hits the quota.
    chrome.storage.sync.set({ [PAGE_SITE.storageKey]: enabled }, afterSave);
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
      if (label.length > 80 || !containsAny(label, PAGE_SITE.controlText)) {
        continue;
      }

      if (getExplicitCheckedState(control) === false) {
        return control;
      }
    }

    return null;
  };

  const clickTemporaryToggleIfClearlyOff = () => {
    if (!PAGE_SITE.clickToggle) {
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
    let patched = 0;

    for (const anchor of document.querySelectorAll("a[href]")) {
      const href = anchor.getAttribute("href") || "";

      // Sidebar conversation and utility links are the bulk of anchors on the
      // page and can never be a new chat; skip them before the costly text read.
      if (isConversationOrUtilityPath(PAGE_SITE, href)) {
        continue;
      }

      // Short-circuit: only read aria-label/title/textContent when the cheap
      // href shape did not already identify a new-chat link.
      if ((PAGE_SITE.isNewChatHref(href) || containsAny(getElementText(anchor), NEW_CHAT_TEXT)) && patchAnchor(anchor)) {
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
    const temporaryHref = withTemporaryParam(location.origin + PAGE_SITE.newChatBasePath);

    if (temporaryHref) {
      location.assign(temporaryHref);
    }
  };

  const onCapturedClick = (event) => {
    if (!options.enabled) {
      return;
    }

    const anchor = event.target.closest?.("a[href]");

    if (anchor) {
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

      if (changes[PAGE_SITE.storageKey]) {
        options.enabled = Boolean(changes[PAGE_SITE.storageKey].newValue ?? DEFAULT_OPTIONS.enabled);
        changed = true;
      }

      if (changes.debug) {
        options.debug = Boolean(changes.debug.newValue ?? DEFAULT_OPTIONS.debug);
        changed = true;
      }

      if (changed) {
        if (!options.enabled) {
          restorePatchedLinks();
          scheduleInlineToggleSync();
          return;
        }

        scheduleInlineToggleSync();
        applyTemporaryChatMode("settings-change");
      }
    });
  };

  const init = async () => {
    options = await readSiteOptions();

    document.addEventListener("click", onCapturedClick, true);
    window.addEventListener("resize", scheduleInlineToggleSync);
    window.addEventListener("scroll", scheduleInlineToggleSync, true);
    installMessageHandler();
    installStorageHandler();
    watchLocationChanges();
    watchDomChanges();
    applyTemporaryChatMode("init");
  };

  if (!PAGE_SITE) {
    return;
  }

  init().catch((error) => {
    console.warn("[Temporary Chat Auto] Failed to initialize", error);
  });
})();
