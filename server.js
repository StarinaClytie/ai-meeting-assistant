import { createServer } from "node:http";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { transcribeWithAliyun } from "./aliyun-transcription.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
await loadLocalEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || "127.0.0.1";
const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(__dirname, "uploads");
const PROGRESS_DIR = path.join(DATA_DIR, "progress");
const DB_PATH = path.join(DATA_DIR, "db.json");
const PUBLIC_DIR = path.join(__dirname, "public");

const STATUS = {
  uploaded: "uploaded",
  transcribing: "transcribing",
  transcribed: "transcribed",
  summarizing: "summarizing",
  summarized: "summarized",
  failed: "failed"
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webm": "audio/webm",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4"
};

const transcriptionJobs = new Map();

await ensureStorage();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(res, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(res, error.statusCode || 500, {
      error: error instanceof Error ? error.message : "服务器处理失败",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  server.listen(PORT, HOST, () => {
    console.log(`Meeting Assistant running at http://${HOST}:${PORT}`);
  });
}

async function handleApi(req, res, url) {
  const method = req.method || "GET";

  if (method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, {
      status: "ok",
      transcription_provider: String(process.env.TRANSCRIPTION_PROVIDER || "local"),
      summary_provider: String(process.env.SUMMARY_PROVIDER || "claude"),
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (method === "GET" && url.pathname === "/api/meetings") {
    const db = await readDb();
    await normalizeStaleTranscriptions(db);
    sendJson(res, 200, { meetings: db.meetings.map(publicMeeting) });
    return;
  }

  if (method === "POST" && url.pathname === "/api/meetings") {
    const body = await readJsonBody(req);
    const meeting = await createMeeting(body);
    sendJson(res, 201, { meeting });
    return;
  }

  const match = url.pathname.match(/^\/api\/meetings\/([^/]+)(?:\/([^/]+))?$/);
  if (!match) {
    sendJson(res, 404, { error: "接口不存在" });
    return;
  }

  const [, meetingId, action] = match;

  if (method === "GET" && !action) {
    const meeting = await getMeeting(meetingId);
    sendJson(res, 200, { meeting });
    return;
  }

  if (method === "POST" && action === "transcribe") {
    const meeting = await startTranscription(meetingId);
    sendJson(res, 200, { meeting });
    return;
  }

  if (method === "PATCH" && action === "segments") {
    const body = await readJsonBody(req);
    const meeting = await updateSegments(meetingId, body.segments);
    sendJson(res, 200, { meeting });
    return;
  }

  if (method === "PATCH" && action === "summary") {
    const body = await readJsonBody(req);
    const meeting = await updateSummary(meetingId, body.summary);
    sendJson(res, 200, { meeting });
    return;
  }

  if (method === "POST" && action === "summarize") {
    const body = await readJsonBody(req);
    const meeting = await summarizeMeeting(meetingId, body);
    sendJson(res, 200, { meeting });
    return;
  }

  sendJson(res, 405, { error: "请求方法不支持" });
}

async function createMeeting(body) {
  const title = String(body.title || "").trim() || "未命名会议";
  const hotwords = normalizeHotwords(body.hotwords);
  const audio = body.audio;
  if (!audio) {
    throw httpError(400, "请先录音、选择音频文件，或填写本机音频路径");
  }

  let originalName;
  let mimeType;
  let audioPath;
  let audioSize;
  let sourceType;
  const id = crypto.randomUUID();

  if (audio.localPath) {
    const resolvedPath = path.resolve(String(audio.localPath));
    const fileStat = await stat(resolvedPath).catch(() => null);
    if (!fileStat?.isFile()) {
      throw httpError(400, "本机音频路径不存在，或不是一个文件");
    }
    const extension = safeAudioExtension(resolvedPath, "");
    originalName = path.basename(resolvedPath);
    mimeType = mimeFromExtension(extension);
    audioPath = resolvedPath;
    audioSize = fileStat.size;
    sourceType = "local_path";
  } else if (audio.dataUrl && audio.name) {
    const parsed = parseDataUrl(audio.dataUrl);
    if (!parsed.buffer.length) {
      throw httpError(400, "音频文件为空");
    }

    const extension = safeAudioExtension(audio.name, parsed.mime);
    const audioFileName = `${id}${extension}`;
    audioPath = path.join(UPLOAD_DIR, audioFileName);
    await writeFile(audioPath, parsed.buffer);
    originalName = String(audio.name);
    mimeType = parsed.mime;
    audioSize = parsed.buffer.length;
    sourceType = "uploaded";
  } else {
    throw httpError(400, "请先录音、选择音频文件，或填写本机音频路径");
  }

  const meeting = {
    id,
    title,
    status: STATUS.uploaded,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    audio: {
      original_name: originalName,
      mime_type: mimeType,
      path: audioPath,
      size: audioSize,
      source_type: sourceType
    },
    transcripts: [],
    summary: null,
    hotwords,
    error: null
  };

  const db = await readDb();
  db.meetings.unshift(meeting);
  await writeDb(db);
  return publicMeeting(meeting);
}

async function startTranscription(meetingId) {
  if (transcriptionJobs.has(meetingId)) {
    return getMeeting(meetingId);
  }

  const db = await readDb();
  const meeting = findMeeting(db, meetingId);
  meeting.status = STATUS.transcribing;
  meeting.error = null;
  meeting.progress = {
    percent: 5,
    stage: "已提交转写任务",
    updated_at: new Date().toISOString()
  };
  touch(meeting);
  await writeDb(db);

  const job = transcribeMeeting(meetingId)
    .catch((error) => {
      console.error("Transcription job failed:", error);
    })
    .finally(() => {
      transcriptionJobs.delete(meetingId);
    });
  transcriptionJobs.set(meetingId, job);
  return publicMeeting(meeting);
}

async function transcribeMeeting(meetingId) {
  const db = await readDb();
  const meeting = findMeeting(db, meetingId);

  try {
    const segments = await runFunAsr(meeting.audio.path, meetingId, meeting.hotwords || []);
    if (!segments.length) {
      throw new Error("FunASR 没有返回可用转录片段");
    }
    meeting.transcripts = segments.map((segment, index) => ({
      id: crypto.randomUUID(),
      speaker_label: normalizeSpeakerLabel(segment.speaker_label ?? segment.speaker ?? segment.spk),
      speaker_name: "",
      start_time: Number(segment.start_time ?? segment.start ?? 0),
      end_time: Number(segment.end_time ?? segment.end ?? 0),
      text: String(segment.text ?? segment.sentence ?? "").trim(),
      sort_order: index
    })).filter((segment) => segment.text);
    meeting.status = STATUS.transcribed;
    meeting.progress = {
      percent: 100,
      stage: "转写完成",
      updated_at: new Date().toISOString()
    };
    touch(meeting);
    await writeDb(db);
    await removeProgressFile(meetingId);
    return publicMeeting(meeting);
  } catch (error) {
    meeting.status = STATUS.failed;
    meeting.error = error instanceof Error ? error.message : String(error);
    meeting.progress = {
      percent: 100,
      stage: "转写失败",
      updated_at: new Date().toISOString()
    };
    touch(meeting);
    await writeDb(db);
    await removeProgressFile(meetingId);
    throw httpError(502, meeting.error);
  }
}

async function updateSegments(meetingId, segments) {
  if (!Array.isArray(segments)) {
    throw httpError(400, "segments 必须是数组");
  }
  const db = await readDb();
  const meeting = findMeeting(db, meetingId);
  meeting.transcripts = segments.map((segment, index) => ({
    id: String(segment.id || crypto.randomUUID()),
    speaker_label: normalizeSpeakerLabel(segment.speaker_label),
    speaker_name: String(segment.speaker_name || "").trim(),
    start_time: Number(segment.start_time || 0),
    end_time: Number(segment.end_time || 0),
    text: String(segment.text || "").trim(),
    sort_order: Number.isFinite(segment.sort_order) ? segment.sort_order : index
  })).filter((segment) => segment.text);
  meeting.summary = null;
  meeting.status = STATUS.transcribed;
  meeting.error = null;
  touch(meeting);
  await writeDb(db);
  return publicMeeting(meeting);
}

async function updateSummary(meetingId, summary) {
  if (!summary || typeof summary !== "object") {
    throw httpError(400, "summary 必须是对象");
  }
  const db = await readDb();
  const meeting = findMeeting(db, meetingId);
  const normalized = validateSummary(summary);
  meeting.summary = {
    ...normalized,
    template: cleanText(summary.template || meeting.summary?.template || "auto"),
    created_at: cleanText(summary.created_at || meeting.summary?.created_at) || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  meeting.status = STATUS.summarized;
  meeting.error = null;
  touch(meeting);
  await writeDb(db);
  return publicMeeting(meeting);
}

async function summarizeMeeting(meetingId, options = {}) {
  const db = await readDb();
  const meeting = findMeeting(db, meetingId);
  if (!meeting.transcripts.length) {
    throw httpError(400, "请先完成转录");
  }
  const missingName = meeting.transcripts.some((segment) => !segment.speaker_name);
  if (missingName) {
    throw httpError(400, "请先为每个说话人绑定真实姓名");
  }

  meeting.status = STATUS.summarizing;
  meeting.error = null;
  touch(meeting);
  await writeDb(db);

  try {
    const summaryOptions = normalizeSummaryOptions(options);
    const summary = await callSummaryModel(meeting.transcripts, meeting.hotwords || [], summaryOptions);
    meeting.summary = {
      ...summary,
      template: summaryOptions.template,
      created_at: new Date().toISOString()
    };
    meeting.summary_options = summaryOptions;
    meeting.status = STATUS.summarized;
    touch(meeting);
    await writeDb(db);
    return publicMeeting(meeting);
  } catch (error) {
    meeting.status = STATUS.failed;
    meeting.error = error instanceof Error ? error.message : String(error);
    touch(meeting);
    await writeDb(db);
    throw httpError(502, meeting.error);
  }
}

async function callSummaryModel(segments, hotwords = [], options = {}) {
  const provider = String(process.env.SUMMARY_PROVIDER || "claude").toLowerCase();
  if (provider === "bigmodel" || provider === "zhipu" || provider === "glm") {
    return callBigModel(segments, hotwords, options);
  }
  if (provider === "claude" || provider === "anthropic") {
    return callClaude(segments, hotwords, options);
  }
  throw new Error(`不支持的摘要模型提供方：${provider}`);
}

async function runFunAsr(audioPath, meetingId, hotwords = []) {
  const provider = String(process.env.TRANSCRIPTION_PROVIDER || "local").trim().toLowerCase();
  if (provider === "aliyun" || provider === "dashscope") {
    return transcribeWithAliyun({
      audioPath,
      originalName: path.basename(audioPath),
      meetingId,
      speakerCount: process.env.DASHSCOPE_SPEAKER_COUNT,
      onProgress: (progress) => updateMeetingProgress(meetingId, progress)
    });
  }
  if (provider !== "local" && provider !== "funasr") {
    throw new Error(`不支持的转写提供方：${provider}`);
  }

  const normalizedHotwords = normalizeHotwords(hotwords);
  try {
    return await runFunAsrOnce(audioPath, meetingId, normalizedHotwords);
  } catch (error) {
    if (!normalizedHotwords.length) throw error;
    await updateMeetingProgress(meetingId, {
      percent: 45,
      stage: "热词转写失败，正在不带热词重试"
    });
    try {
      return await runFunAsrOnce(audioPath, meetingId, []);
    } catch {
      throw error;
    }
  }
}

async function runFunAsrOnce(audioPath, meetingId, hotwords = []) {
  const python = process.env.PYTHON_BIN || "python3";
  const script = path.join(__dirname, "scripts", "funasr_transcribe.py");
  const progressPath = progressFilePath(meetingId);
  await writeProgress(progressPath, 8, "准备音频");
  const env = {
    ...process.env,
    FUNASR_DEVICE: process.env.FUNASR_DEVICE || "cpu",
    FUNASR_MODEL: process.env.FUNASR_MODEL || "iic/SenseVoiceSmall",
    FUNASR_MAX_SECONDS: process.env.FUNASR_MAX_SECONDS || "180",
    FUNASR_PROGRESS_PATH: progressPath,
    FUNASR_HOTWORDS: JSON.stringify(normalizeHotwords(hotwords))
  };

  const result = await runProcess(python, [script, audioPath], {
    env,
    timeoutMs: 1000 * 60 * 30,
    onProgress: (progress) => updateMeetingProgress(meetingId, progress)
  });

  try {
    const payload = parseJsonFromProcessOutput(result.stdout);
    if (payload.error) {
      throw new Error(payload.error);
    }
    const segments = Array.isArray(payload.segments) ? payload.segments : [];
    if (segments.length || result.code === 0) {
      return segments;
    }
  } catch (error) {
    if (result.code !== 0) {
      throw new Error(cleanProcessError(result.stderr || result.stdout || "FunASR 转录失败"));
    }
    throw new Error(`FunASR 输出不是有效 JSON：${error instanceof Error ? error.message : String(error)}`);
  }

  if (result.code !== 0) {
    throw new Error(cleanProcessError(result.stderr || result.stdout || "FunASR 转录失败"));
  }

  return [];
}

function parseJsonFromProcessOutput(output) {
  const text = String(output || "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (lines[index].startsWith("{") && lines[index].endsWith("}")) {
        return JSON.parse(lines[index]);
      }
    }
    const start = text.lastIndexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("没有找到 JSON 结果");
  }
}

function cleanProcessError(output) {
  const withoutAnsi = String(output || "")
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
    .replace(/\r/g, "\n");
  const lines = withoutAnsi
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.includes("%|") && !line.startsWith("{'load_data'") && !line.startsWith("rtf_avg:"));
  const useful = lines.slice(-8).join("\n");
  return useful || "FunASR 转录失败，请换短音频或检查模型环境";
}

async function callClaude(segments, hotwords = [], options = {}) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 CLAUDE_API_KEY，请在环境变量中配置后再生成摘要");
  }

  const prompt = buildSummaryPrompt(segments, hotwords, options);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || "claude-sonnet-4-6",
      max_tokens: Number(process.env.SUMMARY_MAX_TOKENS || 4000),
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }]
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Claude API 请求失败：${response.status}`);
  }

  const text = payload?.content?.map((part) => part.type === "text" ? part.text : "").join("").trim();
  if (!text) {
    throw new Error("Claude 没有返回摘要文本");
  }

  const parsed = parseJsonObject(text);
  return enrichSummaryWithTranscript(validateSummary(parsed), segments);
}

async function callBigModel(segments, hotwords = [], options = {}) {
  const apiKey = process.env.BIGMODEL_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 BIGMODEL_API_KEY，请在 .env 中配置后再生成摘要");
  }

  const prompt = buildSummaryPrompt(segments, hotwords, options);
  let response;
  try {
    response = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.BIGMODEL_MODEL || "glm-4-flash",
        temperature: 0.2,
        max_tokens: Number(process.env.SUMMARY_MAX_TOKENS || 4000),
        messages: [
          {
            role: "system",
            content: "你是严谨的中文会议内容分析助手。你必须区分事实、结论、已发生事件和未来行动，只输出合法 JSON，不输出 Markdown。"
          },
          {
            role: "user",
            content: prompt
          }
        ]
      }),
      signal: AbortSignal.timeout(Number(process.env.SUMMARY_TIMEOUT_MS || 120000))
    });
  } catch (error) {
    if (error?.name === "TimeoutError") {
      throw new Error("连接智谱 API 超时，请检查网络或代理后重试");
    }
    throw new Error("无法连接智谱 API（open.bigmodel.cn:443），请检查 VPN、代理或当前网络后重试");
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.msg || `BigModel API 请求失败：${response.status}`);
  }

  const text = payload?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("BigModel 没有返回摘要文本");
  }

  const parsed = parseJsonObject(text);
  return enrichSummaryWithTranscript(validateSummary(parsed), segments);
}

function buildSummaryPrompt(segments, hotwords = [], options = {}) {
  const summaryOptions = normalizeSummaryOptions(options);
  const transcriptText = [...segments]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((segment) => {
      const start = formatSeconds(segment.start_time);
      const end = formatSeconds(segment.end_time);
      return `[${start}-${end}] ${segment.speaker_name}: ${segment.text}`;
    })
    .join("\n");

  const schema = {
    version: 2,
    meeting_type: "识别出的会议类型",
    title: "准确概括本次内容的标题",
    summary: "2至4句整体概述，说明目的、核心内容和结果",
    core_takeaways: [
      {
        title: "结论式短标题",
        detail: "具体概念、结论、方法或纠错，不是讨论过程复述",
        evidence: [{ timestamp: "MM:SS", speaker: "姓名" }]
      }
    ],
    chapters: [
      {
        start_time: "MM:SS",
        title: "章节主题",
        summary: "本章讲清楚了什么",
        key_points: ["本章的具体结论或方法"],
        formulas: ["原文明确出现的公式或计算结果"],
        misconceptions: ["原文明示的易错点及正确理解"]
      }
    ],
    action_items: [
      {
        person: "明确负责人",
        task: "未来需要完成的动作",
        deadline: "明确截止时间，没有则为空字符串",
        evidence_timestamp: "MM:SS"
      }
    ],
    decisions: [
      {
        decision: "明确达成的决定",
        evidence_timestamp: "MM:SS"
      }
    ],
    highlights: [
      {
        speaker: "说话人",
        quote: "接近原文的关键表达",
        timestamp: "MM:SS",
        significance: "它为何重要"
      }
    ]
  };

  const glossary = normalizeHotwords(hotwords);
  const glossaryText = glossary.length
    ? `\n\n本次会议专业热词/术语表：\n${glossary.map((word) => `- ${word}`).join("\n")}\n\n如果转录文本里出现明显相近但错误的专业词，请优先参考术语表修正；不要凭空添加术语表之外的信息。`
    : "";

  const templateInstruction = summaryTemplateInstruction(summaryOptions);
  const customInstruction = summaryOptions.customPrompt
    ? `\n\n用户补充要求：\n${summaryOptions.customPrompt}`
    : "";

  return `请根据带时间戳的转录生成高质量结构化纪要，只返回一个合法 JSON 对象，不要 Markdown，不要解释。

