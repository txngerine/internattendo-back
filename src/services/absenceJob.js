import { supabaseAdmin } from "../config/supabase.js";
import { getDateKey } from "../utils/attendance.js";

export async function runAbsenceMarking() {
  const targetHour = Number(process.env.ABSENCE_MARK_TIME_HOUR || 16);
  const targetMinute = Number(process.env.ABSENCE_MARK_TIME_MINUTE || 30);

  setInterval(async () => {
    try {
      const now = new Date();
      if (now.getUTCHours() !== targetHour || now.getUTCMinutes() !== targetMinute) return;

      const dateKey = getDateKey(now);
      
      // Get all approved interns
      const { data: interns, error: internsError } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("role", "Intern")
        .eq("access_status", "approved");

      if (internsError) {
        console.error("[AbsenceJob] Error fetching interns:", internsError.message);
        return;
      }

      // Get all attendance records for today
      const { data: attendance, error: attendanceError } = await supabaseAdmin
        .from("attendance")
        .select("user_id, status, location_valid")
        .eq("attendance_date", dateKey);

      if (attendanceError) {
        console.error("[AbsenceJob] Error fetching attendance:", attendanceError.message);
        return;
      }

      const attendanceMap = new Map((attendance || []).map((item) => [item.user_id, item]));
      const absentInterns = (interns || []).filter((intern) => !attendanceMap.has(intern.id));

      if (!absentInterns.length) {
        console.log(`[AbsenceJob] All ${interns?.length || 0} interns accounted for on ${dateKey}`);
        return;
      }

      // Mark interns who didn't come to office as absent
      const absenceRecords = absentInterns.map((intern) => ({
        user_id: intern.id,
        attendance_date: dateKey,
        status: "Absent",
        location_valid: false,
      }));

      const { error: insertError, data: inserted } = await supabaseAdmin
        .from("attendance")
        .insert(absenceRecords)
        .select("*");

      if (insertError) {
        console.error("[AbsenceJob] Error inserting absence records:", insertError.message);
        return;
      }

      console.log(
        `[AbsenceJob] Marked ${inserted?.length || 0} interns as absent on ${dateKey}`
      );
    } catch (error) {
      console.error("[AbsenceJob] Unexpected error:", error);
    }
  }, 60000);
}
