# 花東茶之旅－茶道社迎新小遊戲

手機直式瀏覽器用的純前端迎新小遊戲，可直接部署到 GitHub Pages。

## 檔案結構

- `index.html`：頁面入口。
- `styles.css`：日系木質、茶園風格 UI 與動畫。
- `js/data.js`：遊戲時間、採茶分數、知識卡、題庫、稱號門檻與加入連結。
- `js/audio.js`：免音檔的簡單互動音效。
- `js/game.js`：首頁、採茶、知識卡、測驗、結果頁流程。
- `assets/`：茶園背景與茶葉 SVG 素材。

## 修改常用內容

主要改 `js/data.js`：

- 第一關時間：`teaPicking.durationSeconds`
- 採茶分數：`teaPicking.types`
- 掉落加速：`teaPicking.spawnIntervalMs` / `teaPicking.endSpawnIntervalMs`、`teaPicking.itemLifeMs` / `teaPicking.endItemLifeMs`
- 漏採扣分：`teaPicking.missPenalty`
- 知識卡：`knowledge.cards`
- 測驗題庫：`quiz.questions`
- 問答分數：`quiz.pointsPerCorrect`
- 稱號門檻：`titles`
- 最後按鈕連結：`cta.joinUrl`

目前第一關採茶時間為 30 秒。

## 預覽

可以直接開啟 `index.html`，或在資料夾中啟動靜態伺服器：

```bash
python -m http.server 8000
```

再開啟：

```text
http://localhost:8000/index.html
```

短流程測試網址：

```text
http://localhost:8000/index.html?test=short
```

## 部署到 GitHub Pages

將整個資料夾推到 GitHub repo 後，在 GitHub Pages 選擇從主要分支部署即可。此專案沒有後端，也不需要建置步驟。
