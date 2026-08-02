const state = {
  meetings: [],
  selectedMeetingId: null,
  locale: localStorage.getItem("meetingAssistant:locale") || "zh-CN",
  meetingFilters: {
    title: "",
    speaker: "",
    from: "",
    to: ""
  },
  mediaRecorder: null,
  recordedChunks: [],
  recordingStartedAt: null,
  timerId: null,
  recordedBlob: null,
  pollTimerId: null,
  hotwords: [],
  summaryOptionsMeetingId: null,
  summaryEditingMeetingId: null
};

const SPEAKER_HISTORY_KEY = "meetingAssistant:speakerProfiles:v1";
const SPEAKER_ROLES = ["advisor", "student", "member"];

const translations = {
  "zh-CN": {
    appTitle: "AI 会议纪要助手",
    localFlow: "本地流程",
    uploadTitle: "录音或上传",
    uploadDescription: "上传一段会议音频，创建待转写会议。",
    collapse: "收起",
    expand: "展开",
    meetingTitleLabel: "会议标题",
    meetingTitlePlaceholder: "例如：7月课题组周会",
    audioFileLabel: "音频文件",
    chooseAudio: "选择音频",
    noFileSelected: "未选择文件",
    localPathLabel: "本机音频路径（大文件推荐）",
    localPathPlaceholder: "/Users/<username>/Downloads/meeting-audio.wav",
    hotwordsLabel: "本次会议热词",
    hotwordsHelpLabel: "热词说明",
    hotwordsHelp: "热词会提示转写模型优先识别这些专业词、人名、缩写或设备名。只对本次会议生效，清空后不会带入新会议。",
    startRecording: "开始录音",
    selectMeeting: "选择会议",
    close: "关闭",
    addHotwords: "添加本次会议热词",
    addVocabularyRow: "+ 添加",
    clear: "清空",
    saveHotwords: "保存热词",
    vocabularyDialogCount: "{count}/200 · 仅用于当前会议",
    vocabularyColumn: "词汇",
    typeColumn: "类型",
    vocabularyPlaceholder: "输入专业词、人名或缩写",
    typeTerm: "术语",
    typeName: "人名",
    typeAcronym: "缩写",
    typeEntity: "机构设备",
    localPathHint: "本机调试时可直接填写音频文件的完整路径。",
    uploadingAudio: "正在上传音频 {percent}%",
    preparingUpload: "正在准备 OSS 直传...",
    directUploadFailed: "无法直传 OSS。请检查 Bucket 的 CORS 是否允许当前网站使用 PUT。",
    largeFileReady: "已选择 {name}（{size}），创建会议时将上传该大文件。",
    createMeeting: "创建会议",
    refreshList: "刷新列表",
    transcriptTitle: "转写与说话人标注",
    transcriptDescription: "FunASR 输出 speaker 编号后，在这里绑定真实姓名并校正文案。",
    startTranscription: "开始转写",
    saveLabels: "保存标注",
    summaryTitle: "生成会议总结",
    summaryDescription: "选择内容类型后生成核心结论、智能章节、明确待办、决策和金句。",
    summaryTemplateLabel: "总结模板",
    templateAuto: "自动识别",
    templateTeaching: "课程 / 作业讲解",
    templateResearch: "科研组会",
    templateProject: "项目会议",
    templateGeneral: "通用讨论",
    templateCustom: "自定义要求",
    customPromptLabel: "本次总结要求",
    customPromptPlaceholder: "例如：重点整理实验参数、失败原因和下周需要验证的假设",
    generateSummary: "生成总结",
    exportWord: "Word (.docx)",
    exportPdf: "PDF",
    editMinutes: "编辑纪要",
    saveChanges: "保存修改",
    cancelEdit: "取消编辑",
    meetingQueue: "会议队列",
    runtimeStatus: "运行状态",
    searchTitle: "标题搜索",
    searchTitlePlaceholder: "输入会议标题",
    speakerFilter: "说话人",
    dateFrom: "开始日期",
    dateTo: "结束日期",
    datePlaceholder: "YYYY-MM-DD",
    invalidDate: "请使用 YYYY-MM-DD 格式",
    export: "导出",
    clearFilters: "清除筛选",
    allSpeakers: "全部说话人",
    filterCount: "显示 {shown}/{total} 场",
    noMeetings: "还没有会议",
    noMatches: "没有符合筛选条件的会议",
    noMeetingOption: "暂无会议",
    advisor: "导师",
    student: "学生",
    member: "实验室成员",
    realName: "真实姓名",
    noSpeakerHistory: "此分类暂无历史姓名，可直接输入新姓名",
    transcriptPlaceholder: "创建会议后显示转录片段",
    noTranscript: "还没有转录内容",
    summaryPlaceholder: "摘要会显示在这里",
    smartMinutes: "智能纪要",
    contentOverview: "内容概览",
    noOverview: "暂无概览",
    coreTakeaways: "核心结论",
    noCoreTakeaways: "没有提取到明确的核心结论",
    smartChapters: "智能章节",
    noChapters: "没有生成智能章节",
    actionItems: "待办事项",
    noActionItems: "本次没有明确的后续待办",
    keyDecisions: "关键决策",
    noDecisions: "本次没有明确达成的会议决策",
    highlights: "金句时刻",
    noHighlights: "本次没有适合单独摘录的金句",
    keyPoints: "要点",
    formulas: "公式与结果",
    misconceptions: "易错点",
    unnamedChapter: "未命名章节",
    unlabeled: "未标注",
    unspecified: "未指定",
    unknown: "未知",
    statusUploaded: "已上传",
    statusTranscribing: "转写中",
    statusTranscribed: "待总结",
    statusSummarizing: "总结中",
    statusSummarized: "已完成",
    statusFailed: "处理失败",
    hotwordCountEmpty: "0 个热词",
    hotwordCount: "{count} 个热词已添加",
    readyLog: "准备就绪，可以录音或上传音频。",
    labelsSavedLog: "说话人和转录文本已保存。",
    requestFailed: "请求失败",
    namePlaceholder: "姓名"
  },
  en: {
    appTitle: "AI Meeting Notes",
    localFlow: "Local workflow",
    uploadTitle: "Record or upload",
    uploadDescription: "Upload meeting audio to create a transcription task.",
    collapse: "Collapse",
    expand: "Expand",
    meetingTitleLabel: "Meeting title",
    meetingTitlePlaceholder: "e.g. July research group meeting",
    audioFileLabel: "Audio file",
    chooseAudio: "Choose audio",
    noFileSelected: "No file selected",
    localPathLabel: "Local audio path (large files)",
    localPathPlaceholder: "/Users/<username>/Downloads/meeting-audio.wav",
    hotwordsLabel: "Meeting vocabulary",
    hotwordsHelpLabel: "About meeting vocabulary",
    hotwordsHelp: "Vocabulary helps the transcription model recognize technical terms, names, acronyms and equipment names. It applies only to this meeting and is not carried into a new meeting after being cleared.",
    startRecording: "Start recording",
    selectMeeting: "Select meeting",
    close: "Close",
    addHotwords: "Add meeting vocabulary",
    addVocabularyRow: "+ Add",
    clear: "Clear",
    saveHotwords: "Save vocabulary",
    vocabularyDialogCount: "{count}/200 · Current meeting only",
    vocabularyColumn: "Vocabulary",
    typeColumn: "Type",
    vocabularyPlaceholder: "Enter a technical term, name or acronym",
    typeTerm: "Term",
    typeName: "Name",
    typeAcronym: "Acronym",
    typeEntity: "Organization / equipment",
    localPathHint: "For local testing, enter the complete path to an audio file on this computer.",
    uploadingAudio: "Uploading audio {percent}%",
    preparingUpload: "Preparing direct OSS upload...",
    directUploadFailed: "Direct OSS upload failed. Check that the bucket CORS allows PUT from this site.",
    largeFileReady: "Selected {name} ({size}). The large file will upload when the meeting is created.",
    createMeeting: "Create meeting",
    refreshList: "Refresh",
    transcriptTitle: "Transcript and speaker labels",
    transcriptDescription: "Map speaker IDs to real names and correct the transcript.",
    startTranscription: "Transcribe",
    saveLabels: "Save labels",
    summaryTitle: "Generate meeting minutes",
    summaryDescription: "Generate takeaways, chapters, action items, decisions and highlights.",
    summaryTemplateLabel: "Summary template",
    templateAuto: "Auto detect",
    templateTeaching: "Teaching / assignment",
    templateResearch: "Research meeting",
    templateProject: "Project meeting",
    templateGeneral: "General discussion",
    templateCustom: "Custom instructions",
    customPromptLabel: "Summary instructions",
    customPromptPlaceholder: "e.g. Focus on experiment parameters, failure causes and hypotheses to test next week",
    generateSummary: "Generate summary",
    exportWord: "Word (.docx)",
    exportPdf: "PDF",
    editMinutes: "Edit minutes",
    saveChanges: "Save changes",
    cancelEdit: "Cancel",
    meetingQueue: "Meeting history",
    runtimeStatus: "Activity",
    searchTitle: "Search title",
    searchTitlePlaceholder: "Enter a meeting title",
    speakerFilter: "Speaker",
    dateFrom: "From",
    dateTo: "To",
    datePlaceholder: "YYYY-MM-DD",
    invalidDate: "Use YYYY-MM-DD format",
    export: "Export",
    clearFilters: "Clear filters",
    allSpeakers: "All speakers",
    filterCount: "Showing {shown} of {total}",
    noMeetings: "No meetings yet",
    noMatches: "No meetings match these filters",
    noMeetingOption: "No meetings",
    advisor: "Advisor",
    student: "Student",
    member: "Lab member",
    realName: "Real name",
    noSpeakerHistory: "No saved names in this category. Enter a new name.",
    transcriptPlaceholder: "Transcript segments appear after creating a meeting",
    noTranscript: "No transcript yet",
    summaryPlaceholder: "The summary will appear here",
    smartMinutes: "AI minutes",
    contentOverview: "Overview",
    noOverview: "No overview",
    coreTakeaways: "Core takeaways",
    noCoreTakeaways: "No explicit core takeaways were identified",
    smartChapters: "Smart chapters",
    noChapters: "No smart chapters were generated",
    actionItems: "Action items",
    noActionItems: "No explicit follow-up actions",
    keyDecisions: "Key decisions",
    noDecisions: "No explicit decisions were made",
    highlights: "Highlights",
    noHighlights: "No standalone highlight was identified",
    keyPoints: "Key points",
    formulas: "Formulas and results",
    misconceptions: "Misconceptions",
    unnamedChapter: "Untitled chapter",
    unlabeled: "Unlabeled",
    unspecified: "Unspecified",
    unknown: "Unknown",
    statusUploaded: "Uploaded",
    statusTranscribing: "Transcribing",
    statusTranscribed: "Ready to summarize",
    statusSummarizing: "Summarizing",
    statusSummarized: "Completed",
    statusFailed: "Failed",
    hotwordCountEmpty: "0 terms",
    hotwordCount: "{count} terms added",
    readyLog: "Ready to record or upload audio.",
    labelsSavedLog: "Speaker labels and transcript changes saved.",
    requestFailed: "Request failed",
    namePlaceholder: "Name"
  }
};

