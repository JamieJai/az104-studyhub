/** POST /api/auth/login {name, password} */
import { json, readJson, hashPassword, loginResponse } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const name = String(body?.name || "").trim();
  const password = String(body?.password || "");
  const user = await env.DB.prepare("SELECT id, name, pass_hash, salt, is_admin FROM users WHERE name = ?").bind(name).first();
  if (!user) return json({ error: "bad_credentials" }, 401);
  const h = await hashPassword(password, user.salt);
  if (h !== user.pass_hash) return json({ error: "bad_credentials" }, 401);
  await env.DB.prepare("UPDATE users SET last_login = ? WHERE id = ?").bind(new Date().toISOString(), user.id).run();
  return loginResponse(user, env);
}
