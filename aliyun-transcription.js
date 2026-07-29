import OSS from "ali-oss";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export async function transcribeWithAliyun({
  audioPath,
  originalName,
  meetingId,
  speakerCount,
  onProgress
}) {
  const config = readAliyunConfig();
  const client = createOssClient(config);
  const extension = path.extname(originalName || audioPath).toLowerCase() || ".audio";
  const objectName = [
    String(config.objectPrefix || "meeting-audio").replace(/^\/+|\/+$/g, ""),
    new Date().toISOString().slice(0, 10),
    `${meetingId || crypto.randomUUID()}${extension}`
  ].filter(Boolean).join("/");

  await report(onProgress, 10, "正在上传音频到阿里云 OSS");
  await client.put(objectName, audioPath);

  try {
    const signedUrl = client.signatureUrl(objectName, {
      expires: Number(config.signedUrlExpiresSeconds || 21600)
    });

    await report(onProgress, 22, "正在提交阿里云 Fun-ASR 任务");
    const taskId = await submitTask(config, signedUrl, speakerCount);
    await report(onProgress, 30, "Fun-ASR 已接收任务，正在排队");

    const taskResult = await pollTask(config, taskId, onProgress);
    await report(onProgress, 92, "正在下载并整理转写结果");
    const resultPayload = await fetchJson(taskResult.transcriptionUrl, {
      timeoutMs: 120000,
      label: "下载 Fun-ASR 转写结果"
    });
    const segments = normalizeAliyunSegments(resultPayload);
    await report(onProgress, 98, "转写结果已整理完成");
    return segments;
  } finally {
    await client.delete(objectName).catch((error) => {
      console.warn(`OSS 临时音频清理失败 (${objectName}):`, error.message);
    });
  }
}

function readAliyunConfig() {
  const required = [
    "DASHSCOPE_API_KEY",
    "OSS_REGION",
    "OSS_BUCKET",
    "OSS_ACCESS_KEY_ID",
    "OSS_ACCESS_KEY_SECRET"
  ];
  const missing = required.filter((key) => !String(process.env[key] || "").trim());
  if (missing.length) {
    throw new Error(`阿里云配置不完整，请在 .env 中填写：${missing.join("、")}`);
  }

  return {
    apiKey: process.env.DASHSCOPE_API_KEY.trim(),
    workspaceId: String(process.env.DASHSCOPE_WORKSPACE_ID || "").trim(),
    dashscopeRegion: String(process.env.DASHSCOPE_REGION || "beijing").trim().toLowerCase(),
    baseUrl: String(process.env.DASHSCOPE_BASE_URL || "").trim(),
    model: String(process.env.DASHSCOPE_ASR_MODEL || "fun-asr").trim(),
    vocabularyId: String(process.env.DASHSCOPE_VOCABULARY_ID || "").trim(),
    languageHints: parseCsv(process.env.DASHSCOPE_LANGUAGE_HINTS || "zh,en"),
    ossRegion: process.env.OSS_REGION.trim(),
    ossEndpoint: String(process.env.OSS_ENDPOINT || "").trim(),
    bucket: process.env.OSS_BUCKET.trim(),
    accessKeyId: process.env.OSS_ACCESS_KEY_ID.trim(),
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET.trim(),
    secure: String(process.env.OSS_SECURE || "true").toLowerCase() !== "false",
    objectPrefix: process.env.OSS_OBJECT_PREFIX,
    signedUrlExpiresSeconds: process.env.OSS_SIGNED_URL_EXPIRES_SECONDS
  };
}

function createOssClient(config) {
  return new OSS({
    region: normalizeOssRegion(config.ossRegion),
    endpoint: config.ossEndpoint || undefined,
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    bucket: config.bucket,
    secure: config.secure,
    timeout: 10 * 60 * 1000
  });
}

function normalizeOssRegion(region) {
  const value = String(region || "").trim();
  if (!value) return value;
  if (value.startsWith("oss-")) return value;
  const aliases = {
    singapore: "oss-ap-southeast-1",
    "ap-southeast-1": "oss-ap-southeast-1",
    hongkong: "oss-cn-hongkong",
    "hong-kong": "oss-cn-hongkong",
    "cn-hongkong": "oss-cn-hongkong",
    beijing: "oss-cn-beijing",
    "cn-beijing": "oss-cn-beijing"
  };
  return aliases[value.toLowerCase()] || value;
}

async function submitTask(config, audioUrl, speakerCount) {
  const parameters = {
    channel_id: [0],
    diarization_enabled: true,
    language_hints: config.languageHints
  };
  if (config.vocabularyId) parameters.vocabulary_id = config.vocabularyId;
  const normalizedSpeakerCount = Number(speakerCount);
  if (Number.isInteger(normalizedSpeakerCount) && normalizedSpeakerCount >= 2) {
    parameters.speaker_count = Math.min(100, normalizedSpeakerCount);
  }

  const response = await dashscopeFetch(config, "/api/v1/services/audio/asr/transcription", {
    method: "POST",
    headers: { "X-DashScope-Async": "enable" },
    body: JSON.stringify({
      model: config.model,
      input: { file_urls: [audioUrl] },
      parameters
    })
  });
  const taskId = response?.output?.task_id || response?.task_id;
  if (!taskId) {
    throw new Error(`Fun-ASR 没有返回 task_id：${response?.message || "未知响应"}`);
  }
  return taskId;
}

