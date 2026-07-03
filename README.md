# ChatGPT Temporary Chat Auto

Automatically open new ChatGPT chats with Temporary Chat enabled, and new Claude chats in Incognito mode.

This is an unofficial extension and is not affiliated with OpenAI.

[한국어 README](README_KO.md)

## Features

- Opens new ChatGPT chats with `temporary-chat=true`.
- Opens new Claude chats on `claude.ai` with the `incognito` parameter.
- Patches New chat links on `chatgpt.com`, `chat.openai.com`, and `claude.ai`.
- Adds a compact in-page toggle near each site's Temporary/Incognito chat indicator.
- Keeps the popup simple with one on/off control.
- Stores only the user's on/off preference in Chrome sync storage.

## Installation

### Chrome Web Store

The extension has been submitted to the Chrome Web Store and is waiting for review.

### Manual install

1. Download the latest store package from [Releases](https://github.com/HanChangHun/chatgpt-temporary-chat-auto/releases).
2. Unzip the package.
3. Open `chrome://extensions` in Chrome.
4. Enable `Developer mode`.
5. Click `Load unpacked` and select the unzipped folder.

## How It Works

- The extension runs only on `https://chatgpt.com/*`, `https://chat.openai.com/*`, and `https://claude.ai/*`.
- It updates new-chat URLs and New chat links with each site's private-chat parameter (`temporary-chat=true` on ChatGPT, `incognito` on Claude).
- If ChatGPT exposes a visible Temporary Chat toggle and it is clearly off, the extension can turn it on.
- The popup and in-page toggle both control the same single preference.

## Privacy

The extension does not collect, transmit, sell, or share user data. It does not read or send ChatGPT or Claude conversation content to any server.

See [PRIVACY.md](PRIVACY.md).

## Support

If this extension is useful to you, you can [support development on Ko-fi](https://ko-fi.com/edgetpu). Donations are optional and will never be required for the extension's core functionality.

## License and Branding

The source code and documentation are available under the MIT License. The project name, icon, store screenshots, promotional images, and other branding assets are not covered by that license. See [TRADEMARKS.md](TRADEMARKS.md).

## Publishing Notes

Chrome Web Store listing copy, privacy answers, permission justifications, and the Korean submission checklist are in [store/](store/).
