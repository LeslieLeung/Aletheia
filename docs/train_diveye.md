# DivEye 训练指南

DivEye 是 Aletheia 中基于 surprisal 多样性分析的 AI 文本检测方法。它使用 GPT-2 语言模型计算 token 级别的惊奇度（surprisal），提取统计特征后通过 XGBoost 分类器区分人类与 AI 生成的文本。

核心思路：人类文本的 surprisal 波动更大（用词多样、不可预测），AI 文本的 surprisal 更均匀（输出平滑、可预测）。

## 前置条件

```bash
# 安装项目依赖
uv sync

# 训练脚本额外需要 pandas（项目运行时不需要）
uv pip install pandas
```

## 第一步：准备 GPT-2 ONNX 模型

DivEye 的特征提取依赖 ONNX 格式的 GPT-2 模型。需要先进行转换：

```bash
# 设置模型输出目录（本地开发时用 ./models）
export MODELS_DIR=./models

# 运行转换脚本（会同时转换分类模型和 GPT-2）
uv run python scripts/convert_models.py
```

转换完成后，GPT-2 模型将保存在 `./models/openai-community/gpt2/` 目录下。

> 转换需要安装 `optimum` 和 `torch`（仅转换时需要，推理时不需要）：
> ```bash
> uv pip install "optimum[exporters,onnxruntime]" torch --index-url https://download.pytorch.org/whl/cpu
> ```

## 第二步：准备训练数据

训练脚本接受 CSV 格式的数据集，必须包含两列：

| 列名    | 类型   | 说明                        |
|---------|--------|-----------------------------|
| `text`  | string | 文本内容                     |
| `label` | int    | 0 = 人类撰写，1 = AI 生成    |

### 数据集格式示例

```csv
text,label
"The quick brown fox jumps over the lazy dog. This sentence has been used...",0
"In the realm of artificial intelligence, large language models have...",1
```

### 数据来源建议

可以从以下公开数据集构建训练数据：

**1. HC3 (Human ChatGPT Comparison Corpus)**

包含人类与 ChatGPT 对同一问题的回答，适合英文和中文检测。

- 来源：[Hello-SimpleAI/HC3](https://huggingface.co/datasets/Hello-SimpleAI/HC3)
- 构建方式：将 `human_answers` 标为 0，`chatgpt_answers` 标为 1

**2. CHEAT (ChatGPT-writtEn AbsTract)**

学术论文摘要数据集，含人类撰写和 ChatGPT 生成的版本。

- 来源：[yuchuantian/CHEAT](https://huggingface.co/datasets/yuchuantian/CHEAT)

**3. 自行收集**

用目标 LLM（ChatGPT、Claude 等）对同一主题生成文本，与人类撰写的文本配对：

```python
import pandas as pd

data = []
# 人类文本
for text in human_texts:
    data.append({"text": text, "label": 0})
# AI 文本
for text in ai_texts:
    data.append({"text": text, "label": 1})

df = pd.DataFrame(data)
df.to_csv("train_data.csv", index=False)
```

### 数据集建议

- **数量**：至少 1000 条（人类和 AI 各 500 条），推荐 5000+ 条
- **平衡**：人类与 AI 文本数量尽量 1:1
- **长度**：每条文本建议 50 字以上（过短的文本特征不明显）
- **多样性**：覆盖多种主题和写作风格，避免数据集偏向特定领域
- **语言**：DivEye 使用英文 GPT-2，对英文效果最佳；中文文本需要确保 GPT-2 tokenizer 能合理分词

## 第三步：运行训练

```bash
export MODELS_DIR=./models

uv run python scripts/train_diveye.py \
    --train_dataset train_data.csv \
    --model_dir ./models/openai-community/gpt2 \
    --output ./models/diveye/xgb_classifier.json
```

### 参数说明

| 参数              | 默认值                              | 说明                        |
|-------------------|-------------------------------------|-----------------------------|
| `--train_dataset` | （必填）                             | 训练数据 CSV 路径            |
| `--model_dir`     | `/app/models/openai-community/gpt2` | GPT-2 ONNX 模型目录         |
| `--output`        | `models/diveye/xgb_classifier.json` | XGBoost 模型输出路径         |

训练完成后，XGBoost 模型将保存为 JSON 格式（跨平台安全，不使用 pickle）。

### 训练时间参考

特征提取是主要耗时环节（每条文本需要一次 GPT-2 前向推理），XGBoost 训练本身很快：

- 1000 条文本：约 5-10 分钟（CPU）
- 5000 条文本：约 25-50 分钟（CPU）

## 第四步：验证

训练完成后，启动服务并测试 DivEye 检测器：

```bash
export MODELS_DIR=./models

uv run uvicorn app.main:app --reload
```

发送测试请求：

```bash
curl -X POST http://localhost:8000/detect \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Your test text here...",
    "detector": "diveye"
  }'
```

响应示例：

```json
{
  "label": "ai",
  "score": 0.87,
  "model_id": "diveye",
  "detected_lang": "en",
  "num_chunks": 1,
  "detector": "diveye"
}
```

不指定 `detector` 字段时，默认使用 `onnx_classifier`（原有检测器），保持向后兼容。

## Docker 部署

将训练好的模型放入 `models/diveye/` 目录，Docker 构建时会自动复制：

```
models/
└── diveye/
    └── xgb_classifier.json
```

```bash
docker compose up --build
```

## 提取的特征说明

DivEye 从 GPT-2 的 surprisal（惊奇度）序列中提取 10 个统计特征：

| #  | 特征名          | 含义                              |
|----|----------------|-----------------------------------|
| 1  | `mean_s`       | surprisal 均值                    |
| 2  | `std_s`        | surprisal 标准差                  |
| 3  | `var_s`        | surprisal 方差                    |
| 4  | `skew_s`       | surprisal 偏度                    |
| 5  | `kurt_s`       | surprisal 峰度                    |
| 6  | `mean_diff`    | surprisal 一阶差分均值            |
| 7  | `std_diff`     | surprisal 一阶差分标准差          |
| 8  | `var_2nd`      | log-likelihood 二阶差分方差       |
| 9  | `entropy_2nd`  | 二阶差分熵（20 bins 直方图）      |
| 10 | `autocorr_2nd` | 二阶差分自相关                    |

## XGBoost 超参数

训练脚本使用以下默认超参数（参照 DivEye 原论文）：

```python
max_depth=12
n_estimators=200
colsample_bytree=0.8
subsample=0.7
min_child_weight=5
gamma=1.0
```

如需调参，可直接修改 `scripts/train_diveye.py` 中的参数。
