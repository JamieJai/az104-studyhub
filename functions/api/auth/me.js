/** GET /api/auth/me — 현재 세션 사용자 (없으면 401) */
import { json } from "../../_lib/auth.js";

export async function onRequestGet({ data }) {
  const u = data.user;
  if (!u) return json({ error: "unauthorized" }, 401);
  return json({ user: { name: u.name, admin: !!u.adm, since: u.lat || u.iat || null, exp: u.exp || null } });
}