const els = {
  recordButton: document.querySelector("#recordButton"),
  recordIcon: document.querySelector("#recordIcon"),
  recordTimer: document.querySelector("#recordTimer"),
  audioPreview: document.querySelector("#audioPreview"),
  meetingTitle: document.querySelector("#meetingTitle"),
  audioFile: document.querySelector("#audioFile"),
  audioFileName: document.querySelector("#audioFileName"),
  localAudioPath: document.querySelector("#localAudioPath"),
  localPathField: document.querySelector("#localPathField"),
  localPathHint: document.querySelector("#localPathHint"),
  openVocabularyButton: document.querySelector("#openVocabularyButton"),
  vocabularyCount: document.querySelector("#vocabularyCount"),
  vocabularyDialog: document.querySelector("#vocabularyDialog"),
  vocabularyDialogCount: document.querySelector("#vocabularyDialogCount"),
  vocabularyRows: document.querySelector("#vocabularyRows"),
  addVocabularyRowButton: document.querySelector("#addVocabularyRowButton"),
  closeVocabularyButton: document.querySelector("#closeVocabularyButton"),
  clearVocabularyButton: document.querySelector("#clearVocabularyButton"),
  saveVocabularyButton: document.querySelector("#saveVocabularyButton"),
  createMeetingButton: document.querySelector("#createMeetingButton"),
  refreshButton: document.querySelector("#refreshButton"),
  meetingSelect: document.querySelector("#meetingSelect"),
  transcribeButton: document.querySelector("#transcribeButton"),
  saveSegmentsButton: document.querySelector("#saveSegmentsButton"),
  summarizeButton: document.querySelector("#summarizeButton"),
  summaryTemplate: document.querySelector("#summaryTemplate"),
  customPromptField: document.querySelector("#customPromptField"),
  customSummaryPrompt: document.querySelector("#customSummaryPrompt"),
  exportDocButton: document.querySelector("#exportDocButton"),
  exportPdfButton: document.querySelector("#exportPdfButton"),
  exportMenu: document.querySelector("#exportMenu"),
  editSummaryButton: document.querySelector("#editSummaryButton"),
  saveSummaryButton: document.querySelector("#saveSummaryButton"),
  cancelSummaryButton: document.querySelector("#cancelSummaryButton"),
  transcriptionProgress: document.querySelector("#transcriptionProgress"),
  progressStage: document.querySelector("#progressStage"),
  progressPercent: document.querySelector("#progressPercent"),
  progressFill: document.querySelector("#progressFill"),
  speakerMap: document.querySelector("#speakerMap"),
  segments: document.querySelector("#segments"),
  summary: document.querySelector("#summary"),
  meetingSearch: document.querySelector("#meetingSearch"),
  meetingSpeakerFilter: document.querySelector("#meetingSpeakerFilter"),
  meetingDateFrom: document.querySelector("#meetingDateFrom"),
  meetingDateTo: document.querySelector("#meetingDateTo"),
  meetingFilterCount: document.querySelector("#meetingFilterCount"),
  clearMeetingFilters: document.querySelector("#clearMeetingFilters"),
  meetingList: document.querySelector("#meetingList"),
  log: document.querySelector("#log"),
  systemStatus: document.querySelector("#systemStatus"),
  segmentTemplate: document.querySelector("#segmentTemplate"),
  panelToggles: document.querySelectorAll("[data-toggle-panel]"),
  languageButtons: document.querySelectorAll("[data-language]")
};

