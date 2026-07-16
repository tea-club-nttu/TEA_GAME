/* 
  花東茶之旅資料設定
  之後要換主題、改題目、調整分數，優先修改這個檔案。
*/
window.TEA_GAME_DATA = {
  gameTitle: "花東茶之旅",
  clubName: "臺東大學茶道社",

  // 首頁文字與最終頁的加入按鈕。joinUrl 可改成社群、表單或 Linktree。
  home: {
    intro: "跟著茶香走進花東茶園，採下一心二葉，認識鹿野與舞鶴的特色茶，再用五題小測驗完成迎新挑戰。",
    startButton: "開始遊戲"
  },
  cta: {
    label: "加入茶道社",
    joinUrl: "#",
    message: "歡迎加入臺東大學茶道社，一起體驗泡茶、茶文化與茶點製作！"
  },

  // 第一關：採茶遊戲設定。
  teaPicking: {
    durationSeconds: 30,
    spawnIntervalMs: 760,
    endSpawnIntervalMs: 390,
    itemLifeMs: 2500,
    endItemLifeMs: 1450,
    missPenalty: -3,
    maxActiveItems: 7,
    types: [
      {
        id: "twoLeaves",
        label: "一心二葉",
        score: 10,
        isCorrect: true,
        weight: 56,
        asset: "assets/tea-leaf-correct.svg"
      },
      {
        id: "youngBud",
        label: "太嫩的芽",
        score: -5,
        isCorrect: false,
        weight: 22,
        asset: "assets/tea-bud.svg"
      },
      {
        id: "oldLeaf",
        label: "太老的葉子",
        score: -5,
        isCorrect: false,
        weight: 22,
        asset: "assets/tea-old-leaf.svg"
      }
    ]
  },

  // 第二關：知識卡。autoSeconds 控制每張卡自動切換的秒數。
  knowledge: {
    autoSeconds: 5.5,
    cards: [
      {
        title: "鹿野紅烏龍",
        body: "台東鹿野最具代表性的特色茶，\n香氣濃郁、茶湯呈琥珀紅色。",
        accent: "#b96443"
      },
      {
        title: "舞鶴蜜香紅茶",
        body: "花蓮瑞穗舞鶴著名茶葉，\n具有天然蜜香風味。",
        accent: "#d2a13e"
      },
      {
        title: "一心二葉",
        body: "採茶時最常採摘的部位，\n也是製茶品質的重要來源。",
        accent: "#5f8d4e"
      },
      {
        title: "泡茶小知識",
        body: "水溫與浸泡時間，\n都會影響茶的香氣與口感。",
        accent: "#35654b"
      },
      {
        title: "茶道社活動",
        body: "除了泡茶之外，\n還會體驗茶點製作與認識茶文化。",
        accent: "#7a5438"
      }
    ]
  },

  // 第三關：五題測驗。answerIndex 從 0 開始算。
  quiz: {
    pointsPerCorrect: 20,
    questions: [
      {
        question: "紅烏龍最具代表性的產地是？",
        options: ["池上", "關山", "鹿野", "卑南"],
        answerIndex: 2
      },
      {
        question: "採茶時最適合採摘哪一部分？",
        options: ["一心三葉", "一心二葉", "三心二葉", "最老的葉片"],
        answerIndex: 1
      },
      {
        question: "下列哪一種是花蓮具有代表性的茶？",
        options: ["凍頂烏龍", "阿里山高山茶", "舞鶴蜜香紅茶", "文山包種茶"],
        answerIndex: 2
      },
      {
        question: "哪一個因素最容易影響泡出的茶風味？",
        options: ["杯子的顏色", "茶匙材質", "水溫與浸泡時間", "茶盤大小"],
        answerIndex: 2
      },
      {
        question: "茶道社除了泡茶之外，也會舉辦哪一項活動？",
        options: ["咖啡拉花", "花藝設計", "茶點製作", "調酒體驗"],
        answerIndex: 2
      }
    ]
  },

  // 稱號門檻以總分判斷：採茶分數 + 問答分數。
  // 第一關目前為 30 秒，門檻已依短版採茶時間調整。
  titles: [
    { minScore: 0, title: "🌱 茶葉新手" },
    { minScore: 80, title: "🍃 採茶學徒" },
    { minScore: 170, title: "🍵 花東茶達人" },
    { minScore: 260, title: "👑 茶王" }
  ]
};
