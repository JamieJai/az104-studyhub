-- AZ-104 Study Hub — D1 스키마
-- 사용자·진도·북마크·모의고사 기록·학습 세션·오답 신고. 모두 서버가 유일한 기준이다.

CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,          -- 로그인 이름 (영문·숫자·_-, 3~64자)
  pass_hash  TEXT NOT NULL,                 -- sha256(salt + password) hex
  salt       TEXT NOT NULL,
  is_admin   INTEGER NOT NULL DEFAULT 0,    -- 첫 가입자 = 관리자
  created_at TEXT NOT NULL,
  last_login TEXT
);

-- 문항별 진도: 사용자×문항당 1행. 기기 간 병합은 updated_at 이 큰 쪽이 이긴다.
CREATE TABLE IF NOT EXISTS progress (
  user_id    INTEGER NOT NULL,
  source     INTEGER NOT NULL,              -- 원본 문항 번호
  data       TEXT NOT NULL,                 -- {result, selected, attempts, bookmarked, ...} JSON
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, source)
);

-- 학습 세션(현재 큐·위치·필터) — 사용자당 1행
CREATE TABLE IF NOT EXISTS study_session (
  user_id    INTEGER PRIMARY KEY,
  data       TEXT NOT NULL,                 -- {queue, cursor, filter, order, bookmarks} JSON
  updated_at TEXT NOT NULL
);

-- 모의고사 회차 기록
CREATE TABLE IF NOT EXISTS exam_runs (
  user_id    INTEGER NOT NULL,
  run_id     TEXT NOT NULL,                 -- 클라이언트가 만든 id (없으면 at)
  data       TEXT NOT NULL,
  at         TEXT NOT NULL,
  PRIMARY KEY (user_id, run_id)
);

-- 오답 신고: 같은 문항·같은 유형은 최신 것으로 대체
CREATE TABLE IF NOT EXISTS reports (
  user_id    INTEGER NOT NULL,
  source     INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  data       TEXT NOT NULL,
  at         TEXT NOT NULL,
  PRIMARY KEY (user_id, source, kind)
);

CREATE INDEX IF NOT EXISTS idx_progress_user ON progress(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_reports_at ON reports(at);
