-- 0001: 시험 종류(exam) 컬럼 추가 — AZ-104 와 AZ-802 문항 번호가 겹치므로 기록을 시험별로 분리한다.
-- 기존 행은 전부 'az104'. SQLite 는 PK 를 바꿀 수 없어 테이블을 다시 만든다.
-- 적용 전 백업: npx wrangler d1 export az104-studyhub --remote --output backups/<date>.sql

CREATE TABLE progress_v2 (
  user_id    INTEGER NOT NULL,
  exam       TEXT    NOT NULL DEFAULT 'az104',
  source     INTEGER NOT NULL,
  data       TEXT    NOT NULL,
  updated_at TEXT    NOT NULL,
  PRIMARY KEY (user_id, exam, source)
);
INSERT INTO progress_v2 (user_id, exam, source, data, updated_at)
  SELECT user_id, 'az104', source, data, updated_at FROM progress;
DROP TABLE progress;
ALTER TABLE progress_v2 RENAME TO progress;
CREATE INDEX IF NOT EXISTS idx_progress_user ON progress(user_id, updated_at);

CREATE TABLE study_session_v2 (
  user_id    INTEGER NOT NULL,
  exam       TEXT    NOT NULL DEFAULT 'az104',
  data       TEXT    NOT NULL,
  updated_at TEXT    NOT NULL,
  PRIMARY KEY (user_id, exam)
);
INSERT INTO study_session_v2 (user_id, exam, data, updated_at)
  SELECT user_id, 'az104', data, updated_at FROM study_session;
DROP TABLE study_session;
ALTER TABLE study_session_v2 RENAME TO study_session;

CREATE TABLE exam_runs_v2 (
  user_id    INTEGER NOT NULL,
  exam       TEXT    NOT NULL DEFAULT 'az104',
  run_id     TEXT    NOT NULL,
  data       TEXT    NOT NULL,
  at         TEXT    NOT NULL,
  PRIMARY KEY (user_id, exam, run_id)
);
INSERT INTO exam_runs_v2 (user_id, exam, run_id, data, at)
  SELECT user_id, 'az104', run_id, data, at FROM exam_runs;
DROP TABLE exam_runs;
ALTER TABLE exam_runs_v2 RENAME TO exam_runs;

CREATE TABLE reports_v2 (
  user_id    INTEGER NOT NULL,
  exam       TEXT    NOT NULL DEFAULT 'az104',
  source     INTEGER NOT NULL,
  kind       TEXT    NOT NULL,
  data       TEXT    NOT NULL,
  at         TEXT    NOT NULL,
  PRIMARY KEY (user_id, exam, source, kind)
);
INSERT INTO reports_v2 (user_id, exam, source, kind, data, at)
  SELECT user_id, 'az104', source, kind, data, at FROM reports;
DROP TABLE reports;
ALTER TABLE reports_v2 RENAME TO reports;
CREATE INDEX IF NOT EXISTS idx_reports_at ON reports(at);