总结模式：${summaryOptions.template}
${templateInstruction}

必须遵守：
1. 所有内容只能来自转录。不要补充常识性答案，不要猜测原文没有的信息。
2. core_takeaways 必须是被讲清楚的概念、结论、方法、限制条件或纠正后的认识，只写最重要的 4 至 6 条。禁止使用“讨论了、分析了、讲解了”开头来简单罗列议题。每条 detail 写 60 至 140 个汉字，至少包含“具体结论 + 推理或原因 + 适用条件/实际意义”中的两项；原文有数字、公式或纠错时优先保留。
3. action_items 只记录原文明确要求未来执行的任务或承诺，必须有负责人。像“解释了某题、分享了思路、回答了问题”属于已经发生的活动，不是待办。没有明确待办时必须返回空数组。
4. decisions 只记录明确拍板、达成共识或确定采用的方案。课程讲解内容和知识结论不是会议决策。没有时必须返回空数组。
5. chapters 按时间顺序覆盖主要内容，通常 3 至 8 章。start_time 必须逐字复制该章节第一条相关转录开头的 MM:SS，不得留空。
6. formulas 和计算结果仅在原文明示时记录。无法确认的专业词、公式、数字或人名应省略，不要臆测。
7. core_takeaways、action_items、decisions 和 highlights 都要提供可追溯的原文时间戳。
8. highlights 优先选择老师总结结论、纠正常见错误、解释适用条件或给出实用方法的表达，保持接近原文。课程讲解通常选 2 至 5 条，不要因为语言口语化就返回空数组；只有整段转录确实没有完整观点时才返回空数组。
9. 每个列表只保留高价值且不重复的内容。宁可少而准确，不要为了填满栏目制造内容。${glossaryText}${customInstruction}

