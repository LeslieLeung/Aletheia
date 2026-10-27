# Development

This document covers the browser extension implementation and development workflow. For installation and usage, see the [English README](README.md) or [Chinese README](README_zh.md).

## Layout

| Path | Purpose |
| --- | --- |
| `extension/manifest.json` | Manifest V3 definition for Chrome and Firefox. |
| `extension/content/` | Readability-based article extraction, automatic detection, and the floating badge. |
| `extension/background/` | Message handling and Jev requests. |
| `extension/popup/` | Toolbar popup: detection switch and manual detection. |
| `extension/options/` | Settings: Jev credentials, content classification, badge, and domain lists. |
| `extension/shared/` | Storage, i18n, Jev client, questions, and defaults. |
| `extension/lib/` | Bundled Mozilla Readability. |
| `scripts/test_extension.cjs` | Node tests for content-script and background behavior. |
| `scripts/sync-version.py` | Version check/write for release tags. |

## Request flow

1. [`content/content.js`](extension/content/content.js) extracts the article with Readability, applies the domain lists and minimum text length, then sends `DETECT_TEXT` to the background.
2. [`background/service-worker.js`](extension/background/service-worker.js) reads settings and builds the Jev state and question set.
3. [`shared/jev.js`](extension/shared/jev.js) calls `POST /v1/systemone` on the configured Jev server with the API key.
4. [`shared/questions.js`](extension/shared/questions.js) converts the answers into the badge result shape.
5. [`content/badge.js`](extension/content/badge.js) renders the result. Clicking the badge opens the detail panel.

When the **Classify content** toggle is on, `questions.forSettings` adds the `content_type` question. It is built from `settings.contentCategories`: each category's name becomes the prompt label and its description becomes the criteria text. The response gains a `content` object whose `label` is the category id and whose `name` is the display name shown in the badge.

The **Classify content** switch exists in both the popup and the settings page. Both write the same `localContent` key, so a change in either place applies to the next detection. Categories are edited only in the settings page and stored under `contentCategories`; an empty list falls back to the built-in original, repost, and ad categories.

## Settings storage

`chrome.storage.sync` holds ordinary preferences, including the Jev server URL, detection toggle, content categories, badge percentage, minimum text length, and domain lists. The Jev API key is written to `chrome.storage.local` because sync storage would copy it across the user's signed-in browsers. `storage.get` merges both areas and always returns the defaults from [`shared/constants.js`](extension/shared/constants.js).

The **Classify content** switch exists in both the popup and the settings page. Both write the same `localContent` key, so a change in either place applies to the next detection.

## Browser support

The extension targets Chrome and Firefox 140 or newer. Firefox still has no extension service workers. The manifest lists `background.scripts` for Firefox's event page and `background.service_worker` for Chrome. Chrome 121 and newer ignores `scripts` in a Manifest V3 extension. `background/service-worker.js` calls `importScripts` only when that function exists, so the same file is the last event-page script on Firefox and the service worker on Chrome.

`browser_specific_settings.gecko` sets a stable add-on ID, requires Firefox 140, and declares that detection transmits page text and the page URL. Firefox for Android requires 142 for that declaration. Its add-on manager still cannot show or edit host-permission grants, so Android is not a supported target.

Shared scripts keep the `ALETHEIA` namespace on `globalThis`. Firefox content scripts have a global scope distinct from `self`/`window`, so reading the namespace from `self` would discard helpers loaded by earlier scripts.

## Testing

Run the Node tests:

```bash
node --test scripts/test_extension.cjs
```

The tests cover content-script initialization under both global-scope models, manual detection, and background Jev requests with content classification. They use mocked browser APIs and do not replace a browser smoke test.

For a manual check, load `extension/` as an unpacked extension in Chrome, or run:

```bash
npx web-ext run --source-dir extension
```

## Release

The manifest version is the single source of truth. To update it:

```bash
python3 scripts/sync-version.py 0.4.0
```

Pushing a `v*` tag triggers [`extension-release.yml`](.github/workflows/extension-release.yml). The workflow checks that the tag matches the manifest version, signs the Firefox package with `web-ext sign`, builds the Chrome zip, and uploads both files to the GitHub Release. `AMO_API_KEY` and `AMO_API_SECRET` repository secrets are required.

The signed Firefox package cannot be replaced by a lower version, so `sync-version.py` refuses to decrease the manifest version.
