# Aletheia – AI Text Detector for the Browser

[简体中文](README_zh.md) · [Development](DEVELOPMENT.md)

Aletheia is a browser extension that checks whether article text looks AI-generated. It can optionally classify the page using categories you define (original, repost, and ad by default). The extension calls the [Jev](https://docs.typesafe.ai/introduction) decision engine directly with your own API key; there is no separate server component.

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

1. Enter your Jev server URL (for example `https://api.typesafe.ai`) and API key.
2. Click **Test Connection** to verify access.
3. Turn on **Classify content** if you also want a content label. Edit the default original, repost, and ad categories, or add your own.

The API key is stored only in the browser's local extension storage. Page text, title, and URL are sent only to the Jev server you configure, and only when detection runs. Other preferences may sync through your browser account.

## Use

The extension checks eligible article pages automatically and shows the result in a floating badge. Click the badge for details, or click **Detect Now** in the popup to check the current page manually. The header switch in the popup turns detection on or off, and the **Classify content** switch toggles the content label for the next detection.

The popup also shows the current site with two shortcuts: **Always detect** adds it to the whitelist and **Never detect** adds it to the blacklist. Click the active shortcut again to remove the rule.

In **Settings**, you can also adjust:

- the content categories and the descriptions sent to Jev as the classification prompt;
- whether the badge shows the percentage;
- the minimum text length for automatic detection;
- the domain whitelist and blacklist. Add one or more domains or URLs at a time, search the list, switch a domain between the two lists, or remove it.

Whitelisted domains are always detected, blacklisted domains are always skipped, and the whitelist takes priority.

## Privacy

Page text, title, and URL are sent only to the Jev server you configure, and only when detection runs. The common tracking-heavy sites in the default blacklist are skipped automatically.

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md). Run the extension tests with:

```bash
node --test scripts/test_extension.cjs
```
