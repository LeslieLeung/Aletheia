# Aletheia – AIGC Detection and Content Classification

[简体中文](README_zh.md) · [Development](DEVELOPMENT.md)

Aletheia checks whether text appears to be AI-generated and can also classify article content as **original**, **repost**, or **ad**. Use it in the browser, on the built-in web page, or through the HTTP API. Content classification is optional and requires a Jev API key.

## Start the service

From this repository, run the published image with Docker Compose:

```bash
docker compose -f docker-compose.yml up
```

Open `http://localhost:8000` to use the web page. The API is available at the same address, and its interactive documentation is at `http://localhost:8000/docs`.

To enable content classification or use Jev for AIGC detection, set the API key before starting the service:

```bash
export TYPESAFE_API_KEY="your-key"
docker compose -f docker-compose.yml up
```

Without the key, the built-in AIGC Detector and DivEye remain available; requests that use Jev return HTTP 503.

## Use the web page

1. Open `http://localhost:8000` and paste text into the text box.
2. Select one or more AIGC detectors. The built-in AIGC Detector is selected by default.
3. To also classify the content, set **Content type** to **Jev**. This requires `TYPESAFE_API_KEY` on the server.
4. Click **Detect**. Each selected detector gets a result card; the optional content category appears with one of the results.

The content categories are `original` (first-hand writing), `repost` (copied or lightly rewritten material), and `ad` (promotional content).

## Use the Chrome extension

1. Download the latest `aletheia-extension-*.zip` from [Releases](https://github.com/LeslieLeung/Aletheia/releases) and unzip it.
2. Open `chrome://extensions`, enable **Developer mode**, then choose **Load unpacked** and select the unzipped folder.
3. Click the Aletheia icon and set **API URL** to your running service. The default is `http://localhost:8000`.
4. Select an **AI detector**. Set **Content type** to **Jev** if you also want the original/repost/ad category; content classification is off by default.

The extension checks eligible article pages automatically and shows the result in a floating badge. Click the badge for details, or click **Detect Now** in the popup to check the current page manually. In **Settings**, you can adjust the detection strategy, minimum text length, and domain lists.

## Use the API

Send text to `POST /detect` for an AIGC judgment:

```bash
curl -X POST http://localhost:8000/detect \
  -H "Content-Type: application/json" \
  -d '{"text":"This is a sample passage to analyze."}'
```

The response includes `label` (`human` or `ai`), `score` (confidence in that label), and the model, language, and detector used. The default detector is `onnx_classifier`.

Add `content_engine` to request content classification at the same time:

```bash
curl -X POST http://localhost:8000/detect \
  -H "Content-Type: application/json" \
  -d '{"text":"This is a sample passage to analyze.","content_engine":"jev"}'
```

This adds a `content` object with a `label` of `original`, `repost`, or `ad`, plus its confidence and per-category probabilities. To use Jev for both judgments, also set `"detector":"jev"`.

Common request options:

| Field | Usage |
| --- | --- |
| `text` | Required text to analyze. |
| `detector` | `onnx_classifier` (default), `diveye`, or `jev` for the AIGC judgment. |
| `content_engine` | Set to `jev` for content classification; omit to skip it. |
| `lang` | Set to `zh` for the Chinese default model or `en` for English; otherwise language is detected automatically. |
| `title`, `url` | Optional page context passed to Jev. |

The full request schema and available strategy values are shown at [`/docs`](http://localhost:8000/docs) when the service is running. `GET /health` checks whether the service is responding.
