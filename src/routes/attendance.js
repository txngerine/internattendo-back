import express from "express";
import { supabaseAdmin } from "../config/supabase.js";
import {
  getAttendanceStatusForLogin,
  getDateKey,
  isValidLatitude,
  isValidLongitude,
  isEarlyLogout,
  isWithinGeofence,
} from "../utils/attendance.js";

const router = express.Router();
const officeLat = Number(process.env.OFFICE_LAT || 0);
const officeLon = Number(process.env.OFFICE_LON || 0);
const officeRadiusMeters = Number(process.env.OFFICE_RADIUS_METERS || 200);

router.get("/today", async (req, res) => {
  const dateKey = getDateKey(new Date());
  const { data, error } = await supabaseAdmin
    .from("attendance")
    .select("*")
    .eq("user_id", req.user.id)
    .eq("attendance_date", dateKey)
    .maybeSingle();

  if (error) return res.status(500).json({ message: error.message });
  return res.json({ attendance: data });
});

router.post("/check-in", async (req, res) => {
  const { workDescription, latitude, longitude } = req.body;
  if (!workDescription || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ message: "workDescription, latitude and longitude are required" });
  }
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!isValidLatitude(lat) || !isValidLongitude(lon)) {
    return res.status(400).json({ message: "Invalid device GPS coordinates" });
  }

  const now = new Date();
  const dateKey = getDateKey(now);
  const { data: existing } = await supabaseAdmin
    .from("attendance")
    .select("id")
    .eq("user_id", req.user.id)
    .eq("attendance_date", dateKey)
    .maybeSingle();

  if (existing) {
    return res.status(409).json({ message: "Already checked in for today" });
  }

  const inRange = isWithinGeofence(
    lat,
    lon,
    officeLat,
    officeLon,
    officeRadiusMeters
  );
  const status = inRange ? getAttendanceStatusForLogin(now) : "Leave";

  const payload = {
    user_id: req.user.id,
    attendance_date: dateKey,
    login_time: now.toISOString(),
    status,
    work_description: workDescription,
    location_lat: lat,
    location_lon: lon,
    location_valid: inRange,
  };

  const { data, error } = await supabaseAdmin.from("attendance").insert(payload).select("*").single();
  if (error) return res.status(500).json({ message: error.message });
  return res.status(201).json({ attendance: data });
});

router.post("/check-out", async (req, res) => {
  const now = new Date();
  const dateKey = getDateKey(now);
  const { data: attendance, error: fetchError } = await supabaseAdmin
    .from("attendance")
    .select("*")
    .eq("user_id", req.user.id)
    .eq("attendance_date", dateKey)
    .maybeSingle();

  if (fetchError) return res.status(500).json({ message: fetchError.message });
  if (!attendance) return res.status(404).json({ message: "No check-in found for today" });
  if (attendance.logout_time) return res.status(409).json({ message: "Already checked out" });

  const early = isEarlyLogout(now);
  let nextStatus = attendance.status;
  if (attendance.status !== "Leave" && early) nextStatus = "Early Leave";

  const { data, error } = await supabaseAdmin
    .from("attendance")
    .update({
      logout_time: now.toISOString(),
      status: nextStatus,
    })
    .eq("id", attendance.id)
    .select("*")
    .single();

  if (error) return res.status(500).json({ message: error.message });
  return res.json({ attendance: data });
});

router.patch("/work", async (req, res) => {
  const { workDescription } = req.body;
  if (!workDescription) return res.status(400).json({ message: "workDescription is required" });

  const dateKey = getDateKey(new Date());
  const { data: attendance } = await supabaseAdmin
    .from("attendance")
    .select("id")
    .eq("user_id", req.user.id)
    .eq("attendance_date", dateKey)
    .maybeSingle();

  if (!attendance) return res.status(404).json({ message: "No attendance record found for today" });

  const { data, error } = await supabaseAdmin
    .from("attendance")
    .update({ work_description: workDescription })
    .eq("id", attendance.id)
    .select("*")
    .single();

  if (error) return res.status(500).json({ message: error.message });
  return res.json({ attendance: data });
});

export default router;
