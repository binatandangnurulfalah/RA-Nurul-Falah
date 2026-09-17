import "jsr:@supabase/functions-js@2.4.5/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Metode tidak diizinkan." }, 405);
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ ok: false, error: "Silakan login kembali." }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } } });
  const adminClient = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ ok: false, error: "Sesi tidak valid. Silakan login kembali." }, 401);
  const { data: profile } = await adminClient.from("user_profiles").select("role,is_active").eq("id", authData.user.id).maybeSingle();
  if (!profile?.is_active || !["admin", "teacher"].includes(profile.role)) return json({ ok: false, error: "Hanya Admin atau Guru yang dapat mencatat absensi." }, 403);
  let body: { token?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: "QR tidak valid." }, 400); }
  const raw = String(body.token ?? "").trim();
  const token = raw.startsWith("RA-NF:") ? raw.slice(6) : raw;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) return json({ ok: false, error: "Kode QR tidak dikenali." }, 400);
  const { data: student } = await adminClient.from("students").select("id,full_name,class_name,is_active").eq("qr_token", token).maybeSingle();
  if (!student?.is_active) return json({ ok: false, error: "Data murid tidak ditemukan atau tidak aktif." }, 404);
  if (profile.role === "teacher") {
    const { data: teacher } = await adminClient.from("teacher_profiles").select("id").eq("teacher_user_id", authData.user.id).maybeSingle();
    const { data: schoolClass } = await adminClient.from("school_classes").select("id").eq("name", student.class_name).eq("is_active", true).maybeSingle();
    if (!teacher || !schoolClass) return json({ ok: false, error: "Guru belum ditugaskan ke kelas murid ini." }, 403);
    const { data: assignment } = await adminClient.from("teacher_class_assignments").select("class_id").eq("class_id", schoolClass.id).eq("teacher_profile_id", teacher.id).maybeSingle();
    if (!assignment) return json({ ok: false, error: "Anda hanya dapat memindai QR murid dari kelas yang ditugaskan." }, 403);
  }
  const now = new Date();
  const { data: settings } = await adminClient.from("school_settings").select("timezone,late_cutoff").eq("id", 1).maybeSingle();
  const timezone = settings?.timezone || "Asia/Jakarta";
  const lateCutoff = String(settings?.late_cutoff || "07:15:00").slice(0, 5);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const status = time > lateCutoff ? "late" : "present";
  const { data: existing } = await adminClient.from("attendance_records").select("id,check_in,check_out,status").eq("student_id", student.id).eq("attendance_date", date).maybeSingle();
  if (!existing) {
    const { error } = await adminClient.from("attendance_records").insert({ student_id: student.id, attendance_date: date, check_in: now.toISOString(), status, recorded_by: authData.user.id });
    if (error) return json({ ok: false, error: "Absensi gagal disimpan. Silakan pindai ulang." }, 409);
    return json({ ok: true, action: "check_in", student, time, status, late_cutoff: lateCutoff });
  }
  if (!existing.check_out) {
    if (now.getTime() - new Date(existing.check_in).getTime() < 120000) return json({ ok: false, error: "Murid baru saja absen masuk. Tunggu 2 menit untuk absen pulang." }, 409);
    const { error } = await adminClient.from("attendance_records").update({ check_out: now.toISOString(), recorded_by: authData.user.id }).eq("id", existing.id).is("check_out", null);
    if (error) return json({ ok: false, error: "Jam pulang gagal disimpan." }, 409);
    return json({ ok: true, action: "check_out", student, time, status: existing.status, late_cutoff: lateCutoff });
  }
  return json({ ok: false, error: "Absensi masuk dan pulang hari ini sudah lengkap." }, 409);
});