els.recordButton.addEventListener("click", toggleRecording);
els.audioFile.addEventListener("change", handleFileSelected);
els.openVocabularyButton.addEventListener("click", openVocabularyDialog);
els.addVocabularyRowButton.addEventListener("click", () => addVocabularyRow());
els.closeVocabularyButton.addEventListener("click", () => els.vocabularyDialog.close());
els.clearVocabularyButton.addEventListener("click", clearVocabularyRows);
els.saveVocabularyButton.addEventListener("click", saveVocabularyRows);
els.createMeetingButton.addEventListener("click", createMeeting);
els.refreshButton.addEventListener("click", loadMeetings);
els.meetingSelect.addEventListener("change", () => selectMeeting(els.meetingSelect.value));
els.transcribeButton.addEventListener("click", transcribeSelected);
els.saveSegmentsButton.addEventListener("click", saveSegments);
els.summarizeButton.addEventListener("click", summarizeSelected);
els.summaryTemplate.addEventListener("change", updateCustomPromptVisibility);
els.exportDocButton.addEventListener("click", () => {
  els.exportMenu.open = false;
  exportSummaryDoc();
});
els.exportPdfButton.addEventListener("click", () => {
  els.exportMenu.open = false;
  exportSummaryPdf();
});
els.editSummaryButton.addEventListener("click", startSummaryEditing);
els.saveSummaryButton.addEventListener("click", saveSummaryEditing);
els.cancelSummaryButton.addEventListener("click", cancelSummaryEditing);
els.meetingSearch.addEventListener("input", updateMeetingFilters);
els.meetingSpeakerFilter.addEventListener("change", updateMeetingFilters);
els.meetingDateFrom.addEventListener("input", updateMeetingFilters);
els.meetingDateTo.addEventListener("input", updateMeetingFilters);
els.clearMeetingFilters.addEventListener("click", clearMeetingFilters);
els.languageButtons.forEach((button) => {
  button.addEventListener("click", () => setLocale(button.dataset.language));
});
els.panelToggles.forEach((button) => {
  button.addEventListener("click", () => togglePanel(button.dataset.togglePanel));
});
els.summary.addEventListener("click", handleSummaryClick);

applyLocale();
restorePanelState();
configureEnvironmentSpecificUi();
await loadMeetings();
updateVocabularyCount();
log(t("readyLog"));

function t(key, variables = {}) {
  const dictionary = translations[state.locale] || translations["zh-CN"];
  const template = dictionary[key] ?? translations["zh-CN"][key] ?? key;
  return Object.entries(variables).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    template
  );
}

function applyLocale() {
  document.documentElement.lang = state.locale;
  document.title = state.locale === "en" ? "AI Meeting Notes" : "AI 会议纪要助手";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((node) => {
    node.title = t(node.dataset.i18nTitle);
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
    node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
  });
  els.audioFileName.textContent = els.audioFile.files[0]?.name || t("noFileSelected");
  els.languageButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.language === state.locale));
  });
}

function setLocale(locale) {
  if (!translations[locale] || locale === state.locale) return;
  state.locale = locale;
  localStorage.setItem("meetingAssistant:locale", locale);
  applyLocale();
  restorePanelState();
  renderAll();
  updateVocabularyCount();
}

function configureEnvironmentSpecificUi() {
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  els.localPathField.hidden = !isLocal;
  els.localPathHint.hidden = !isLocal;
}

async function toggleRecording() {
  if (state.mediaRecorder?.state === "recording") {
    state.mediaRecorder.stop();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.recordedChunks = [];
    state.mediaRecorder = new MediaRecorder(stream);
    state.mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) state.recordedChunks.push(event.data);
    });
    state.mediaRecorder.addEventListener("stop", () => {
      stream.getTracks().forEach((track) => track.stop());
      state.recordedBlob = new Blob(state.recordedChunks, { type: state.mediaRecorder.mimeType || "audio/webm" });
      els.audioPreview.src = URL.createObjectURL(state.recordedBlob);
      els.audioPreview.hidden = false;
      els.recordButton.classList.remove("recording");
      els.recordIcon.textContent = "●";
      clearInterval(state.timerId);
      log("录音已完成，可以创建会议。");
    });
    state.recordingStartedAt = Date.now();
    state.timerId = setInterval(updateTimer, 500);
    state.mediaRecorder.start();
    els.recordButton.classList.add("recording");
    els.recordIcon.textContent = "■";
    log("正在录音。");
  } catch (error) {
    log(`无法访问麦克风：${error.message}`);
  }
}

async function createMeeting() {
  const selectedFile = els.audioFile.files[0];
  const localPath = els.localAudioPath.value.trim();
  const audioBlob = selectedFile || state.recordedBlob;
  if (!audioBlob && !localPath) {
    log("请先录音、选择音频文件，或填写本机音频路径。");
    return;
  }

  setBusy(true);
  try {
    let audio;
    if (localPath) {
      audio = { localPath };
    } else if (selectedFile) {
      const uploaded = await uploadAudioFile(selectedFile);
      audio = {
        ossObjectName: uploaded.objectName,
        name: selectedFile.name,
        mimeType: uploaded.contentType,
        size: selectedFile.size
      };
    } else {
      audio = {
        name: selectedFile?.name || `recording-${Date.now()}.webm`,
        dataUrl: await blobToDataUrl(audioBlob)
      };
    }
    const response = await api("/api/meetings", {
      method: "POST",
      body: JSON.stringify({
        title: els.meetingTitle.value,
        audio,
        hotwords: currentHotwords()
      })
    });
    state.meetings.unshift(response.meeting);
    selectMeeting(response.meeting.id);
    renderMeetings();
    const hotwordCount = response.meeting.hotwords?.length || 0;
    log(hotwordCount ? `会议已创建，已带入 ${hotwordCount} 个热词。` : "会议已创建，下一步可以开始转写。");
  } catch (error) {
    log(error.message);
  } finally {
    setBusy(false);
    renderAll();
  }
}

function handleFileSelected() {
  const file = els.audioFile.files[0];
  els.audioFileName.textContent = file?.name || t("noFileSelected");
  if (!file) return;
  const size = formatBytes(file.size);
  if (file.size > 100 * 1024 * 1024) {
    log(t("largeFileReady", { name: file.name, size }));
  } else {
    log(`已选择 ${file.name}（${size}）。`);
  }
}

async function uploadAudioFile(file) {
  els.systemStatus.textContent = t("preparingUpload");
  const response = await api("/api/uploads/presign", {
    method: "POST",
    body: JSON.stringify({
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size
    })
  });
  const target = response.upload;

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", target.uploadUrl);
    request.setRequestHeader("Content-Type", target.contentType);
    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
      els.systemStatus.textContent = t("uploadingAudio", { percent });
    });
    request.addEventListener("load", () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(`${t("directUploadFailed")} (HTTP ${request.status || 0})`));
        return;
      }
      resolve(target);
    });
    request.addEventListener("error", () => reject(new Error(t("directUploadFailed"))));
    request.send(file);
  });
}

async function loadMeetings() {
  const response = await api("/api/meetings");
  state.meetings = response.meetings;
  if (!state.selectedMeetingId && state.meetings[0]) {
    state.selectedMeetingId = state.meetings[0].id;
  }
  renderAll();
}

async function transcribeSelected() {
  const meeting = selectedMeeting();
  if (!meeting) return;
  setBusy(true);
  log("已提交 FunASR 转写任务，长音频会在后台处理。");
  try {
    const response = await api(`/api/meetings/${meeting.id}/transcribe`, { method: "POST" });
    replaceMeeting(response.meeting);
    renderAll();
    startPollingMeeting(response.meeting.id);
  } catch (error) {
    log(error.message);
    await loadMeetings();
  } finally {
    setBusy(false);
  }
}

function startPollingMeeting(meetingId) {
  if (state.pollTimerId) {
    clearInterval(state.pollTimerId);
  }
  state.pollTimerId = setInterval(async () => {
    try {
      const response = await api(`/api/meetings/${meetingId}`);
      replaceMeeting(response.meeting);
      renderAll();
      if (response.meeting.status !== "transcribing" && response.meeting.status !== "summarizing") {
        clearInterval(state.pollTimerId);
        state.pollTimerId = null;
        if (response.meeting.status === "transcribed") {
          log("转写完成，请绑定说话人姓名。");
          setPanelCollapsed("summary", false);
        } else if (response.meeting.status === "failed") {
          log(response.meeting.error || "处理失败。");
        }
      }
    } catch (error) {
      log(error.message);
    }
  }, 5000);
}

