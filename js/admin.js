/* 管理後台只透過受驗證的 admin-api Edge Function 讀寫競賽資料。 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.TEA_SUPABASE_CONFIG || {};
const root = document.getElementById("admin-root");
const taipei = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
let client;
let dashboard = null;
let selectedActivityId = "";
let activeTab = "ranking";
let questionBank = [];
const SPEED_TYPES = [
  { id: "twoLeaves", label: "一心二葉" },
  { id: "singleBud", label: "單芽" },
  { id: "oldLeaf", label: "老葉" },
  { id: "diseasedLeaf", label: "病葉" }
];

const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const statusLabel = (status) => ({ active: "進行中", paused: "暫停開放", upcoming: "未開始", ended: "已結束", closed: "關閉" }[status] || "關閉");
const formatDate = (value) => value ? taipei.format(new Date(value)) : "-";
const localInputValue = (value) => value ? new Date(value).toLocaleString("sv-SE", { timeZone: "Asia/Taipei", hour12: false }).replace(" ", "T").slice(0, 16) : "";

function configured() { return /^https:\/\/.+\.supabase\.co$/i.test(config.url || "") && Boolean(config.anonKey); }

async function adminCall(action, payload = {}) {
  const { data: { session } } = await client.auth.getSession();
  if (!session) throw new Error("登入已失效，請重新登入。");
  const response = await fetch(`${config.url}/functions/v1/admin-api`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: config.anonKey, Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action, ...payload })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "管理資料讀取失敗。");
  return body;
}

function renderSetup() {
  root.innerHTML = `<section class="admin-login"><div class="status-card"><p class="eyebrow">管理後台</p><h1>尚未設定 Supabase</h1><p class="lead">請先在 js/supabase-config.js 填入 Project URL 與 anon key。</p></div></section>`;
}

function renderLogin(error = "") {
  root.innerHTML = `<section class="admin-login"><div class="screen-header"><p class="eyebrow">臺東大學茶道社</p><h1>挑戰賽管理後台</h1><p class="lead">請使用已授權的管理員帳號登入。</p></div><form class="entry-card" id="login-form"><label class="input-group"><span>Email</span><input name="email" type="email" autocomplete="email" required></label><label class="input-group"><span>密碼</span><input name="password" type="password" autocomplete="current-password" required></label>${error ? `<p class="form-error">${escapeHtml(error)}</p>` : ""}<button class="primary-button" type="submit">登入後台</button></form></section>`;
  document.getElementById("login-form").addEventListener("submit", login);
}

async function login(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const { error } = await client.auth.signInWithPassword({ email: form.email.value.trim(), password: form.password.value });
    if (error) throw error;
    await loadDashboard();
  } catch (error) { renderLogin(error.message || "登入失敗。"); }
}

async function loadDashboard() {
  root.innerHTML = `<section class="admin-login"><div class="status-card"><span class="loading-ring"></span><h2>正在讀取管理資料…</h2></div></section>`;
  try {
    dashboard = await adminCall("dashboard", { activityId: selectedActivityId || null });
    selectedActivityId = dashboard.selectedActivity?.id || "";
    renderDashboard();
  } catch (error) {
    await client.auth.signOut();
    renderLogin(error.message || "你沒有管理權限。");
  }
}

function renderDashboard() {
  const activity = dashboard.selectedActivity;
  const stats = dashboard.stats || {};
  root.innerHTML = `<section class="admin-page">
    <header class="admin-header"><div><p class="eyebrow">茶道社挑戰賽</p><h1>管理後台</h1></div><button class="admin-button is-quiet" data-admin-action="logout">登出</button></header>
    <div class="admin-toolbar"><select class="admin-select" id="activity-select">${dashboard.activities.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selectedActivityId ? "selected" : ""}>${escapeHtml(item.name)}（${statusLabel(item.status)}）</option>`).join("")}</select><button class="admin-button is-quiet" data-admin-action="edit-activity">修改活動</button><button class="admin-button is-quiet" data-admin-action="new-activity">新增活動</button></div>
    ${activity ? `<div class="admin-stats"><div class="admin-stat"><span>活動狀態</span><strong>${statusLabel(activity.status)}</strong></div><div class="admin-stat"><span>參賽人數</span><strong>${stats.players || 0}</strong></div><div class="admin-stat"><span>遊玩總次數</span><strong>${stats.sessions || 0}</strong></div><div class="admin-stat"><span>活動截止</span><strong>${escapeHtml(formatDate(activity.endAt))}</strong></div></div>` : `<p class="admin-message">尚未建立活動。</p>`}
    <nav class="admin-tabs"><button class="admin-tab ${activeTab === "questions" ? "is-active" : ""}" data-admin-action="tab" data-tab="questions">題庫管理</button><button class="admin-tab ${activeTab === "ranking" ? "is-active" : ""}" data-admin-action="tab" data-tab="ranking">排行榜</button><button class="admin-tab ${activeTab === "players" ? "is-active" : ""}" data-admin-action="tab" data-tab="players">搜尋玩家</button><button class="admin-tab ${activeTab === "public" ? "is-active" : ""}" data-admin-action="tab" data-tab="public">公開排行</button><button class="admin-tab ${activeTab === "speed" ? "is-active" : ""}" data-admin-action="tab" data-tab="speed">遊戲速度</button></nav>
    <div id="admin-content"></div></section>`;
  document.getElementById("activity-select").addEventListener("change", (event) => { selectedActivityId = event.target.value; loadDashboard(); });
  renderTab();
}

function renderTab() {
  const content = document.getElementById("admin-content");
  if (activeTab === "questions") { renderQuestionBank(); return; }
  if (activeTab === "speed") { renderSpeedSettings(); return; }
  if (activeTab === "players") {
    content.innerHTML = `<section class="admin-panel"><h2>搜尋玩家</h2><div class="table-toolbar"><input class="admin-input" id="player-query" placeholder="輸入學號或姓名"><button class="admin-button" id="search-player">搜尋</button></div><div id="search-result" class="admin-empty">輸入學號或姓名以查看遊玩紀錄。</div></section>`;
    document.getElementById("search-player").addEventListener("click", searchPlayer);
    document.getElementById("player-query").addEventListener("keydown", (event) => { if (event.key === "Enter") searchPlayer(); });
    return;
  }
  const rows = activeTab === "public" ? dashboard.publicLeaderboard : dashboard.leaderboard;
  const header = activeTab === "public" ? "<tr><th>排名</th><th>姓名</th><th>最高分</th></tr>" : "<tr><th>排名</th><th>學號</th><th>姓名</th><th>最高分</th><th>達成時間</th><th>遊玩次數</th></tr>";
  const body = rows?.length ? rows.map((row) => activeTab === "public" ? `<tr><td>${row.rank}</td><td>${escapeHtml(row.name)}</td><td>${row.highScore}</td></tr>` : `<tr><td>${row.rank}</td><td>${escapeHtml(row.studentId)}</td><td>${escapeHtml(row.name)}</td><td>${row.highScore}</td><td>${escapeHtml(formatDate(row.achievedAt))}</td><td>${row.playCount}</td></tr>`).join("") : `<tr><td colspan="6" class="admin-empty">尚無有效成績。</td></tr>`;
  content.innerHTML = `<section class="admin-panel"><div class="table-toolbar"><h2>${activeTab === "public" ? "IG 公開排行榜" : "最終排行榜"}</h2>${activeTab === "ranking" ? `<button class="admin-button is-quiet" data-admin-action="export">匯出 CSV</button>` : ""}</div><div class="admin-table-wrap"><table class="admin-table"><thead>${header}</thead><tbody>${body}</tbody></table></div></section>`;
}

function readSpeedForm() {
  const form = document.getElementById("speed-form");
  const number = (name) => Number(form.elements.namedItem(name).value);
  return {
    spawnStartMs: number("spawnStartMs"),
    spawnEndMs: number("spawnEndMs"),
    speedRampPower: number("speedRampPower"),
    types: Object.fromEntries(SPEED_TYPES.map(({ id }) => [id, {
      weight: number(`${id}-weight`),
      startLifeMs: number(`${id}-startLifeMs`),
      endLifeMs: number(`${id}-endLifeMs`)
    }]))
  };
}

function updateSpeedPreview() {
  const target = document.getElementById("speed-preview");
  if (!target) return;
  const config = readSpeedForm();
  const interpolate = (start, end, progress) => Math.round(start + (end - start) * progress);
  const rows = [0, 5, 10, 15, 20, 25, 30].map((seconds) => {
    const progress = Math.pow(seconds / 30, config.speedRampPower);
    const spawn = interpolate(config.spawnStartMs, config.spawnEndMs, progress);
    const cells = SPEED_TYPES.map(({ id }) => {
      const valid = Number.isFinite(config.types[id].startLifeMs) && Number.isFinite(config.types[id].endLifeMs);
      return `<td>${valid ? `${interpolate(config.types[id].startLifeMs, config.types[id].endLifeMs, progress)}ms` : "—"}</td>`;
    }).join("");
    return `<tr><td>${seconds} 秒</td><td>${Number.isFinite(spawn) ? `${spawn}ms` : "—"}</td>${cells}</tr>`;
  }).join("");
  target.innerHTML = `<div class="admin-table-wrap"><table class="admin-table speed-preview-table"><thead><tr><th>時間</th><th>出現間隔</th>${SPEED_TYPES.map(({ label }) => `<th>${label}掉落</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderSpeedSettings(message = "") {
  const content = document.getElementById("admin-content");
  const config = dashboard.gameConfig;
  if (!config?.types) { content.innerHTML = `<p class="admin-message is-error">尚未取得遊戲速度設定。</p>`; return; }
  const typeRows = SPEED_TYPES.map(({ id, label }) => {
    const item = config.types[id];
    return `<tr><th>${label}</th><td><input class="speed-input" type="number" name="${id}-weight" min="1" max="97" step="1" value="${item.weight}" required></td><td><input class="speed-input" type="number" name="${id}-startLifeMs" min="600" max="5000" step="10" value="${item.startLifeMs}" required></td><td><input class="speed-input" type="number" name="${id}-endLifeMs" min="300" max="3000" step="10" value="${item.endLifeMs}" required></td></tr>`;
  }).join("");
  content.innerHTML = `<form class="admin-panel" id="speed-form"><div><h2>遊戲速度設定</h2><p class="admin-help">毫秒越小越快。玩家重新進入遊戲後會讀取最新設定。</p></div>
    <div class="speed-settings-grid"><label class="input-group"><span>開始出現間隔（ms）</span><input type="number" name="spawnStartMs" min="400" max="1500" step="10" value="${config.spawnStartMs}" required></label><label class="input-group"><span>結尾出現間隔（ms）</span><input type="number" name="spawnEndMs" min="200" max="1000" step="10" value="${config.spawnEndMs}" required></label><label class="input-group"><span>加速曲線（0.5～3）</span><input type="number" name="speedRampPower" min="0.5" max="3" step="0.1" value="${config.speedRampPower}" required></label></div>
    <div class="admin-table-wrap"><table class="admin-table speed-edit-table"><thead><tr><th>葉片</th><th>出現比例 %</th><th>初始掉落 ms</th><th>結尾掉落 ms</th></tr></thead><tbody>${typeRows}</tbody></table></div>
    <p class="admin-help">四種出現比例須合計 100%。結尾時間不可大於初始時間；加速曲線越高，速度變化越集中在後半段。</p>
    <h3>30 秒速度預覽</h3><div id="speed-preview"></div>
    <p class="form-error" id="speed-error" hidden></p>${message ? `<p class="speed-success">${escapeHtml(message)}</p>` : ""}<button class="primary-button" type="submit">儲存速度設定</button></form>`;
  document.getElementById("speed-form").addEventListener("input", updateSpeedPreview);
  document.getElementById("speed-form").addEventListener("submit", saveSpeedSettings);
  updateSpeedPreview();
}

async function saveSpeedSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.getElementById("speed-error");
  const button = form.querySelector("button[type=submit]");
  error.hidden = true; button.disabled = true; button.textContent = "儲存中…";
  try {
    const response = await adminCall("update-game-settings", { gameConfig: readSpeedForm() });
    dashboard.gameConfig = response.gameConfig;
    renderSpeedSettings("已儲存，玩家重新進入遊戲後生效。");
  } catch (requestError) {
    error.textContent = requestError.message || "速度設定儲存失敗。"; error.hidden = false;
    button.disabled = false; button.textContent = "儲存速度設定";
  }
}

async function searchPlayer() {
  const query = document.getElementById("player-query").value.trim();
  const result = document.getElementById("search-result");
  if (!query) { result.textContent = "請輸入學號或姓名。"; return; }
  result.textContent = "搜尋中…";
  try {
    const response = await adminCall("search", { activityId: selectedActivityId, query });
    result.innerHTML = response.players?.length ? response.players.map((player) => `<article class="admin-panel"><h3>${escapeHtml(player.name)}・${escapeHtml(player.studentId)}</h3><p>遊玩 ${player.playCount} 次，最高分 ${player.highScore}</p><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>完成時間</th><th>分數</th><th>狀態</th><th></th></tr></thead><tbody>${player.sessions.map((session) => `<tr><td>${escapeHtml(formatDate(session.completedAt))}</td><td>${session.totalScore ?? "-"}</td><td>${session.isValid ? "有效" : "異常"}</td><td><button class="admin-button is-danger" data-admin-action="delete-session" data-session-id="${escapeHtml(session.id)}">刪除此筆</button></td></tr>`).join("")}</tbody></table></div></article>`).join("") : "找不到符合的玩家資料。";
  } catch (error) { result.innerHTML = `<p class="admin-message is-error">${escapeHtml(error.message)}</p>`; }
}

function renderActivityForm(activity) {
  const formActivity = activity || {};
  const pauseEnabled = Boolean(formActivity.isPaused && (!formActivity.resumeAt || new Date(formActivity.resumeAt) > new Date()));
  root.innerHTML = `<section class="admin-login"><div class="screen-header"><p class="eyebrow">活動設定</p><h1>${activity ? "修改活動" : "建立活動"}</h1></div><form class="entry-card activity-form" id="activity-form" data-activity-id="${escapeHtml(formActivity.id || "")}"><label class="input-group full-width"><span>活動名稱</span><input name="name" maxlength="100" value="${escapeHtml(formActivity.name || "")}" required></label><label class="input-group"><span>開始時間（台灣）</span><input class="admin-date" type="datetime-local" name="startAt" value="${escapeHtml(localInputValue(formActivity.startAt))}" required></label><label class="input-group"><span>結束時間（台灣）</span><input class="admin-date" type="datetime-local" name="endAt" value="${escapeHtml(localInputValue(formActivity.endAt))}" required></label><fieldset class="admin-panel full-width"><legend>本活動開放關卡</legend>${[["harvest", "採茶關"], ["knowledge", "知識卡"], ["quiz", "問答關"]].map(([key, label]) => `<label class="toggle-label"><input type="checkbox" name="stage-${key}" ${formActivity.stages?.[key] !== false ? "checked" : ""}> ${label}</label>`).join("")}<p class="admin-help">至少勾選一關；只開知識卡時不計分。問答會使用題庫中勾選的所有題目。更改關卡或題數會影響可得總分，建議新活動開始前設定。</p></fieldset><label class="toggle-label full-width"><input type="checkbox" name="isActive" ${formActivity.isActive ? "checked" : ""}> 開放此活動</label><label class="toggle-label full-width"><input type="checkbox" name="isPaused" ${pauseEnabled ? "checked" : ""}> 暫停開放（停止新挑戰）</label><label class="input-group full-width"><span>預計重新開放時間（台灣，可留空）</span><input class="admin-date" type="datetime-local" name="resumeAt" value="${escapeHtml(pauseEnabled ? localInputValue(formActivity.resumeAt) : "")}" ${pauseEnabled ? "" : "disabled"}></label><p class="admin-help full-width">暫停時，玩家入口會顯示公告；已開始的挑戰仍可交成績。填寫時間會自動恢復，留空則等待手動取消暫停。請保持「開放此活動」勾選，重新開放時間須早於活動結束。</p><p class="form-error" id="activity-error" hidden></p><div class="admin-actions full-width"><button class="primary-button" type="submit">儲存活動</button><button class="secondary-button" type="button" data-admin-action="back-dashboard">返回後台</button></div></form></section>`;
  const form = document.getElementById("activity-form");
  form.addEventListener("submit", saveActivity);
  form.elements.isPaused.addEventListener("change", () => { form.elements.resumeAt.disabled = !form.elements.isPaused.checked; if (form.elements.isPaused.checked) form.elements.isActive.checked = true; });
}

async function saveActivity(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.getElementById("activity-error");
  try {
    const saved = await adminCall("upsert-activity", { activity: { id: form.dataset.activityId || null, name: form.name.value.trim(), startAt: new Date(`${form.startAt.value}+08:00`).toISOString(), endAt: new Date(`${form.endAt.value}+08:00`).toISOString(), stages: Object.fromEntries(["harvest", "knowledge", "quiz"].map((key) => [key, form.elements.namedItem(`stage-${key}`).checked])), isActive: form.isActive.checked, isPaused: form.elements.isPaused.checked, resumeAt: form.elements.isPaused.checked && form.elements.resumeAt.value ? new Date(`${form.elements.resumeAt.value}+08:00`).toISOString() : null } });
    selectedActivityId = saved.id;
    await loadDashboard();
  } catch (requestError) { error.textContent = requestError.message; error.hidden = false; }
}


async function renderQuestionBank(message = "") {
  const content = document.getElementById("admin-content");
  content.innerHTML = '<p class="admin-message">正在讀取題庫…</p>';
  try {
    const result = await adminCall("questions");
    if (activeTab !== "questions" || !content.isConnected) return;
    questionBank = result.questions;
    content.innerHTML = `<section class="admin-panel"><div class="table-toolbar"><h2>題庫管理</h2><button class="admin-button" data-admin-action="new-question">新增題目</button></div><p class="admin-help">已勾選 ${questionBank.filter((q) => q.enabled).length} 題（最多 50 題）。新增題目預設不啟用，勾選後下一場開始生效。已开始的挑戰使用原題目。</p>${message ? `<p class="speed-success">${escapeHtml(message)}</p>` : ""}<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>遊戲啟用</th><th>來源</th><th>題目</th><th>難度</th><th></th></tr></thead><tbody>${questionBank.map((q) => `<tr><td><input type="checkbox" aria-label="啟用題目：${escapeHtml(q.question)}" data-question-toggle="${escapeHtml(q.id)}" ${q.enabled ? "checked" : ""}></td><td>${q.is_default ? "預設" : "自訂"}</td><td>${escapeHtml(q.question)}</td><td>${{ easy: "基礎（60分）", medium: "進階（80分）", hard: "挑戰（100分）" }[q.difficulty]}</td><td><button class="admin-button is-quiet" data-admin-action="edit-question" data-question-id="${escapeHtml(q.id)}">編輯</button></td></tr>`).join("")}</tbody></table></div></section>`;
  } catch (error) { content.innerHTML = `<p class="admin-message is-error">${escapeHtml(error.message)}</p>`; }
}

function renderQuestionForm(question = null) {
  const options = question?.options || ["a", "b", "c", "d"].map((id) => ({ id, label: "" }));
  root.innerHTML = `<section class="admin-login"><h1>${question ? "編輯題目" : "新增題目"}</h1><form class="entry-card activity-form" id="question-form"><p class="admin-help">${question?.is_default ? "預設題目" : "自訂題目"}・新增後須回題庫勾選才會出現在遊戲中。</p><label class="input-group"><span>題目</span><textarea name="prompt" maxlength="500" required>${escapeHtml(question?.question || "")}</textarea></label>${options.map((o, i) => `<label class="input-group"><span>選項 ${String.fromCharCode(65 + i)}</span><input name="option-${i}" maxlength="200" value="${escapeHtml(o.label)}" required></label>`).join("")}<label class="input-group"><span>正確答案</span><select name="correct" class="admin-select">${options.map((o, i) => `<option value="${escapeHtml(o.id)}" ${question?.correct_option_id === o.id ? "selected" : ""}>${String.fromCharCode(65 + i)}</option>`).join("")}</select></label><label class="input-group"><span>難度／基本分數</span><select name="difficulty" class="admin-select">${[["easy", "基礎／60"], ["medium", "進階／80"], ["hard", "挑戰／100"]].map(([value, label]) => `<option value="${value}" ${question?.difficulty === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><p id="question-error" class="form-error" hidden></p><button class="primary-button" type="submit">儲存題目</button><button class="secondary-button" type="button" data-admin-action="back-dashboard">返回題庫</button></form></section>`;
  document.getElementById("question-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]'); button.disabled = true;
    try {
      await adminCall("save-question", { question: { id: question?.id || null, question: form.elements.prompt.value.trim(), difficulty: form.elements.difficulty.value, correctOptionId: form.elements.correct.value, options: options.map((o, i) => ({ id: o.id, label: form.elements.namedItem(`option-${i}`).value.trim() })) } });
      activeTab = "questions"; renderDashboard();
    } catch (error) { const target = document.getElementById("question-error"); target.textContent = error.message; target.hidden = false; button.disabled = false; }
  });
}

root.addEventListener("change", async (event) => {
  const input = event.target.closest("[data-question-toggle]");
  if (!input) return;
  input.disabled = true;
  try { await adminCall("toggle-question", { id: input.dataset.questionToggle, enabled: input.checked }); await renderQuestionBank("已儲存題目啟用狀態。"); }
  catch (error) { input.checked = !input.checked; input.disabled = false; window.alert(error.message); }
});

function exportCsv() {
  const rows = dashboard.leaderboard || [];
  const csv = [["排名", "學號", "姓名", "最高分", "最高分達成時間", "遊玩次數"], ...rows.map((row) => [row.rank, row.studentId, row.name, row.highScore, formatDate(row.achievedAt), row.playCount])].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob); link.download = "tea-game-ranking.csv"; link.click(); URL.revokeObjectURL(link.href);
}

root.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-admin-action]");
  if (!target) return;
  const action = target.dataset.adminAction;
  if (action === "logout") { await client.auth.signOut(); renderLogin(); }
  if (action === "tab") { activeTab = target.dataset.tab; renderDashboard(); }
  if (action === "new-question") renderQuestionForm();
  if (action === "edit-question") renderQuestionForm(questionBank.find((q) => q.id === target.dataset.questionId));
  if (action === "new-activity") renderActivityForm(null);
  if (action === "edit-activity") renderActivityForm(dashboard.selectedActivity);
  if (action === "back-dashboard") renderDashboard();
  if (action === "export") exportCsv();
  if (action === "delete-session" && window.confirm("確定刪除這筆遊戲成績？此動作不會刪除玩家資料。")) {
    try { await adminCall("delete-session", { sessionId: target.dataset.sessionId }); await loadDashboard(); } catch (error) { window.alert(error.message); }
  }
});

if (!configured()) renderSetup();
else { client = createClient(config.url, config.anonKey); client.auth.getSession().then(({ data: { session } }) => session ? loadDashboard() : renderLogin()); }
