/**
 * 전역 미들웨어 — 세션 확인·리다이렉트·세션 연장
 *
 * - 쿠키의 토큰을 검증해 context.data.user 에 넣는다.
 * - 보호 페이지(/map/, /AZ-104_CBT/, /AZ-802_CBT/)로 이동(HTML 요청)하는데 세션이 없으면 / (로그인 화면)으로 보낸다.
 * - /api/* (auth 제외)는 세션 없으면 401.
 * - 로그인된 상태로 / 에 오면 /map/ (자격증 노선도 홈)으로 보낸다.
 * - 토큰이 15분 이상 지났으면 응답에 새 토큰을 실어 3시간을 다시 준다(활동 중이면 안 끊김).
 *
 * 어떤 경로가 이 함수를 거치는지는 dist/_routes.json 이 정한다 (이미지 등 정적 자산은 거치지 않는다).
 */
import { COOKIE, readCookie, verifyToken, signToken, tokenPayload, cookieHeader, json } from "./_lib/auth.js";

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const accept = request.headers.get("Accept") || "";
  const isNav = request.method === "GET" && accept.includes("text/html");

  if (!env.AUTH_SECRET) {
    if (path.startsWith("/api/")) return json({ error: "auth_secret_missing" }, 503);
    return next();
  }

  let user = null;
  const token = readCookie(request, COOKIE);
  if (token) user = await verifyToken(token, env.AUTH_SECRET);
  context.data.user = user;

  // 로그인해야 들어갈 수 있는 페이지 (dist/_routes.json 의 include 와 맞춘다)
  const PROTECTED = ["/map", "/AZ-104_CBT", "/AZ-802_CBT", "/SC-300_CBT", "/AZ-305_CBT", "/AZ-900_CBT", "/AI-103_CBT", "/SC-100_CBT"];
  const protectedPage = PROTECTED.some(p => path === p || path === p + "/" || path === p + "/index.html");
  if (!user && protectedPage && isNav) {
    const nextPath = encodeURIComponent(path + url.search);
    return Response.redirect(`${url.origin}/?next=${nextPath}`, 302);
  }
  if (!user && path.startsWith("/api/") && !path.startsWith("/api/auth/") && !path.startsWith("/api/admin/")) {
    return json({ error: "unauthorized" }, 401);
  }
  if (user && (path === "/" || path === "/index.html") && isNav) {
    const to = url.searchParams.get("next");
    const safe = to && to.startsWith("/") && !to.startsWith("//") ? to : "/map/";
    return Response.redirect(`${url.origin}${safe}`, 302);
  }

  const res = await next();

  // 세션 연장: 15분 넘게 지난 토큰이면 새로 발급
  if (user && Math.floor(Date.now() / 1000) - (user.iat || 0) > 15 * 60) {
    const fresh = await signToken(tokenPayload({ id: user.uid, name: user.name, is_admin: user.adm }, user.lat || user.iat), env.AUTH_SECRET);
    const out = new Response(res.body, res);
    out.headers.append("Set-Cookie", cookieHeader(fresh));
    return out;
  }
  return res;
}
