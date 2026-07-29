# FunASR 会议总结助手

这是一个不使用 agent 的固定流程 MVP：

1. 浏览器录音或上传音频
2. 后端保存音频并临时上传到私有 OSS
3. 阿里云 Fun-ASR 生成转录和说话人分离结果
4. 用户手动绑定真实姓名并校正文案
5. 后端调用配置好的大模型 API 生成结构化会议总结
6. 本地 JSON 保存会议、转录和摘要

## 运行

```bash
npm run dev
```

打开终端显示的本地地址。

## 环境变量

复制 `.env.example` 为 `.env` 并填写密钥。`.env` 已被 Git 忽略，不能上传。

正式部署使用阿里云：

```bash
TRANSCRIPTION_PROVIDER=aliyun
DASHSCOPE_API_KEY="你的百炼 API Key"
DASHSCOPE_WORKSPACE_ID="你的 Workspace ID"
DASHSCOPE_REGION="singapore"
OSS_REGION="oss-ap-southeast-1"
OSS_BUCKET="你的私有 Bucket"
OSS_ACCESS_KEY_ID="专用 RAM 用户的 AccessKey ID"
OSS_ACCESS_KEY_SECRET="专用 RAM 用户的 AccessKey Secret"
```

阿里云模式会将音频临时上传到私有 OSS、生成限时签名 URL、异步调用
Fun-ASR，并在任务结束后尝试删除 OSS 中的临时音频。

本机模型作为备用：

```bash
export TRANSCRIPTION_PROVIDER="local"
export CLAUDE_API_KEY="你的 Anthropic API Key"
export CLAUDE_MODEL="claude-sonnet-4-6"
export FUNASR_DEVICE="cpu"
export FUNASR_MAX_SECONDS="180"
```

`FUNASR_MAX_SECONDS` 用于本地验证阶段：多声道或超长 wav 会先转成单声道，并默认只取前 180 秒，避免第一次测试被几个百 MB 的音频拖住。

如果使用智谱 BigModel：

```bash
export SUMMARY_PROVIDER="bigmodel"
export BIGMODEL_API_KEY="你的 BigModel API Key"
export BIGMODEL_MODEL="glm-4-flash"
```

## 安装 FunASR

本项目的 Node 后端会调用 `scripts/funasr_transcribe.py`。该脚本需要 Python 环境里安装 FunASR：

```bash
pip install torch torchaudio
pip install funasr
```

第一版建议先用短音频测试 CPU；正式组会长音频建议放到 GPU VM、Modal、RunPod 或学校服务器上运行。

## 数据位置

- 音频文件：`uploads/`
- 会议数据：`data/db.json`

这版先用本地文件模拟数据库。后续切到 Supabase 时，可以把 `meetings`、`meeting_transcripts`、`meeting_summaries` 分别落到对应表里。

## 生产部署

Ubuntu、systemd、Nginx 和 HTTPS 的配置模板位于 `deploy/`。生产环境通过
Nginx 访问 `127.0.0.1:5173`，可使用 `/api/health` 检查服务状态。

前端的“本机音频路径”仅适用于本机开发；生产网站应使用录音或文件上传。
