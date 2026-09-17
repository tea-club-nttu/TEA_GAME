import { activityStatus, corsHeaders, hash, json, now, service } from "../_shared/core.ts";

const HARVEST = { twoLeaves: 40, singleBud: 20, oldLeaf: -30, diseasedLeaf: -40, missed: -5 };
const LIMITS = { twoLeaves: 130, singleBud: 130, oldLeaf: 130, diseasedLeaf: 130, total: 130, misses: 130 };
const QUESTIONS = {
  "lunye-oolong": { correct: "luye", base: 80 },
  "picking-part": { correct: "one-two", base: 60 },
  "wuhhe-tea": { correct: "wuhhe", base: 80 },
  "brewing-factor": { correct: "temperature-time", base: 60 },
  "club-activity": { correct: "sweets", base: 60 }
} as const;

function count(value: unknown) { return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null; }
function scoreQuiz(answers: unknown[], questions: Record<string, { correct: string; base: number }> = QUESTIONS) {
  const seen = new Set<string>();
  let score = 0; let correctAnswers = 0; let combo = 0;
  for (const answer of answers) {
    if (!answer || typeof answer !== "object") continue;
    const item = answer as Record<string, unknown>;
    const questionId = String(item.questionId || "");
    const question = questions[questionId];
    const elapsed = Number(item.elapsedMs);
    if (!question || seen.has(questionId) || !Number.isFinite(elapsed) || elapsed < 0 || elapsed > 12000) continue;
    seen.add(questionId);
    if (item.optionId === question.correct) {
      combo += 1; correctAnswers += 1;
      const speedBonus = Math.max(0, Math.round(30 * (1 - elapsed / 12000)));
      const multiplier = combo >= 5 ? 1.5 : combo >= 3 ? 1.25 : 1;
      score += Math.round((question.base + speedBonus) * multiplier);
    } else combo = 0;
  }
  return { score, correctAnswers };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await request.json();
    if (body.scoringVersion !== "harvest-balanced-v1") return json({ error: "採茶計分已更新，請重新整理頁面後再挑戰。" }, 400);
    const token = request.headers.get("x-game-session-token") || "";
    if (!token || typeof body.sessionId !== "string") return json({ error: "缺少挑戰識別資料。" }, 400);
    const supabase = service();
    const { data: session, error: sessionError } = await supabase.from("game_sessions").select("*").eq("id", body.sessionId).maybeSingle();
    if (sessionError || !session) return json({ error: "找不到這場挑戰。" }, 404);
    if (session.completed_at) return json({ error: "此場挑戰已送出過成績。" }, 409);
    if (session.is_deleted || await hash(token) !== session.session_token_hash) return json({ error: "這場挑戰無法驗證。" }, 403);
    const { data: activity } = await supabase.from("activities").select("id,start_at,end_at,is_active,is_paused,resume_at").eq("id", session.activity_id).maybeSingle();
    // Existing activity-pause behavior: pause blocks NEW sessions in create-game-session;
    // an existing token-verified session may finish while paused, within the activity window.
    // This preserves the deployed v4 submission behavior, while explicitly reading pause state.
    if (!activity || !activity.is_active || !["active", "paused"].includes(activityStatus(activity))) return json({ error: "活動時間已結束，無法列入有效成績。" }, 403);
    const completedAt = now();
    const duration = Math.floor((completedAt.getTime() - new Date(session.game_started_at).getTime()) / 1000);
    const stages = session.stages_snapshot || { harvest: true, knowledge: true, quiz: true };
    const snapshot = session.quiz_snapshot as Array<{ id: string; correctOptionId: string; difficulty: string }> | null;
    const questionMap: Record<string, { correct: string; base: number }> = snapshot ? Object.fromEntries(snapshot.map((q) => [q.id, { correct: q.correctOptionId, base: ({ easy: 60, medium: 80, hard: 100 } as Record<string, number>)[q.difficulty] || 60 }])) : QUESTIONS;
    const questionCount = stages.quiz ? Object.keys(questionMap).length : 0;
    if (duration < (stages.harvest ? 28 : 0) || duration > 240 + questionCount * 15) return json({ error: "本次挑戰時間異常，請重新挑戰。" }, 400);

    const hits = body.harvest?.hits || {};
    if ("rareSprig" in hits || "mountainTip" in hits || "youngBud" in hits) return json({ error: "採茶規則已更新，請重新整理頁面後再挑戰。" }, 400);
    const values = Object.fromEntries(Object.keys(HARVEST).filter((key) => key !== "missed").map((key) => [key, count(hits[key])]));
    const misses = count(body.harvest?.missedCorrect);
    const totalHits = Object.values(values).reduce<number>((sum, value) => sum + (value ?? 0), 0);
    const invalidHarvest = Object.values(values).some((value) => value === null) || misses === null || totalHits > LIMITS.total || misses > LIMITS.misses || Object.entries(values).some(([key, value]) => value! > LIMITS[key as keyof typeof LIMITS]);
    const answers = Array.isArray(body.quizAnswers) ? body.quizAnswers : [];
    if ((!stages.harvest && (totalHits !== 0 || misses !== 0)) || (!stages.quiz && answers.length > 0)) return json({ error: "成績包含未開放的關卡。" }, 400);
    if (snapshot && (answers.length !== questionCount || new Set(answers.map((a: { questionId?: string }) => a?.questionId)).size !== questionCount ||
        answers.some((a: { questionId?: string; elapsedMs?: number }) => !a || !Object.hasOwn(questionMap, String(a.questionId)) || !Number.isFinite(a.elapsedMs) || Number(a.elapsedMs) < 0 || Number(a.elapsedMs) > 12000))) return json({ error: "答題資料與本場題目不符，請重新挑戰。" }, 400);
    const quiz = stages.quiz ? scoreQuiz(answers.slice(0, snapshot ? questionCount : 5), questionMap) : { score: 0, correctAnswers: 0 };
    const harvestScore = Object.entries(values).reduce((sum, [key, value]) => sum + HARVEST[key as keyof typeof HARVEST] * (value || 0), HARVEST.missed * (misses || 0));
    const rawTotalScore = harvestScore + quiz.score;
    // 永遠存進資料表允許的範圍；超出上限的事件組合標記為異常，絕不列入排行。
    const scoreOutOfRange = rawTotalScore < -6000 || rawTotalScore > 20000;
    const totalScore = Math.min(20000, Math.max(-6000, rawTotalScore));
    const isValid = !invalidHarvest && !scoreOutOfRange;
    const anomalyReason = invalidHarvest ? "遊戲事件數量超出合理範圍" : scoreOutOfRange ? "分數超出合理範圍" : null;
    const update = { completed_at: completedAt.toISOString(), game_duration_seconds: duration, harvest_summary: { hits: values, missedCorrect: misses }, quiz_answers: answers, harvest_score: harvestScore, quiz_score: quiz.score, total_score: totalScore, correct_answers: quiz.correctAnswers, is_valid: isValid, anomaly_reason: anomalyReason };
    const { data: saved, error: updateError } = await supabase.from("game_sessions").update(update).eq("id", session.id).is("completed_at", null).select("id").maybeSingle();
    if (updateError || !saved) return json({ error: "此場挑戰已送出過成績。" }, 409);
    if (!isValid) return json({ accepted: false, message: "系統偵測到異常事件，這筆成績不列入排行。" });
    return json({ accepted: true, score: { harvest: harvestScore, quiz: quiz.score, total: totalScore, correctAnswers: quiz.correctAnswers } });
  } catch (error) {
    return json({ error: "成績傳送失敗，請確認網路連線後再試一次。" }, 500);
  }
});
