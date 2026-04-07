import { supabaseAdmin } from "../config/supabase.js";
import { getDateKey } from "../utils/attendance.js";

export async function runAbsenceMarking() {
  const targetHour = Number(process.env.ABSENCE_MARK_TIME_HOUR || 18);
  const targetMinute = Number(process.env.ABSENCE_MARK_TIME_MINUTE || 0);

  setInterval(async () => {
    const now = new Date();
    if (now.getUTCHours() !== targetHour || now.getUTCMinutes() !== targetMinute) return;

    const dateKey = getDateKey(now);
    const { data: interns } = await supabaseAdmin.from("profiles").select("id").eq("role", "Intern");
    const { data: attendance } = await supabaseAdmin
      .from("attendance")
      .select("user_id")
      .eq("attendance_date", dateKey);

    const seen = new Set((attendance || []).map((item) => item.user_id));
    const missing = (interns || []).filter((intern) => !seen.has(intern.id));
    if (!missing.length) return;

    await supabaseAdmin.from("attendance").insert(
      missing.map((intern) => ({
        user_id: intern.id,
        attendance_date: dateKey,
        status: "Leave",
        location_valid: false,
      }))
    );
  }, 60000);
}
