import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { requireAuth } from "./middleware/auth.js";
import { requireRole } from "./middleware/role.js";
import authRoutes from "./routes/auth.js";
import attendanceRoutes from "./routes/attendance.js";
import adminRoutes from "./routes/admin.js";
import publicRoutes from "./routes/public.js";

dotenv.config();

const app = express();

const frontendOrigin = process.env.FRONTEND_URL || "http://localhost:5173";

app.use(
  cors({
    origin: frontendOrigin,
    credentials: true,
  })
);
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api/public", publicRoutes);
app.use("/api/auth", requireAuth, authRoutes);
app.use("/api/attendance", requireAuth, requireRole("Intern"), attendanceRoutes);
app.use("/api/admin", requireAuth, requireRole("Admin"), adminRoutes);

export default app;
