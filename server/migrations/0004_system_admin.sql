-- Global system administrators can access every school. School memberships now
-- carry an approval status; existing memberships remain active.

create table "system_admins" (
  "user_id" text not null primary key references "user" ("id") on delete cascade,
  "created_at" integer not null default (unixepoch())
);

alter table "school_members"
  add column "status" text not null default 'active'
  check ("status" in ('pending', 'active', 'rejected', 'suspended'));

create index "school_members_status_idx" on "school_members" ("status");
