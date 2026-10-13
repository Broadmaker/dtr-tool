// Per-template importer regression tests — synthetic grids exercising each
// layout's markers, guards, and positional mapping (no real school data).
import { describe, expect, it } from 'vitest';
import { parseExtractedDTRGrid } from './extractedDtr';
import { parseCSCForm48Sheet } from './cscForm48';
import { parseSegmentRecordSheet } from './segmentRecord';
import { parseAttendanceReportSheet } from './attendanceReport';
import { parseAttLogSheet, parseExceptionStatSheet } from './attendanceLog';

const OPTS = { fileName: 'test.xlsx', fileDate: new Date(2026, 8, 15) };

describe('Template 1 — Extracted DTR blocks', () => {
  const grid = [
    ['Name', 'Juan Dela Cruz', '', 'Date', '2026-08-01 ~ 2026-08-31'],
    ['Day Week', 'DutyT1', '', 'DutyT2', '', '', '', ''],
    ['01 6', '07:30', '', '12:00', '', '13:00', '', '17:00'],
    ['02 0', '07:31', '', '12:01', '', '13:01', '', '17:01'],
  ];

  it('maps AM-IN / AM-OUT / PM-IN / PM-OUT by column', () => {
    const hit = parseExtractedDTRGrid(grid, 'Sheet1');
    expect(hit?.employees.map((e) => e.name)).toEqual(['Juan Dela Cruz']);
    expect(hit?.employees[0].days['2026-08-01']).toMatchObject({
      amIn: '07:30',
      amOut: '12:00',
      pmIn: '13:00',
      pmOut: '17:00',
    });
    expect(hit?.punches.length).toBe(8);
    expect(hit?.warnings.join(' ')).toMatch(/Extracted DTR/);
  });

  it('bails on Segment Record Report layouts (Template 3 owns them)', () => {
    const seg = [
      ['Record Report', 'Segment 1', 'Segment 2'],
      ['Name', 'Someone', '', 'Date Week', '01 D2'],
      ['01 D2', '07:00', '12:00', '12:58', '17:00'],
      ['02 D3', '07:01', '12:01', '12:59', '17:01'],
    ];
    expect(parseExtractedDTRGrid(seg, 'Sheet1')).toBeNull();
  });
});

describe('Template 2 — CSC Form 48', () => {
  const grid = [
    ['Civil Service Form No. 48'],
    ['DAILY TIME RECORD'],
    ['Department', 'X', 'Name', 'Maria Santos'],
    ['Date', 'September 2026', '', 'No', '1'],
    ['Attendance Table'],
    ['dd/ww', 'AM', '', '', '', '', 'PM', '', ''],
    ['', 'In', 'Out', '', '', '', 'In', '', 'Out'],
    ['01 Tu', '07:15', '', '12:06', '', '', '12:16', '', '17:01'],
    ['02 We', '', '', '', '', '', '', '', ''],
  ];

  it('finds name, period, and positional times', () => {
    const hit = parseCSCForm48Sheet(grid, OPTS);
    expect(hit?.name).toBe('Maria Santos');
    expect(hit?.year).toBe(2026);
    expect(hit?.month).toBe(9);
    expect(hit?.days['2026-09-01']).toEqual({
      amIn: '07:15',
      amOut: '12:06',
      pmIn: '12:16',
      pmOut: '17:01',
    });
    expect(hit?.days['2026-09-02']).toBeUndefined();
  });

  it('rejects non-Form-48 sheets', () => {
    expect(parseCSCForm48Sheet([['random', 'data']], OPTS)).toBeNull();
  });
});

describe('Template 3 — Segment Record Report', () => {
  const grid = [
    ['Record Report'],
    ['Name', 'Pedro Reyes', '', 'ID', '1', '', 'Date', '2026-09'],
    ['Date Week', 'Segment 1', '', 'Segment 2', '', 'Segment 3', ''],
    ['01 D2', '07:00', '12:00', '12:58', '17:00'],
    ['02 D3', '07:01', '12:01', '12:59', '17:01'],
  ];

  it('reads positional Segment 1/2 as AM/PM', () => {
    const hit = parseSegmentRecordSheet(grid, OPTS);
    expect(hit?.name).toBe('Pedro Reyes');
    expect(hit?.days['2026-09-01']).toEqual({
      amIn: '07:00',
      amOut: '12:00',
      pmIn: '12:58',
      pmOut: '17:00',
    });
  });

  it('rejects sheets without Segment markers', () => {
    expect(parseSegmentRecordSheet([['hello', 'world']], OPTS)).toBeNull();
  });
});

