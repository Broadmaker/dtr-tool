-- Global CSC leave types available to every school. Schools can add their own
-- codes on top; global rows cannot be edited through the school API.
create unique index if not exists "leave_types_global_code_idx"
  on "leave_types" ("code") where "school_id" is null;

insert into "leave_types" ("id", "school_id", "code", "name", "requires_credits")
values
  ('lt-global-vl', null, 'VL', 'Vacation Leave', 1),
  ('lt-global-sl', null, 'SL', 'Sick Leave', 1),
  ('lt-global-spl', null, 'SPL', 'Special Privilege Leave', 1),
  ('lt-global-ml', null, 'ML', 'Maternity Leave', 0),
  ('lt-global-pl', null, 'PL', 'Paternity Leave', 0),
  ('lt-global-slpl', null, 'SLPL', 'Solo Parent Leave', 0),
  ('lt-global-stl', null, 'STL', 'Study Leave', 1),
  ('lt-global-el', null, 'EL', 'Emergency Leave', 0)
on conflict do nothing;