async function saveSegments() {
  const meeting = selectedMeeting();
  if (!meeting) return;
  const speakerProfiles = readSpeakerProfilesFromEditor();
  const segments = [...document.querySelectorAll(".segment-row")].map((row) => ({
    id: row.dataset.id,
    speaker_label: row.dataset.speakerLabel,
    speaker_name: row.querySelector(".speaker-input").value,
    text: row.querySelector(".text-input").value,
    start_time: Number(row.dataset.startTime),
    end_time: Number(row.dataset.endTime),
    sort_order: Number(row.dataset.sortOrder)
  }));

  setBusy(true);
  try {
    const response = await api(`/api/meetings/${meeting.id}/segments`, {
      method: "PATCH",
      body: JSON.stringify({ segments })
    });
    replaceMeeting(response.meeting);
    saveSpeakerProfiles(speakerProfiles);
    renderAll();
    log(t("labelsSavedLog"));
  } catch (error) {
    log(error.message);
  } finally {
    setBusy(false);
  }
}

async function summarizeSelected() {
  const meeting = selectedMeeting();
  if (!meeting) return;
  setBusy(true);
  log("正在生成会议总结。");
  try {
    const response = await api(`/api/meetings/${meeting.id}/summarize`, {
      method: "POST",
      body: JSON.stringify({
        template: els.summaryTemplate.value,
        customPrompt: els.customSummaryPrompt.value.trim(),
        language: state.locale
      })
    });
    replaceMeeting(response.meeting);
    setPanelCollapsed("summary", false);
    renderAll();
    log("会议总结已生成。");
  } catch (error) {
    log(error.message);
    await loadMeetings();
  } finally {
    setBusy(false);
  }
}

function openVocabularyDialog() {
  renderVocabularyRows(state.hotwords.length ? state.hotwords : [{ value: "", type: "term" }]);
  els.vocabularyDialog.showModal();
}

function renderVocabularyRows(rows) {
  els.vocabularyRows.innerHTML = "";
  for (const item of rows) {
    addVocabularyRow(item.value, item.type);
  }
  updateVocabularyDialogCount();
}

function addVocabularyRow(value = "", type = "term") {
  if (els.vocabularyRows.children.length >= 200) {
    log("本次会议热词最多 200 个。");
    return;
  }

  const row = document.createElement("div");
  row.className = "vocabulary-row";
  row.innerHTML = `
    <input class="vocabulary-input" type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(t("vocabularyPlaceholder"))}">
    <select class="vocabulary-type" aria-label="热词类型">
      <option value="term">${t("typeTerm")}</option>
      <option value="name">${t("typeName")}</option>
      <option value="acronym">${t("typeAcronym")}</option>
      <option value="entity">${t("typeEntity")}</option>
    </select>
    <button class="icon-delete" type="button" aria-label="删除热词">×</button>
  `;
  row.querySelector(".vocabulary-type").value = type || "term";
  row.querySelector(".icon-delete").addEventListener("click", () => {
    row.remove();
    if (!els.vocabularyRows.children.length) addVocabularyRow();
    updateVocabularyDialogCount();
  });
  row.querySelector(".vocabulary-input").addEventListener("input", updateVocabularyDialogCount);
  els.vocabularyRows.append(row);
  updateVocabularyDialogCount();
}

function clearVocabularyRows() {
  state.hotwords = [];
  renderVocabularyRows([{ value: "", type: "term" }]);
  updateVocabularyCount();
}

function saveVocabularyRows() {
  state.hotwords = readVocabularyRows();
  updateVocabularyCount();
  els.vocabularyDialog.close();
  log(state.hotwords.length ? `已保存 ${state.hotwords.length} 个本次会议热词。` : "已清空本次会议热词。");
}

function readVocabularyRows() {
  const seen = new Set();
  const rows = [...els.vocabularyRows.querySelectorAll(".vocabulary-row")]
    .map((row) => ({
      value: row.querySelector(".vocabulary-input").value.trim(),
      type: row.querySelector(".vocabulary-type").value
    }))
    .filter((item) => item.value)
    .filter((item) => {
      const key = item.value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 200);
  return rows;
}

function updateVocabularyCount() {
  const count = state.hotwords.length;
  els.vocabularyCount.textContent = count ? t("hotwordCount", { count }) : t("hotwordCountEmpty");
}

function updateVocabularyDialogCount() {
  const count = readVocabularyRows().length;
  els.vocabularyDialogCount.textContent = t("vocabularyDialogCount", { count });
}

async function exportSummaryDoc() {
  const meeting = selectedMeeting();
  if (!meeting?.summary) {
    log("请先生成会议总结，再导出 Word。");
    return;
  }
  try {
    const response = await fetch(`/api/meetings/${encodeURIComponent(meeting.id)}/export-docx`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || t("requestFailed"));
    }
    downloadBlob(await response.blob(), `${safeFileName(meeting.title)}-会议纪要.docx`);
    log("已导出 DOCX 会议纪要。");
  } catch (error) {
    log(error.message);
  }
}

function exportSummaryPdf() {
  const meeting = selectedMeeting();
  if (!meeting?.summary) {
    log("请先生成会议总结，再导出 PDF。");
    return;
  }

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    log("浏览器拦截了打印窗口，请允许弹窗后再试。");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(buildSummaryDocumentHtml(meeting, "pdf"));
  printWindow.document.close();
  printWindow.focus();
  log("已打开 PDF 导出窗口，请选择“存储为 PDF”。");
}

function selectMeeting(id) {
  state.selectedMeetingId = id;
  state.summaryOptionsMeetingId = null;
  state.summaryEditingMeetingId = null;
  renderAll();
}

function renderAll() {
  renderMeetings();
  renderProgress();
  renderEditor();
  renderSummaryControls();
  renderSummary();
  const meeting = selectedMeeting();
  els.systemStatus.textContent = meeting ? statusText(meeting.status) : t("localFlow");
}

function renderSummaryControls() {
  const meeting = selectedMeeting();
  if (!meeting || state.summaryOptionsMeetingId === meeting.id) return;
  const savedOptions = meeting.summary_options || {};
  els.summaryTemplate.value = savedOptions.template || meeting.summary?.template || "auto";
  els.customSummaryPrompt.value = savedOptions.customPrompt || "";
  state.summaryOptionsMeetingId = meeting.id;
  updateCustomPromptVisibility();
}

function updateCustomPromptVisibility() {
  els.customPromptField.hidden = els.summaryTemplate.value !== "custom";
}

function renderProgress() {
  const meeting = selectedMeeting();
  const progress = meeting?.progress;
  const shouldShow = meeting?.status === "transcribing" || progress?.stage;
  els.transcriptionProgress.hidden = !shouldShow;
  if (!shouldShow) return;
  const percent = Math.max(0, Math.min(100, Number(progress?.percent || 0)));
  els.progressStage.textContent = progress?.stage || statusText(meeting.status);
  els.progressPercent.textContent = `${Math.round(percent)}%`;
  els.progressFill.style.width = `${percent}%`;
}

