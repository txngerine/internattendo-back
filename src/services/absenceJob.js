import { supabaseAdmin } from "../config/supabase.js";
import { getDateKey } from "../utils/attendance.js";

export async function runAbsenceMarking() {
  // Run at 9:45 and 16:33 (4:33pm)
  const targetTimes = [
    { hour: 9, minute: 45 },
    { hour: 16, minute: 33 },
  ];

  setInterval(async () => {
    const now = new Date();
    // Convert now to Asia/Kolkata timezone
    const indiaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const currentHour = indiaTime.getHours();
    const currentMinute = indiaTime.getMinutes();
    const shouldRun = targetTimes.some(t => t.hour === currentHour && t.minute === currentMinute);
    if (!shouldRun) return;

    const dateKey = getDateKey(indiaTime);
    const { data: interns } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("role", "Intern")
      .eq("access_status", "approved");
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
