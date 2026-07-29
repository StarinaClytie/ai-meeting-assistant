const state = {
  meetings: [],
  selectedMeetingId: null,
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

const els = {
  recordButton: document.querySelector("#recordButton"),
  recordIcon: document.querySelector("#recordIcon"),
  recordTimer: document.querySelector("#recordTimer"),
  audioPreview: document.querySelector("#audioPreview"),
  meetingTitle: document.querySelector("#meetingTitle"),
  audioFile: document.querySelector("#audioFile"),
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
  meetingList: document.querySelector("#meetingList"),
  log: document.querySelector("#log"),
  systemStatus: document.querySelector("#systemStatus"),
  segmentTemplate: document.querySelector("#segmentTemplate"),
  panelToggles: document.querySelectorAll("[data-toggle-panel]")
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
els.exportDocButton.addEventListener("click", exportSummaryDoc);
els.exportPdfButton.addEventListener("click", exportSummaryPdf);
els.editSummaryButton.addEventListener("click", startSummaryEditing);
els.saveSummaryButton.addEventListener("click", saveSummaryEditing);
els.cancelSummaryButton.addEventListener("click", cancelSummaryEditing);
els.panelToggles.forEach((button) => {
  button.addEventListener("click", () => togglePanel(button.dataset.togglePanel));
});
els.summary.addEventListener("click", handleSummaryClick);

restorePanelState();
configureEnvironmentSpecificUi();
await loadMeetings();
updateVocabularyCount();
log("准备就绪，可以录音或上传音频。");

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
  if (selectedFile && selectedFile.size > 100 * 1024 * 1024) {
    log("这个文件超过 100MB，请把它的完整本机路径填到下方输入框，再创建会议。");
    return;
  }

  setBusy(true);
  try {
    const audio = localPath
      ? { localPath }
      : {
        name: selectedFile?.name || `recording-${Date.now()}.webm`,
        dataUrl: await blobToDataUrl(audioBlob)
      };
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
  }
}

function handleFileSelected() {
  const file = els.audioFile.files[0];
  if (!file) return;
  const size = formatBytes(file.size);
  if (file.size > 100 * 1024 * 1024) {
    log(`已选择 ${file.name}（${size}）。文件较大，请改用本机路径方式创建会议。`);
  } else {
    log(`已选择 ${file.name}（${size}）。`);
  }
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
    renderAll();
    log("说话人和转录文本已保存。");
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
        customPrompt: els.customSummaryPrompt.value.trim()
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
    <input class="vocabulary-input" type="text" value="${escapeHtml(value)}" placeholder="输入专业词、人名或缩写">
    <select class="vocabulary-type" aria-label="热词类型">
      <option value="term">术语</option>
      <option value="name">人名</option>
      <option value="acronym">缩写</option>
      <option value="entity">机构设备</option>
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
  els.vocabularyCount.textContent = count ? `${count} 个热词已添加` : "0 个热词";
}

function updateVocabularyDialogCount() {
  const count = readVocabularyRows().length;
  els.vocabularyDialogCount.textContent = `${count}/200 · 仅用于当前会议`;
}

function exportSummaryDoc() {
  const meeting = selectedMeeting();
  if (!meeting?.summary) {
    log("请先生成会议总结，再导出 Word。");
    return;
  }

  const html = buildSummaryDocumentHtml(meeting, "word");
  const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
  downloadBlob(blob, `${safeFileName(meeting.title)}-会议纪要.doc`);
  log("已导出 Word 会议纪要。");
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
  els.systemStatus.textContent = meeting ? statusText(meeting.status) : "本地流程";
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
    option.textContent = "暂无会议";
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

  els.meetingList.innerHTML = "";
  if (!state.meetings.length) {
    els.meetingList.innerHTML = `<div class="empty-state">还没有会议</div>`;
    return;
  }
  for (const meeting of state.meetings) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `meeting-item ${meeting.id === state.selectedMeetingId ? "active" : ""}`;
    item.innerHTML = `<strong>${escapeHtml(meeting.title)}</strong><span>${statusText(meeting.status)} · ${formatDate(meeting.created_at)}</span>`;
    item.addEventListener("click", () => selectMeeting(meeting.id));
    els.meetingList.append(item);
  }
}

function renderEditor() {
  const meeting = selectedMeeting();
  els.speakerMap.innerHTML = "";
  els.segments.innerHTML = "";
  if (!meeting) {
    els.segments.innerHTML = `<div class="empty-state">创建会议后显示转录片段</div>`;
    return;
  }
  if (!meeting.transcripts.length) {
    els.segments.innerHTML = `<div class="empty-state">还没有转录内容</div>`;
    return;
  }

  const labels = [...new Set(meeting.transcripts.map((segment) => segment.speaker_label))];
  for (const label of labels) {
    const card = document.createElement("label");
    card.className = "speaker-card";
    const currentName = meeting.transcripts.find((segment) => segment.speaker_label === label)?.speaker_name || "";
    card.innerHTML = `<strong>${escapeHtml(label)}</strong><input data-map-label="${escapeHtml(label)}" value="${escapeHtml(currentName)}" placeholder="真实姓名">`;
    card.querySelector("input").addEventListener("input", (event) => applySpeakerName(label, event.target.value));
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
    node.querySelector(".text-input").value = segment.text;
    els.segments.append(node);
  }
}

