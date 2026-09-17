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
    const { data: activities, error: activityError } = await supabase.from("activities").select("id,name,start_at,end_at,is_active,is_paused,resume_at,stages").eq("is_active", true).order("start_at", { ascending: true });
    if (activityError) throw activityError;
    const activity = activities?.find((item) => ["active", "paused"].includes(activityStatus(item)));
    if (activity && activityStatus(activity) === "paused") return json({ error: "活動暫停開放，請返回首頁查看重新開放時間。" }, 403);
    if (!activity) return json({ error: "目前不是可開始正式挑戰的活動時間。" }, 403);
    const stages = activity.stages || { harvest: true, knowledge: true, quiz: true };
    let questions: Record<string, unknown>[] = [];
    if (stages.quiz) {
      const { data, error } = await supabase.from("quiz_questions").select("id,question,options,correct_option_id,difficulty").eq("enabled", true).order("created_at", { ascending: true }).order("id").limit(51);
      if (error) throw error;
      if (!data?.length || data.length > 50) return json({ error: "問答關尚未設定有效題目，請聯絡活動管理員。" }, 400);
      questions = data.map((q) => ({ id: q.id, question: q.question, options: q.options, correctOptionId: q.correct_option_id, difficulty: q.difficulty }));
    }
    const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const startedAt = now().toISOString();
    const { data: session, error: sessionError } = await supabase.from("game_sessions").insert({ activity_id: activity.id, student_id: studentId, player_name: name, session_token_hash: await hash(token), game_started_at: startedAt, stages_snapshot: stages, quiz_snapshot: questions }).select("id,game_started_at").single();
    if (sessionError) throw sessionError;
    return json({ activity: publicActivity(activity), questions, session: { id: session.id, token, startedAt: session.game_started_at } });
  } catch (error) {
    return json({ error: "無法建立挑戰，請稍後再試。" }, 500);
  }
});
