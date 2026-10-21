-- Official travel records tracked separately from leave applications.

create table "official_travels" (
  "id" text not null primary key,
  "school_id" text not null references "schools" ("id") on delete cascade,
  "employee_id" text not null references "employees" ("id") on delete cascade,
  "reference_no" text,
  "destination" text not null,
  "purpose" text,
  "start_date" text not null,
  "end_date" text not null,
  "days" real not null,
  "status" text not null default 'planned' check ("status" in ('planned', 'approved', 'completed', 'cancelled')),
  "remarks" text,
  "created_at" integer not null default (unixepoch()),
  "updated_at" integer not null default (unixepoch())
);

create index "official_travels_school_idx" on "official_travels" ("school_id", "start_date");
create index "official_travels_employee_idx" on "official_travels" ("employee_id", "start_date");
create index "official_travels_status_idx" on "official_travels" ("status");
