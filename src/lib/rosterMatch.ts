// Best-effort match between a parsed DTR employee and the cloud roster.

export interface RosterName {
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix?: string | null;
  employeeNo?: string | null;
}

const collapse = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

/** Lowercase, strip punctuation, collapse whitespace — comparable across formats. */
export function normalizeName(value: string): string {
  return collapse(value.replace(/[.,-]/g, ' '));
}

export function normalizeEmployeeNo(value: string | null | undefined): string {
  const v = (value ?? '').trim().toLowerCase();
  return /^\d+$/.test(v) ? v.replace(/^0+(?=\d)/, '') : v;
}

/** The name as written plus a "LAST, FIRST" → "FIRST LAST" reordering. */
export function nameVariants(value: string): string[] {
  const keys = new Set<string>();
  const add = (v: string) => {
    const key = normalizeName(v);
    if (key) keys.add(key);
  };
  add(value);
  const comma = value.match(/^([^,]+),\s*(.+)$/);
  if (comma) add(`${comma[2]} ${comma[1]}`);
  return [...keys];
}

function rosterNameKeys(employee: RosterName): { strong: string[]; weak: string[] } {
  const first = employee.firstName ?? '';
  const middle = employee.middleName ?? '';
  const last = employee.lastName ?? '';
  const suffix = employee.suffix ?? '';
  const join = (...parts: string[]) => normalizeName(parts.filter(Boolean).join(' '));
  const strong = [
    join(first, middle, last, suffix),
    join(first, middle, last),
    join(last, first, middle, suffix),
    join(last, first, middle),
  ];
  const weak = [
    join(first, last, suffix),
    join(first, last),
    join(last, first, suffix),
    join(last, first),
  ];
  return { strong: [...new Set(strong)], weak: [...new Set(weak)] };
}

/**
 * Prefer an employee-number match, then the fullest name match; fall back to
 * first+last so a file without a middle name still finds the roster entry.
 */
export function matchRosterEmployee<T extends RosterName>(
  roster: T[],
  target: { name: string; employeeNo?: string | null },
): T | undefined {
  const targetNo = normalizeEmployeeNo(target.employeeNo);
  if (targetNo) {
    const byNo = roster.find((employee) => normalizeEmployeeNo(employee.employeeNo) === targetNo);
    if (byNo) return byNo;
  }

  const keys = new Set(nameVariants(target.name));
  for (const tier of ['strong', 'weak'] as const) {
    for (const employee of roster) {
      if (rosterNameKeys(employee)[tier].some((key) => keys.has(key))) return employee;
    }
  }
  return undefined;
}
