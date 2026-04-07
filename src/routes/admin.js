import express from "express";
import ExcelJS from "exceljs";
import { supabaseAdmin } from "../config/supabase.js";

const router = express.Router();

function applyFilters(query, { fromDate, toDate, status, userId, name }) {
  let next = query;
  if (fromDate) next = next.gte("attendance_date", fromDate);
  if (toDate) next = next.lte("attendance_date", toDate);
  if (status) next = next.eq("status", status);
  if (userId) next = next.eq("user_id", userId);
  if (name) next = next.ilike("profiles.full_name", `%${name}%`);
  return next;
}

router.get("/stats", async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
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
