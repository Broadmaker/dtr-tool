import { describe, expect, it } from 'vitest';
import { classifyDay, lateForDay, parseOfficialHours, requiredMinutes } from './schedule';

describe('parseOfficialHours', () => {
  it('parses the default PH format', () => {
    expect(parseOfficialHours('8:00AM–12:00NN & 1:00PM–5:00PM')).toEqual({
      amIn: '08:00',
      amOut: '12:00',
      pmIn: '13:00',
      pmOut: '17:00',
    });
  });

  it('falls back on garbage', () => {
    expect(parseOfficialHours('flexitime')).toEqual({
      amIn: '08:00',
      amOut: '12:00',
      pmIn: '13:00',
      pmOut: '17:00',
    });
  });

  it('handles two-time shorthand', () => {
    const s = parseOfficialHours('8:00 AM - 5:00 PM');
    expect(s.amIn).toBe('08:00');
    expect(s.pmOut).toBe('17:00');
  });
});

describe('requiredMinutes', () => {
  it('is 480 for the standard schedule', () => {
    expect(requiredMinutes(parseOfficialHours('8:00AM–12:00NN & 1:00PM–5:00PM'))).toBe(480);
  });

  it('follows custom schedules', () => {
    expect(
      requiredMinutes({ amIn: '07:00', amOut: '11:00', pmIn: '12:00', pmOut: '16:00' }),
    ).toBe(480);
    expect(
      requiredMinutes({ amIn: '08:00', amOut: '12:00', pmIn: '13:00', pmOut: '16:00' }),
    ).toBe(420);
  });
});

describe('lateForDay', () => {
  it('counts arrival after scheduled IN', () => {
    const late = lateForDay(
      { amIn: '08:15', pmIn: '13:05' },
      '8:00AM–12:00NN & 1:00PM–5:00PM',
    );
    expect(late).toEqual({ amLate: 15, pmLate: 5, total: 20 });
  });

  it('early arrival is not negative', () => {
    expect(lateForDay({ amIn: '07:30', pmIn: '12:50' }).total).toBe(0);
  });
});

describe('classifyDay', () => {
  const sched = '8:00AM–12:00NN & 1:00PM–5:00PM';

  it('full day when all four slots present', () => {
    const r = classifyDay({ amIn: '07:55', amOut: '12:00', pmIn: '13:00', pmOut: '17:05' }, sched);
    expect(r.status).toBe('full');
    expect(r.workedMinutes).toBeGreaterThan(400);
  });

  it('half-am when only the morning half is complete', () => {
    const r = classifyDay({ amIn: '08:00', amOut: '12:00', pmIn: '', pmOut: '' }, sched);
    expect(r.status).toBe('half-am');
  });

  it('half-pm when only the afternoon half is complete', () => {
    const r = classifyDay({ amIn: '', amOut: '', pmIn: '13:00', pmOut: '17:00' }, sched);
    expect(r.status).toBe('half-pm');
  });

  it('absent with no punches, incomplete when partially filled', () => {
    expect(classifyDay({ amIn: '', amOut: '', pmIn: '', pmOut: '' }, sched).status).toBe('absent');
    expect(classifyDay({ amIn: '08:00', amOut: '', pmIn: '', pmOut: '' }, sched).status).toBe('incomplete');
    expect(classifyDay({ amIn: '08:00', amOut: '12:00', pmIn: '13:00', pmOut: '' }, sched).status).toBe('incomplete');
  });
});
