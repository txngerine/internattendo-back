import express from "express";
import ExcelJS from "exceljs";
import { supabaseAdmin } from "../config/supabase.js";
import { getDateKey } from "../utils/attendance.js";

const router = express.Router();
const allowedAccessStatuses = new Set(["pending", "approved", "disabled"]);
const allowedAttendanceStatuses = new Set(["Present", "Late", "Leave", "Early Leave"]);
const IST_OFFSET_MINUTES = 5 * 60 + 30;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function toAccessLabel(accessStatus) {
  if (accessStatus === "approved") return "approved";
  if (accessStatus === "disabled") return "disabled";
  return "pending";
}

function applyFilters(query, { fromDate, toDate, status, userId, name }) {
  let next = query;
  if (fromDate) next = next.gte("attendance_date", fromDate);
  if (toDate) next = next.lte("attendance_date", toDate);
  if (status) next = next.eq("status", status);
  if (userId) next = next.eq("user_id", userId);
  if (name) next = next.ilike("profiles.full_name", `%${name}%`);
  return next;
}

function combineDateAndTimeIso(dateValue, timeValue) {
  const dateText = String(dateValue || "").trim();
  const timeText = String(timeValue || "").trim();
  if (!dateText || !timeText) return null;

  const dateMatch = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = timeText.match(/^(\d{2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  const utcMillis = Date.UTC(year, month - 1, day, hours, minutes) - IST_OFFSET_MINUTES * 60 * 1000;
  const composed = new Date(utcMillis);
  if (Number.isNaN(composed.getTime())) return null;
  return composed.toISOString();
}

router.get("/interns", async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id,full_name,email,access_status")
    .eq("role", "Intern")
    .order("full_name", { ascending: true });

  if (error) return res.status(500).json({ message: error.message });

  res.json({ interns: (data || []).map((intern) => ({ ...intern, access_status: toAccessLabel(intern.access_status) })) });
});

router.patch("/interns/:internId/access", async (req, res) => {
  const { internId } = req.params;
  const nextStatus = String(req.body?.accessStatus || "").toLowerCase();

  if (!allowedAccessStatuses.has(nextStatus)) {
    return res.status(400).json({ message: "accessStatus must be pending, approved, or disabled" });
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ access_status: nextStatus })
    .eq("id", internId)
    .eq("role", "Intern")
    .select("id,full_name,email,access_status")
    .maybeSingle();

  if (error) return res.status(500).json({ message: error.message });
  if (!data) return res.status(404).json({ message: "Intern not found" });

  res.json({
    intern: { ...data, access_status: toAccessLabel(data.access_status) },
    message: `Intern login access ${nextStatus}.`,
  });
});

router.patch("/interns/:internId", async (req, res) => {
  const { internId } = req.params;
  const fullName = String(req.body?.fullName || "").trim();
  const email = normalizeEmail(req.body?.email);
  const accessStatus = String(req.body?.accessStatus || "").toLowerCase();

  if (!fullName || !email) {
    return res.status(400).json({ message: "fullName and email are required" });
  }

  if (!allowedAccessStatuses.has(accessStatus)) {
    return res.status(400).json({ message: "accessStatus must be pending, approved, or disabled" });
  }

  const { data: existingIntern, error: existingInternError } = await supabaseAdmin
    .from("profiles")
    .select("id,email")
    .eq("id", internId)
    .eq("role", "Intern")
    .maybeSingle();

  if (existingInternError) return res.status(500).json({ message: existingInternError.message });
  if (!existingIntern) return res.status(404).json({ message: "Intern not found" });

  const emailChanged = existingIntern.email !== email;

  if (emailChanged) {
    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(internId, {
      email,
    });

    if (authUpdateError) {
      return res.status(400).json({ message: authUpdateError.message || "Failed to update auth email" });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({
      full_name: fullName,
      email,
      access_status: accessStatus,
    })
    .eq("id", internId)
    .eq("role", "Intern")
    .select("id,full_name,email,access_status")
    .maybeSingle();

  if (error) {
    if (emailChanged) {
      await supabaseAdmin.auth.admin.updateUserById(internId, {
        email: existingIntern.email,
      });
    }

    return res.status(500).json({ message: error.message });
  }

  if (!data) return res.status(404).json({ message: "Intern not found" });

  res.json({
    intern: { ...data, access_status: toAccessLabel(data.access_status) },
    message: "Intern details updated.",
  });
});

router.delete("/interns/:internId", async (req, res) => {
  const { internId } = req.params;

  const { data: existingIntern, error: existingInternError } = await supabaseAdmin
    .from("profiles")
    .select("id,full_name")
    .eq("id", internId)
    .eq("role", "Intern")
    .maybeSingle();

  if (existingInternError) return res.status(500).json({ message: existingInternError.message });
  if (!existingIntern) return res.status(404).json({ message: "Intern not found" });

  const { error: attendanceDeleteError } = await supabaseAdmin
    .from("attendance")
    .delete()
    .eq("user_id", internId);

  if (attendanceDeleteError) {
    return res.status(500).json({ message: attendanceDeleteError.message });
  }

  const { error: profileDeleteError } = await supabaseAdmin
    .from("profiles")
    .delete()
    .eq("id", internId)
    .eq("role", "Intern");

  if (profileDeleteError) {
    return res.status(500).json({ message: profileDeleteError.message });
  }

  const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(internId);
  if (authDeleteError) {
    return res.status(500).json({ message: authDeleteError.message || "Failed to delete auth user" });
  }

  res.json({ message: `${existingIntern.full_name} deleted.` });
});

router.get("/stats", async (_req, res) => {
  const today = getDateKey(new Date());
  const [{ count: totalInterns }, { data: records }] = await Promise.all([
    supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }).eq("role", "Intern"),
    supabaseAdmin
      .from("attendance")
      .select("status")
      .eq("attendance_date", today),
  ]);

  const presentToday = (records || []).filter((r) => r.status === "Present").length;
  const lateToday = (records || []).filter((r) => r.status === "Late").length;
  const leaveToday = (records || []).filter((r) => r.status === "Leave").length;
  const earlyLeaveToday = (records || []).filter((r) => r.status === "Early Leave").length;

  res.json({
    stats: {
      totalInterns: totalInterns || 0,
      presentToday,
      lateToday,
      leaveToday,
      earlyLeaveToday,
    },
  });
});

router.get("/attendance", async (req, res) => {
  const { fromDate, toDate, status, userId, name } = req.query;

  let query = supabaseAdmin
    .from("attendance")
    .select(
      "id,attendance_date,login_time,logout_time,status,work_description,location_lat,location_lon,location_valid,profiles!inner(id,full_name,email)"
    )
    .order("attendance_date", { ascending: false });

  query = applyFilters(query, { fromDate, toDate, status, userId, name });
  const { data, error } = await query;
  if (error) return res.status(500).json({ message: error.message });
  res.json({ records: data || [] });
});

router.post("/attendance", async (req, res) => {
  const userId = String(req.body?.userId || "").trim();
  const attendanceDate = String(req.body?.attendanceDate || "").trim();
  const status = String(req.body?.status || "").trim();
  const workDescription = String(req.body?.workDescription || "").trim();
  const loginTime = combineDateAndTimeIso(attendanceDate, req.body?.loginTime);
  const logoutTime = combineDateAndTimeIso(attendanceDate, req.body?.logoutTime);
  const locationValid = Boolean(req.body?.locationValid);

  if (!userId || !attendanceDate || !allowedAttendanceStatuses.has(status)) {
    return res.status(400).json({ message: "userId, attendanceDate, and valid status are required" });
  }

  const { data: intern, error: internError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .eq("role", "Intern")
    .maybeSingle();

  if (internError) return res.status(500).json({ message: internError.message });
  if (!intern) return res.status(404).json({ message: "Intern not found" });

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("attendance")
    .select("id")
    .eq("user_id", userId)
    .eq("attendance_date", attendanceDate)
    .maybeSingle();

  if (existingError) return res.status(500).json({ message: existingError.message });
  if (existing) return res.status(409).json({ message: "Attendance already exists for this intern and date" });

  const payload = {
    user_id: userId,
    attendance_date: attendanceDate,
    login_time: loginTime,
    logout_time: logoutTime,
    status,
    work_description: workDescription,
    location_valid: locationValid,
  };

  const { data, error } = await supabaseAdmin
    .from("attendance")
    .insert(payload)
    .select(
      "id,attendance_date,login_time,logout_time,status,work_description,location_lat,location_lon,location_valid,profiles!inner(id,full_name,email)"
    )
    .single();

  if (error) return res.status(500).json({ message: error.message });

  res.status(201).json({ record: data, message: "Attendance record added." });
});

router.patch("/attendance/:recordId", async (req, res) => {
  const { recordId } = req.params;
  const status = String(req.body?.status || "").trim();
  const workDescription = String(req.body?.workDescription || "").trim();

  if (!allowedAttendanceStatuses.has(status)) {
    return res.status(400).json({ message: "Invalid attendance status" });
  }

  const { data, error } = await supabaseAdmin
    .from("attendance")
    .update({
      status,
      work_description: workDescription,
    })
    .eq("id", recordId)
    .select(
      "id,attendance_date,login_time,logout_time,status,work_description,location_lat,location_lon,location_valid,profiles!inner(id,full_name,email)"
    )
    .maybeSingle();

  if (error) return res.status(500).json({ message: error.message });
  if (!data) return res.status(404).json({ message: "Attendance record not found" });

  res.json({ record: data, message: "Attendance record updated." });
});

router.delete("/attendance/:recordId", async (req, res) => {
  const { recordId } = req.params;

  const { error } = await supabaseAdmin
    .from("attendance")
    .delete()
    .eq("id", recordId);

  if (error) return res.status(500).json({ message: error.message });

  res.json({ message: "Attendance record deleted." });
});

router.get("/export", async (req, res) => {
  const { format = "csv", fromDate, toDate, status, userId, name } = req.query;

  let query = supabaseAdmin
    .from("attendance")
    .select(
      "attendance_date,login_time,logout_time,status,work_description,location_lat,location_lon,location_valid,profiles!inner(full_name,email)"
    )
    .order("attendance_date", { ascending: false });

  query = applyFilters(query, { fromDate, toDate, status, userId, name });
  const { data, error } = await query;
  if (error) return res.status(500).json({ message: error.message });

  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Attendance");
    sheet.columns = [
      { header: "Name", key: "name", width: 22 },
      { header: "Email", key: "email", width: 24 },
      { header: "Date", key: "date", width: 14 },
      { header: "Login Time", key: "login", width: 24 },
      { header: "Logout Time", key: "logout", width: 24 },
      { header: "Status", key: "status", width: 14 },
      { header: "Work Description", key: "work", width: 30 },
      { header: "Location", key: "location", width: 28 },
      { header: "Location Valid", key: "valid", width: 14 },
    ];
    (data || []).forEach((row) => {
      sheet.addRow({
        name: row.profiles.full_name,
        email: row.profiles.email,
        date: row.attendance_date,
        login: row.login_time || "",
        logout: row.logout_time || "",
        status: row.status,
        work: row.work_description || "",
        location: `${row.location_lat || ""}, ${row.location_lon || ""}`,
        valid: row.location_valid ? "Yes" : "No",
      });
    });
    res.setHeader("Content-Disposition", "attachment; filename=attendance.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    await workbook.xlsx.write(res);
    return res.end();
  }

  const header = [
    "Name",
    "Email",
    "Date",
    "Login Time",
    "Logout Time",
    "Status",
    "Work Description",
    "Location",
    "Location Valid",
  ];
  const rows = (data || []).map((row) =>
    [
      row.profiles.full_name,
      row.profiles.email,
      row.attendance_date,
      row.login_time || "",
      row.logout_time || "",
      row.status,
      row.work_description || "",
      `${row.location_lat || ""}, ${row.location_lon || ""}`,
      row.location_valid ? "Yes" : "No",
    ]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(",")
  );
  res.setHeader("Content-Disposition", "attachment; filename=attendance.csv");
  res.setHeader("Content-Type", "text/csv");
  res.send([header.join(","), ...rows].join("\n"));
});

router.get("/weekly-summary", async (_req, res) => {
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);
  const fromDate = sevenDaysAgo.toISOString().slice(0, 10);
  const toDate = today.toISOString().slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from("attendance")
    .select("attendance_date,status")
    .gte("attendance_date", fromDate)
    .lte("attendance_date", toDate);

  if (error) return res.status(500).json({ message: error.message });

  const grouped = {};
  (data || []).forEach((row) => {
    if (!grouped[row.attendance_date]) {
      grouped[row.attendance_date] = { date: row.attendance_date, Present: 0, Late: 0, Leave: 0, EarlyLeave: 0 };
    }
    if (row.status === "Early Leave") grouped[row.attendance_date].EarlyLeave += 1;
    else grouped[row.attendance_date][row.status] += 1;
  });
  res.json({ weekly: Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date)) });
});

export default router;
