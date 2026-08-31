import { createClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-game-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" } });
export const service = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
export const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
export const now = () => new Date();

export function activityStatus(activity: { start_at: string; end_at: string }, at = now()) {
  if (at < new Date(activity.start_at)) return "upcoming";
  if (at > new Date(activity.end_at)) return "ended";
  return "active";
}

export const publicActivity = (activity: Record<string, unknown>) => ({ id: activity.id, name: activity.name, startAt: activity.start_at, endAt: activity.end_at, isActive: activity.is_active });

export function validPlayer(studentId: unknown, name: unknown) {
  const safe = /^[\p{L}\p{N}\s-]+$/u;
  return typeof studentId === "string" && typeof name === "string" && studentId.length >= 1 && studentId.length <= 20 && name.length >= 1 && name.length <= 40 && safe.test(studentId) && safe.test(name);
}

export async function requireAdmin(request: Request) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("請先登入管理員帳號。");
  const supabase = service();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) throw new Error("登入已失效，請重新登入。");
  const { data: profile } = await supabase.from("admin_profiles").select("role").eq("id", userData.user.id).maybeSingle();
  if (profile?.role !== "admin") throw new Error("此帳號沒有管理權限。");
  return { supabase, user: userData.user };
}
