import { activityStatus, corsHeaders, hash, json, now, publicActivity, service, validPlayer } from "../_shared/core.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await request.json();
    const studentId = String(body.studentId || "").trim();
    const name = String(body.name || "").trim();
    if (!validPlayer(studentId, name)) return json({ error: "學號或姓名格式不符合規範。" }, 400);
    const supabase = service();
    const { data: activities, error: activityError } = await supabase.from("activities").select("id,name,start_at,end_at,is_active").eq("is_active", true).order("start_at", { ascending: true });
    if (activityError) throw activityError;
    const activity = activities?.find((item) => activityStatus(item) === "active");
    if (!activity) return json({ error: "目前不是可開始正式挑戰的活動時間。" }, 403);
    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const startedAt = now().toISOString();
    const { data: session, error: sessionError } = await supabase.from("game_sessions").insert({ activity_id: activity.id, student_id: studentId, player_name: name, session_token_hash: await hash(token), game_started_at: startedAt }).select("id,game_started_at").single();
    if (sessionError) throw sessionError;
    return json({ activity: publicActivity(activity), session: { id: session.id, token, startedAt: session.game_started_at } });
  } catch (error) {
    return json({ error: "無法建立挑戰，請稍後再試。" }, 500);
  }
});
