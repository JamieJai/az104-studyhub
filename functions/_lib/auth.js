/**
 * AZ-104 Study Hub — 인증 공용 모듈
 *
 * - 비밀번호: sha256(salt + password) hex. 개인 학습 도구라 가볍게 간다.
 * - 세션: HMAC-SHA256 서명 토큰(JWT 형식)을 HttpOnly 쿠키에 담는다. 서버 세션 테이블 없음.
 *   만료 3시간, 요청이 있으면 미들웨어가 새 토큰으로 갈아끼워 연장한다.
 * - 서명 키는 Pages 환경변수 AUTH_SECRET (wrangler pages secret put AUTH_SECRET).
 */

export const COOKIE = "az104_auth";
export const SESSION_TTL_S = 3 * 60 * 60;   // 3시간
export const NAME_RE = /^[A-Za-z0-9_-]{3,64}$/;

const enc = new TextEncoder();

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders },
  });
}

function b64u(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64uDecode(str) {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomHex(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(text) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password, salt) {
  return sha256Hex(`${salt}:${password}`);
}

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signToken(payload, secret) {
  const header = b64u(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(`${header}.${body}`));
  return `${header}.${body}.${b64u(sig)}`;
}

export async function verifyToken(token, secret) {
  try {
    const [h, b, s] = String(token || "").split(".");
    if (!h || !b || !s) return null;
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), b64uDecode(s), enc.encode(`${h}.${b}`));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64uDecode(b)));
    if (!payload || typeof payload.uid !== "number" || !payload.exp) return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function tokenPayload(user) {
  const now = Math.floor(Date.now() / 1000);
  return { uid: user.id, name: user.name, adm: user.is_admin ? 1 : 0, iat: now, exp: now + SESSION_TTL_S };
}

export function readCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

export function cookieHeader(token) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_S}`;
}
export function clearCookieHeader() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** 로그인 응답: 토큰을 쿠키로 심어 준다 */
export async function loginResponse(user, env, body = {}) {
  const token = await signToken(tokenPayload(user), env.AUTH_SECRET);
  return json({ ok: true, user: { name: user.name, admin: !!user.is_admin }, ...body }, 200, { "Set-Cookie": cookieHeader(token) });
}

export async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}
