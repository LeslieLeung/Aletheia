# Aletheia – AI Text Detector for the Browser

[简体中文](README_zh.md) · [Development](DEVELOPMENT.md)

Aletheia is a browser extension that checks whether article text looks AI-generated. It can optionally classify the page using categories you define (original, repost, and ad by default). The extension connects directly to [Jev](https://docs.typesafe.ai/introduction), [Clef / Clef-flash on Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/models/clef/), or your own [Laya](https://github.com/NandhaKishorM/laya) server.

## Install

Download the extension from [Releases](https://github.com/LeslieLeung/Aletheia/releases). Chrome uses the zip. Firefox 140 or newer uses the signed xpi.

Chrome:

1. Download the latest `aletheia-extension-*.zip` and unzip it.
2. Open `chrome://extensions`, enable **Developer mode**, then choose **Load unpacked** and select the unzipped folder.

Firefox:

1. Download the latest `aletheia-extension-*.xpi`.
2. Open the file in Firefox, or go to `about:addons` and choose **Install Add-on From File**.

## Setup

Open the extension and click **Settings**.

1. Choose a provider and configure its connection:
   - **Jev**: enter the server URL (default `https://api.typesafe.ai`), API key and model (default `jev-latest`). Existing Jev settings are used automatically.
   - **Clef (Cloudflare)**: enter your 32-character Cloudflare account ID and a [Workers AI API token](https://developers.cloudflare.com/workers-ai/get-started/rest-api/). Choose `clef-flash` (default) or `clef`. The extension calls Workers AI directly.
   - **Laya**: enter your `laya-serve` URL (default `http://localhost:8000`). The default model is `multilingual`; `english`, `typed-decisions`, and server-registered model names can also be entered. Leave the key empty unless your server enables `LAYA_API_KEY`.
2. Click **Test Connection** to verify access. Jev lists available models; Clef and Laya run a small inference request. Clef may charge for that request, and Laya may need to load its model on first use.
3. Turn on **Classify content** if you also want a content label. Edit the default original, repost, and ad categories, or add your own.

Each provider keeps its own connection settings. API keys and tokens are stored only in the browser's local extension storage. Page text, title, and URL are sent to the selected provider when detection runs. Other preferences may sync through your browser account. Local Laya addresses refer to the machine running your browser.

To start a local Laya server:

```bash
pip install "laya[serve]"
LAYA_MODELS=multilingual laya-serve
```

The extension requests an 8,192-token window for `multilingual` so longer articles are not limited to Laya's default 1,024 tokens. It still sends at most 6,000 article characters. Laya requests time out after 60 seconds; if the first connection test times out while loading weights, retry after the server is ready.

## Use

The extension checks eligible article pages automatically and shows the result in a floating badge. Click the badge for details, or click **Detect Now** in the popup to check the current page manually. The header switch in the popup turns detection on or off, and the **Classify content** switch toggles the content label for the next detection.

The popup also shows the current site with two shortcuts: **Always detect** adds it to the whitelist and **Never detect** adds it to the blacklist. Click the active shortcut again to remove the rule.

In **Settings**, you can also adjust:

- the content categories and the descriptions sent to the selected model as the classification prompt;
- whether the badge shows the percentage;
- the minimum text length for automatic detection;
- the domain whitelist and blacklist. Add one or more domains or URLs at a time, search the list, switch a domain between the two lists, or remove it.

Whitelisted domains are always detected, blacklisted domains are always skipped, and the whitelist takes priority.

## Privacy

Page text, title, and URL are sent only to the selected provider, and only when detection runs. The common tracking-heavy sites in the default blacklist are skipped automatically.

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md). Run the extension tests with:

```bash
node --test scripts/test_extension.cjs
```