function renderMeetings() {
  els.meetingSelect.innerHTML = "";
  if (!state.meetings.length) {
    const option = document.createElement("option");
    option.textContent = t("noMeetingOption");
    option.value = "";
    els.meetingSelect.append(option);
  }
  for (const meeting of state.meetings) {
    const option = document.createElement("option");
    option.value = meeting.id;
    option.textContent = `${meeting.title} · ${statusText(meeting.status)}`;
    option.selected = meeting.id === state.selectedMeetingId;
    els.meetingSelect.append(option);
  }

  renderMeetingSpeakerFilter();
  const filteredMeetings = filterMeetings();
  els.meetingList.innerHTML = "";
  if (!state.meetings.length) {
    els.meetingFilterCount.textContent = "";
    els.meetingList.innerHTML = `<div class="empty-state">${t("noMeetings")}</div>`;
    return;
  }
  els.meetingFilterCount.textContent = t("filterCount", {
    shown: filteredMeetings.length,
    total: state.meetings.length
  });
  if (!filteredMeetings.length) {
    els.meetingList.innerHTML = `<div class="empty-state">${t("noMatches")}</div>`;
    return;
  }
  for (const meeting of filteredMeetings) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `meeting-item ${meeting.id === state.selectedMeetingId ? "active" : ""}`;
    item.innerHTML = `<strong>${escapeHtml(meeting.title)}</strong><span>${statusText(meeting.status)} · ${formatDate(meeting.created_at)}</span>`;
    item.addEventListener("click", () => selectMeeting(meeting.id));
    els.meetingList.append(item);
  }
}

function updateMeetingFilters() {
  const from = validDateFilterValue(els.meetingDateFrom);
  const to = validDateFilterValue(els.meetingDateTo);
  state.meetingFilters = {
    title: els.meetingSearch.value.trim(),
    speaker: els.meetingSpeakerFilter.value,
    from,
    to
  };
  renderMeetings();
}

function validDateFilterValue(input) {
  const value = input.value.trim();
  if (!value) {
    input.setCustomValidity("");
    input.removeAttribute("aria-invalid");
    return "";
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = match ? new Date(`${value}T00:00:00`) : null;
  const isValid = Boolean(date && !Number.isNaN(date.getTime())
    && date.getFullYear() === Number(match[1])
    && date.getMonth() + 1 === Number(match[2])
    && date.getDate() === Number(match[3]));
  input.setCustomValidity(isValid ? "" : t("invalidDate"));
  input.toggleAttribute("aria-invalid", !isValid);
  return isValid ? value : "";
}

function clearMeetingFilters() {
  state.meetingFilters = { title: "", speaker: "", from: "", to: "" };
  els.meetingSearch.value = "";
  els.meetingDateFrom.value = "";
  els.meetingDateTo.value = "";
  els.meetingSpeakerFilter.value = "";
  renderMeetings();
}

function renderMeetingSpeakerFilter() {
  const selectedValue = state.meetingFilters.speaker;
  const names = [...new Set(state.meetings.flatMap((meeting) =>
    (meeting.transcripts || []).map((segment) => String(segment.speaker_name || "").trim()).filter(Boolean)
  ))].sort((a, b) => a.localeCompare(b, state.locale));
  els.meetingSpeakerFilter.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = t("allSpeakers");
  els.meetingSpeakerFilter.append(allOption);
  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    els.meetingSpeakerFilter.append(option);
  }
  els.meetingSpeakerFilter.value = names.includes(selectedValue) ? selectedValue : "";
  state.meetingFilters.speaker = els.meetingSpeakerFilter.value;
}

function filterMeetings() {
  const titleQuery = state.meetingFilters.title.toLocaleLowerCase(state.locale);
  const fromTime = state.meetingFilters.from
    ? new Date(`${state.meetingFilters.from}T00:00:00`).getTime()
    : Number.NEGATIVE_INFINITY;
  const toTime = state.meetingFilters.to
    ? new Date(`${state.meetingFilters.to}T23:59:59.999`).getTime()
    : Number.POSITIVE_INFINITY;
  return state.meetings.filter((meeting) => {
    const createdAt = new Date(meeting.created_at).getTime();
    const titleMatches = !titleQuery
      || String(meeting.title || "").toLocaleLowerCase(state.locale).includes(titleQuery);
    const speakerMatches = !state.meetingFilters.speaker
      || (meeting.transcripts || []).some((segment) => segment.speaker_name === state.meetingFilters.speaker);
    return titleMatches && speakerMatches && createdAt >= fromTime && createdAt <= toTime;
  });
}

function renderEditor() {
  const meeting = selectedMeeting();
  els.speakerMap.innerHTML = "";
  els.segments.innerHTML = "";
  if (!meeting) {
    els.segments.innerHTML = `<div class="empty-state">${t("transcriptPlaceholder")}</div>`;
    return;
  }
  if (!meeting.transcripts.length) {
    els.segments.innerHTML = `<div class="empty-state">${t("noTranscript")}</div>`;
    return;
  }

  const labels = [...new Set(meeting.transcripts.map((segment) => segment.speaker_label))];
  for (const label of labels) {
    const card = document.createElement("article");
    card.className = "speaker-card";
    const currentName = meeting.transcripts.find((segment) => segment.speaker_label === label)?.speaker_name || "";
    const currentProfile = speakerProfiles().find((profile) => profile.name === currentName);
    const currentRole = currentProfile?.role || "member";
    card.dataset.speakerLabel = label;
    card.dataset.speakerRole = currentRole;
    card.innerHTML = `
      <strong>${escapeHtml(label)}</strong>
      <div class="speaker-role-tabs" role="group" aria-label="${escapeHtml(t("speakerFilter"))}">
        ${SPEAKER_ROLES.map((role) => `
          <button type="button" data-speaker-role="${role}" aria-pressed="${String(role === currentRole)}">${escapeHtml(t(role))}</button>
        `).join("")}
      </div>
      <div class="speaker-name-picker">
        <input class="speaker-map-input" data-map-label="${escapeHtml(label)}" value="${escapeHtml(currentName)}" placeholder="${escapeHtml(t("realName"))}">
        <div class="speaker-suggestions"></div>
      </div>
    `;
    card.querySelectorAll("[data-speaker-role]").forEach((button) => {
      button.addEventListener("click", () => {
        card.dataset.speakerRole = button.dataset.speakerRole;
        card.querySelectorAll("[data-speaker-role]").forEach((item) => {
          item.setAttribute("aria-pressed", String(item === button));
        });
        renderSpeakerSuggestions(card);
      });
    });
    card.querySelector(".speaker-map-input").addEventListener("input", (event) => {
      applySpeakerName(label, event.target.value);
      renderSpeakerSuggestions(card);
    });
    renderSpeakerSuggestions(card);
    els.speakerMap.append(card);
  }

  for (const segment of meeting.transcripts.sort((a, b) => a.sort_order - b.sort_order)) {
    const node = els.segmentTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.id = segment.id;
    node.dataset.speakerLabel = segment.speaker_label;
    node.dataset.startTime = segment.start_time;
    node.dataset.endTime = segment.end_time;
    node.dataset.sortOrder = segment.sort_order;
    node.querySelector(".time").textContent = `${formatTime(segment.start_time)}-${formatTime(segment.end_time)}`;
    node.querySelector(".speaker-input").value = segment.speaker_name;
    node.querySelector(".speaker-input").placeholder = t("namePlaceholder");
    node.querySelector(".text-input").value = segment.text;
    els.segments.append(node);
  }
}

