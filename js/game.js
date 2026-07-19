/*
  花東茶之旅主程式
  - renderHome / startHarvest / renderKnowledge / renderQuiz / renderFinal 對應遊戲流程
  - 題庫、知識卡與分數設定請修改 js/data.js
*/
(() => {
  const data = window.TEA_GAME_DATA;
  const sound = window.TEA_SOUND;
  const root = document.getElementById("game-root");
  const soundToggle = document.getElementById("sound-toggle");

  // 本機驗證用：網址加上 ?test=short 會縮短流程，正式使用不會觸發。
  if (new URLSearchParams(window.location.search).get("test") === "short") {
    data.teaPicking.durationSeconds = 2;
    data.teaPicking.spawnIntervalMs = 90;
    data.teaPicking.endSpawnIntervalMs = 55;
    data.teaPicking.itemLifeMs = 360;
    data.teaPicking.endItemLifeMs = 220;
    data.knowledge.autoSeconds = 0.35;
  }

  const state = {
    harvestScore: 0,
    harvestCount: 0,
    quizScore: 0,
    quizCorrect: 0,
    questionIndex: 0,
    cardIndex: 0,
    harvestStartedAt: 0,
    timers: [],
    activeItems: new Set(),
    harvestRunning: false
  };

  function addTimer(id) {
    state.timers.push(id);
    return id;
  }

  function clearTimers() {
    state.timers.forEach((id) => {
      clearTimeout(id);
      clearInterval(id);
    });
    state.timers = [];
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function textToHtml(value) {
    return escapeHtml(value).replaceAll("\n", "<br>");
  }

  function updateSoundButton() {
    const isEnabled = sound.isEnabled();
    soundToggle.classList.toggle("is-muted", !isEnabled);
    soundToggle.setAttribute("aria-label", isEnabled ? "關閉音效" : "開啟音效");
    soundToggle.querySelector(".sound-icon").textContent = isEnabled ? "♪" : "×";
  }

  function resetGame() {
    clearTimers();
    state.harvestScore = 0;
    state.harvestCount = 0;
    state.quizScore = 0;
    state.quizCorrect = 0;
    state.questionIndex = 0;
    state.cardIndex = 0;
    state.harvestStartedAt = 0;
    state.harvestRunning = false;
    state.activeItems.clear();
  }

  function renderHome() {
    resetGame();
    root.innerHTML = `
      <section class="screen home-screen">
        <div class="screen-header">
          <p class="eyebrow">${escapeHtml(data.clubName)}迎新小遊戲</p>
          <h1>${escapeHtml(data.gameTitle)}</h1>
          <p class="lead">${escapeHtml(data.home.intro)}</p>
        </div>
        <div class="home-visual" aria-hidden="true">
          <span class="steam"></span>
          <span class="steam"></span>
          <span class="steam"></span>
          <span class="tea-cup"></span>
        </div>
        <button class="primary-button" type="button" data-action="start">${escapeHtml(data.home.startButton)}</button>
      </section>
    `;
  }

  function startHarvest() {
    clearTimers();
    sound.prime();
    sound.play("start");
    state.harvestScore = 0;
    state.harvestCount = 0;
    state.activeItems.clear();
    state.harvestRunning = true;
    state.harvestStartedAt = Date.now();

    root.innerHTML = `
      <section class="screen harvest-screen">
        <div class="screen-header">
          <p class="eyebrow">第一關</p>
          <h2>採茶遊戲</h2>
        </div>
        <div class="stats-grid" aria-label="採茶分數">
          <div class="stat-chip">
            <span class="stat-label">時間</span>
            <span class="stat-value" id="time-left">${data.teaPicking.durationSeconds}</span>
          </div>
          <div class="stat-chip">
            <span class="stat-label">分數</span>
            <span class="stat-value" id="harvest-score">0</span>
          </div>
          <div class="stat-chip">
            <span class="stat-label">採到</span>
            <span class="stat-value" id="harvest-count">0</span>
          </div>
        </div>
        <div class="tea-field" id="tea-field">
          <div class="field-message">採下一心二葉 +10，漏採 -3；避開太嫩的芽與太老的葉子。</div>
        </div>
        <div class="legend-row">
          ${data.teaPicking.types.map((item) => `
            <div class="legend-item">
              <img src="${escapeHtml(item.asset)}" alt="">
              <span>${escapeHtml(item.label)} ${item.score > 0 ? "+" : ""}${item.score}</span>
            </div>
          `).join("")}
        </div>
      </section>
    `;

    updateHarvestStats();
    addTimer(setInterval(tickHarvestClock, 250));
    spawnTeaItem();
    spawnTeaItem();
    scheduleNextSpawn();
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

  function getHarvestProgress() {
    const elapsedMs = Date.now() - state.harvestStartedAt;
    const durationMs = data.teaPicking.durationSeconds * 1000;
    return Math.min(1, Math.max(0, elapsedMs / durationMs));
  }

  function interpolate(start, end, progress) {
    return Math.round(start + (end - start) * progress);
  }

  function getCurrentSpawnInterval() {
    return interpolate(
      data.teaPicking.spawnIntervalMs,
      data.teaPicking.endSpawnIntervalMs || data.teaPicking.spawnIntervalMs,
      getHarvestProgress()
    );
  }

  function getCurrentItemLifeMs() {
    return interpolate(
      data.teaPicking.itemLifeMs,
      data.teaPicking.endItemLifeMs || data.teaPicking.itemLifeMs,
      getHarvestProgress()
    );
  }

  function scheduleNextSpawn() {
    if (!state.harvestRunning) return;

    addTimer(setTimeout(() => {
      spawnTeaItem();
      scheduleNextSpawn();
    }, getCurrentSpawnInterval()));
  }

  function pickWeightedTeaType() {
    const totalWeight = data.teaPicking.types.reduce((sum, item) => sum + item.weight, 0);
    let target = Math.random() * totalWeight;

    for (const item of data.teaPicking.types) {
      target -= item.weight;
      if (target <= 0) return item;
    }

    return data.teaPicking.types[0];
  }

  function spawnTeaItem() {
    if (!state.harvestRunning) return;
    if (state.activeItems.size >= data.teaPicking.maxActiveItems) return;

    const field = document.getElementById("tea-field");
    if (!field) return;

    const type = pickWeightedTeaType();
    const item = document.createElement("button");
    const id = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const itemLifeMs = getCurrentItemLifeMs();
    const left = 7 + Math.random() * 72;
    const drift = -38 + Math.random() * 76;
    const spin = -18 + Math.random() * 36;

    item.type = "button";
    item.className = `leaf-item leaf-${type.id}`;
    item.style.setProperty("--left", `${left}%`);
    item.style.setProperty("--drift-x", `${drift}px`);
    item.style.setProperty("--spin", `${spin}deg`);
    item.style.setProperty("--drop-duration", `${itemLifeMs}ms`);
    item.setAttribute("aria-label", `${type.label}，${type.score > 0 ? "加" : "扣"}${Math.abs(type.score)}分`);
    item.innerHTML = `
      <img src="${escapeHtml(type.asset)}" alt="">
      <span class="leaf-name">${escapeHtml(type.label)}</span>
    `;

    state.activeItems.add(id);
    item.addEventListener("pointerdown", (event) => handleTeaHit(event, item, type, id), { once: true });
    field.appendChild(item);

    addTimer(setTimeout(() => {
      state.activeItems.delete(id);
      if (state.harvestRunning && type.isCorrect && !item.classList.contains("is-hit")) {
        state.harvestScore += data.teaPicking.missPenalty;
        updateHarvestStats();
        showScorePop(item, data.teaPicking.missPenalty, "漏採");
        sound.play("wrong");
      }
      item.remove();
    }, itemLifeMs + 120));
  }

  function handleTeaHit(event, item, type, id) {
    event.preventDefault();
    if (!state.harvestRunning || item.classList.contains("is-hit")) return;

    item.classList.add("is-hit");
    state.activeItems.delete(id);
    state.harvestScore += type.score;

    if (type.isCorrect) {
      state.harvestCount += 1;
      sound.play("correct");
    } else {
      sound.play("wrong");
    }

    updateHarvestStats();
    showScorePop(event.currentTarget, type.score);

    addTimer(setTimeout(() => {
      item.remove();
    }, 140));
  }

  function showScorePop(target, score, label = "") {
    const field = document.getElementById("tea-field");
    if (!field) return;

    const fieldRect = field.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const pop = document.createElement("div");
    const rawX = targetRect.left - fieldRect.left + targetRect.width / 2;
    const rawY = targetRect.top - fieldRect.top + targetRect.height / 2;
    const x = Math.min(fieldRect.width - 34, Math.max(34, rawX));
    const y = Math.min(fieldRect.height - 34, Math.max(60, rawY));

    pop.className = `score-pop ${score < 0 ? "is-negative" : ""}`;
    pop.style.setProperty("--x", `${x}px`);
    pop.style.setProperty("--y", `${y}px`);
    pop.textContent = `${label ? `${label} ` : ""}${score > 0 ? "+" : ""}${score}`;
    field.appendChild(pop);

    addTimer(setTimeout(() => pop.remove(), 700));
  }

  function finishHarvest() {
    if (!state.harvestRunning) return;

    state.harvestRunning = false;
    clearTimers();
    sound.play("finish");

    root.innerHTML = `
      <section class="screen">
        <div class="result-card">
          <p class="eyebrow">第一關完成</p>
          <h2>你成功採了</h2>
          <div class="result-number">${state.harvestCount}</div>
          <p class="lead">片茶葉！採茶分數 ${state.harvestScore} 分。</p>
          <button class="primary-button" type="button" data-action="knowledge">下一步</button>
        </div>
      </section>
    `;
  }

  function renderKnowledge() {
    clearTimers();
    const cards = data.knowledge.cards;
    const card = cards[state.cardIndex];
    const isLastCard = state.cardIndex === cards.length - 1;

    root.innerHTML = `
      <section class="screen knowledge-screen">
        <div class="screen-header">
          <p class="eyebrow">第二關</p>
          <h2>快速認識花東茶</h2>
        </div>
        <article class="knowledge-card" style="--card-accent: ${escapeHtml(card.accent)};">
          <div class="card-progress" aria-hidden="true">
            <span style="--card-seconds: ${data.knowledge.autoSeconds}s;"></span>
          </div>
          <h3 class="knowledge-title">${escapeHtml(card.title)}</h3>
          <p class="knowledge-body">${textToHtml(card.body)}</p>
        </article>
        <div class="dot-row" aria-label="知識卡進度">
          ${cards.map((_, index) => `<span class="dot ${index === state.cardIndex ? "is-active" : ""}"></span>`).join("")}
        </div>
        <button class="primary-button" type="button" data-action="${isLastCard ? "quiz" : "next-card"}">
          ${isLastCard ? "開始測驗" : "下一張"}
        </button>
      </section>
    `;

    if (!isLastCard) {
      addTimer(setTimeout(() => {
        state.cardIndex += 1;
        sound.play("card");
        renderKnowledge();
      }, data.knowledge.autoSeconds * 1000));
    }
  }

  function startQuiz() {
    clearTimers();
    state.questionIndex = 0;
    state.quizScore = 0;
    state.quizCorrect = 0;
    renderQuiz();
  }

  function renderQuiz() {
    clearTimers();
    const question = data.quiz.questions[state.questionIndex];
    const questionNumber = state.questionIndex + 1;
    const totalQuestions = data.quiz.questions.length;

    root.innerHTML = `
      <section class="screen quiz-screen">
        <div class="screen-header">
          <p class="eyebrow">第三關</p>
          <h2>花東茶五題測驗</h2>
        </div>
        <article class="question-card">
          <p class="question-count">第 ${questionNumber} / ${totalQuestions} 題</p>
          <h3>${escapeHtml(question.question)}</h3>
          <div class="option-list">
            ${question.options.map((option, index) => `
              <button class="option-button" type="button" data-answer="${index}">
                ${String.fromCharCode(65 + index)}. ${escapeHtml(option)}
              </button>
            `).join("")}
          </div>
        </article>
        <div class="stats-grid" aria-label="測驗分數">
          <div class="stat-chip">
            <span class="stat-label">答對</span>
            <span class="stat-value">${state.quizCorrect}</span>
          </div>
          <div class="stat-chip">
            <span class="stat-label">問答</span>
            <span class="stat-value">${state.quizScore}</span>
          </div>
          <div class="stat-chip">
            <span class="stat-label">採茶</span>
            <span class="stat-value">${state.harvestScore}</span>
          </div>
        </div>
      </section>
    `;
  }

  function answerQuestion(button) {
    const selectedIndex = Number(button.dataset.answer);
    const question = data.quiz.questions[state.questionIndex];
    const buttons = [...document.querySelectorAll(".option-button")];
    const isCorrect = selectedIndex === question.answerIndex;

    buttons.forEach((optionButton) => {
      const index = Number(optionButton.dataset.answer);
      optionButton.disabled = true;
      if (index === question.answerIndex) optionButton.classList.add("is-correct");
    });

    if (!isCorrect) {
      button.classList.add("is-wrong");
      sound.play("wrong");
    } else {
      state.quizCorrect += 1;
      state.quizScore += data.quiz.pointsPerCorrect;
      sound.play("correct");
    }

    addTimer(setTimeout(() => {
      state.questionIndex += 1;
      if (state.questionIndex >= data.quiz.questions.length) {
        renderFinal();
      } else {
        renderQuiz();
      }
    }, 420));
  }

  function getFinalTitle(totalScore) {
    return data.titles.reduce((best, current) => {
      return totalScore >= current.minScore ? current : best;
    }, data.titles[0]).title;
  }

  function renderFinal() {
    clearTimers();
    sound.play("finish");

    const totalScore = state.harvestScore + state.quizScore;
    const title = getFinalTitle(totalScore);

    root.innerHTML = `
      <section class="screen final-screen">
        <div class="final-card">
          <p class="eyebrow">挑戰完成</p>
          <h2 class="final-title">${escapeHtml(title)}</h2>
          <div class="final-score">${totalScore}</div>
          <div class="breakdown">
            <div class="breakdown-row">
              <span>採茶分數</span>
              <strong>${state.harvestScore}</strong>
            </div>
            <div class="breakdown-row">
              <span>問答分數</span>
              <strong>${state.quizScore}</strong>
            </div>
            <div class="breakdown-row">
              <span>答對題數</span>
              <strong>${state.quizCorrect} / ${data.quiz.questions.length}</strong>
            </div>
          </div>
          <div class="join-block">
            <p>${escapeHtml(data.cta.message)}</p>
            <a class="link-button" href="${escapeHtml(data.cta.joinUrl)}">${escapeHtml(data.cta.label)}</a>
          </div>
          <button class="secondary-button" type="button" data-action="restart">再玩一次</button>
        </div>
      </section>
    `;
  }

  root.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return;

    const action = actionTarget.dataset.action;

    if (action === "start") startHarvest();
    if (action === "knowledge") {
      state.cardIndex = 0;
      renderKnowledge();
    }
    if (action === "next-card") {
      state.cardIndex += 1;
      sound.play("card");
      renderKnowledge();
    }
    if (action === "quiz") startQuiz();
    if (action === "restart") renderHome();
  });

  root.addEventListener("click", (event) => {
    const optionButton = event.target.closest(".option-button");
    if (optionButton && !optionButton.disabled) answerQuestion(optionButton);
  });

  soundToggle.addEventListener("click", () => {
    sound.toggle();
    updateSoundButton();
  });

  updateSoundButton();
  renderHome();
})();
