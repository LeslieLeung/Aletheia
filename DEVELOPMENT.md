# Development

This document covers the browser extension implementation and development workflow. For installation and usage, see the [English README](README.md) or [Chinese README](README_zh.md).

## Layout

| Path | Purpose |
| --- | --- |
| `extension/manifest.json` | Manifest V3 definition for Chrome and Firefox. |
| `extension/content/` | Readability-based article extraction, automatic detection, and the floating badge. |
| `extension/background/` | Message handling, provider requests, and result caching. |
| `extension/popup/` | Toolbar popup: detection switch and manual detection. |
| `extension/options/` | Settings: model providers and credentials, content classification, badge, and domain lists. |
| `extension/shared/` | Storage, i18n, provider adapters, questions, and defaults. |
| `extension/lib/` | Bundled Mozilla Readability. |
| `scripts/test_extension.cjs` | Node tests for content-script and background behavior. |
| `scripts/sync-version.py` | Version check/write for release tags. |

## Request flow

1. [`content/content.js`](extension/content/content.js) extracts the article with Readability, applies the domain lists and minimum text length, then sends `DETECT_TEXT` to the background.
2. [`background/service-worker.js`](extension/background/service-worker.js) reads settings, then [`background/detection-cache.js`](extension/background/detection-cache.js) builds the model state and question set and checks for a reusable result or request.
3. [`shared/providers.js`](extension/shared/providers.js) validates the active connection and routes the request through the Jev, Clef, or Laya adapter. All share typed System One questions and normalize results through the same converter.
4. [`shared/questions.js`](extension/shared/questions.js) converts the answers into the badge result shape.
5. [`content/badge.js`](extension/content/badge.js) renders the result. Clicking the badge opens the detail panel.

The background caches successful results for 24 hours, with at most 100 entries and least recently used eviction. Cache identity is a SHA-256 digest of the **complete extracted body** (before the 6,000-character request limit), provider, resolved endpoint (including the Cloudflare account), trimmed API key, model, provider request options, and generated question set. Classification toggles, category names and criteria therefore partition results; display preferences and domain rules do not. Titles and page URLs remain in the model request but do not partition the cache, allowing identical bodies on different pages to reuse a result. Neither article bodies nor credentials are written into cache storage.

Results use `chrome.storage.session`, so they survive service-worker suspension but are cleared with the browser session. If session storage is unavailable or fails, detection continues with an in-memory cache. Concurrent requests for the same identity share one provider request; failures are not cached and can be retried. Manual detection sends `forceRerun: true` to skip completed results and replace them on success, while still sharing any matching request already in progress.

When the **Classify content** toggle is on, `questions.forSettings` adds the `content_type` question. It is built from `settings.contentCategories`: each category's name becomes the prompt label and its description becomes the criteria text. The response gains a `content` object whose `label` is the category id and whose `name` is the display name shown in the badge.

The **Classify content** switch exists in both the popup and the settings page. Both write the same `localContent` key, so a change in either place applies to the next detection. Categories are edited only in the settings page and stored under `contentCategories`; an empty list falls back to the built-in original, repost, and ad categories.

## Settings storage

`chrome.storage.sync` holds ordinary preferences, `modelProvider` (default `jev`), and `providerConfigs` keyed by provider ID. Profiles contain `model` and either `baseUrl` or `accountId`. `chrome.storage.local` holds `providerApiKeys`, keyed by provider ID. Credentials are never sent to sync storage and are removed from `GET_STATUS` responses. Switching providers in settings preserves each profile and key, including unsaved edits until saved together.

Legacy `jevBaseUrl` and local `jevApiKey` are used when a new Jev profile/key has not been saved. An explicitly empty `providerApiKeys.jev` overrides the old key, so removing a key cannot revive the legacy credential. Reset clears both credential formats.

## Provider adapters

`providers.config`, `validate`, `isConfigured`, `identity`, `detect`, and `test` form the shared boundary. The registry owns provider defaults, endpoint construction, optional request fields, and response unwrapping. To add a compatible provider, add an adapter and its settings option/hints; the detection/cache pipeline stays unchanged.

- **Jev**: bearer authentication, `POST /v1/systemone`, `GET /v1/models` for connection tests, and a configurable model (`jev-latest` by default). API roots, `/v1`, and full `/v1/systemone` URLs are accepted.
- **Clef**: bearer Workers AI token, account ID, and `clef-flash` (default) or `clef`. Calls `https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/run/@cf/cloudflare/{model}` and unwraps the REST `result` envelope, including Cloudflare error responses.
- **Laya**: self-hosted `/v1/systemone`; bearer auth is omitted when no key is set. Defaults to `http://localhost:8000`, model `multilingual`, and a 60-second timeout. That model receives `max_len: 8192` to use its longer context. Other checkpoints inherit their server token budget. Clef and Laya connection tests execute a minimal inference request and validate the returned judgment.

Providers share the article budget, questions, result shape and probability validation. Confidence values come from each provider and are not recalibrated by the extension.

## Browser support

The extension targets Chrome and Firefox 140 or newer. Firefox still has no extension service workers. The manifest lists `background.scripts` for Firefox's event page and `background.service_worker` for Chrome. Chrome 121 and newer ignores `scripts` in a Manifest V3 extension. `background/service-worker.js` calls `importScripts` only when that function exists, so the same file is the last event-page script on Firefox and the service worker on Chrome.

`browser_specific_settings.gecko` sets a stable add-on ID, requires Firefox 140, and declares that detection transmits page text and the page URL. Firefox for Android requires 142 for that declaration. Its add-on manager still cannot show or edit host-permission grants, so Android is not a supported target.

Shared scripts keep the `ALETHEIA` namespace on `globalThis`. Firefox content scripts have a global scope distinct from `self`/`window`, so reading the namespace from `self` would discard helpers loaded by earlier scripts.

## Testing

Run the Node tests:

```bash
node --test scripts/test_extension.cjs
```

The tests cover content-script initialization under both global-scope models, manual detection, Jev/Clef/Laya requests with content classification, legacy settings, local credential storage and status redaction, connection tests and provider errors, cache isolation across providers/models/accounts/keys, expiration, session restoration and storage failures, concurrent request sharing, forced refresh, and failure retries. They use mocked browser APIs and do not replace a browser smoke test.

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
