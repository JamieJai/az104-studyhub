/**
 * AZ-104 Study Hub — 진도 API (D1). 세션 쿠키의 사용자 기준. 서버가 유일한 기준이다.
 *
 * GET    /api/progress → { progress:{source:{...}}, examRuns:[...], session:{...}, savedAt }
 * POST   /api/progress → 변경분 저장. 본문 { records:{source:{...}}, session:{...}, examRuns:[...] }
 *                        문항 행은 updated_at 이 큰 쪽이 이긴다 → 기기 간 자동 병합.
 * DELETE /api/progress → 내 진도·세션·모의고사 기록 전부 삭제 (초기화)
 */
import { json, readJson } from "../_lib/auth.js";

const MAX_RECORDS = 1000;

export async function onRequestGet({ data, env }) {
  const uid = data.user.uid;
  const [rows, ses, runs] = await Promise.all([
    env.DB.prepare("SELECT source, data, updated_at FROM progress WHERE user_id = ?").bind(uid).all(),
    env.DB.prepare("SELECT data, updated_at FROM study_session WHERE user_id = ?").bind(uid).first(),
    env.DB.prepare("SELECT run_id, data FROM exam_runs WHERE user_id = ? ORDER BY at").bind(uid).all(),
  ]);
  const progress = {};
  let savedAt = ses?.updated_at || null;
  for (const r of rows.results || []) {
    try { progress[String(r.source)] = JSON.parse(r.data); } catch { /* skip */ }
    if (!savedAt || r.updated_at > savedAt) savedAt = r.updated_at;
  }
  const examRuns = [];
  for (const r of runs.results || []) {
    try { const run = JSON.parse(r.data); if (!run.id) run.id = r.run_id; examRuns.push(run); } catch { /* skip */ }
  }
  let session = null;
  try { session = ses ? JSON.parse(ses.data) : null; } catch { session = null; }
  return json({ found: Object.keys(progress).length > 0 || !!session, progress, examRuns, session, savedAt });
}

export async function onRequestPost({ request, data, env }) {
  const uid = data.user.uid;
  const body = await readJson(request);
  if (!body || typeof body !== "object") return json({ error: "bad_json" }, 400);
  const now = new Date().toISOString();
  const stmts = [];

  const records = body.records && typeof body.records === "object" ? body.records : {};
  const keys = Object.keys(records);
  if (keys.length > MAX_RECORDS) return json({ error: "too_many_records" }, 413);
  for (const k of keys) {
    const source = Number(k);
    const rec = records[k];
    if (!Number.isInteger(source) || !rec || typeof rec !== "object") continue;
    const text = JSON.stringify(rec);
    if (text.length > 8000) continue;
    const at = typeof rec.updatedAt === "string" ? rec.updatedAt : now;
    stmts.push(env.DB.prepare(
      "INSERT INTO progress (user_id, source, data, updated_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(user_id, source) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at " +
      "WHERE excluded.updated_at >= progress.updated_at"
    ).bind(uid, source, text, at));
  }

  if (body.session && typeof body.session === "object") {
    const text = JSON.stringify(body.session);
    if (text.length <= 64000) {
      stmts.push(env.DB.prepare(
        "INSERT OR REPLACE INTO study_session (user_id, data, updated_at) VALUES (?, ?, ?)"
      ).bind(uid, text, now));
    }
  }

  for (const run of Array.isArray(body.examRuns) ? body.examRuns.slice(-30) : []) {
    if (!run || typeof run !== "object") continue;
    const id = String(run.id || run.at || run.finishedAt || "");
    if (!id) continue;
    stmts.push(env.DB.prepare(
      "INSERT OR IGNORE INTO exam_runs (user_id, run_id, data, at) VALUES (?, ?, ?, ?)"
    ).bind(uid, id, JSON.stringify(run), run.at || run.finishedAt || now));
  }

  if (!stmts.length) return json({ ok: true, written: 0, savedAt: now });
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
  const { c } = await env.DB.prepare("SELECT COUNT(*) AS c FROM progress WHERE user_id = ?").bind(uid).first();
  return json({ ok: true, written: stmts.length, count: c, savedAt: now });
}

export async function onRequestDelete({ data, env }) {
  const uid = data.user.uid;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM progress WHERE user_id = ?").bind(uid),
    env.DB.prepare("DELETE FROM study_session WHERE user_id = ?").bind(uid),
    env.DB.prepare("DELETE FROM exam_runs WHERE user_id = ?").bind(uid),
  ]);
  return json({ ok: true });
}
