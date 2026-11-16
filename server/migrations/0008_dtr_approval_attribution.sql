-- Keep the current review and approval attribution on each DTR period. The
-- immutable audit log remains the history when a period is reopened.

alter table "dtr_periods" add column "reviewed_by" text references "user" ("id") on delete set null;
alter table "dtr_periods" add column "reviewed_at" integer;
alter table "dtr_periods" add column "approved_by" text references "user" ("id") on delete set null;
alter table "dtr_periods" add column "approved_at" integer;

