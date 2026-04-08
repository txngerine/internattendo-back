import { supabaseAdmin } from "../config/supabase.js";

function getAccessMessage(accessStatus) {
  if (accessStatus === "disabled") {
    return "Your account has been disabled. Contact an admin.";
  }

  return "Your account is pending admin approval.";
}

function isSupabaseNetworkError(error) {
  const code = error?.cause?.code || error?.code;
  return code === "UND_ERR_CONNECT_TIMEOUT" || code === "UND_ERR_CONNECT";
}

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing token" });
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id,email,full_name,role,access_status")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return res.status(403).json({ message: "Profile not found" });
    }

    if (profile.role === "Intern" && profile.access_status !== "approved") {
      return res.status(403).json({ message: getAccessMessage(profile.access_status) });
    }

    req.user = profile;
    req.token = token;
    next();
  } catch (error) {
    if (isSupabaseNetworkError(error)) {
      return res.status(503).json({ message: "Auth service temporarily unavailable. Please retry." });
    }

    return res.status(500).json({ message: "Authentication failed" });
  }
}