function speakerProfiles() {
  let savedProfiles = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(SPEAKER_HISTORY_KEY) || "[]");
    savedProfiles = Array.isArray(parsed) ? parsed : [];
  } catch {
    savedProfiles = [];
  }
  const normalized = savedProfiles
    .map((profile) => ({
      name: String(profile.name || "").trim(),
      role: SPEAKER_ROLES.includes(profile.role) ? profile.role : "member",
      usageCount: Math.max(0, Number(profile.usageCount || 0)),
      lastUsedAt: String(profile.lastUsedAt || "")
    }))
    .filter((profile) => profile.name);
  const knownNames = new Set(normalized.map((profile) => profile.name.toLocaleLowerCase()));
  for (const meeting of state.meetings) {
    for (const segment of meeting.transcripts || []) {
      const name = String(segment.speaker_name || "").trim();
      const key = name.toLocaleLowerCase();
      if (!name || knownNames.has(key)) continue;
      normalized.push({ name, role: "member", usageCount: 0, lastUsedAt: meeting.updated_at || meeting.created_at || "" });
      knownNames.add(key);
    }
  }
  return normalized.sort((a, b) =>
    Number(b.usageCount) - Number(a.usageCount)
    || String(b.lastUsedAt).localeCompare(String(a.lastUsedAt))
    || a.name.localeCompare(b.name, state.locale)
  );
}

function renderSpeakerSuggestions(card) {
  const container = card.querySelector(".speaker-suggestions");
  const input = card.querySelector(".speaker-map-input");
  const query = input.value.trim().toLocaleLowerCase(state.locale);
  const profiles = speakerProfiles()
    .filter((profile) => profile.role === card.dataset.speakerRole)
    .filter((profile) => !query || profile.name.toLocaleLowerCase(state.locale).includes(query))
    .slice(0, 12);
  container.innerHTML = "";
  if (!profiles.length) {
    container.innerHTML = `<p class="speaker-history-empty">${t("noSpeakerHistory")}</p>`;
    return;
  }
  for (const profile of profiles) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "speaker-suggestion";
    button.textContent = profile.name;
    button.addEventListener("click", () => {
      input.value = profile.name;
      applySpeakerName(card.dataset.speakerLabel, profile.name);
      renderSpeakerSuggestions(card);
    });
    container.append(button);
  }
}

function readSpeakerProfilesFromEditor() {
  return [...els.speakerMap.querySelectorAll(".speaker-card")]
    .map((card) => ({
      name: card.querySelector(".speaker-map-input")?.value.trim() || "",
      role: SPEAKER_ROLES.includes(card.dataset.speakerRole) ? card.dataset.speakerRole : "member"
    }))
    .filter((profile) => profile.name);
}

function saveSpeakerProfiles(profiles) {
  const existing = speakerProfiles();
  const now = new Date().toISOString();
  for (const profile of profiles) {
    const match = existing.find((item) => item.name.toLocaleLowerCase() === profile.name.toLocaleLowerCase());
    if (match) {
      match.name = profile.name;
      match.role = profile.role;
      match.usageCount = Number(match.usageCount || 0) + 1;
      match.lastUsedAt = now;
    } else {
      existing.push({
        name: profile.name,
        role: profile.role,
        usageCount: 1,
        lastUsedAt: now
      });
    }
  }
  localStorage.setItem(SPEAKER_HISTORY_KEY, JSON.stringify(existing));
}

function renderSummary() {
  const meeting = selectedMeeting();
  els.summary.innerHTML = "";
  renderSummaryEditControls(meeting);
  if (!meeting?.summary) {
    els.summary.innerHTML = `<div class="empty-state">${t("summaryPlaceholder")}</div>`;
    return;
  }

  const summary = meeting.summary;
  if (isModernSummary(summary)) {
    renderModernSummary(summary);
    return;
  }

  els.summary.append(summaryBlock(t("contentOverview"), `<p>${escapeHtml(summary.summary)}</p>`));
  els.summary.append(summaryBlock(t("keyPoints"), listHtml(summary.key_points)));
  els.summary.append(summaryBlock(t("actionItems"), actionItemsHtml(summary.action_items)));
  els.summary.append(summaryBlock(t("keyDecisions"), listHtml(summary.decisions)));
}

function renderSummaryEditControls(meeting) {
  const canEdit = Boolean(meeting?.summary && isModernSummary(meeting.summary));
  const isEditing = canEdit && state.summaryEditingMeetingId === meeting.id;
  els.editSummaryButton.hidden = !canEdit || isEditing;
  els.saveSummaryButton.hidden = !isEditing;
  els.cancelSummaryButton.hidden = !isEditing;
  els.summarizeButton.hidden = isEditing;
  els.exportMenu.hidden = isEditing;
}

function isSummaryEditing() {
  return state.summaryEditingMeetingId === selectedMeeting()?.id;
}

function startSummaryEditing() {
  const meeting = selectedMeeting();
  if (!meeting?.summary || !isModernSummary(meeting.summary)) return;
  state.summaryEditingMeetingId = meeting.id;
  renderSummary();
  log("纪要已进入编辑模式，点击文字即可修改。");
}

function cancelSummaryEditing() {
  state.summaryEditingMeetingId = null;
  renderSummary();
  log("已取消本次纪要修改。");
}

async function saveSummaryEditing() {
  const meeting = selectedMeeting();
  if (!meeting?.summary || !isSummaryEditing()) return;
  const editedSummary = structuredClone(meeting.summary);
  for (const node of els.summary.querySelectorAll("[data-summary-path]")) {
    setNestedValue(editedSummary, node.dataset.summaryPath, node.textContent.trim());
  }

  setBusy(true);
  try {
    const response = await api(`/api/meetings/${meeting.id}/summary`, {
      method: "PATCH",
      body: JSON.stringify({ summary: editedSummary })
    });
    replaceMeeting(response.meeting);
    state.summaryEditingMeetingId = null;
    renderAll();
    log("纪要修改已保存。");
  } catch (error) {
    log(error.message);
  } finally {
    setBusy(false);
  }
}

function setNestedValue(target, path, value) {
  const parts = String(path).split(".");
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    cursor = cursor?.[parts[index]];
    if (cursor === undefined || cursor === null) return;
  }
  cursor[parts.at(-1)] = value;
}

function isModernSummary(summary) {
  return Number(summary?.version) >= 2
    || Array.isArray(summary?.core_takeaways)
    || Array.isArray(summary?.chapters);
}

function renderModernSummary(summary) {
  const header = document.createElement("header");
  header.className = "summary-document-head";
  header.innerHTML = `
    <div>
      <span class="summary-kicker">${t("smartMinutes")}</span>
      ${editableTextHtml("h2", summary.title || t("summaryTitle"), "title")}
    </div>
    <span class="summary-type">${escapeHtml(meetingTypeLabel(summary.meeting_type, summary.template))}</span>
  `;
  els.summary.append(header);

  els.summary.append(summarySection(t("contentOverview"), editableTextHtml("p", summary.summary || t("noOverview"), "summary", "summary-lead")));

  const takeaways = Array.isArray(summary.core_takeaways) ? summary.core_takeaways : [];
  const takeawayHtml = takeaways.length
    ? `<div class="takeaway-list">${takeaways.map((item, index) => `
        <article class="takeaway-item">
          ${editableTextHtml("h4", item.title || t("coreTakeaways"), `core_takeaways.${index}.title`)}
          ${editableTextHtml("p", item.detail || "", `core_takeaways.${index}.detail`)}
          ${evidenceHtml(item.evidence)}
        </article>
      `).join("")}</div>`
    : `<p class="summary-empty">${t("noCoreTakeaways")}</p>`;
  els.summary.append(summarySection(t("coreTakeaways"), takeawayHtml));

  const chapters = Array.isArray(summary.chapters) ? summary.chapters : [];
  const chapterHtml = chapters.length
    ? `<div class="chapter-list">${chapters.map((chapter, index) => chapterHtmlForSummary(chapter, index)).join("")}</div>`
    : `<p class="summary-empty">${t("noChapters")}</p>`;
  els.summary.append(summarySection(t("smartChapters"), chapterHtml));

  els.summary.append(summarySection(
    t("actionItems"),
    actionItemsHtml(summary.action_items, t("noActionItems"), "action_items")
  ));
  els.summary.append(summarySection(
    t("keyDecisions"),
    decisionsHtml(summary.decisions, t("noDecisions"), "decisions")
  ));

  const highlights = Array.isArray(summary.highlights) ? summary.highlights : [];
  const highlightsHtml = highlights.length
    ? `<div class="highlight-list">${highlights.map((item, index) => `
        <figure class="highlight-item">
          <blockquote>“${editableTextHtml("span", item.quote || "", `highlights.${index}.quote`)}”</blockquote>
          <figcaption>
            ${editableTextHtml("span", item.speaker || t("unlabeled"), `highlights.${index}.speaker`)}
            ${timestampButton(item.timestamp)}
            ${item.significance ? editableTextHtml("span", item.significance, `highlights.${index}.significance`) : ""}
          </figcaption>
        </figure>
      `).join("")}</div>`
    : `<p class="summary-empty">${t("noHighlights")}</p>`;
  els.summary.append(summarySection(t("highlights"), highlightsHtml));
}

