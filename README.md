# 花東茶之旅－茶道社社團博覽會挑戰賽

手機直式瀏覽器用的茶文化小遊戲，前端可部署到 GitHub Pages；Supabase 負責活動時間、單局 session、成績驗證、RLS 與管理後台。

## 架構與遊戲流程

玩家流程：活動檢查 → 規則 → 學號與姓名 → 建立單局 session → 30 秒採茶 → 五張知識卡 → 限時五題測驗 → 後端驗證並儲存成績。

- 同一學號可無限重玩，排行榜每人只取該活動的最高有效成績。
- 同分以達成最高分的時間較早者優先。
- 玩家只會看到自己的本次分數，沒有公開完整排行榜。
- 所有資料表已啟用 RLS；前端不直接讀寫資料表。
- Edge Function 會驗證活動時間、session token、單局只能提交一次、合理遊戲時長與事件上限，並重算採茶與問答分數。

## 修改與新增檔案

- `index.html`：載入 Supabase 設定與遊戲 API。
- `styles.css`：新增報名、讀取、錯誤、活動與測驗倒數 UI。
- `js/data.js`：新增稀有茶芽、題目／選項 ID、洗牌所需資料、限時計分和新稱號門檻。
- `js/game.js`：競賽流程、報名驗證、session、隨機題目與選項、限時答題、重新送出成績。
- `js/supabase-config.js`：僅存公開 URL 與 anon key 的設定檔。
- `js/supabase-api.js`：玩家端 Edge Function API。
- `admin.html`、`admin.css`、`js/admin.js`：受 Supabase Auth 保護的管理後台、搜尋、刪除異常成績、活動設定、CSV 匯出。
- `supabase/migrations/20260831_competition_system.sql`：完整資料表、index、trigger、RLS、排行榜 SQL。
- `supabase/functions/`：活動查詢、建立 session、成績驗證與管理後台 Edge Functions。

## Supabase 設定

1. 建立 Supabase Project，記下 `Project URL` 與 `anon public key`。
2. 在 **SQL Editor** 執行完整的 [`supabase/migrations/20260831_competition_system.sql`](supabase/migrations/20260831_competition_system.sql)。這會建立 `activities`、`game_sessions`、`admin_profiles`、索引、trigger、RLS 與 `activity_leaderboard()`。
3. 以 Supabase CLI 登入並連結專案：

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

4. 部署 Edge Functions。前三個是公開玩家入口，管理 API 則會在函式內驗證 Supabase Auth 使用者與 `admin_profiles`。

```bash
supabase functions deploy get-active-activity --no-verify-jwt
supabase functions deploy create-game-session --no-verify-jwt
supabase functions deploy submit-game-result --no-verify-jwt
supabase functions deploy admin-api
```

5. 在 **Edge Functions > Secrets** 確認平台提供的 `SUPABASE_URL`、`SUPABASE_ANON_KEY` 與 `SUPABASE_SERVICE_ROLE_KEY` 可供函式使用。`SUPABASE_SERVICE_ROLE_KEY` 只能留在 Supabase server 端，絕不可放進 GitHub Pages。
6. 編輯 [`js/supabase-config.js`](js/supabase-config.js)，填入公開設定：

```js
window.TEA_SUPABASE_CONFIG = {
  url: "https://YOUR_PROJECT_REF.supabase.co",
  anonKey: "YOUR_ANON_PUBLIC_KEY"
};
```

anon key 是給瀏覽器使用的公開 key；資料安全依賴 RLS 和 Edge Function 的 server-side 驗證，而非隱藏 anon key。

## 建立第一位管理員

1. 在 Supabase **Authentication > Users** 建立 Email／Password 使用者，或邀請該管理員。
2. 複製該使用者的 UUID。
3. 在 SQL Editor 執行：

```sql
insert into public.admin_profiles (id, role)
values ('AUTH_USER_UUID', 'admin');
```

4. 開啟 `https://YOUR_GITHUB_PAGES_URL/admin.html`，使用該 Email 與密碼登入。

## 建立活動

登入後台後按「新增活動」，填入活動名稱與台灣時間並勾選「開放此活動」。例如：

- 名稱：`2026 茶道社社團博覽會挑戰賽`
- 開始：`2026/09/15 09:00`
- 結束：`2026/09/17 17:00`

後台會將時間轉成 UTC 儲存，但玩家端和管理端均以 `Asia/Taipei` 顯示。活動未開始時玩家會看到「活動尚未開始」，結束後則不能送出有效成績。

## 管理後台功能

- 切換活動並查看活動狀態、參賽人數、遊玩總次數。
- 在「遊戲速度」調整葉片出現間隔、加速曲線、各葉片比例與掉落時間，並即時預覽 30 秒速度表。
- 查看每位學號的最高有效成績與同分時間排序。
- 依學號或姓名搜尋，查看每一次遊玩紀錄。
- 刪除單一異常 session；資料採邏輯刪除，會立即從排行榜排除。
- 在「公開排行」查看僅含排名、姓名、分數的資料。
- 在「排行榜」按「匯出 CSV」下載含學號、姓名、最高分、達成時間與遊玩次數的檔案。

## GitHub Pages 部署

1. 將本專案推到 `main`。
2. GitHub repo 的 **Settings > Pages** 選擇 **Deploy from a branch**。
3. Branch 選 `main`，資料夾選 `/ (root)`，儲存後等待部署完成。
4. 對外玩家網址是 Pages 根網址；管理入口是 `/admin.html`。

## 本機遊戲預覽

```bash
python -m http.server 8000
```

正式模式必須設定 Supabase 才能開始。設計／流程測試可使用不會送出任何資料的展示模式：

```text
http://localhost:8000/index.html?demo=1
```

短流程測試：

```text
http://localhost:8000/index.html?demo=1&test=short
```

## 後續修改重點

### 臨時暫停與自動重新開放

後台選擇活動 →「修改活動」→ 勾選「暫停開放」，保持「開放此活動」勾選，再儲存。
可填台灣時間的「預計重新開放時間」以自動恢復；留空則需手動取消暫停。
重新開放時間必須在現在之後，且位於活動開始與結束之間。
玩家入口會顯示暫停通知與預計時間，每 15 秒重新確認狀態。
伺服器會阻止新挑戰；暫停前已開始的挑戰仍可在原活動時間內完成交分。
已過期的自動暫停不影響新挑戰；編輯活動時也會顯示為未暫停。
驗證：`node scripts/check-activity-pause.cjs`。

- 遊戲題庫、採茶機率、前端即時計分：`js/data.js`
- 正式計分同步規則：`supabase/functions/submit-game-result/index.ts`
- 活動資料庫欄位與 RLS：`supabase/migrations/20260831_competition_system.sql`
- 加入社團按鈕連結：`js/data.js` 的 `cta.joinUrl`

調整正式計分時，請同步更新前端與 Edge Function，避免玩家畫面與有效成績不同。
