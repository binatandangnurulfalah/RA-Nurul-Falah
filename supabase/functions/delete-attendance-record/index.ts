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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Metode tidak diizinkan." }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ ok: false, error: "Silakan login kembali." }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
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

  let body: { record_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Permintaan tidak valid." }, 400);
  }

  const recordId = String(body.record_id ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recordId)) {
    return json({ ok: false, error: "ID data absensi tidak valid." }, 400);
  }

  const { data: record } = await adminClient
    .from("attendance_records")
    .select("id,attendance_date,student_id,students(full_name)")
    .eq("id", recordId)
    .maybeSingle();

  if (!record) return json({ ok: false, error: "Data absensi tidak ditemukan." }, 404);

  const { error: deleteError } = await adminClient
    .from("attendance_records")
    .delete()
    .eq("id", recordId);

  if (deleteError) {
    return json({ ok: false, error: "Data absensi gagal dihapus." }, 409);
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
