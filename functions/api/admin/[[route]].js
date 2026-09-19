/**
 * 관리자 포털 API — /api/admin/*
 *
 * 사용자 계정과 별개로 ADMIN_USER / ADMIN_PASS (기본 admin / admin) 로 로그인한다.
 * 관리자 세션은 az104_admin 쿠키(HMAC JWT, 3시간).
 *
 * POST   /api/admin/login   {name, password}
 * POST   /api/admin/logout
 * GET    /api/admin/overview            → 사용자별 행 수·최근 로그인, 전체 합계
 * GET    /api/admin/reports             → 전체 신고 목록
 * DELETE /api/admin/user?id=N           → 사용자와 그 사용자의 모든 기록 삭제
 * DELETE /api/admin/progress?id=N       → 사용자의 진도·세션·모의고사만 삭제
 * DELETE /api/admin/reports?id=N        → 사용자의 신고 삭제 (id 없으면 전체)
 */
import { json, readJson, readCookie, verifyToken, signToken, SESSION_TTL_S } from "../../_lib/auth.js";

const ADMIN_COOKIE = "az104_admin";

function adminCookie(token, maxAge = SESSION_TTL_S) {
  return `${ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

async function requireAdmin(request, env) {
  const t = readCookie(request, ADMIN_COOKIE);
  if (!t) return null;
  const p = await verifyToken(t, env.AUTH_SECRET);
  return p && p.role === "admin" ? p : null;
}

export async function onRequest({ request, env, params }) {
  const route = (params.route || []).join("/");
  const url = new URL(request.url);
  const method = request.method;
  if (!env.AUTH_SECRET) return json({ error: "auth_secret_missing" }, 503);

  if (route === "login" && method === "POST") {
    const body = await readJson(request);
    const user = env.ADMIN_USER || "admin";
    const pass = env.ADMIN_PASS || "admin";
    if (String(body?.name || "") !== user || String(body?.password || "") !== pass) {
      return json({ error: "bad_credentials" }, 401);
    }
    const now = Math.floor(Date.now() / 1000);
    const token = await signToken({ uid: -1, role: "admin", iat: now, exp: now + SESSION_TTL_S }, env.AUTH_SECRET);
    return json({ ok: true }, 200, { "Set-Cookie": adminCookie(token) });
  }
  if (route === "logout" && method === "POST") {
    return json({ ok: true }, 200, { "Set-Cookie": adminCookie("", 0) });
  }

  const admin = await requireAdmin(request, env);
  if (!admin) return json({ error: "unauthorized" }, 401);

  if (route === "me" && method === "GET") return json({ ok: true });

  if (route === "overview" && method === "GET") {
    const users = await env.DB.prepare(`
      SELECT u.id, u.name, u.created_at, u.last_login,
        (SELECT COUNT(*) FROM progress p WHERE p.user_id = u.id)  AS progress,
        (SELECT COUNT(*) FROM exam_runs e WHERE e.user_id = u.id) AS exam_runs,
        (SELECT COUNT(*) FROM reports r WHERE r.user_id = u.id)   AS reports,
        (SELECT MAX(updated_at) FROM progress p WHERE p.user_id = u.id) AS last_saved
      FROM users u ORDER BY u.id`).all();
    const totals = await env.DB.prepare(`
      SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM progress) AS progress,
             (SELECT COUNT(*) FROM exam_runs) AS exam_runs, (SELECT COUNT(*) FROM reports) AS reports,
             (SELECT COUNT(*) FROM study_session) AS sessions`).first();
    const sizes = await env.DB.prepare(`
      SELECT (SELECT COALESCE(SUM(LENGTH(data)),0) FROM progress) + (SELECT COALESCE(SUM(LENGTH(data)),0) FROM exam_runs)
           + (SELECT COALESCE(SUM(LENGTH(data)),0) FROM reports) + (SELECT COALESCE(SUM(LENGTH(data)),0) FROM study_session) AS bytes`).first();
    const maxUsers = Number(env.MAX_USERS) || null;   // 관리자 화면의 "사용자 n / 최대" 표시용
    return json({ users: users.results || [], totals, approxBytes: sizes?.bytes || 0, maxUsers });
  }

  if (route === "reports" && method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT u.id AS user_id, u.name AS owner, r.exam, r.data FROM reports r JOIN users u ON u.id = r.user_id ORDER BY r.at DESC"
    ).all();
    const list = [];
    for (const r of rows.results || []) { try { list.push({ owner: r.owner, user_id: r.user_id, exam: r.exam, ...JSON.parse(r.data) }); } catch { /* skip */ } }
    return json({ count: list.length, reports: list });
  }

  if (method === "DELETE") {
    const idRaw = url.searchParams.get("id");
    const id = idRaw === null || idRaw.trim() === "" ? null : Number(idRaw);
    const hasId = Number.isInteger(id) && id > 0;
    if (route === "user") {
      if (!hasId) return json({ error: "bad_id" }, 400);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM progress WHERE user_id = ?").bind(id),
        env.DB.prepare("DELETE FROM study_session WHERE user_id = ?").bind(id),
        env.DB.prepare("DELETE FROM exam_runs WHERE user_id = ?").bind(id),
        env.DB.prepare("DELETE FROM reports WHERE user_id = ?").bind(id),
        env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id),
      ]);
      return json({ ok: true, deleted: id });
    }
    if (route === "progress") {
      if (!hasId) return json({ error: "bad_id" }, 400);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM progress WHERE user_id = ?").bind(id),
        env.DB.prepare("DELETE FROM study_session WHERE user_id = ?").bind(id),
        env.DB.prepare("DELETE FROM exam_runs WHERE user_id = ?").bind(id),
      ]);
      return json({ ok: true, cleared: id });
    }
    if (route === "reports") {
      if (hasId) await env.DB.prepare("DELETE FROM reports WHERE user_id = ?").bind(id).run();
      else await env.DB.prepare("DELETE FROM reports").run();
      return json({ ok: true });
    }
  }

  return json({ error: "not_found" }, 404);
}
