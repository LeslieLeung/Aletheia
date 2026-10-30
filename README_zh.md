# Aletheia – 浏览器 AI 文本检测扩展

[English](README.md) · [开发文档（英文）](DEVELOPMENT.md)

Aletheia 是一个浏览器扩展，可以判断文章文本是否疑似由 AI 生成，也可以选择按你自定义的类别给页面分类（默认是**原创**、**搬运**、**广告**）。扩展可直接连接 [Jev](https://docs.typesafe.ai/introduction)、[Cloudflare Workers AI 上的 Clef / Clef-flash](https://developers.cloudflare.com/workers-ai/models/clef/)，或你自行部署的 [Laya](https://github.com/NandhaKishorM/laya) 服务。

## 安装

从 [Releases](https://github.com/LeslieLeung/Aletheia/releases) 下载扩展。Chrome 使用 zip，Firefox 140 及以上使用签过名的 xpi。

Chrome：

1. 下载最新的 `aletheia-extension-*.zip` 并解压。
2. 打开 `chrome://extensions`，启用**开发者模式**，点击**加载已解压的扩展程序**并选择解压后的文件夹。

Firefox：

1. 下载最新的 `aletheia-extension-*.xpi`。
2. 用 Firefox 打开这个文件，或进入 `about:addons`，选择**从文件安装附加组件**。

## 配置

打开扩展，点击**设置**。

1. 选择模型服务并填写对应配置：
   - **Jev**：服务器地址默认 `https://api.typesafe.ai`，填写 API key，模型默认 `jev-latest`。已有 Jev 配置会自动沿用。
   - **Clef (Cloudflare)**：填写 32 位 Cloudflare 账户 ID 和 [Workers AI API token](https://developers.cloudflare.com/workers-ai/get-started/rest-api/)，模型可选 `clef-flash`（默认）或 `clef`。扩展直接调用 Workers AI。
   - **Laya**：填写 `laya-serve` 地址，默认 `http://localhost:8000`。模型默认 `multilingual`，也可填写 `english`、`typed-decisions` 或服务端注册的模型名。服务端未启用 `LAYA_API_KEY` 时，key 可以留空。
2. 点击**测试连接**确认可用。Jev 会查询模型列表；Clef 和 Laya 会执行一次小型推理请求，Clef 可能计费，Laya 首次请求可能需要加载模型。
3. 如需同时显示内容分类，打开**内容分类**开关。可以修改默认的原创、搬运、广告类别，也可以自行增删类别。

各模型服务分别保存连接配置。API key 和 token 只保存在浏览器的本地扩展存储中。执行检测时，页面文本、标题和 URL 会发送到当前选择的模型服务。其他偏好设置可能会通过浏览器账号同步。Laya 的 localhost 地址指运行浏览器的机器。

启动本地 Laya 服务：

```bash
pip install "laya[serve]"
LAYA_MODELS=multilingual laya-serve
```

扩展对 `multilingual` 请求 8,192 token 的窗口，避免长文章被 Laya 默认的 1,024 token 限制截断；文章正文仍最多发送 6,000 个字符。Laya 请求超时为 60 秒，如果首次测试因下载或加载模型超时，待服务就绪后重试。

## 使用

扩展会自动检查符合条件的文章页面，并用浮动徽章显示结果。点击徽章可查看详情，也可以在弹窗中点击**立即检测**手动检查当前页面。弹窗右上角的开关用于开启或关闭检测，**内容分类**开关则控制下次检测是否同时显示内容类别。

弹窗还会显示当前网站，并提供两个快捷操作：**始终检测**会加入白名单，**从不检测**会加入黑名单；再次点击已选中的按钮即可移除该规则。

在**设置**中还可以调整：

- 内容分类的类别和描述，它们会作为分类 prompt 发送给当前模型；
- 徽章是否显示百分比；
- 自动检测所需的最小文本长度；
- 域名白名单和黑名单。可以一次添加一个或多个域名/网址，搜索列表，在两个列表之间切换域名，或直接移除。

白名单优先：白名单中的域名始终检测，黑名单中的域名始终跳过。

## 隐私

只有在执行检测时，页面文本、标题和 URL 才会发送到当前选择的模型服务。默认黑名单已经跳过常见的跟踪、社交和视频站点。

## 开发

见 [DEVELOPMENT.md](DEVELOPMENT.md)。运行扩展测试：

```bash
node --test scripts/test_extension.cjs
```
