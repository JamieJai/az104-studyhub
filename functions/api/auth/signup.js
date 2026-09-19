/**
 * POST /api/auth/signup  {name, password}
 * 같은 이름의 옛 KV 기록(p:<name>, r:<name>)이 있으면 D1으로 가져온다.
 */
import { json, readJson, NAME_RE, randomHex, hashPassword, loginResponse } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const name = String(body?.name || "").trim();
  const password = String(body?.password || "");
  if (!NAME_RE.test(name)) return json({ error: "invalid_name" }, 400);
  if (password.length < 4 || password.length > 128) return json({ error: "invalid_password" }, 400);

  const exists = await env.DB.prepare("SELECT id FROM users WHERE name = ?").bind(name).first();
  if (exists) return json({ error: "name_taken" }, 409);

  // 가입 인원 제한 (MAX_USERS 환경변수, 없으면 무제한). 로그인 화면이 user_limit 메시지를 알고 있다.
  const maxUsers = Number(env.MAX_USERS);
  if (Number.isInteger(maxUsers) && maxUsers > 0) {
    const { c } = await env.DB.prepare("SELECT COUNT(*) AS c FROM users").first();
    if (c >= maxUsers) return json({ error: "user_limit" }, 403);
  }

  const salt = randomHex(16);
  const pass_hash = await hashPassword(password, salt);
  const now = new Date().toISOString();
  const isAdmin = 0;   // 관리는 /admin 포털이 한다
  const ins = await env.DB.prepare(
    "INSERT INTO users (name, pass_hash, salt, is_admin, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(name, pass_hash, salt, isAdmin, now, now).run();
  const user = { id: ins.meta.last_row_id, name, is_admin: isAdmin };

  const migrated = await migrateFromKv(env, user);
  return loginResponse(user, env, { migrated });
}

/** 옛 KV 진도/신고를 D1으로 옮긴다. 옮긴 건수를 돌려준다. */
async function migrateFromKv(env, user) {
  if (!env.PROGRESS) return null;
  const out = { progress: 0, examRuns: 0, reports: 0 };
  const now = new Date().toISOString();
  try {
    const raw = await env.PROGRESS.get(`p:${user.name}`);
    if (raw) {
      const old = JSON.parse(raw);
      const stmts = [];
      for (const [src, rec] of Object.entries(old.progress || {})) {
        const source = Number(src);
        if (!Number.isInteger(source)) continue;
        stmts.push(env.DB.prepare(
          "INSERT OR REPLACE INTO progress (user_id, exam, source, data, updated_at) VALUES (?, 'az104', ?, ?, ?)"
        ).bind(user.id, source, JSON.stringify(rec), rec?.updatedAt || old.savedAt || now));
        out.progress++;
      }
      for (const run of old.examRuns || []) {
        const id = String(run?.id || run?.at || run?.finishedAt || randomHex(6));
        stmts.push(env.DB.prepare(
          "INSERT OR IGNORE INTO exam_runs (user_id, exam, run_id, data, at) VALUES (?, 'az104', ?, ?, ?)"
        ).bind(user.id, id, JSON.stringify(run), run?.at || run?.finishedAt || now));
        out.examRuns++;
      }
      if (old.session) {
        stmts.push(env.DB.prepare(
          "INSERT OR REPLACE INTO study_session (user_id, exam, data, updated_at) VALUES (?, 'az104', ?, ?)"
        ).bind(user.id, JSON.stringify(old.session), old.savedAt || now));
      }
      for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
    }
    const rraw = await env.PROGRESS.get(`r:${user.name}`);
    if (rraw) {
      const reports = JSON.parse(rraw);
      const stmts = [];
      for (const r of Array.isArray(reports) ? reports : []) {
        if (!Number.isInteger(r?.source)) continue;
        stmts.push(env.DB.prepare(
          "INSERT OR REPLACE INTO reports (user_id, exam, source, kind, data, at) VALUES (?, 'az104', ?, ?, ?, ?)"
        ).bind(user.id, r.source, String(r.kind || "other"), JSON.stringify(r), r.at || now));
        out.reports++;
      }
      if (stmts.length) await env.DB.batch(stmts);
    }
  } catch (e) {
    return { ...out, error: String(e?.message || e) };
  }
  return out;
}