async function pollTask(config, taskId, onProgress) {
  const startedAt = Date.now();
  const timeoutMs = Number(process.env.DASHSCOPE_TASK_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const intervalMs = Math.max(
    1000,
    Number(process.env.DASHSCOPE_POLL_INTERVAL_MS || DEFAULT_POLL_INTERVAL_MS)
  );
  let pollCount = 0;

  while (Date.now() - startedAt < timeoutMs) {
    const payload = await dashscopeFetch(config, `/api/v1/tasks/${encodeURIComponent(taskId)}`);
    const output = payload?.output || payload;
    const status = String(output?.task_status || output?.status || "").toUpperCase();

    if (status === "SUCCEEDED") {
      const transcriptionUrl = findTranscriptionUrl(output);
      if (!transcriptionUrl) {
        throw new Error("Fun-ASR 任务成功，但响应中没有 transcription_url");
      }
      return { transcriptionUrl, payload };
    }
    if (["FAILED", "CANCELED", "UNKNOWN"].includes(status)) {
      const message = output?.message || output?.task_message || payload?.message || status;
      throw new Error(`Fun-ASR 任务失败：${message}`);
    }

    pollCount += 1;
    const elapsedRatio = Math.min(1, (Date.now() - startedAt) / Math.max(timeoutMs, 1));
    const percent = Math.min(88, 32 + Math.round(elapsedRatio * 45) + Math.min(11, pollCount));
    const stage = status === "PENDING"
      ? "Fun-ASR 正在排队"
      : "正在进行语音识别和说话人分离";
    await report(onProgress, percent, stage);
    await delay(intervalMs);
  }

  throw new Error("Fun-ASR 云端任务超时，请稍后重试或检查阿里云控制台任务状态");
}

async function dashscopeFetch(config, pathname, options = {}) {
  const baseUrl = resolveDashscopeBaseUrl(config);
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(Number(process.env.DASHSCOPE_REQUEST_TIMEOUT_MS || 120000))
  }).catch((error) => {
    throw new Error(`无法连接阿里云 Fun-ASR：${error.message}`);
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const requestId = payload?.request_id || response.headers.get("x-request-id");
    const message = payload?.message || payload?.code || `HTTP ${response.status}`;
    throw new Error(`阿里云 Fun-ASR 请求失败：${message}${requestId ? `（Request ID: ${requestId}）` : ""}`);
  }
  return payload;
}

function resolveDashscopeBaseUrl(config) {
  if (config.baseUrl) return config.baseUrl.replace(/\/+$/, "");
  if (!config.workspaceId) {
    return config.dashscopeRegion.includes("singapore")
      || config.dashscopeRegion.includes("southeast")
      ? "https://dashscope-intl.aliyuncs.com"
      : "https://dashscope.aliyuncs.com";
  }
  if (config.dashscopeRegion.includes("singapore") || config.dashscopeRegion.includes("southeast")) {
    return `https://${config.workspaceId}.ap-southeast-1.maas.aliyuncs.com`;
  }
  return `https://${config.workspaceId}.cn-beijing.maas.aliyuncs.com`;
}

function findTranscriptionUrl(output) {
  if (output?.transcription_url) return output.transcription_url;
  const results = output?.results;
  if (!Array.isArray(results)) return "";
  return results.find((item) => item?.transcription_url)?.transcription_url || "";
}

function normalizeAliyunSegments(payload) {
  const candidates = [];
  collectSentences(payload, candidates);
  return candidates
    .map((sentence, index) => {
      const startMs = firstNumber(
        sentence.begin_time,
        sentence.start_time,
        sentence.start,
        sentence.start_ms
      );
      const endMs = firstNumber(
        sentence.end_time,
        sentence.stop_time,
        sentence.end,
        sentence.end_ms
      );
      const speaker = sentence.speaker_id ?? sentence.speaker ?? sentence.spk ?? 0;
      return {
        speaker_label: normalizeSpeaker(speaker),
        start_time: millisecondsToSeconds(startMs),
        end_time: millisecondsToSeconds(endMs),
        text: String(sentence.text ?? sentence.transcript ?? sentence.sentence ?? "").trim(),
        sort_order: index
      };
    })
    .filter((segment) => segment.text)
    .sort((a, b) => a.start_time - b.start_time);
}

function collectSentences(value, output) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectSentences(item, output);
    return;
  }

  const looksLikeSentence = (
    value.text !== undefined
    || value.transcript !== undefined
    || value.sentence !== undefined
  ) && (
    value.begin_time !== undefined
    || value.start_time !== undefined
    || value.start !== undefined
  );
  if (looksLikeSentence) {
    output.push(value);
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (["words", "word_list", "tokens"].includes(key)) continue;
    collectSentences(child, output);
  }
}

function normalizeSpeaker(value) {
  const match = String(value ?? "0").match(/\d+/);
  const number = match ? Number(match[0]) : 0;
  return `SPEAKER_${String(number).padStart(2, "0")}`;
}

function millisecondsToSeconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, number / 1000);
}

function firstNumber(...values) {
  return values.find((value) => Number.isFinite(Number(value))) ?? 0;
}

async function fetchJson(url, { timeoutMs, label }) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs)
  }).catch((error) => {
    throw new Error(`${label}失败：${error.message}`);
  });
  if (!response.ok) {
    throw new Error(`${label}失败：HTTP ${response.status}`);
  }
  return response.json().catch(() => {
    throw new Error(`${label}失败：响应不是有效 JSON`);
  });
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function report(callback, percent, stage) {
  if (callback) await callback({ percent, stage });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { normalizeAliyunSegments, resolveDashscopeBaseUrl };
