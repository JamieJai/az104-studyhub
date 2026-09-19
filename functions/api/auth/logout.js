/** POST /api/auth/logout — 세션 쿠키 제거 */
import { json, clearCookieHeader } from "../../_lib/auth.js";

export async function onRequestPost() {
  return json({ ok: true }, 200, { "Set-Cookie": clearCookieHeader() });
}
