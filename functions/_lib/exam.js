/**
 * 시험 종류 — 진도·세션·모의고사·신고를 시험별로 나눠 저장한다.
 * 새 시험을 추가하면 여기 EXAMS 에 넣고, dist/<폴더>/app.js 가 ?exam=<id> 로 부른다.
 */
import { json } from "./auth.js";

export const EXAMS = {
  az104: { title: "AZ-104", path: "/AZ-104_CBT/" },
  az802: { title: "AZ-802", path: "/AZ-802_CBT/" },
  sc300: { title: "SC-300", path: "/SC-300_CBT/" },
  az305: { title: "AZ-305", path: "/AZ-305_CBT/" },
  az900: { title: "AZ-900", path: "/AZ-900_CBT/" },
  ai103: { title: "AI-103", path: "/AI-103_CBT/" },
  sc100: { title: "SC-100", path: "/SC-100_CBT/" },
};
export const DEFAULT_EXAM = "az104";   // 옛 클라이언트(exam 미지정)는 AZ-104

/** 요청에서 exam 을 읽는다. ?exam= 우선, POST 본문의 exam 도 허용. 모르는 값이면 null. */
export function examOf(request, body) {
  const q = new URL(request.url).searchParams.get("exam");
  const raw = String(q || body?.exam || DEFAULT_EXAM).toLowerCase();
  return EXAMS[raw] ? raw : null;
}

export function badExam() {
  return json({ error: "bad_exam", allowed: Object.keys(EXAMS) }, 400);
}