describe('Template 4 — Attendance Report blocks', () => {
  const grid = [
    ['Attendance Report'],
    ['Period :', '', '2024/05/01 ~ 05/31'],
    ['Department', '', '', '', '', '', '', '', 'Name', 'Ana Garcia'],
    ['Date', '2024/05/01 ~ 05/31', '', 'No', '1'],
    ['Attendance Table'],
    ['', 'dd/ww', 'AM', '', '', '', '', 'PM', '', ''],
    ['', '', 'In', '', 'Out', '', '', 'In', '', 'Out'],
    ['', '01 We', '07:14', '', '12:05', '', '', '12:35', '', '16:43'],
    ['', '02 Th', '', '', '', '', '', '', '', ''],
  ];

  it('finds the side-by-side block via Name-column geometry', () => {
    const hits = parseAttendanceReportSheet(grid, OPTS);
    expect(hits?.length).toBe(1);
    expect(hits?.[0].name).toBe('Ana Garcia');
    expect(hits?.[0].days['2024-05-01']).toEqual({
      amIn: '07:14',
      amOut: '12:05',
      pmIn: '12:35',
      pmOut: '16:43',
    });
  });

  it('stays mutually exclusive with CSC Form 48', () => {
    const form48 = [
      ['Civil Service Form No. 48'],
      ['DAILY TIME RECORD'],
      ['Attendance Table'],
    ];
    expect(parseAttendanceReportSheet(form48, OPTS)).toBeNull();
  });
});

describe('Template 5 — attendance log export', () => {
  it('5a: parses Exception Stat. day rows', () => {
    const grid = [
      ['Exception Statistic Report', '', 'Stat.Date:', '2026-09-01 ~ 2026-09-10'],
      ['ID', 'Name', 'Department', 'Date', 'First time zone', '', 'Second time zone', ''],
      ['', '', '', '', 'On-duty', 'Off-duty', 'On-duty', 'Off-duty'],
      ['1', 'jekyll', 'Company', '2026-09-02', '07:46', '12:00', '12:43', '17:00'],
      ['2', 'hyde', 'Company', '2026-09-03', '07:50', '12:05', '12:50', '17:05'],
    ];
    const hit = parseExceptionStatSheet(grid, OPTS);
    expect(hit?.employees.map((e) => e.name)).toEqual(['jekyll', 'hyde']);
    expect(hit?.employees[0].days['2026-09-02']).toEqual({
      amIn: '07:46',
      amOut: '12:00',
      pmIn: '12:43',
      pmOut: '17:00',
    });
    expect(hit?.source).toBe('Exception Stat.');
  });

  it('5b: parses the Att.log concatenated-time grid', () => {
    const grid = [
      ['Attendance Record Report', '', 'Att. Time', '2026-09-01 ~ 2026-09-10'],
      ['1', '2', '3', '4', '5', '6'],
      ['ID:', '1', '', 'Name:', 'attjekyll'],
      ['', '07:5512:1812:3116:59', '08:0012:0013:0017:00', '', '', ''],
    ];
    const hit = parseAttLogSheet(grid, OPTS);
    expect(hit?.employees.map((e) => e.name)).toEqual(['attjekyll']);
    expect(hit?.employees[0].days['2026-09-02']).toEqual({
      amIn: '07:55',
      amOut: '12:18',
      pmIn: '12:31',
      pmOut: '16:59',
    });
    expect(hit?.source).toBe('Att.log report');
  });

  it('5a rejects the 5b grid and vice versa', () => {
    const log = [
      ['Attendance Record Report', '', 'Att. Time', '2026-09-01 ~ 2026-09-10'],
      ['1', '2', '3', '4', '5', '6'],
    ];
    expect(parseExceptionStatSheet(log, OPTS)).toBeNull();
    const stat = [['Exception Statistic Report', 'nothing else here']];
    expect(parseAttLogSheet(stat, OPTS)).toBeNull();
  });
});
