# Chrome Web Store Listing Draft

## Name

Temporary Chat Auto for ChatGPT & Claude

## Short Description

Automatically opens new ChatGPT chats in Temporary Chat and new Claude chats in Incognito mode. Unofficial extension.

## Detailed Description

Temporary Chat Auto for ChatGPT & Claude makes private chats the default: Temporary Chat for new ChatGPT conversations and Incognito for new Claude conversations.

When you open ChatGPT or Claude, or click New chat, the extension adds each site's private-chat URL parameter to the new chat's address so it starts in Temporary Chat (ChatGPT) or Incognito (Claude) mode. On ChatGPT it can also turn on the site's own Temporary Chat toggle when a new chat shows it visibly off. It works on `chatgpt.com`, `chat.openai.com`, and `claude.ai`.

Use the popup to turn automation on or off for each site independently. On the page, a compact Auto toggle can appear near each site's Temporary/Incognito chat indicator for quick control.

This is an unofficial extension and is not affiliated with OpenAI or Anthropic.

## Category

Productivity

## Language

English

## Single Purpose

Automatically open new ChatGPT and Claude chats in their private chat modes (Temporary Chat / Incognito).

## Permission Justifications

### storage

Stores the user's extension preferences, specifically whether automatic private chat mode is enabled for each supported site.

### scripting

Used only right after the extension is installed or updated: it re-runs the extension's own bundled content script in ChatGPT and Claude tabs that are already open, so the on-page Auto toggle keeps working without a manual tab refresh. No remote code is involved.

### Host permission: https://chatgpt.com/*

Allows the extension to run on ChatGPT pages so it can add the Temporary Chat URL parameter to new chat links and, when a new chat is not yet in Temporary Chat, turn on ChatGPT's own Temporary Chat toggle on the page.

### Host permission: https://chat.openai.com/*

Supports the older ChatGPT domain for users who are still routed through `chat.openai.com`.

### Host permission: https://claude.ai/*

Allows the extension to run on Claude pages so it can add the Incognito URL parameter to new chat links and apply the user's preference.

## Remote Code

No. The extension does not load or execute remote code.

## Data Usage

The extension does not collect user data.

Recommended Chrome Web Store data disclosure:

- Do not select any user data collection categories.
- Certify that data is not sold or used for unrelated purposes.
- Privacy policy URL: `https://github.com/HanChangHun/temporary-chat-auto/blob/main/PRIVACY.md`

## Test Instructions

1. Install the extension from the submitted package.
2. Open `https://chatgpt.com/`.
3. Confirm that opening a new chat routes to a URL with `temporary-chat=true`.
4. Open `https://claude.ai/` and confirm a new chat routes to a URL with the `incognito` parameter.
5. Open the extension popup and turn off both the ChatGPT and Claude toggles.
6. Confirm New chat links on both sites are no longer modified by the extension.

No test credentials are required. The reviewer can test with any ChatGPT and Claude account.

## Store Assets

- Icon: `icons/icon-128.png`
- Small promotional image: `store/assets/promo-small-440x280.png`
- Marquee promotional image: `store/assets/promo-marquee-1400x560.png`
- Screenshot: `store/assets/screenshot-1280x800.png`

## Korean Submission Checklist

See `store/SUBMISSION_CHECKLIST_KO.md`.
