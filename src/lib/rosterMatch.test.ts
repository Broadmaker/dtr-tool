import { describe, expect, it } from 'vitest';
import {
  matchRosterEmployee,
  nameVariants,
  normalizeEmployeeNo,
  normalizeName,
  type RosterName,
} from './rosterMatch';

type Person = RosterName & { id: string };

const person = (over: Partial<Person> & Pick<Person, 'id' | 'firstName' | 'lastName'>): Person => ({
  middleName: null,
  suffix: null,
  employeeNo: null,
  ...over,
});

const roster: Person[] = [
  person({ id: 'a', firstName: 'Juan', middleName: 'Santos', lastName: 'Dela Cruz', employeeNo: '0042' }),
  person({ id: 'b', firstName: 'Maria', lastName: 'Santos', suffix: 'Jr.' }),
  person({ id: 'c', firstName: 'Pedro', lastName: 'Reyes', employeeNo: '7' }),
];

describe('normalizeName', () => {
  it('lowercases, strips punctuation, and collapses whitespace', () => {
    expect(normalizeName('  JUAN  G.  Dela-Cruz ')).toBe('juan g dela cruz');
  });
});

describe('normalizeEmployeeNo', () => {
  it('compares numeric ids ignoring leading zeros', () => {
    expect(normalizeEmployeeNo('0042')).toBe('42');
    expect(normalizeEmployeeNo(' 42 ')).toBe('42');
    expect(normalizeEmployeeNo('A-12')).toBe('a-12');
    expect(normalizeEmployeeNo(null)).toBe('');
  });
});

describe('nameVariants', () => {
  it('reorders comma-style names', () => {
    expect(nameVariants('DELA CRUZ, JUAN S.')).toContain('juan s dela cruz');
  });

  it('keeps the original name as a variant', () => {
    expect(nameVariants('JUAN DELA CRUZ')).toEqual(['juan dela cruz']);
  });
});

describe('matchRosterEmployee', () => {
  it('matches by employee number even when the name differs', () => {
    expect(matchRosterEmployee(roster, { name: 'J. Dela Cruz', employeeNo: '42' })?.id).toBe('a');
  });

  it('ignores leading zeros on employee numbers', () => {
    expect(matchRosterEmployee(roster, { name: 'Someone Else', employeeNo: '0007' })?.id).toBe('c');
  });

  it('matches a comma-style file name against the roster', () => {
    expect(matchRosterEmployee(roster, { name: 'DELA CRUZ, JUAN SANTOS' })?.id).toBe('a');
  });

  it('matches when the file omits the middle name', () => {
    expect(matchRosterEmployee(roster, { name: 'Juan Dela Cruz' })?.id).toBe('a');
  });

  it('matches when the roster omits punctuation from the file', () => {
    expect(matchRosterEmployee(roster, { name: 'MARIA SANTOS, JR.' })?.id).toBe('b');
  });

  it('returns undefined when nothing matches', () => {
    expect(matchRosterEmployee(roster, { name: 'Nobody Here' })).toBeUndefined();
  });
});
