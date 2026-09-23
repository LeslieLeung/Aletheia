# Aletheia – AIGC 检测与内容分类

[English](README.md) · [开发文档（英文）](DEVELOPMENT.md)

Aletheia 可以判断文本是否疑似由 AI 生成，也可以将文章内容分为**原创**、**搬运**或**广告**。你可以通过网页、Chrome 扩展或 HTTP API 使用。内容分类为可选功能，需要 Jev API 密钥。

## 启动服务

在本仓库目录下，用 Docker Compose 运行已发布的镜像：

```bash
docker compose -f docker-compose.yml up
```

打开 `http://localhost:8000` 即可使用网页；API 也在同一地址，交互式接口文档位于 `http://localhost:8000/docs`。

如果要使用内容分类或用 Jev 检测 AIGC，请先设置 API 密钥：

```bash
export TYPESAFE_API_KEY="your-key"
docker compose -f docker-compose.yml up
```

未设置密钥时，内置 AIGC Detector 和 DivEye 仍可使用；使用 Jev 的请求会返回 HTTP 503。

## 使用网页

1. 打开 `http://localhost:8000`，将文本粘贴到输入框。
2. 选择一个或多个 AIGC 检测器。默认选中内置的 AIGC Detector。
3. 如需同时进行内容分类，将 **Content type** 设为 **Jev**。服务端需要设置 `TYPESAFE_API_KEY`。
4. 点击 **Detect**。每个检测器会显示一张结果卡片；启用内容分类后，其中一张卡片还会显示内容类别。

内容类别包括 `original`（原创：作者自己的报道、经历或分析）、`repost`（搬运：复制或轻度改写的内容）和 `ad`（广告：推广性内容）。

## 使用 Chrome 扩展

1. 从 [Releases](https://github.com/LeslieLeung/Aletheia/releases) 下载最新的 `aletheia-extension-*.zip` 并解压。
2. 打开 `chrome://extensions`，启用**开发者模式**，点击**加载已解压的扩展程序**并选择解压后的文件夹。
3. 点击 Aletheia 图标，将 **API 地址**设为正在运行的服务地址，默认为 `http://localhost:8000`。
4. 选择 **AI 检测器**。如需同时显示原创、搬运或广告类别，将**内容类型**设为 **Jev**；内容分类默认关闭。

扩展会自动检查符合条件的文章页面，并用浮动徽章显示结果。点击徽章可查看详情；也可以在扩展弹窗中点击**立即检测**，手动检查当前页面。你还可以在**设置**中调整检测策略、最小文本长度和域名列表。

## 使用 API

向 `POST /detect` 发送文本，获取 AIGC 判断：

```bash
curl -X POST http://localhost:8000/detect \
  -H "Content-Type: application/json" \
  -d '{"text":"这是一段用于分析的示例文本。"}'
```

响应中的 `label` 为 `human` 或 `ai`，`score` 表示对该标签的置信度，同时会返回模型、语言和检测器信息。默认检测器为 `onnx_classifier`。

增加 `content_engine`，即可同时获取内容分类结果：

```bash
curl -X POST http://localhost:8000/detect \
  -H "Content-Type: application/json" \
  -d '{"text":"这是一段用于分析的示例文本。","content_engine":"jev"}'
```

此时响应会增加 `content` 对象，其 `label` 为 `original`、`repost` 或 `ad`，并包含置信度及各类别的概率。如果两项判断都想使用 Jev，再加上 `"detector":"jev"`。

常用请求参数：

| 字段 | 用途 |
| --- | --- |
| `text` | 必填，待分析文本。 |
| `detector` | AIGC 检测器：`onnx_classifier`（默认）、`diveye` 或 `jev`。 |
| `content_engine` | 设为 `jev` 时启用内容分类；省略则跳过。 |
| `lang` | 设为 `zh` 或 `en` 可指定中文或英文默认模型；省略时自动识别语言。 |
| `title`、`url` | 可选的页面上下文，传递给 Jev。 |

服务运行后，可在 [`/docs`](http://localhost:8000/docs) 查看完整请求结构和检测策略选项；`GET /health` 可用于检查服务是否正常响应。
