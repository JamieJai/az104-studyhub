/**
 * AZ-104 Study Hub — 오답 신고 API (D1). 세션 사용자 기준.
 *
 * GET    /api/report          → 내 신고 목록
 * POST   /api/report          → 신고 등록 (같은 문항·같은 유형은 최신 것으로 대체)
 * DELETE /api/report          → 내 신고 전부 삭제
 */
import { json, readJson } from "../_lib/auth.js";

const MAX_NOTE = 600;

export async function onRequestGet({ request, data, env }) {
  const url = new URL(request.url);
  if (url.searchParams.get("all") === "1") {   // 전체 조회는 /api/admin/reports 로 옮겼다
    return json({ error: "forbidden" }, 403);
    const rows = await env.DB.prepare(
      "SELECT u.name AS owner, r.data FROM reports r JOIN users u ON u.id = r.user_id ORDER BY u.name, r.at"
    ).all();
    const byOwner = new Map();
    for (const r of rows.results || []) {
      if (!byOwner.has(r.owner)) byOwner.set(r.owner, []);
      try { byOwner.get(r.owner).push(JSON.parse(r.data)); } catch { /* skip */ }
    }
    const out = [...byOwner.entries()].map(([owner, reports]) => ({ owner, reports }));
    return json({ users: out.length, data: out });
  }
  const rows = await env.DB.prepare("SELECT data FROM reports WHERE user_id = ? ORDER BY at").bind(data.user.uid).all();
  const reports = [];
  for (const r of rows.results || []) { try { reports.push(JSON.parse(r.data)); } catch { /* skip */ } }
  return json({ count: reports.length, reports });
}

export async function onRequestPost({ request, data, env }) {
  const body = await readJson(request);
  const source = Number(body?.source);
  if (!Number.isInteger(source) || source < 1 || source > 999) return json({ error: "bad_source" }, 400);
  const entry = {
    source,
    practice: Number(body?.practice) || null,
    kind: String(body?.kind || "other").slice(0, 40),
    myAnswer: String(body?.myAnswer || "").slice(0, 120),
    graded: String(body?.graded || "").slice(0, 20),
    appAnswer: String(body?.appAnswer || "").slice(0, 120),
    note: String(body?.note || "").slice(0, MAX_NOTE),
    at: new Date().toISOString(),
  };
  await env.DB.prepare(
    "INSERT OR REPLACE INTO reports (user_id, source, kind, data, at) VALUES (?, ?, ?, ?, ?)"
  ).bind(data.user.uid, source, entry.kind, JSON.stringify(entry), entry.at).run();
  const { c } = await env.DB.prepare("SELECT COUNT(*) AS c FROM reports WHERE user_id = ?").bind(data.user.uid).first();
  return json({ ok: true, count: c });
}

export async function onRequestDelete({ data, env }) {
  await env.DB.prepare("DELETE FROM reports WHERE user_id = ?").bind(data.user.uid).run();
  return json({ ok: true });
}
