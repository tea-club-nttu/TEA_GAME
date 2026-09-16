import { activityStatus, corsHeaders, json, now, publicActivity, requireAdmin } from "../_shared/core.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const activityResponse = (activity: Record<string, unknown>) => ({ ...publicActivity(activity), status: activityStatus(activity as { start_at: string; end_at: string }) });
const safeText = (value: unknown, limit: number) => typeof value === "string" && value.trim().length > 0 && value.trim().length <= limit;
const TYPE_IDS = ["twoLeaves", "singleBud", "oldLeaf", "diseasedLeaf"] as const;

function validatedGameConfig(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("遊戲速度設定格式不正確。");
  const value = input as Record<string, unknown>;
  const whole = (key: string, min: number, max: number) => {
    const number = Number(value[key]);
    if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${key} 超出允許範圍。`);
    return number;
  };
  const spawnStartMs = whole("spawnStartMs", 400, 1500);
  const spawnEndMs = whole("spawnEndMs", 200, 1000);
  const speedRampPower = Number(value.speedRampPower);
  if (spawnEndMs > spawnStartMs) throw new Error("結尾出現間隔不可大於開始間隔。");
  if (!Number.isFinite(speedRampPower) || speedRampPower < 0.5 || speedRampPower > 3) throw new Error("加速曲線必須介於 0.5～3。");
  const inputTypes = value.types;
  if (!inputTypes || typeof inputTypes !== "object") throw new Error("葉片速度設定格式不正確。");
  const types: Record<string, { weight: number; startLifeMs: number; endLifeMs: number }> = {};
  for (const id of TYPE_IDS) {
    const item = (inputTypes as Record<string, unknown>)[id];
    if (!item || typeof item !== "object") throw new Error(`缺少 ${id} 設定。`);
    const source = item as Record<string, unknown>;
    const read = (key: string, min: number, max: number) => {
      const number = Number(source[key]);
      if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${id} 的 ${key} 超出允許範圍。`);
      return number;
    };
    const weight = read("weight", 1, 97);
    const startLifeMs = read("startLifeMs", 600, 5000);
    const endLifeMs = read("endLifeMs", 300, 3000);
    if (endLifeMs > startLifeMs) throw new Error(`${id} 的結尾掉落時間不可大於初始時間。`);
    types[id] = { weight, startLifeMs, endLifeMs };
  }
  if (Object.values(types).reduce((sum, item) => sum + item.weight, 0) !== 100) throw new Error("四種葉片的出現比例必須合計 100%。");
  return { spawnStartMs, spawnEndMs, speedRampPower: Math.round(speedRampPower * 100) / 100, types };
}

