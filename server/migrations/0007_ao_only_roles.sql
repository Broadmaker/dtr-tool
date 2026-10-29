-- AO-only role model for now. Every school membership becomes an AO; the
-- system administrator is tracked separately in system_admins. Other roles
-- (owner/admin/encoder/viewer) are retired until principals/employees ship.

update "school_members"
set "role" = 'ao'
where "role" <> 'ao';
