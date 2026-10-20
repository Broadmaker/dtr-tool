-- AO II workspace model. No payroll data: this stores attendance, leave, and
-- audit records only. Every row that belongs to a school is scoped by school_id
-- so API queries can enforce tenant isolation.

create table "schools" (
  "id" text not null primary key,
  "name" text not null,
  "school_code" text unique,
  "division" text,
  "region" text,
  "created_at" integer not null default (unixepoch()),
  "updated_at" integer not null default (unixepoch())
);

create table "school_members" (
  "id" text not null primary key,
  "school_id" text not null references "schools" ("id") on delete cascade,
  "user_id" text not null references "user" ("id") on delete cascade,
  "role" text not null check ("role" in ('owner', 'admin', 'ao', 'encoder', 'viewer')),
  "created_at" integer not null default (unixepoch()),
  unique ("school_id", "user_id")
);

create index "school_members_user_idx" on "school_members" ("user_id");

create table "employees" (
  "id" text not null primary key,
  "school_id" text not null references "schools" ("id") on delete cascade,
  "employee_no" text,
  "first_name" text not null,
  "middle_name" text,
  "last_name" text not null,
  "suffix" text,
  "position" text,
  "is_active" integer not null default 1,
  "created_at" integer not null default (unixepoch()),
  "updated_at" integer not null default (unixepoch()),
  unique ("school_id", "employee_no")
);

create index "employees_school_idx" on "employees" ("school_id", "last_name", "first_name");

create table "holidays" (
  "id" text not null primary key,
  "school_id" text references "schools" ("id") on delete cascade,
  "holiday_date" text not null,
  "name" text not null,
  "type" text not null check ("type" in ('regular', 'special', 'local')),
  "created_at" integer not null default (unixepoch()),
  unique ("school_id", "holiday_date", "name")
);

create index "holidays_date_idx" on "holidays" ("holiday_date");

create table "leave_types" (
  "id" text not null primary key,
  "school_id" text references "schools" ("id") on delete cascade,
  "code" text not null,
  "name" text not null,
  "requires_credits" integer not null default 1,
  "created_at" integer not null default (unixepoch()),
  unique ("school_id", "code")
);

create table "leave_credits" (
  "id" text not null primary key,
  "employee_id" text not null references "employees" ("id") on delete cascade,
  "leave_type_id" text not null references "leave_types" ("id"),
  "year" integer not null,
  "earned" real not null default 0,
  "used" real not null default 0,
  "created_at" integer not null default (unixepoch()),
  "updated_at" integer not null default (unixepoch()),
  unique ("employee_id", "leave_type_id", "year")
);

create table "leave_applications" (
  "id" text not null primary key,
  "employee_id" text not null references "employees" ("id") on delete cascade,
  "leave_type_id" text not null references "leave_types" ("id"),
  "start_date" text not null,
  "end_date" text not null,
  "days" real not null,
  "status" text not null default 'draft' check ("status" in ('draft', 'submitted', 'approved', 'rejected', 'cancelled')),
  "remarks" text,
  "filed_at" integer,
  "decided_at" integer,
  "decided_by" text references "user" ("id") on delete set null,
  "created_at" integer not null default (unixepoch()),
  "updated_at" integer not null default (unixepoch())
);

create index "leave_applications_employee_idx" on "leave_applications" ("employee_id", "start_date");
create index "leave_applications_status_idx" on "leave_applications" ("status");

create table "dtr_periods" (
  "id" text not null primary key,
  "school_id" text not null references "schools" ("id") on delete cascade,
  "employee_id" text not null references "employees" ("id") on delete cascade,
  "year" integer not null,
  "month" integer not null check ("month" between 1 and 12),
  "status" text not null default 'draft' check ("status" in ('draft', 'reviewed', 'approved', 'locked')),
  "locked_at" integer,
  "created_at" integer not null default (unixepoch()),
  "updated_at" integer not null default (unixepoch()),
  unique ("employee_id", "year", "month")
);

create index "dtr_periods_school_idx" on "dtr_periods" ("school_id", "year", "month");

create table "dtr_days" (
  "id" text not null primary key,
  "period_id" text not null references "dtr_periods" ("id") on delete cascade,
  "work_date" text not null,
  "am_in" text,
  "am_out" text,
  "pm_in" text,
  "pm_out" text,
  "day_type" text not null default 'work' check ("day_type" in ('work', 'holiday', 'leave', 'weekend', 'half_day')),
  "leave_application_id" text references "leave_applications" ("id") on delete set null,
  "remarks" text,
  "source" text not null default 'import' check ("source" in ('import', 'manual', 'correction')),
  "created_at" integer not null default (unixepoch()),
  "updated_at" integer not null default (unixepoch()),
  unique ("period_id", "work_date")
);

create index "dtr_days_date_idx" on "dtr_days" ("work_date");

create table "audit_log" (
  "id" text not null primary key,
  "school_id" text not null references "schools" ("id") on delete cascade,
  "actor_user_id" text not null references "user" ("id") on delete cascade,
  "action" text not null,
  "entity_type" text not null,
  "entity_id" text,
  "meta_json" text,
  "created_at" integer not null default (unixepoch())
);

create index "audit_log_school_idx" on "audit_log" ("school_id", "created_at");