async function dashboard(supabase: SupabaseClient, activityId: string | null) {
  const [{ data: activities, error }, { data: settings, error: settingsError }] = await Promise.all([
    supabase.from("activities").select("id,name,start_at,end_at,is_active,is_paused,resume_at").order("start_at", { ascending: false }),
    supabase.from("game_settings").select("config").eq("id", true).maybeSingle()
  ]);
  if (error || settingsError) throw error || settingsError;
  const selected = activities?.find((activity) => activity.id === activityId) || activities?.[0] || null;
  if (!selected) return { activities: [], selectedActivity: null, stats: {}, leaderboard: [], publicLeaderboard: [], gameConfig: settings?.config || null };
  const { data: leaderboard, error: boardError } = await supabase.rpc("activity_leaderboard", { p_activity_id: selected.id });
  if (boardError) throw boardError;
  const { count: sessions, error: sessionError } = await supabase.from("game_sessions").select("id", { count: "exact", head: true }).eq("activity_id", selected.id).eq("is_valid", true).eq("is_deleted", false).not("completed_at", "is", null);
  if (sessionError) throw sessionError;
  const mapped = (leaderboard || []).map((row: Record<string, unknown>) => ({ rank: row.rank, studentId: row.student_id, name: row.player_name, highScore: row.high_score, achievedAt: row.achieved_at, playCount: row.play_count }));
  return {
    activities: (activities || []).map(activityResponse),
    selectedActivity: activityResponse(selected),
    stats: { players: mapped.length, sessions: sessions || 0 },
    leaderboard: mapped,
    publicLeaderboard: mapped.slice(0, 20).map(({ rank, name, highScore }) => ({ rank, name, highScore })),
    gameConfig: settings?.config || null
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await request.json();
    const { supabase, user } = await requireAdmin(request);
    if (body.action === "dashboard") return json(await dashboard(supabase, body.activityId || null));

    if (body.action === "update-game-settings") {
      const gameConfig = validatedGameConfig(body.gameConfig);
      const { error } = await supabase.from("game_settings").upsert({ id: true, config: gameConfig });
      if (error) throw error;
      return json({ ok: true, gameConfig });
    }

    if (body.action === "search") {
      const query = String(body.query || "").trim();
      if (!query || query.length > 40 || !body.activityId) return json({ error: "請輸入有效的查詢資料。" }, 400);
      const escaped = query.replaceAll("%", "\\%").replaceAll("_", "\\_");
      const { data: sessions, error } = await supabase.from("game_sessions").select("id,student_id,player_name,total_score,completed_at,is_valid,is_deleted").eq("activity_id", body.activityId).or(`student_id.ilike.%${escaped}%,player_name.ilike.%${escaped}%`).order("completed_at", { ascending: false }).limit(200);
      if (error) throw error;
      const grouped = new Map<string, Record<string, unknown>>();
      for (const session of sessions || []) {
        const key = `${session.student_id}:${session.player_name}`;
        if (!grouped.has(key)) grouped.set(key, { studentId: session.student_id, name: session.player_name, sessions: [] });
        (grouped.get(key)!.sessions as unknown[]).push({ id: session.id, totalScore: session.total_score, completedAt: session.completed_at, isValid: session.is_valid && !session.is_deleted });
      }
      const players = [...grouped.values()].map((player) => {
        const valid = (player.sessions as Array<{ totalScore: number | null; isValid: boolean }>).filter((session) => session.isValid && session.totalScore !== null);
        return { ...player, playCount: valid.length, highScore: valid.length ? Math.max(...valid.map((session) => session.totalScore!)) : 0 };
      });
      return json({ players });
    }

    if (body.action === "delete-session") {
      if (typeof body.sessionId !== "string") return json({ error: "缺少成績識別資料。" }, 400);
      const { error } = await supabase.from("game_sessions").update({ is_deleted: true, deleted_at: now().toISOString(), deleted_by: user.id }).eq("id", body.sessionId).eq("is_deleted", false);
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === "upsert-activity") {
      const activity = body.activity || {};
      if (!safeText(activity.name, 100) || Number.isNaN(Date.parse(activity.startAt)) || Number.isNaN(Date.parse(activity.endAt)) || new Date(activity.endAt) <= new Date(activity.startAt)) return json({ error: "請填寫有效的活動名稱與時間。" }, 400);
      const isPaused = activity.isPaused === true;
      const resumeAt = isPaused && activity.resumeAt ? new Date(activity.resumeAt) : null;
      if (resumeAt && (!Number.isFinite(resumeAt.getTime()) || resumeAt <= now() || resumeAt <= new Date(activity.startAt) || resumeAt >= new Date(activity.endAt))) return json({ error: "重新開放時間必須在現在之後，且位於活動開始與結束之間；不確定時間可留空。" }, 400);
      const values = { name: activity.name.trim(), start_at: new Date(activity.startAt).toISOString(), end_at: new Date(activity.endAt).toISOString(), is_active: Boolean(activity.isActive), is_paused: isPaused, resume_at: resumeAt?.toISOString() || null };
      const query = activity.id ? supabase.from("activities").update(values).eq("id", activity.id) : supabase.from("activities").insert(values);
      const { data, error } = await query.select("id").single();
      if (error) throw error;
      return json({ ok: true, id: data.id });
    }

    return json({ error: "未知的管理操作。" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "管理操作失敗。";
    return json({ error: message }, message.includes("權限") || message.includes("登入") ? 403 : 500);
  }
});
