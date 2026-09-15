/* 管理後台只透過受驗證的 admin-api Edge Function 讀寫競賽資料。 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.TEA_SUPABASE_CONFIG || {};
const root = document.getElementById("admin-root");
const taipei = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
let client;
let dashboard = null;
let selectedActivityId = "";
let activeTab = "ranking";
const SPEED_TYPES = [
  { id: "twoLeaves", label: "一心二葉" },
  { id: "singleBud", label: "單芽" },
  { id: "oldLeaf", label: "老葉" },
  { id: "diseasedLeaf", label: "病葉" }
];

const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
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
    <div class="admin-toolbar"><select class="admin-select" id="activity-select">${dashboard.activities.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selectedActivityId ? "selected" : ""}>${escapeHtml(item.name)}${item.isActive ? "（開放）" : "（關閉）"}</option>`).join("")}</select><button class="admin-button is-quiet" data-admin-action="edit-activity">修改活動</button><button class="admin-button is-quiet" data-admin-action="new-activity">新增活動</button></div>
    ${activity ? `<div class="admin-stats"><div class="admin-stat"><span>活動狀態</span><strong>${activity.status === "active" ? "進行中" : activity.status === "upcoming" ? "未開始" : "已結束"}</strong></div><div class="admin-stat"><span>參賽人數</span><strong>${stats.players || 0}</strong></div><div class="admin-stat"><span>遊玩總次數</span><strong>${stats.sessions || 0}</strong></div><div class="admin-stat"><span>活動截止</span><strong>${escapeHtml(formatDate(activity.endAt))}</strong></div></div>` : `<p class="admin-message">尚未建立活動。</p>`}
    <nav class="admin-tabs"><button class="admin-tab ${activeTab === "ranking" ? "is-active" : ""}" data-admin-action="tab" data-tab="ranking">排行榜</button><button class="admin-tab ${activeTab === "players" ? "is-active" : ""}" data-admin-action="tab" data-tab="players">搜尋玩家</button><button class="admin-tab ${activeTab === "public" ? "is-active" : ""}" data-admin-action="tab" data-tab="public">公開排行</button><button class="admin-tab ${activeTab === "speed" ? "is-active" : ""}" data-admin-action="tab" data-tab="speed">遊戲速度</button></nav>
    <div id="admin-content"></div></section>`;
  document.getElementById("activity-select").addEventListener("change", (event) => { selectedActivityId = event.target.value; loadDashboard(); });
  renderTab();
}

function renderTab() {
  const content = document.getElementById("admin-content");
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
  root.innerHTML = `<section class="admin-login"><div class="screen-header"><p class="eyebrow">活動設定</p><h1>${activity ? "修改活動" : "建立活動"}</h1></div><form class="entry-card activity-form" id="activity-form" data-activity-id="${escapeHtml(formActivity.id || "")}"><label class="input-group full-width"><span>活動名稱</span><input name="name" maxlength="100" value="${escapeHtml(formActivity.name || "")}" required></label><label class="input-group"><span>開始時間（台灣）</span><input class="admin-date" type="datetime-local" name="startAt" value="${escapeHtml(localInputValue(formActivity.startAt))}" required></label><label class="input-group"><span>結束時間（台灣）</span><input class="admin-date" type="datetime-local" name="endAt" value="${escapeHtml(localInputValue(formActivity.endAt))}" required></label><label class="toggle-label full-width"><input type="checkbox" name="isActive" ${formActivity.isActive ? "checked" : ""}> 開放此活動</label><p class="form-error" id="activity-error" hidden></p><div class="admin-actions full-width"><button class="primary-button" type="submit">儲存活動</button><button class="secondary-button" type="button" data-admin-action="back-dashboard">返回後台</button></div></form></section>`;
  document.getElementById("activity-form").addEventListener("submit", saveActivity);
}

async function saveActivity(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.getElementById("activity-error");
  try {
    const saved = await adminCall("upsert-activity", { activity: { id: form.dataset.activityId || null, name: form.name.value.trim(), startAt: new Date(`${form.startAt.value}+08:00`).toISOString(), endAt: new Date(`${form.endAt.value}+08:00`).toISOString(), isActive: form.isActive.checked } });
    selectedActivityId = saved.id;
    await loadDashboard();
  } catch (requestError) { error.textContent = requestError.message; error.hidden = false; }
}

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