function summarySection(title, html) {
  const section = document.createElement("details");
  section.className = "summary-section";
  section.open = true;
  section.innerHTML = `<summary><h3>${title}</h3><span class="summary-chevron" aria-hidden="true"></span></summary><div class="summary-section-body">${html}</div>`;
  return section;
}

function chapterHtmlForSummary(chapter, chapterIndex) {
  return `
    <article class="chapter-item">
      <div class="chapter-heading">
        ${timestampButton(chapter.start_time)}
        ${editableTextHtml("h4", chapter.title || t("unnamedChapter"), `chapters.${chapterIndex}.title`)}
      </div>
      ${editableTextHtml("p", chapter.summary || "", `chapters.${chapterIndex}.summary`)}
      ${detailListHtml(t("keyPoints"), chapter.key_points, `chapters.${chapterIndex}.key_points`)}
      ${detailListHtml(t("formulas"), chapter.formulas, `chapters.${chapterIndex}.formulas`)}
      ${detailListHtml(t("misconceptions"), chapter.misconceptions, `chapters.${chapterIndex}.misconceptions`)}
    </article>
  `;
}

function detailListHtml(label, items, pathPrefix) {
  if (!Array.isArray(items) || !items.length) return "";
  return `
    <div class="chapter-detail">
      <strong>${label}</strong>
      <ul>${items.map((item, index) => editableTextHtml("li", item, `${pathPrefix}.${index}`)).join("")}</ul>
    </div>
  `;
}

function evidenceHtml(items) {
  if (!Array.isArray(items) || !items.length) return "";
  return `<div class="evidence-row">${items.map((item) => `
    ${timestampButton(item.timestamp)}
    ${item.speaker ? `<span>${escapeHtml(item.speaker)}</span>` : ""}
  `).join("")}</div>`;
}

function timestampButton(timestamp) {
  if (!timestamp) return "";
  return `<button class="timestamp-link" type="button" data-jump-time="${escapeHtml(timestamp)}">${escapeHtml(timestamp)}</button>`;
}

function decisionsHtml(items = [], emptyText = "暂无", pathPrefix = "") {
  if (!Array.isArray(items) || !items.length) return `<p class="summary-empty">${escapeHtml(emptyText)}</p>`;
  return `<ul class="decision-list">${items.map((item, index) => {
    const decision = typeof item === "string" ? item : item.decision;
    const timestamp = typeof item === "string" ? "" : item.evidence_timestamp;
    const path = typeof item === "string" ? `${pathPrefix}.${index}` : `${pathPrefix}.${index}.decision`;
    return `<li>${editableTextHtml("span", decision || "", path)}${timestampButton(timestamp)}</li>`;
  }).join("")}</ul>`;
}

function editableTextHtml(tag, value, path, className = "") {
  const classNames = [className, isSummaryEditing() ? "summary-editable" : ""].filter(Boolean).join(" ");
  const classAttribute = classNames ? ` class="${classNames}"` : "";
  const editAttributes = isSummaryEditing()
    ? ` contenteditable="true" spellcheck="false" data-summary-path="${escapeHtml(path)}"`
    : "";
  return `<${tag}${classAttribute}${editAttributes}>${escapeHtml(value)}</${tag}>`;
}

function handleSummaryClick(event) {
  const button = event.target.closest("[data-jump-time]");
  if (!button) return;
  jumpToTranscriptTime(button.dataset.jumpTime);
}

function jumpToTranscriptTime(timestamp) {
  const seconds = parseTimestamp(timestamp);
  if (!Number.isFinite(seconds)) return;
  setPanelCollapsed("transcript", false);
  const rows = [...document.querySelectorAll(".segment-row")];
  if (!rows.length) return;
  const target = rows.reduce((best, row) => {
    const distance = Math.abs(Number(row.dataset.startTime) - seconds);
    return !best || distance < best.distance ? { row, distance } : best;
  }, null)?.row;
  if (!target) return;
  document.querySelectorAll(".segment-row.is-source").forEach((row) => row.classList.remove("is-source"));
  target.classList.add("is-source");
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => target.classList.remove("is-source"), 2400);
}

