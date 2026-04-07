import { supabaseAdmin } from "../config/supabase.js";

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing token" });
  }

  const token = authHeader.replace("Bearer ", "");
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ message: "Invalid token" });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id,email,full_name,role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return res.status(403).json({ message: "Profile not found" });
  }

  req.user = profile;
  req.token = token;
  next();
}
