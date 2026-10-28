CREATE TABLE training_plans (id TEXT PRIMARY KEY, sport TEXT NOT NULL, status TEXT NOT NULL, revision INTEGER NOT NULL, spec TEXT NOT NULL);
CREATE UNIQUE INDEX one_open_plan_per_sport ON training_plans(sport) WHERE status IN ('active','paused');
ALTER TABLE records ADD COLUMN planId TEXT REFERENCES training_plans(id);
CREATE INDEX records_plan_time ON records(planId,occurredAt);
CREATE TABLE widget_links (tokenHash TEXT PRIMARY KEY, planId TEXT NOT NULL UNIQUE REFERENCES training_plans(id));