function parseTimestamp(value) {
  const match = String(value || "").match(/^(\d{1,3}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN;
}

function templateLabel(template) {
  return {
    auto: t("templateAuto"),
    teaching: t("templateTeaching"),
    research: t("templateResearch"),
    project: t("templateProject"),
    general: t("templateGeneral"),
    custom: t("templateCustom")
  }[template] || t("summaryTitle");
}

function meetingTypeLabel(meetingType, template) {
  const normalized = String(meetingType || "").toLowerCase();
  return {
    teaching: t("templateTeaching"),
    research: t("templateResearch"),
    project: t("templateProject"),
    general: t("templateGeneral")
  }[normalized] || meetingType || templateLabel(template);
}

function buildSummaryDocumentHtml(meeting, mode) {
  const summary = meeting.summary;
  const generatedAt = summary.created_at || summary.generated_at || new Date().toISOString();
  const actionItems = Array.isArray(summary.action_items) ? summary.action_items : [];
  const title = `${meeting.title || "未命名会议"} - 会议纪要`;
  const transcriptCount = Array.isArray(meeting.transcripts) ? meeting.transcripts.length : 0;
  const shouldAutoPrint = mode === "pdf";
  const summaryBody = isModernSummary(summary)
    ? modernSummaryDocumentHtml(summary)
    : legacySummaryDocumentHtml(summary, actionItems);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      max-width: 760px;
      margin: 36px auto;
      color: #18212f;
      font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
      line-height: 1.68;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 26px;
    }
    .meta {
      margin-bottom: 28px;
      color: #5c6b7c;
      font-size: 13px;
    }
    h2 {
      border-bottom: 1px solid #d8e1ea;
      margin: 24px 0 10px;
      padding-bottom: 6px;
      font-size: 18px;
    }
    p {
      margin: 0 0 10px;
    }
    ul {
      margin: 0;
      padding-left: 22px;
    }
    li {
      margin: 6px 0;
    }
    @media print {
      body {
        margin: 0;
      }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">
    生成时间：${escapeHtml(formatFullDate(generatedAt))}
    ${transcriptCount ? ` · 转录片段：${transcriptCount} 条` : ""}
  </div>

  ${summaryBody}

  ${shouldAutoPrint ? "<script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));<\/script>" : ""}
</body>
</html>`;
}

function modernSummaryDocumentHtml(summary) {
  const takeaways = Array.isArray(summary.core_takeaways) ? summary.core_takeaways : [];
  const chapters = Array.isArray(summary.chapters) ? summary.chapters : [];
  const decisions = Array.isArray(summary.decisions) ? summary.decisions : [];
  const highlights = Array.isArray(summary.highlights) ? summary.highlights : [];
  return `
    <h2>${escapeHtml(summary.title || "内容概览")}</h2>
    <p>${escapeHtml(summary.summary || "暂无")}</p>

    <h2>核心结论</h2>
    ${takeaways.length ? takeaways.map((item) => `
      <h3>${escapeHtml(item.title || "核心结论")}</h3>
      <p>${escapeHtml(item.detail || "")}${documentTimestampText(item.evidence?.[0]?.timestamp)}</p>
    `).join("") : "<p>没有提取到明确的核心结论</p>"}

    <h2>智能章节</h2>
    ${chapters.length ? chapters.map((chapter) => `
      <h3>${escapeHtml(chapter.start_time || "")} ${escapeHtml(chapter.title || "未命名章节")}</h3>
      <p>${escapeHtml(chapter.summary || "")}</p>
      ${documentDetailListHtml("要点", chapter.key_points)}
      ${documentDetailListHtml("公式与结果", chapter.formulas)}
      ${documentDetailListHtml("易错点", chapter.misconceptions)}
    `).join("") : "<p>没有生成智能章节</p>"}

    <h2>待办事项</h2>
    ${documentActionItemsHtml(summary.action_items, "本次没有明确的后续待办")}

    <h2>关键决策</h2>
    ${decisions.length ? `<ul>${decisions.map((item) => `
      <li>${escapeHtml(typeof item === "string" ? item : item.decision || "")}${documentTimestampText(item?.evidence_timestamp)}</li>
    `).join("")}</ul>` : "<p>本次没有明确达成的会议决策</p>"}

    <h2>金句时刻</h2>
    ${highlights.length ? highlights.map((item) => `
      <blockquote>“${escapeHtml(item.quote || "")}”</blockquote>
      <p>${escapeHtml(item.speaker || "未标注")}${documentTimestampText(item.timestamp)}${item.significance ? ` · ${escapeHtml(item.significance)}` : ""}</p>
    `).join("") : "<p>本次没有适合单独摘录的金句</p>"}
  `;
}

function legacySummaryDocumentHtml(summary, actionItems) {
  return `
    <h2>整体摘要</h2>
    <p>${escapeHtml(summary.summary || "暂无")}</p>
    <h2>关键要点</h2>
    ${documentListHtml(summary.key_points)}
    <h2>待办事项</h2>
    ${documentActionItemsHtml(actionItems)}
    <h2>会议决策</h2>
    ${documentListHtml(summary.decisions)}
  `;
}

function documentDetailListHtml(label, items) {
  if (!Array.isArray(items) || !items.length) return "";
  return `<h4>${label}</h4>${documentListHtml(items)}`;
}

function documentTimestampText(timestamp) {
  return timestamp ? `（${escapeHtml(timestamp)}）` : "";
}

function summaryBlock(title, html) {
  const block = document.createElement("section");
  block.className = "summary-block";
  block.innerHTML = `<h3>${title}</h3>${html}`;
  return block;
}

function listHtml(items = []) {
  if (!items.length) return "<p>暂无</p>";
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function actionItemsHtml(items = [], emptyText = "暂无", pathPrefix = "") {
  if (!items.length) return `<p class="summary-empty">${escapeHtml(emptyText)}</p>`;
  return `<ul>${items.map((item, index) => {
    const person = editableTextHtml("strong", item.person || t("unspecified"), `${pathPrefix}.${index}.person`);
    const task = editableTextHtml("span", item.task || "", `${pathPrefix}.${index}.task`);
    const deadline = item.deadline
      ? `（${editableTextHtml("span", item.deadline, `${pathPrefix}.${index}.deadline`)}）`
      : "";
    return `<li>${person}：${task}${deadline}${timestampButton(item.evidence_timestamp)}</li>`;
  }).join("")}</ul>`;
}

function documentListHtml(items = []) {
  if (!Array.isArray(items) || !items.length) return "<p>暂无</p>";
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function documentActionItemsHtml(items = [], emptyText = "暂无") {
  if (!Array.isArray(items) || !items.length) return `<p>${escapeHtml(emptyText)}</p>`;
  return `<ul>${items.map((item) => {
    const deadline = item.deadline ? `（${escapeHtml(item.deadline)}）` : "";
    return `<li><strong>${escapeHtml(item.person || "未指定")}：</strong>${escapeHtml(item.task || "")}${deadline}${documentTimestampText(item.evidence_timestamp)}</li>`;
  }).join("")}</ul>`;
}

function applySpeakerName(label, name) {
  document.querySelectorAll(`.segment-row[data-speaker-label="${cssEscape(label)}"] .speaker-input`)
    .forEach((input) => {
      input.value = name;
    });
}

function selectedMeeting() {
  return state.meetings.find((meeting) => meeting.id === state.selectedMeetingId);
}

function replaceMeeting(meeting) {
  const index = state.meetings.findIndex((item) => item.id === meeting.id);
  if (index >= 0) state.meetings[index] = meeting;
  else state.meetings.unshift(meeting);
  state.selectedMeetingId = meeting.id;
}

function setBusy(isBusy) {
  for (const button of document.querySelectorAll("button")) {
    if (button.classList.contains("panel-toggle")) continue;
    button.disabled = isBusy;
  }
}

function togglePanel(panelName) {
  const panel = document.querySelector(`[data-panel="${panelName}"]`);
  if (!panel) return;
  setPanelCollapsed(panelName, !panel.classList.contains("is-collapsed"));
}

function setPanelCollapsed(panelName, isCollapsed) {
  const panel = document.querySelector(`[data-panel="${panelName}"]`);
  const toggle = document.querySelector(`[data-toggle-panel="${panelName}"]`);
  if (!panel || !toggle) return;
  panel.classList.toggle("is-collapsed", isCollapsed);
  toggle.textContent = isCollapsed ? t("expand") : t("collapse");
  toggle.setAttribute("aria-expanded", String(!isCollapsed));
  localStorage.setItem(`panel:${panelName}`, isCollapsed ? "collapsed" : "expanded");
}

function restorePanelState() {
  for (const toggle of els.panelToggles) {
    const panelName = toggle.dataset.togglePanel;
    const saved = localStorage.getItem(`panel:${panelName}`);
    setPanelCollapsed(panelName, saved === "collapsed");
  }
}

function updateTimer() {
  if (!state.recordingStartedAt) return;
  const seconds = Math.floor((Date.now() - state.recordingStartedAt) / 1000);
  els.recordTimer.textContent = formatTime(seconds);
}

function log(message) {
  const entry = document.createElement("div");
  entry.className = "log-entry";
  entry.textContent = `${new Date().toLocaleTimeString(state.locale, { hour12: false })} ${message}`;
  els.log.prepend(entry);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.detail || t("requestFailed"));
  }
  return payload;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function statusText(status) {
  return {
    uploaded: t("statusUploaded"),
    transcribing: t("statusTranscribing"),
    transcribed: t("statusTranscribed"),
    summarizing: t("statusSummarizing"),
    summarized: t("statusSummarized"),
    failed: t("statusFailed")
  }[status] || status || t("unknown");
}

function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatDate(value) {
  return new Date(value).toLocaleString(state.locale, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatFullDate(value) {
  return new Date(value).toLocaleString(state.locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = Number(bytes) || 0;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function currentHotwords() {
  return state.hotwords.map((item) => item.value);
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function safeFileName(value) {
  return String(value || "会议纪要")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80) || "会议纪要";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cssEscape(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