function renderSummary() {
  const meeting = selectedMeeting();
  els.summary.innerHTML = "";
  renderSummaryEditControls(meeting);
  if (!meeting?.summary) {
    els.summary.innerHTML = `<div class="empty-state">摘要会显示在这里</div>`;
    return;
  }

  const summary = meeting.summary;
  if (isModernSummary(summary)) {
    renderModernSummary(summary);
    return;
  }

  els.summary.append(summaryBlock("整体摘要", `<p>${escapeHtml(summary.summary)}</p>`));
  els.summary.append(summaryBlock("关键要点", listHtml(summary.key_points)));
  els.summary.append(summaryBlock("待办事项", actionItemsHtml(summary.action_items)));
  els.summary.append(summaryBlock("会议决策", listHtml(summary.decisions)));
}

function renderSummaryEditControls(meeting) {
  const canEdit = Boolean(meeting?.summary && isModernSummary(meeting.summary));
  const isEditing = canEdit && state.summaryEditingMeetingId === meeting.id;
  els.editSummaryButton.hidden = !canEdit || isEditing;
  els.saveSummaryButton.hidden = !isEditing;
  els.cancelSummaryButton.hidden = !isEditing;
  els.summarizeButton.hidden = isEditing;
  els.exportDocButton.hidden = isEditing;
  els.exportPdfButton.hidden = isEditing;
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
      <span class="summary-kicker">智能纪要</span>
      ${editableTextHtml("h2", summary.title || "会议内容总结", "title")}
    </div>
    <span class="summary-type">${escapeHtml(meetingTypeLabel(summary.meeting_type, summary.template))}</span>
  `;
  els.summary.append(header);

  els.summary.append(summarySection("内容概览", editableTextHtml("p", summary.summary || "暂无概览", "summary", "summary-lead")));

  const takeaways = Array.isArray(summary.core_takeaways) ? summary.core_takeaways : [];
  const takeawayHtml = takeaways.length
    ? `<div class="takeaway-list">${takeaways.map((item, index) => `
        <article class="takeaway-item">
          ${editableTextHtml("h4", item.title || "核心结论", `core_takeaways.${index}.title`)}
          ${editableTextHtml("p", item.detail || "", `core_takeaways.${index}.detail`)}
          ${evidenceHtml(item.evidence)}
        </article>
      `).join("")}</div>`
    : `<p class="summary-empty">没有提取到明确的核心结论</p>`;
  els.summary.append(summarySection("核心结论", takeawayHtml));

  const chapters = Array.isArray(summary.chapters) ? summary.chapters : [];
  const chapterHtml = chapters.length
    ? `<div class="chapter-list">${chapters.map((chapter, index) => chapterHtmlForSummary(chapter, index)).join("")}</div>`
    : `<p class="summary-empty">没有生成智能章节</p>`;
  els.summary.append(summarySection("智能章节", chapterHtml));

  els.summary.append(summarySection(
    "待办事项",
    actionItemsHtml(summary.action_items, "本次没有明确的后续待办", "action_items")
  ));
  els.summary.append(summarySection(
    "关键决策",
    decisionsHtml(summary.decisions, "本次没有明确达成的会议决策", "decisions")
  ));

  const highlights = Array.isArray(summary.highlights) ? summary.highlights : [];
  const highlightsHtml = highlights.length
    ? `<div class="highlight-list">${highlights.map((item, index) => `
        <figure class="highlight-item">
          <blockquote>“${editableTextHtml("span", item.quote || "", `highlights.${index}.quote`)}”</blockquote>
          <figcaption>
            ${editableTextHtml("span", item.speaker || "未标注", `highlights.${index}.speaker`)}
            ${timestampButton(item.timestamp)}
            ${item.significance ? editableTextHtml("span", item.significance, `highlights.${index}.significance`) : ""}
          </figcaption>
        </figure>
      `).join("")}</div>`
    : `<p class="summary-empty">本次没有适合单独摘录的金句</p>`;
  els.summary.append(summarySection("金句时刻", highlightsHtml));
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
        ${editableTextHtml("h4", chapter.title || "未命名章节", `chapters.${chapterIndex}.title`)}
      </div>
      ${editableTextHtml("p", chapter.summary || "", `chapters.${chapterIndex}.summary`)}
      ${detailListHtml("要点", chapter.key_points, `chapters.${chapterIndex}.key_points`)}
      ${detailListHtml("公式与结果", chapter.formulas, `chapters.${chapterIndex}.formulas`)}
      ${detailListHtml("易错点", chapter.misconceptions, `chapters.${chapterIndex}.misconceptions`)}
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
    auto: "自动识别",
    teaching: "课程讲解",
    research: "科研组会",
    project: "项目会议",
    general: "通用讨论",
    custom: "自定义"
  }[template] || "结构化总结";
}

function meetingTypeLabel(meetingType, template) {
  const normalized = String(meetingType || "").toLowerCase();
  return {
    teaching: "课程讲解",
    research: "科研组会",
    project: "项目会议",
    general: "通用讨论"
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
    const person = editableTextHtml("strong", item.person || "未指定", `${pathPrefix}.${index}.person`);
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
  toggle.textContent = isCollapsed ? "展开" : "收起";
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
  entry.textContent = `${new Date().toLocaleTimeString("zh-CN", { hour12: false })} ${message}`;
  els.log.prepend(entry);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.detail || "请求失败");
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
    uploaded: "已上传",
    transcribing: "转写中",
    transcribed: "待总结",
    summarizing: "总结中",
    summarized: "已完成",
    failed: "处理失败"
  }[status] || status || "未知";
}

function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatDate(value) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatFullDate(value) {
  return new Date(value).toLocaleString("zh-CN", {
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
