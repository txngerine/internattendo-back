import express from "express";
import { supabaseAdmin } from "../config/supabase.js";

const router = express.Router();

router.post("/register", async (req, res) => {
  const { fullName, email, password } = req.body;

  if (!fullName || !email || !password) {
    return res.status(400).json({ message: "fullName, email and password are required" });
  }

  const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !createdUser?.user) {
    return res.status(400).json({ message: createError?.message || "Failed to create user" });
  }

  const { error: profileError } = await supabaseAdmin.from("profiles").insert({
    id: createdUser.user.id,
    email,
    full_name: fullName,
    role: "Intern",
  });

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(createdUser.user.id);
    return res.status(400).json({ message: profileError.message });
  }

  return res.status(201).json({ message: "Account created successfully. Please login." });
});

export default router;
