import { activityStatus, corsHeaders, json, now, publicActivity, service } from "../_shared/core.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const supabase = service();
  const [{ data, error }, { data: settings, error: settingsError }] = await Promise.all([
    supabase.from("activities").select("id,name,start_at,end_at,is_active,is_paused,resume_at,stages").eq("is_active", true).order("start_at", { ascending: true }),
    supabase.from("game_settings").select("config").eq("id", true).maybeSingle()
  ]);
  if (error) return json({ error: "無法讀取活動資訊。" }, 500);
  if (settingsError) return json({ error: "無法讀取遊戲速度設定。" }, 500);
  if (!data?.length) return json({ status: "none", activity: null, gameConfig: settings?.config || null, serverTime: now().toISOString() });
  const current = now();
  const active = data.find((activity) => ["active", "paused"].includes(activityStatus(activity, current)));
  const upcoming = data.find((activity) => activityStatus(activity, current) === "upcoming");
  const latest = data[data.length - 1];
  const activity = active || upcoming || latest;
  const { count: questionCount, error: questionsError } = await supabase.from("quiz_questions").select("id", { count: "exact", head: true }).eq("enabled", true);
  if (questionsError) return json({ error: "無法讀取題库設定。" }, 500);
  return json({ questionCount: questionCount || 0, status: activityStatus(activity, current), activity: publicActivity(activity), gameConfig: settings?.config || null, serverTime: current.toISOString() });
});
