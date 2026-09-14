/*
  花東茶之旅遊戲設定。
  修改題目、採茶物件、難度與前端顯示文字時，優先調整此檔案。
  Edge Function 中保留相同的關鍵計分規則，前端分數僅供遊戲即時回饋。
*/
window.TEA_GAME_DATA = {
  gameTitle: "花東茶之旅",
  clubName: "臺東大學茶道社",
  home: {
    intro: "跟著茶香走進花東茶園，採下珍貴茶芽，認識鹿野與舞鶴的特色茶，再用五題小測驗完成挑戰。",
    startButton: "查看挑戰規則"
  },
  rules: {
    title: "挑戰規則",
    intro: "活動期間內，每位同學可以重複挑戰，系統只會保留你的最高有效成績。",
    startButton: "填寫參賽資料"
  },
  cta: {
    label: "加入茶道社",
    joinUrl: "https://sites.google.com/view/nttu-rform/",
    message: "歡迎加入臺東大學茶道社，一起體驗泡茶、茶文化與茶點製作！"
  },

  // 採茶 30 秒。後段的出現間隔與停留時間都會縮短。
  teaPicking: {
    durationSeconds: 30,
    spawnIntervalMs: 700,
    endSpawnIntervalMs: 350,
    itemLifeMs: 2400,
    endItemLifeMs: 1250,
    missPenalty: -3,
    maxActiveItems: 7,
    types: [
      { id: "twoLeaves", label: "一心二葉", score: 3, isCorrect: true, weight: 50, lifeMultiplier: 1, asset: "assets/tea-leaf-correct.svg" },
      { id: "singleBud", label: "單芽", score: 1, isCorrect: true, weight: 20, lifeMultiplier: 0.7, asset: "assets/tea-single-bud.svg" },
      { id: "oldLeaf", label: "老葉", score: -2, isCorrect: false, weight: 15, lifeMultiplier: 1.1, asset: "assets/tea-old-leaf.svg" },
      { id: "diseasedLeaf", label: "病葉", score: -3, isCorrect: false, weight: 15, lifeMultiplier: 1.08, asset: "assets/tea-diseased-leaf.svg" }
    ]
  },

  knowledge: {
    autoSeconds: 5.5,
    cards: [
      { title: "鹿野紅烏龍", body: "台東鹿野最具代表性的特色茶，\n香氣濃郁、茶湯呈琥珀紅色。", accent: "#b96443" },
      { title: "舞鶴蜜香紅茶", body: "花蓮瑞穗舞鶴著名茶葉，\n具有天然蜜香風味。", accent: "#d2a13e" },
      { title: "一心二葉", body: "採茶時最常採摘的部位，\n也是製茶品質的重要來源。", accent: "#5f8d4e" },
      { title: "泡茶小知識", body: "水溫與浸泡時間，\n都會影響茶的香氣與口感。", accent: "#35654b" },
      { title: "茶道社活動", body: "除了泡茶之外，\n還會體驗茶點製作與認識茶文化。", accent: "#7a5438" }
    ]
  },

  // 每題與選項都有固定 ID，洗牌後不會依賴 A/B/C/D 判斷正解。
  quiz: {
    secondsPerQuestion: 12,
    speedBonusMax: 30,
    questions: [
      {
        id: "lunye-oolong", difficulty: "medium", question: "紅烏龍最具代表性的產地是？",
        options: [{ id: "chishang", label: "池上" }, { id: "guanshan", label: "關山" }, { id: "luye", label: "鹿野" }, { id: "beinan", label: "卑南" }], correctOptionId: "luye"
      },
      {
        id: "picking-part", difficulty: "easy", question: "採茶時最適合採摘哪一部分？",
        options: [{ id: "one-three", label: "一心三葉" }, { id: "one-two", label: "一心二葉" }, { id: "three-two", label: "三心二葉" }, { id: "oldest", label: "最老的葉片" }], correctOptionId: "one-two"
      },
      {
        id: "wuhhe-tea", difficulty: "medium", question: "下列哪一種是花蓮具有代表性的茶？",
        options: [{ id: "dongding", label: "凍頂烏龍" }, { id: "alishan", label: "阿里山高山茶" }, { id: "wuhhe", label: "舞鶴蜜香紅茶" }, { id: "wenshan", label: "文山包種茶" }], correctOptionId: "wuhhe"
      },
      {
        id: "brewing-factor", difficulty: "easy", question: "哪一個因素最容易影響泡出的茶風味？",
        options: [{ id: "cup-color", label: "杯子的顏色" }, { id: "spoon", label: "茶匙材質" }, { id: "temperature-time", label: "水溫與浸泡時間" }, { id: "tray", label: "茶盤大小" }], correctOptionId: "temperature-time"
      },
      {
        id: "club-activity", difficulty: "easy", question: "茶道社除了泡茶之外，也會舉辦哪一項活動？",
        options: [{ id: "latte", label: "咖啡拉花" }, { id: "flowers", label: "花藝設計" }, { id: "sweets", label: "茶點製作" }, { id: "cocktail", label: "調酒體驗" }], correctOptionId: "sweets"
      }
    ]
  },

  quizDifficulty: { easy: 60, medium: 80, hard: 100 },
  titles: [
    { minScore: -999, title: "茶葉新手" },
    { minScore: 500, title: "採茶學徒" },
    { minScore: 900, title: "花東茶達人" },
    { minScore: 1400, title: "茶王" }
  ]
};
