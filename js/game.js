/*
  遊戲流程：活動檢查 -> 規則 -> 參賽資料與 session -> 採茶 -> 知識卡 -> 測驗 -> 後端提交。
  畫面上的即時分數只供回饋，最終有效分數由 Supabase Edge Function 重算。
*/
(() => {
  const data = window.TEA_GAME_DATA;
  const sound = window.TEA_SOUND;
  const api = window.TEA_API;
  const root = document.getElementById("game-root");
  const soundToggle = document.getElementById("sound-toggle");
  const params = new URLSearchParams(window.location.search);
  const demoMode = params.get("demo") === "1";

  if (params.get("test") === "short") {
    data.teaPicking.durationSeconds = 2;
    data.teaPicking.spawnIntervalMs = 90;
    data.teaPicking.endSpawnIntervalMs = 55;
    data.teaPicking.itemLifeMs = 360;
    data.teaPicking.endItemLifeMs = 220;
    data.knowledge.autoSeconds = 0.35;
    data.quiz.secondsPerQuestion = 2;
  }

  const state = {
    activity: null,
    player: { studentId: "", name: "" },
    gameSession: null,
    harvestScore: 0,
    harvestCount: 0,
    harvestHits: {},
    missedCorrect: 0,
    quizScore: 0,
    quizCorrect: 0,
    quizCombo: 0,
    quizQuestions: [],
    quizAnswers: [],
    questionIndex: 0,
    questionStartedAt: 0,
    cardIndex: 0,
    harvestStartedAt: 0,
    timers: [],
    activeItems: new Set(),
    harvestRunning: false
  };

  const addTimer = (id) => { state.timers.push(id); return id; };
  const clearTimers = () => { state.timers.forEach((id) => { clearTimeout(id); clearInterval(id); }); state.timers = []; };
  const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const textToHtml = (value) => escapeHtml(value).replaceAll("\n", "<br>");

  // Fisher-Yates：每一場的題目與選項都重新洗牌，並保留 option ID 判斷正解。
  function shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[target]] = [copy[target], copy[index]];
    }
    return copy;
  }

  function updateSoundButton() {
    const isEnabled = sound.isEnabled();
    soundToggle.classList.toggle("is-muted", !isEnabled);
    soundToggle.setAttribute("aria-label", isEnabled ? "關閉音效" : "開啟音效");
    soundToggle.querySelector(".sound-icon").textContent = isEnabled ? "♪" : "×";
  }

  function resetRound() {
    clearTimers();
    state.gameSession = null;
    state.harvestScore = 0;
    state.harvestCount = 0;
    state.harvestHits = Object.fromEntries(data.teaPicking.types.map((type) => [type.id, 0]));
    state.missedCorrect = 0;
    state.quizScore = 0;
    state.quizCorrect = 0;
    state.quizCombo = 0;
    state.quizQuestions = [];
    state.quizAnswers = [];
    state.questionIndex = 0;
    state.questionStartedAt = 0;
    state.cardIndex = 0;
    state.harvestStartedAt = 0;
    state.harvestRunning = false;
    state.activeItems.clear();
  }

  function applyGameConfig(config) {
    if (!config?.types) return;
    data.teaPicking.spawnIntervalMs = Number(config.spawnStartMs) || data.teaPicking.spawnIntervalMs;
    data.teaPicking.endSpawnIntervalMs = Number(config.spawnEndMs) || data.teaPicking.endSpawnIntervalMs;
    data.teaPicking.speedRampPower = Number(config.speedRampPower) || data.teaPicking.speedRampPower;
    for (const type of data.teaPicking.types) {
      const remote = config.types[type.id];
      if (!remote) continue;
      type.weight = Number(remote.weight) || type.weight;
      type.startLifeMs = Number(remote.startLifeMs) || Math.round(data.teaPicking.itemLifeMs * (type.lifeMultiplier || 1));
      type.endLifeMs = Number(remote.endLifeMs) || Math.round(data.teaPicking.endItemLifeMs * (type.lifeMultiplier || 1));
    }
  }

  function formatTaipei(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
  }

  function renderLoading(message = "正在讀取活動資訊…") {
    root.innerHTML = `<section class="screen status-screen"><div class="status-card"><span class="loading-ring" aria-hidden="true"></span><h2>${escapeHtml(message)}</h2></div></section>`;
  }

  function renderUnavailable(message, actionLabel = "重新讀取") {
    root.innerHTML = `<section class="screen status-screen"><div class="status-card"><p class="eyebrow">茶道社挑戰賽</p><h2>${escapeHtml(message)}</h2><p class="lead">請留意茶道社公告，期待在下一場茶香相遇。</p><button class="primary-button" type="button" data-action="reload-activity">${escapeHtml(actionLabel)}</button></div></section>`;
  }

  function renderSetupNotice() {
    root.innerHTML = `<section class="screen status-screen"><div class="status-card"><p class="eyebrow">需要活動系統</p><h2>成績系統尚未設定</h2><p class="lead">請由茶道社管理員完成 Supabase 設定後，再開放正式挑戰。</p></div></section>`;
  }

  function renderHome() {
    resetRound();
    root.innerHTML = `
      <section class="screen home-screen">
        <div class="screen-header"><p class="eyebrow">${escapeHtml(state.activity?.name || `${data.clubName}挑戰賽`)}</p><h1>${escapeHtml(data.gameTitle)}</h1><p class="lead">${escapeHtml(data.home.intro)}</p></div>
        <div class="activity-banner"><span class="status-dot"></span><span>活動進行中・截止 ${escapeHtml(formatTaipei(state.activity?.endAt))}</span></div>
        <div class="home-visual" aria-hidden="true"><span class="steam"></span><span class="steam"></span><span class="steam"></span><span class="tea-cup"></span></div>
        <button class="primary-button" type="button" data-action="start">${escapeHtml(data.home.startButton)}</button>
      </section>`;
  }

  function renderRules() {
    const pickingRules = data.teaPicking.types.map((type) => `${type.label} ${type.score > 0 ? "+" : ""}${type.score}`).join("、");
    root.innerHTML = `
      <section class="screen rules-screen">
        <div class="screen-header"><p class="eyebrow">開始前</p><h2>${escapeHtml(data.rules.title)}</h2><p class="lead">${escapeHtml(data.rules.intro)}</p></div>
        <article class="rules-card"><div class="rule-list">
          <div class="rule-item"><span class="rule-icon">1</span><div><h3>30 秒採茶</h3><p>越到後面，茶葉出現與下落速度越快。採下一心二葉與單芽，避開老葉與病葉。</p></div></div>
          <div class="rule-item"><span class="rule-icon">2</span><div><h3>選對才得分</h3><p>${pickingRules}；漏採正確茶芽 ${data.teaPicking.missPenalty} 分。</p></div></div>
          <div class="rule-item"><span class="rule-icon">3</span><div><h3>快問快答</h3><p>題目和選項每次都會洗牌。每題限時 ${data.quiz.secondsPerQuestion} 秒，答得快、連續答對都有加成。</p></div></div>
          <div class="rule-item"><span class="rule-icon">4</span><div><h3>最高分入榜</h3><p>可重複挑戰；完整排行榜僅供茶道社管理員於活動後整理公布。</p></div></div>
        </div></article><button class="primary-button" type="button" data-action="register">${escapeHtml(data.rules.startButton)}</button>
      </section>`;
  }

  function renderRegistration(error = "") {
    root.innerHTML = `
      <section class="screen registration-screen">
        <div class="screen-header"><p class="eyebrow">茶道社挑戰賽</p><h2>填寫參賽資料</h2><p class="lead">同一學號可多次挑戰，系統會保留本次活動的最高有效成績。</p></div>
        <form class="entry-card" id="player-form" novalidate>
          <label class="input-group"><span>學號</span><input id="student-id" name="studentId" value="${escapeHtml(state.player.studentId)}" maxlength="20" autocomplete="off" placeholder="請輸入學號" required></label>
          <label class="input-group"><span>姓名</span><input id="player-name" name="name" value="${escapeHtml(state.player.name)}" maxlength="40" autocomplete="name" placeholder="請輸入姓名" required></label>
          ${error ? `<p class="form-error" role="alert">${escapeHtml(error)}</p>` : ""}<button class="primary-button" type="submit">開始挑戰</button>
        </form>
      </section>`;
    document.getElementById("player-form").addEventListener("submit", beginSession);
  }

  function validatePlayer(studentId, name) {
    const safeText = /^[\p{L}\p{N}\s-]+$/u;
    if (!studentId || !name) return "請完整填寫學號與姓名。";
    if (studentId.length > 20 || name.length > 40) return "學號或姓名長度不符合規範。";
    if (!safeText.test(studentId) || !safeText.test(name)) return "請使用中文、英文、數字、空白或連字號。";
    return "";
  }

  async function beginSession(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const studentId = form.studentId.value.trim();
    const name = form.name.value.trim();
    state.player = { studentId, name };
    const error = validatePlayer(studentId, name);
    if (error) { renderRegistration(error); return; }
    const button = form.querySelector("button");
    button.disabled = true;
    button.textContent = "正在建立挑戰…";
    try {
      state.gameSession = demoMode ? { id: crypto.randomUUID(), token: "demo-session", startedAt: new Date().toISOString() } : (await api.createSession(state.player)).session;
      startHarvest();
    } catch (requestError) {
      renderRegistration(requestError.message || "無法建立挑戰，請確認網路後再試一次。");
    }
  }

  function startHarvest() {
    clearTimers(); sound.prime(); sound.play("start");
    state.harvestScore = 0; state.harvestCount = 0; state.missedCorrect = 0;
    state.harvestHits = Object.fromEntries(data.teaPicking.types.map((type) => [type.id, 0]));
    state.activeItems.clear(); state.harvestRunning = true; state.harvestStartedAt = Date.now();
    root.innerHTML = `
      <section class="screen harvest-screen"><div class="screen-header"><p class="eyebrow">第一關</p><h2>採茶遊戲</h2></div>
        <div class="stats-grid"><div class="stat-chip"><span class="stat-label">時間</span><span class="stat-value" id="time-left">${data.teaPicking.durationSeconds}</span></div><div class="stat-chip"><span class="stat-label">分數</span><span class="stat-value" id="harvest-score">0</span></div><div class="stat-chip"><span class="stat-label">採到</span><span class="stat-value" id="harvest-count">0</span></div></div>
        <div class="tea-field" id="tea-field"><div class="field-message">採下一心二葉與單芽，避開老葉與病葉；漏採 ${data.teaPicking.missPenalty}。</div></div>
        <div class="legend-row">${data.teaPicking.types.map((type) => `<div class="legend-item"><img src="${escapeHtml(type.asset)}" alt=""><span>${escapeHtml(type.label)} ${type.score > 0 ? "+" : ""}${type.score}</span></div>`).join("")}</div>
      </section>`;
    addTimer(setInterval(tickHarvestClock, 200)); spawnTeaItem(); spawnTeaItem(); scheduleNextSpawn();
  }

  function tickHarvestClock() {
    const elapsedSeconds = Math.floor((Date.now() - state.harvestStartedAt) / 1000);
    const remaining = Math.max(0, data.teaPicking.durationSeconds - elapsedSeconds);
    const timeNode = document.getElementById("time-left");
    if (timeNode) timeNode.textContent = remaining;
    if (remaining <= 0) finishHarvest();
  }

  function updateHarvestStats() {
    const scoreNode = document.getElementById("harvest-score");
    const countNode = document.getElementById("harvest-count");
    if (scoreNode) scoreNode.textContent = state.harvestScore;
    if (countNode) countNode.textContent = state.harvestCount;
  }

  const getHarvestProgress = () => Math.min(1, Math.max(0, (Date.now() - state.harvestStartedAt) / (data.teaPicking.durationSeconds * 1000)));
  const getHarvestSpeedProgress = () => Math.pow(getHarvestProgress(), data.teaPicking.speedRampPower || 1);
  const interpolate = (start, end, progress) => Math.round(start + (end - start) * progress);
  const getCurrentSpawnInterval = () => interpolate(data.teaPicking.spawnIntervalMs, data.teaPicking.endSpawnIntervalMs, getHarvestSpeedProgress());
  const getCurrentItemLifeMs = (type) => interpolate(
    type.startLifeMs || Math.round(data.teaPicking.itemLifeMs * (type.lifeMultiplier || 1)),
    type.endLifeMs || Math.round(data.teaPicking.endItemLifeMs * (type.lifeMultiplier || 1)),
    getHarvestSpeedProgress()
  );
  const scheduleNextSpawn = () => { if (state.harvestRunning) addTimer(setTimeout(() => { spawnTeaItem(); scheduleNextSpawn(); }, getCurrentSpawnInterval())); };

  function pickWeightedTeaType() {
    const totalWeight = data.teaPicking.types.reduce((sum, type) => sum + type.weight, 0);
    let target = Math.random() * totalWeight;
    for (const type of data.teaPicking.types) { target -= type.weight; if (target <= 0) return type; }
    return data.teaPicking.types[0];
  }

  function spawnTeaItem() {
    if (!state.harvestRunning || state.activeItems.size >= data.teaPicking.maxActiveItems) return;
    const field = document.getElementById("tea-field");
    if (!field) return;
    const type = pickWeightedTeaType();
    const item = document.createElement("button");
    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const itemLifeMs = getCurrentItemLifeMs(type);
    item.type = "button"; item.className = `leaf-item leaf-${type.id}`;
    item.style.setProperty("--left", `${5 + Math.random() * 78}%`);
    item.style.setProperty("--drift-x", `${-48 + Math.random() * 96}px`);
    item.style.setProperty("--spin", `${-22 + Math.random() * 44}deg`);
    item.style.setProperty("--drop-duration", `${itemLifeMs}ms`);
    item.setAttribute("aria-label", `${type.label}，${type.score > 0 ? "加" : "扣"}${Math.abs(type.score)}分`);
    item.innerHTML = `<img src="${escapeHtml(type.asset)}" alt=""><span class="leaf-name">${escapeHtml(type.label)}</span>`;
    state.activeItems.add(id);
    item.addEventListener("pointerdown", (event) => handleTeaHit(event, item, type, id), { once: true });
    field.appendChild(item);
    addTimer(setTimeout(() => {
      state.activeItems.delete(id);
      if (state.harvestRunning && type.isCorrect && !item.classList.contains("is-hit")) {
        state.missedCorrect += 1; state.harvestScore += data.teaPicking.missPenalty; updateHarvestStats(); showScorePop(item, data.teaPicking.missPenalty, "漏採"); sound.play("wrong");
      }
      item.remove();
    }, itemLifeMs + 120));
  }

  function handleTeaHit(event, item, type, id) {
    event.preventDefault();
    if (!state.harvestRunning || item.classList.contains("is-hit")) return;
    item.classList.add("is-hit"); state.activeItems.delete(id); state.harvestScore += type.score; state.harvestHits[type.id] += 1;
    if (type.isCorrect) { state.harvestCount += 1; sound.play("correct"); } else sound.play("wrong");
    updateHarvestStats(); showScorePop(item, type.score); addTimer(setTimeout(() => item.remove(), 140));
  }

  function showScorePop(target, score, label = "") {
    const field = document.getElementById("tea-field");
    if (!field) return;
    const fieldRect = field.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const pop = document.createElement("div");
    pop.className = `score-pop ${score < 0 ? "is-negative" : ""}`;
    pop.style.setProperty("--x", `${Math.min(fieldRect.width - 34, Math.max(34, targetRect.left - fieldRect.left + targetRect.width / 2))}px`);
    pop.style.setProperty("--y", `${Math.min(fieldRect.height - 34, Math.max(60, targetRect.top - fieldRect.top + targetRect.height / 2))}px`);
    pop.textContent = `${label ? `${label} ` : ""}${score > 0 ? "+" : ""}${score}`;
    field.appendChild(pop); addTimer(setTimeout(() => pop.remove(), 700));
  }

  function finishHarvest() {
    if (!state.harvestRunning) return;
    state.harvestRunning = false; clearTimers(); sound.play("finish");
    root.innerHTML = `<section class="screen"><div class="result-card"><p class="eyebrow">第一關完成</p><h2>你成功採了</h2><div class="result-number">${state.harvestCount}</div><p class="lead">片高品質茶芽！即時計分 ${state.harvestScore} 分。</p><button class="primary-button" type="button" data-action="knowledge">下一步</button></div></section>`;
  }

  function renderKnowledge() {
    clearTimers();
    const cards = data.knowledge.cards;
    const card = cards[state.cardIndex];
    const isLastCard = state.cardIndex === cards.length - 1;
    root.innerHTML = `
      <section class="screen knowledge-screen"><div class="screen-header"><p class="eyebrow">第二關</p><h2>快速認識花東茶</h2></div>
        <article class="knowledge-card" style="--card-accent: ${escapeHtml(card.accent)};"><div class="card-progress"><span style="--card-seconds: ${data.knowledge.autoSeconds}s;"></span></div><h3 class="knowledge-title">${escapeHtml(card.title)}</h3><p class="knowledge-body">${textToHtml(card.body)}</p></article>
        <div class="dot-row">${cards.map((_, index) => `<span class="dot ${index === state.cardIndex ? "is-active" : ""}"></span>`).join("")}</div><button class="primary-button" type="button" data-action="${isLastCard ? "quiz" : "next-card"}">${isLastCard ? "開始測驗" : "下一張"}</button>
      </section>`;
    if (!isLastCard) addTimer(setTimeout(() => { state.cardIndex += 1; sound.play("card"); renderKnowledge(); }, data.knowledge.autoSeconds * 1000));
  }

  function startQuiz() {
    clearTimers(); state.questionIndex = 0; state.quizScore = 0; state.quizCorrect = 0; state.quizCombo = 0; state.quizAnswers = [];
    state.quizQuestions = shuffle(data.quiz.questions).map((question) => ({ ...question, options: shuffle(question.options) }));
    renderQuiz();
  }

  function renderQuiz() {
    clearTimers();
    const question = state.quizQuestions[state.questionIndex];
    const questionNumber = state.questionIndex + 1;
    state.questionStartedAt = Date.now();
    root.innerHTML = `
      <section class="screen quiz-screen"><div class="screen-header"><p class="eyebrow">第三關</p><h2>花東茶五題測驗</h2></div>
        <div class="quiz-timer"><div class="quiz-timer-row"><span>剩餘時間</span><strong id="quiz-time">${data.quiz.secondsPerQuestion}</strong></div><span class="quiz-timer-bar" id="quiz-timer-bar"></span></div>
        <article class="question-card"><p class="question-count">第 ${questionNumber} / ${state.quizQuestions.length} 題・${escapeHtml({ easy: "基礎", medium: "進階", hard: "挑戰" }[question.difficulty] || "基礎")}</p><h3>${escapeHtml(question.question)}</h3><div class="option-list">${question.options.map((option, index) => `<button class="option-button" type="button" data-option-id="${escapeHtml(option.id)}">${String.fromCharCode(65 + index)}. ${escapeHtml(option.label)}</button>`).join("")}</div></article>
        <div class="stats-grid"><div class="stat-chip"><span class="stat-label">答對</span><span class="stat-value">${state.quizCorrect}</span></div><div class="stat-chip"><span class="stat-label">連擊</span><span class="stat-value">${state.quizCombo}</span></div><div class="stat-chip"><span class="stat-label">採茶</span><span class="stat-value">${state.harvestScore}</span></div></div>
      </section>`;
    addTimer(setInterval(tickQuizClock, 100));
  }

  function tickQuizClock() {
    const duration = data.quiz.secondsPerQuestion * 1000;
    const remainingMs = Math.max(0, duration - (Date.now() - state.questionStartedAt));
    const timeNode = document.getElementById("quiz-time");
    const bar = document.getElementById("quiz-timer-bar");
    if (timeNode) timeNode.textContent = Math.ceil(remainingMs / 1000);
    if (bar) bar.style.transform = `scaleX(${remainingMs / duration})`;
    if (remainingMs <= 0) answerQuestion(null);
  }

  function getLocalQuizPoints(question, elapsedMs, combo) {
    const base = data.quizDifficulty[question.difficulty] || data.quizDifficulty.easy;
    const speed = Math.max(0, Math.round(data.quiz.speedBonusMax * (1 - elapsedMs / (data.quiz.secondsPerQuestion * 1000))));
    const multiplier = combo >= 5 ? 1.5 : combo >= 3 ? 1.25 : 1;
    return Math.round((base + speed) * multiplier);
  }

  function answerQuestion(button) {
    if (!state.quizQuestions.length) return;
    clearTimers();
    const question = state.quizQuestions[state.questionIndex];
    const elapsedMs = Math.min(data.quiz.secondsPerQuestion * 1000, Date.now() - state.questionStartedAt);
    const optionId = button?.dataset.optionId || null;
    const isCorrect = optionId === question.correctOptionId;
    [...document.querySelectorAll(".option-button")].forEach((optionButton) => {
      optionButton.disabled = true;
      if (optionButton.dataset.optionId === question.correctOptionId) optionButton.classList.add("is-correct");
    });
    state.quizAnswers.push({ questionId: question.id, optionId, elapsedMs: Math.round(elapsedMs) });
    if (isCorrect) {
      state.quizCorrect += 1; state.quizCombo += 1; state.quizScore += getLocalQuizPoints(question, elapsedMs, state.quizCombo); sound.play("correct");
    } else { state.quizCombo = 0; if (button) button.classList.add("is-wrong"); sound.play("wrong"); }
    addTimer(setTimeout(() => { state.questionIndex += 1; if (state.questionIndex >= state.quizQuestions.length) submitResult(); else renderQuiz(); }, 460));
  }

  function renderSubmitting() {
    root.innerHTML = `<section class="screen status-screen"><div class="status-card"><span class="loading-ring"></span><p class="eyebrow">正在驗證</p><h2>成績傳送中…</h2><p class="lead">請不要關閉此頁面。</p></div></section>`;
  }

  async function submitResult() {
    clearTimers(); sound.play("finish"); renderSubmitting();
    const payload = { sessionId: state.gameSession.id, scoringVersion: data.teaPicking.scoringVersion, harvest: { hits: state.harvestHits, missedCorrect: state.missedCorrect }, quizAnswers: state.quizAnswers };
    try {
      const result = demoMode ? { accepted: true, score: { harvest: state.harvestScore, quiz: state.quizScore, total: state.harvestScore + state.quizScore, correctAnswers: state.quizCorrect } } : await api.submitResult(payload, state.gameSession.token);
      if (!result.accepted) { renderRejected(result.message || "這筆成績未通過系統驗證。"); return; }
      renderCompleted(result.score);
    } catch (requestError) { renderSubmitFailed(requestError.message || "成績傳送失敗，請確認網路連線後再試一次。"); }
  }

  const getFinalTitle = (totalScore) => data.titles.reduce((best, current) => totalScore >= current.minScore ? current : best, data.titles[0]).title;

  function renderCompleted(score) {
    root.innerHTML = `
      <section class="screen final-screen"><div class="final-card"><p class="eyebrow">挑戰完成！</p><h2 class="final-title">${escapeHtml(getFinalTitle(score.total))}</h2><div class="final-score">${score.total}</div><p class="lead">${escapeHtml(state.player.name)}，這是你本次的有效成績。</p>
        <div class="breakdown"><div class="breakdown-row"><span>採茶分數</span><strong>${score.harvest}</strong></div><div class="breakdown-row"><span>問答分數</span><strong>${score.quiz}</strong></div><div class="breakdown-row"><span>答對題數</span><strong>${score.correctAnswers} / ${data.quiz.questions.length}</strong></div></div>
        <p class="quiet-note">活動結束後將於茶道社 IG 公布最終排名。</p><div class="join-block"><p>${escapeHtml(data.cta.message)}</p><a class="link-button" href="${escapeHtml(data.cta.joinUrl)}">${escapeHtml(data.cta.label)}</a></div><button class="secondary-button" type="button" data-action="restart">再次挑戰</button></div></section>`;
  }

  function renderSubmitFailed(message) {
    root.innerHTML = `<section class="screen status-screen"><div class="status-card"><p class="eyebrow">傳送失敗</p><h2>成績尚未送出</h2><p class="lead">${escapeHtml(message)}</p><button class="primary-button" type="button" data-action="retry-submit">重新送出</button><button class="secondary-button" type="button" data-action="restart">重新挑戰</button></div></section>`;
  }

  function renderRejected(message) {
    root.innerHTML = `<section class="screen status-screen"><div class="status-card"><p class="eyebrow">系統驗證</p><h2>這筆成績無法列入活動</h2><p class="lead">${escapeHtml(message)}</p><button class="primary-button" type="button" data-action="restart">重新挑戰</button></div></section>`;
  }

  let pauseRefreshTimer;
  async function loadActivity() {
    clearTimeout(pauseRefreshTimer);
    renderLoading();
    if (demoMode) { state.activity = { name: "本機展示模式", endAt: new Date(Date.now() + 86400000).toISOString() }; renderHome(); return; }
    if (!api.isConfigured()) { renderSetupNotice(); return; }
    try {
      const response = await api.getActivity();
      applyGameConfig(response.gameConfig);
      state.activity = response.activity;
      if (response.status === "active") renderHome();
      else if (response.status === "paused") {
        const reopen = response.activity?.resumeAt ? new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(response.activity.resumeAt)) : null;
        root.innerHTML = `<section class="screen status-screen"><div class="status-card"><p class="eyebrow">茶道社挑戰賽</p><h2>活動暫停開放</h2><p class="lead">${reopen ? `預計 ${escapeHtml(reopen)}（台灣時間）重新開放。` : "重新開放時間待定，請留意茶道社公告。"}<br>我們正在處理臨時問題，感謝你的耐心等候。</p><p class="quiet-note">此頁每 15 秒自動確認開放狀態。</p><button class="primary-button" type="button" data-action="reload-activity">重新確認</button></div></section>`;
        pauseRefreshTimer = setTimeout(loadActivity, 15000);
      }
      else if (response.status === "upcoming") renderUnavailable("活動尚未開始");
      else if (response.status === "ended") renderUnavailable("本次活動已結束");
      else renderUnavailable("目前沒有開放中的挑戰活動");
    } catch (requestError) { renderUnavailable(requestError.message || "無法讀取活動資訊"); }
  }

  root.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    if (action === "start") renderRules();
    if (action === "register") renderRegistration();
    if (action === "knowledge") { state.cardIndex = 0; renderKnowledge(); }
    if (action === "next-card") { state.cardIndex += 1; sound.play("card"); renderKnowledge(); }
    if (action === "quiz") startQuiz();
    if (action === "restart") { resetRound(); loadActivity(); }
    if (action === "retry-submit") submitResult();
    if (action === "reload-activity") loadActivity();
  });
  root.addEventListener("click", (event) => { const option = event.target.closest(".option-button"); if (option && !option.disabled) answerQuestion(option); });
  soundToggle.addEventListener("click", () => { sound.toggle(); updateSoundButton(); });
  updateSoundButton();
  loadActivity();
})();