转录内容：
${transcriptText}

严格返回以下结构：
${JSON.stringify(schema, null, 2)}`;
}

function validateSummary(summary) {
  if (!summary || typeof summary !== "object") {
    throw new Error("摘要结果不是对象");
  }
  const coreTakeaways = normalizeObjectList(summary.core_takeaways, (item) => ({
    title: cleanText(item?.title),
    detail: cleanText(item?.detail),
    evidence: normalizeObjectList(item?.evidence, (evidence) => ({
      timestamp: normalizeTimestamp(evidence?.timestamp),
      speaker: cleanText(evidence?.speaker)
    })).filter((evidence) => evidence.timestamp || evidence.speaker)
  })).filter((item) => item.title || item.detail);
  const legacyKeyPoints = Array.isArray(summary.key_points)
    ? summary.key_points.map(cleanText).filter(Boolean)
    : [];

  return {
    version: 2,
    meeting_type: cleanText(summary.meeting_type) || "通用会议",
    title: cleanText(summary.title),
    summary: String(summary.summary || "").trim(),
    core_takeaways: coreTakeaways.length
      ? coreTakeaways
      : legacyKeyPoints.map((detail) => ({ title: "核心要点", detail, evidence: [] })),
    key_points: coreTakeaways.length
      ? coreTakeaways.map((item) => item.detail || item.title).filter(Boolean)
      : legacyKeyPoints,
    chapters: normalizeObjectList(summary.chapters, (item) => ({
      start_time: normalizeTimestamp(item?.start_time ?? item?.timestamp),
      title: cleanText(item?.title),
      summary: cleanText(item?.summary),
      key_points: normalizeStringList(item?.key_points),
      formulas: normalizeStringList(item?.formulas),
      misconceptions: normalizeStringList(item?.misconceptions)
    })).filter((item) => item.title || item.summary),
    action_items: normalizeObjectList(summary.action_items, (item) => ({
      person: cleanText(item?.person),
      task: cleanText(item?.task),
      deadline: cleanText(item?.deadline),
      evidence_timestamp: normalizeTimestamp(item?.evidence_timestamp)
    })).filter((item) => item.person && item.task),
    decisions: normalizeObjectList(summary.decisions, (item) => {
      if (typeof item === "string") {
        return { decision: cleanText(item), evidence_timestamp: "" };
      }
      return {
        decision: cleanText(item?.decision),
        evidence_timestamp: normalizeTimestamp(item?.evidence_timestamp)
      };
    }).filter((item) => item.decision),
    highlights: normalizeObjectList(summary.highlights, (item) => ({
      speaker: cleanText(item?.speaker),
      quote: cleanText(item?.quote),
      timestamp: normalizeTimestamp(item?.timestamp),
      significance: cleanText(item?.significance)
    })).filter((item) => item.quote)
  };
}

function normalizeSummaryOptions(value = {}) {
  const allowedTemplates = new Set(["auto", "teaching", "research", "project", "general", "custom"]);
  const requestedTemplate = String(value.template || "auto").trim().toLowerCase();
  return {
    template: allowedTemplates.has(requestedTemplate) ? requestedTemplate : "auto",
    customPrompt: String(value.customPrompt || "").trim().slice(0, 3000)
  };
}

function summaryTemplateInstruction(options) {
  const instructions = {
    auto: "先判断内容属于课程讲解、科研组会、项目会议或通用讨论，再采用最适合该类型的信息结构。",
    teaching: "这是课程或作业讲解。重点提炼知识结论、解题步骤、公式、适用条件、学生易错点和老师的纠正方式；不要把被点名回答问题误写成待办。",
    research: "这是科研组会。重点提炼研究问题、方法、实验结果、证据、假设、风险、阻塞项、明确决策和下一步负责人。",
    project: "这是项目会议。重点提炼目标、进展、分歧、风险、依赖关系、明确决策、负责人和截止时间。",
    general: "这是通用讨论。重点提炼核心观点、达成的共识、尚未解决的问题以及原文明示的后续行动。",
    custom: "按用户补充要求组织内容，但仍必须遵守事实约束以及待办、决策和时间戳规则。"
  };
  return instructions[options.template] || instructions.auto;
}

function normalizeObjectList(value, mapper) {
  return Array.isArray(value) ? value.map(mapper) : [];
}

function normalizeStringList(value) {
  return Array.isArray(value) ? value.map(cleanText).filter(Boolean) : [];
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeTimestamp(value) {
  const text = cleanText(value);
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    return formatSeconds(Number(text));
  }
  const match = text.match(/(\d{1,3}):(\d{2})/);
  if (!match) return "";
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

function enrichSummaryWithTranscript(summary, segments = []) {
  const orderedSegments = [...segments]
    .filter((segment) => cleanText(segment?.text))
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  if (!orderedSegments.length || !summary) return summary;

  const enriched = structuredClone(summary);
  const chapters = Array.isArray(enriched.chapters) ? enriched.chapters : [];
  let minimumSegmentIndex = 0;
  chapters.forEach((chapter, chapterIndex) => {
    let matchedIndex;
    if (chapter.start_time) {
      matchedIndex = nearestSegmentIndex(orderedSegments, timestampToSeconds(chapter.start_time));
    } else {
      const sourceText = [
        chapter.title,
        chapter.summary,
        ...(chapter.key_points || []),
        ...(chapter.formulas || []),
        ...(chapter.misconceptions || [])
      ].join(" ");
      matchedIndex = findBestSegmentIndex(sourceText, orderedSegments, minimumSegmentIndex);
      if (matchedIndex < minimumSegmentIndex) {
        matchedIndex = Math.floor(chapterIndex * orderedSegments.length / Math.max(chapters.length, 1));
      }
      chapter.start_time = formatSeconds(orderedSegments[matchedIndex]?.start_time || 0);
    }
    minimumSegmentIndex = Math.min(orderedSegments.length - 1, Math.max(minimumSegmentIndex, matchedIndex + 1));
  });

  for (const takeaway of enriched.core_takeaways || []) {
    const evidence = Array.isArray(takeaway.evidence) ? takeaway.evidence : [];
    if (!evidence.length) evidence.push({ timestamp: "", speaker: "" });
    for (const item of evidence) {
      if (item.timestamp) continue;
      const matchedIndex = findBestSegmentIndex(
        `${takeaway.title || ""} ${takeaway.detail || ""}`,
        orderedSegments,
        0,
        item.speaker
      );
      const segment = orderedSegments[matchedIndex];
      item.timestamp = formatSeconds(segment?.start_time || 0);
      if (!item.speaker) item.speaker = cleanText(segment?.speaker_name || segment?.speaker_label);
    }
    takeaway.evidence = evidence;
  }

  for (const highlight of enriched.highlights || []) {
    if (highlight.timestamp) continue;
    const matchedIndex = findBestSegmentIndex(highlight.quote, orderedSegments, 0, highlight.speaker);
    highlight.timestamp = formatSeconds(orderedSegments[matchedIndex]?.start_time || 0);
  }

  if (!Array.isArray(enriched.highlights) || !enriched.highlights.length) {
    enriched.highlights = extractHighlightsFromTranscript(orderedSegments);
  }
  return enriched;
}

function findBestSegmentIndex(sourceText, segments, startIndex = 0, preferredSpeaker = "") {
  const safeStart = Math.max(0, Math.min(Number(startIndex) || 0, Math.max(segments.length - 1, 0)));
  let bestIndex = safeStart;
  let bestScore = -1;
  for (let index = safeStart; index < segments.length; index += 1) {
    const windowText = segments.slice(index, index + 3).map((segment) => segment.text).join(" ");
    let score = textSimilarity(sourceText, windowText);
    if (preferredSpeaker && cleanText(segments[index].speaker_name) === cleanText(preferredSpeaker)) {
      score += 0.08;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function nearestSegmentIndex(segments, targetSeconds) {
  if (!Number.isFinite(targetSeconds)) return 0;
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  segments.forEach((segment, index) => {
    const distance = Math.abs(Number(segment.start_time || 0) - targetSeconds);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function timestampToSeconds(value) {
  const match = cleanText(value).match(/(\d{1,3}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN;
}

function textSimilarity(left, right) {
  const leftTokens = summaryTokens(left);
  const rightTokens = summaryTokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return overlap / Math.sqrt(leftTokens.size * rightTokens.size);
}

function summaryTokens(value) {
  const normalized = cleanText(value).toLowerCase().replace(/\s+/g, "");
  const tokens = new Set(normalized.match(/[a-z][a-z0-9^/.-]{1,}|\d+(?:\.\d+)?/g) || []);
  const chinese = normalized.replace(/[^\u4e00-\u9fff]/g, "");
  for (let index = 0; index < chinese.length - 1; index += 1) {
    tokens.add(chinese.slice(index, index + 2));
  }
  return tokens;
}

function extractHighlightsFromTranscript(segments) {
  const markers = ["所以", "结论", "答案是", "注意", "关键", "不能", "其实", "因为", "意味着", "说明", "代表", "也就是说", "错误", "误区"];
  const candidates = segments
    .map((segment) => {
      const text = cleanText(segment.text);
      const markerCount = markers.filter((marker) => text.includes(marker)).length;
      const questionPenalty = /吗|有没有|谁来|是不是|你可以|让你|可以讲一下|告诉我/.test(text) ? 7 : 0;
      const lengthScore = text.length >= 24 && text.length <= 180 ? 3 : 0;
      const concreteScore = /\d|等于|守恒|斜率|公式|参考|条件/.test(text) ? 2 : 0;
      const conclusionScore = /最后就可以得出一个结论|答案是|也就是说/.test(text) ? 7 : 0;
      return { segment, text, score: markerCount * 4 + lengthScore + concreteScore + conclusionScore - questionPenalty };
    })
    .filter((item) => item.text.length >= 18 && item.score >= 4)
    .sort((a, b) => b.score - a.score);

  const selected = [];
  for (const candidate of candidates) {
    const start = Number(candidate.segment.start_time || 0);
    if (selected.some((item) => Math.abs(Number(item.segment.start_time || 0) - start) < 45)) continue;
    selected.push(candidate);
    if (selected.length >= 3) break;
  }

  return selected
    .sort((a, b) => Number(a.segment.start_time || 0) - Number(b.segment.start_time || 0))
    .map(({ segment, text }) => ({
      speaker: cleanText(segment.speaker_name || segment.speaker_label),
      quote: extractQuoteWindow(text),
      timestamp: formatSeconds(segment.start_time || 0),
      significance: highlightSignificance(text)
    }));
}

function extractQuoteWindow(text) {
  const cleaned = cleanText(text).replace(/^[嗯呃啊，。\s]+/, "");
  const markers = ["最后就可以得出一个结论", "所以", "但其实", "其实", "注意", "关键", "不能"];
  const positions = markers
    .map((marker) => cleaned.indexOf(marker))
    .filter((index) => index >= 0);
  const start = positions.length ? Math.min(...positions) : 0;
  return cleaned.slice(start, start + 180);
}

function highlightSignificance(text) {
  if (/错误|不能|误区|不对/.test(text)) return "指出常见误区或定理的适用边界";
  if (/所以|结论|意味着|说明/.test(text)) return "给出了可以直接复用的结论";
  if (/注意|关键/.test(text)) return "强调了解题时容易忽略的关键条件";
  return "包含清晰的解释、方法或判断依据";
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("Claude 返回内容不是合法 JSON");
    }
    return JSON.parse(text.slice(start, end + 1));
  }
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: options.env || process.env,
      cwd: __dirname
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGTERM");
        resolve({ code: 124, stdout, stderr: "转录超时，请换较短音频或使用 GPU 服务" });
      }
    }, options.timeoutMs || 120000);

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      handleProcessProgress(text, options.onProgress);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      handleProcessProgress(text, options.onProgress);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: error.message });
    });
  });
}

function handleProcessProgress(text, onProgress) {
  if (!onProgress) return;
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("__FUNASR_PROGRESS__")) continue;
    const jsonText = trimmed.replace("__FUNASR_PROGRESS__", "");
    try {
      onProgress(JSON.parse(jsonText));
    } catch {
      // Ignore malformed progress lines; transcription output parsing handles final errors.
    }
  }
}

async function serveStatic(res, requestedPath) {
  const cleanPath = requestedPath === "/" ? "/index.html" : requestedPath;
  const resolved = path.normalize(path.join(PUBLIC_DIR, cleanPath));
  if (!resolved.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const data = await readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, { "content-type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    const fallback = await readFile(path.join(PUBLIC_DIR, "index.html"));
    res.writeHead(200, { "content-type": MIME_TYPES[".html"] });
    res.end(fallback);
  }
}

async function ensureStorage() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(UPLOAD_DIR, { recursive: true });
  await mkdir(PROGRESS_DIR, { recursive: true });
  try {
    await readFile(DB_PATH, "utf8");
  } catch {
    await writeDb({ meetings: [] });
  }
}

async function readDb() {
  const text = await readFile(DB_PATH, "utf8");
  return JSON.parse(text);
}

async function writeDb(db) {
  await writeFile(DB_PATH, JSON.stringify(db, null, 2));
}

async function getMeeting(meetingId) {
  const db = await readDb();
  await normalizeStaleTranscriptions(db);
  return publicMeeting(findMeeting(db, meetingId));
}

function findMeeting(db, meetingId) {
  const meeting = db.meetings.find((item) => item.id === meetingId);
  if (!meeting) {
    throw httpError(404, "会议不存在");
  }
  return meeting;
}

function publicMeeting(meeting) {
  return {
    ...meeting,
    summary: meeting.summary && Number(meeting.summary.version) >= 2
      ? enrichSummaryWithTranscript(meeting.summary, meeting.transcripts || [])
      : meeting.summary,
    audio: {
      original_name: meeting.audio.original_name,
      mime_type: meeting.audio.mime_type,
      size: meeting.audio.size,
      source_type: meeting.audio.source_type
    }
  };
}

async function normalizeStaleTranscriptions(db) {
  let changed = false;
  for (const meeting of db.meetings) {
    if (meeting.status !== STATUS.transcribing || transcriptionJobs.has(meeting.id)) continue;
    const updatedAt = new Date(meeting.updated_at || meeting.created_at || 0).getTime();
    const staleMs = Date.now() - updatedAt;
    if (staleMs > 2 * 60 * 1000) {
      meeting.status = STATUS.failed;
      meeting.error = "转写任务已中断，请重新点击开始转写";
      meeting.progress = {
        percent: 100,
        stage: "任务中断",
        updated_at: new Date().toISOString()
      };
      touch(meeting);
      changed = true;
    }
  }
  if (changed) await writeDb(db);
}

function progressFilePath(meetingId) {
  return path.join(PROGRESS_DIR, `${meetingId}.jsonl`);
}

async function writeProgress(progressPath, percent, stage) {
  await writeFile(progressPath, `${JSON.stringify({
    type: "progress",
    percent,
    stage,
    updated_at: new Date().toISOString()
  })}\n`);
}

async function removeProgressFile(meetingId) {
  await unlink(progressFilePath(meetingId)).catch(() => {});
}

async function updateMeetingProgress(meetingId, progress) {
  const db = await readDb().catch(() => null);
  if (!db) return;
  const meeting = db.meetings.find((item) => item.id === meetingId);
  if (!meeting || meeting.status !== STATUS.transcribing) return;
  meeting.progress = {
    percent: clampProgress(progress.percent),
    stage: String(progress.stage || "转写中"),
    updated_at: new Date().toISOString()
  };
  touch(meeting);
  await writeDb(db).catch(() => {});
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw httpError(400, "音频数据格式不正确");
  }
  return {
    mime: match[1],
    buffer: Buffer.from(match[2], "base64")
  };
}

function safeAudioExtension(name, mime) {
  const ext = path.extname(name).toLowerCase();
  if ([".webm", ".wav", ".mp3", ".m4a", ".ogg", ".aac", ".flac"].includes(ext)) {
    return ext;
  }
  const byMime = {
    "audio/webm": ".webm",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/ogg": ".ogg"
  };
  return byMime[mime] || ".webm";
}

function mimeFromExtension(extension) {
  const byExtension = {
    ".webm": "audio/webm",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".aac": "audio/aac",
    ".flac": "audio/flac"
  };
  return byExtension[extension] || "application/octet-stream";
}

function normalizeSpeakerLabel(value) {
  const raw = String(value ?? "0").trim();
  if (raw.startsWith("SPEAKER_")) return raw;
  if (raw.startsWith("Speaker ")) return `SPEAKER_${raw.replace("Speaker ", "").padStart(2, "0")}`;
  if (/^\d+$/.test(raw)) return `SPEAKER_${raw.padStart(2, "0")}`;
  return raw || "SPEAKER_00";
}

function normalizeHotwords(value) {
  const list = Array.isArray(value)
    ? value
    : String(value || "").split(/\r?\n|,|，|;/);
  const seen = new Set();
  return list
    .map((word) => String(word || "").trim())
    .filter((word) => word && word.length <= 80)
    .filter((word) => {
      const key = word.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 200);
}

function touch(meeting) {
  meeting.updated_at = new Date().toISOString();
}

function formatSeconds(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 250 * 1024 * 1024) {
        reject(httpError(413, "音频太大，请先压缩或切分"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(httpError(400, "请求 JSON 格式不正确"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8" });
  res.end(text);
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function clampProgress(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

async function loadLocalEnv(envPath) {
  try {
    const text = await readFile(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const equalsIndex = trimmed.indexOf("=");
      if (equalsIndex === -1) continue;
      const key = trimmed.slice(0, equalsIndex).trim();
      const value = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // A local .env file is optional; environment variables still work normally.
  }
}

export { buildSummaryPrompt, enrichSummaryWithTranscript, normalizeSummaryOptions, validateSummary };
