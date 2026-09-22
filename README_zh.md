# Aletheia – AIGC 文本检测 API

基于 [AIGC_text_detector](https://github.com/YuchuanTian/AIGC_text_detector)、[DivEye](https://github.com/IBM/diveye) 和 [Jev](https://docs.typesafe.ai/introduction) 的 FastAPI 服务，用于检测文本是否由 AI 生成。Jev 还可以把页面分成原创、搬运或广告。

## 快速开始 (Docker)

```bash
# 使用 GHCR 上的预构建镜像
docker compose -f docker-compose.yml up
```

API 将在 `http://localhost:8000` 上可用。

## Chrome 扩展

提供 Chrome 浏览器扩展，可在浏览文章页面时自动检测 AI 生成的文本。

### 安装

1. 前往 [Releases](https://github.com/LeslieLeung/Aletheia/releases) 页面，下载最新的 `aletheia-extension-*.zip`。
2. 解压文件。
3. 在 Chrome 中打开 `chrome://extensions`，启用**开发者模式**。
4. 点击**加载已解压的扩展程序**，选择解压后的文件夹。

### 配置

点击扩展图标打开弹窗，将 **API URL** 设置为你运行的 Aletheia 实例地址（默认：`http://localhost:8000`）。更多选项（检测策略、域名白名单/黑名单）可在扩展的**设置**页面中配置。

扩展会自动检测你访问的页面中的文章内容，并以浮动徽章显示检测结果。

## 本地开发

需要安装 [uv](https://docs.astral.sh/uv/)。

```bash
# 安装依赖
uv sync

# 启动服务
uv run uvicorn app.main:app --reload
```

或使用 Docker Compose：

```bash
docker compose up --build
```

## API

### `POST /detect`

检测文本是人类撰写还是 AI 生成。

**请求体：**

| 字段         | 类型   | 必填 | 默认值       | 说明                                                                        |
|-------------|--------|------|-------------|-----------------------------------------------------------------------------|
| `text`      | string | 是   |             | 待检测文本                                                                    |
| `lang`      | string | 否   | 自动检测     | `"zh"` 使用中文模型，其他值使用英文模型                                            |
| `model_id`  | string | 否   | 按语言决定   | HuggingFace 模型 ID，优先级高于 `lang`。`jev` 会忽略该字段。 |
| `strategy`  | string | 否   | `"truncate"` | `"truncate"`、`"sliding_avg"`、`"sliding_weighted_avg"` 或 `"sliding_vote"`。`jev` 会忽略该字段。 |
| `early_stop`| bool   | 否   | `false`     | 置信度足够高时提前停止（仅限滑动窗口策略）。`jev` 会忽略该字段。 |
| `detector`  | string | 否   | `"onnx_classifier"` | `"onnx_classifier"`（AIGC Detector）、`"diveye"` 或 `"jev"` |
| `title`     | string | 否   |             | 页面标题，会和正文一起交给决策引擎 |
| `url`       | string | 否   |             | 页面 URL，会和正文一起交给决策引擎 |
| `content_engine` | string | 否 |          | 设为 `"jev"` 时同时判断原创、搬运或广告。省略则不做内容分类。 |

**策略说明：**

- `truncate` – 截断至 512 tokens，单次前向推理，速度最快。
- `sliding_avg` – 滑动窗口（512 tokens，步长 256），对各窗口的 softmax 分数取平均。
- `sliding_weighted_avg` – 滑动窗口，按置信度加权平均：置信度越高的分块权重越大。
- `sliding_vote` – 滑动窗口，对各窗口的预测标签进行多数投票。

> **建议：** 大多数场景下 `truncate` 即可满足需求。对于长文本且需要更高准确率的情况，推荐使用 `sliding_weighted_avg` 并启用 `early_stop` —— 它通过对高置信度分块赋予更大权重来获得更好的结果，同时提前停止可避免不必要的计算。

**示例：**

```bash
curl -X POST http://localhost:8000/detect \
  -H "Content-Type: application/json" \
  -d '{"text": "这是一段用于检测的示例文本。"}'
```

**响应：**

```json
{
  "label": "human",
  "score": 0.98,
  "model_id": "yuchuantian/AIGC_detector_zhv3",
  "detected_lang": "zh",
  "num_chunks": 1,
  "detector": "onnx_classifier"
}
```

设置 `content_engine` 后，响应会多一个 `content`。`label` 为 `original`（原创）、`repost`（搬运）或 `ad`（广告，软广和硬广都算广告）。`detector` 和 `content_engine` 都是 `jev` 时，两次判断来自同一次 API 调用。

```json
{
  "label": "ai",
  "score": 0.91,
  "model_id": "jev-latest",
  "detected_lang": "zh",
  "num_chunks": 1,
  "detector": "jev",
  "content": {
    "engine": "jev",
    "model_id": "jev-latest",
    "label": "ad",
    "confidence": 0.81,
    "probabilities": {"original": 0.07, "repost": 0.12, "ad": 0.81}
  }
}
```

Jev 在服务端读取 `TYPESAFE_API_KEY`（可选 `TYPESAFE_BASE_URL` 和 `TYPESAFE_DEFAULT_MODEL`，默认 `jev-latest`）。没有密钥时返回 HTTP 503。用 Compose 启动时把密钥传进去：

```bash
export TYPESAFE_API_KEY="your-key"
docker compose up --build
```

### `GET /health`

健康检查接口。

## 默认模型

| 语言   | 模型 ID                             |
|--------|-------------------------------------|
| 英文   | `yuchuantian/AIGC_detector_env3`    |
| 中文   | `yuchuantian/AIGC_detector_zhv3`    |

可通过请求中的 `model_id` 字段使用任意 HuggingFace `*ForSequenceClassification` 模型。

## 检测方法

### AIGC Text Detector

基于 Transformer 的序列分类器，专门针对 AI 文本检测微调。
来源：[YuchuanTian/AIGC_text_detector](https://github.com/YuchuanTian/AIGC_text_detector)

### DivEye

DivEye 通过基于 **surprisal（惊异度）** 的统计特征检测 AI 生成文本——该特征衡量文本各位置的不可预测性变化程度。人类写作在词汇和结构上的不可预测性波动明显大于大语言模型输出。这些特征输入 XGBoost 分类器，具备良好的可解释性，并对改写攻击有较强的鲁棒性。

> Advik Raj Basani, Pin-Yu Chen. *Diversity Boosts AI-Generated Text Detection.* TMLR 2026.

来源：[IBM/diveye](https://github.com/IBM/diveye)

### Jev

[Jev](https://docs.typesafe.ai/introduction) 是 TypeSafe 的决策模型。它可以在一次请求里同时回答「是否 AI 生成」和内容分类（原创 / 搬运 / 广告）。题目写在 [`app/engines/questions.py`](app/engines/questions.py) 里，是普通数据，不是 SDK 类型。

要再接一个决策引擎，在 `app/engines` 里实现 `DecisionEngine.judge(state, *, include_ai, include_content)`，在 [`app/main.py`](app/main.py) 注册实例，并把名字加到 [`app/schemas.py`](app/schemas.py) 的 `DetectorType` 和 `ContentEngine`。`/detect` 的请求和响应不用改。
