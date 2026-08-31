/* Supabase Edge Function 的唯一前端入口。玩家不會直接讀寫資料表。 */
window.TEA_API = (() => {
  const config = window.TEA_SUPABASE_CONFIG || {};

  function isConfigured() {
    return /^https:\/\/.+\.supabase\.co$/i.test(config.url || "") && Boolean(config.anonKey);
  }

  async function call(functionName, payload = {}, sessionToken = "") {
    if (!isConfigured()) throw new Error("尚未設定 Supabase 連線資訊。");
    const response = await fetch(`${config.url}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        ...(sessionToken ? { "x-game-session-token": sessionToken } : {})
      },
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "目前無法連線到成績系統，請稍後再試。");
    return body;
  }

  return { isConfigured, getActivity: () => call("get-active-activity"), createSession: (player) => call("create-game-session", player), submitResult: (result, token) => call("submit-game-result", result, token), call };
})();
