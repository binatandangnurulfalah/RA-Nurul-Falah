import "jsr:@supabase/functions-js@2.4.5/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Metode tidak diizinkan." }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ ok: false, error: "Silakan login kembali." }, 401);
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const adminClient = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) {
    return json({ ok: false, error: "Sesi tidak valid. Silakan login kembali." }, 401);
  }

  const { data: profile } = await adminClient
    .from("user_profiles")
    .select("role,is_active")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (!profile?.is_active || !["admin", "teacher"].includes(profile.role)) {
    return json({ ok: false, error: "Hanya Admin atau Guru yang dapat menghapus data absensi." }, 403);
  }

  const teacherCanAccessStudent = async (studentId: string) => {
    if (profile.role === "admin") return true;

    const { data: student } = await adminClient
      .from("students")
      .select("class_name")
      .eq("id", studentId)
      .maybeSingle();
    if (!student?.class_name) return false;

    const { data: teacher } = await adminClient
      .from("teacher_profiles")
      .select("id")
      .eq("teacher_user_id", authData.user.id)
      .maybeSingle();
    if (!teacher) return false;

    const { data: schoolClass } = await adminClient
      .from("school_classes")
      .select("id")
      .eq("name", student.class_name)
      .eq("is_active", true)
      .maybeSingle();
    if (!schoolClass) return false;

    const { data: assignment } = await adminClient
      .from("teacher_class_assignments")
      .select("class_id")
      .eq("class_id", schoolClass.id)
      .eq("teacher_profile_id", teacher.id)
      .maybeSingle();

    return Boolean(assignment);
  };

  let body: { record_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Permintaan tidak valid." }, 400);
  }

  const recordId = String(body.record_id ?? "").trim();
  if (!isUuid(recordId)) {
    return json({ ok: false, error: "ID data absensi tidak valid." }, 400);
  }

  const { data: record } = await adminClient
    .from("attendance_records")
    .select("id,attendance_date,student_id,students(full_name)")
    .eq("id", recordId)
    .maybeSingle();

  if (!record) return json({ ok: false, error: "Data absensi tidak ditemukan." }, 404);
  if (!(await teacherCanAccessStudent(record.student_id))) {
    return json({ ok: false, error: "Anda tidak memiliki akses ke kelas murid ini." }, 403);
  }

  const { data: deleted, error: deleteError } = await adminClient
    .from("attendance_records")
    .delete()
    .eq("id", recordId)
    .eq("student_id", record.student_id)
    .select("id")
    .maybeSingle();

  if (deleteError) {
    return json({ ok: false, error: "Data absensi gagal dihapus." }, 409);
  }
  if (!deleted) {
    return json({ ok: false, error: "Data absensi berubah saat diproses. Muat ulang lalu coba lagi." }, 409);
  }

  return json({
    ok: true,
    deleted: {
      id: record.id,
      attendance_date: record.attendance_date,
      student_name: Array.isArray(record.students) ? record.students[0]?.full_name : record.students?.full_name,
    },
  });
});
