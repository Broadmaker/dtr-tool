// Client-side exports: XLSX workbook — faithful to dtr-sample.pdf
import type { EmployeeInfo, HolidayEntry, LeaveEntry, ResolvedDay } from './types';
import { monthName } from './dateUtils';
import { totalUndertime, undertimeForDay } from './rules';

export interface ExportBundle {
  info: EmployeeInfo;
  month: number;
  year: number;
  days: ResolvedDay[];
  holidays: HolidayEntry[];
  leaves: LeaveEntry[];
}

function fmtTime(t: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

function dayLabel(d: ResolvedDay): string {
  const wd = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.weekday];
  if (d.weekday === 0 || d.weekday === 6) return `${d.dayOfMonth} ${wd}`;
  return String(d.dayOfMonth);
}

export async function buildBatchWorkbook(bundles: ExportBundle[]) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const b of bundles) {
    const capMonth = (() => {
      const up = monthName(b.month);
      return up.charAt(0) + up.slice(1).toLowerCase();
    })();
    const official = b.info.officialHours || '08:00:00-12:00:00 13:00:00-17:00:00';
    const rows: (string | number)[][] = [
      ['Civil Service Form No. 48'],
      ['DAILY TIME RECORD'],
      [`Name: ${b.info.name}`],
      [`Station: ${b.info.office || ''}`],
      [`Official Hours: ${official}`],
      [`For the month of ${capMonth}, ${b.year}`],
      ['Official hours for arrival and departure'],
      ['Day', 'A.M. Arrival', 'A.M. Departure', 'P.M. Arrival', 'P.M. Departure', 'Undertime Hours', 'Undertime Min'],
    ];
    for (const d of b.days) {
      const u = undertimeForDay(d);
      if (d.kind === 'holiday') {
        const desc = d.holiday?.description ? ` — ${d.holiday.description}` : '';
        const type = d.holiday?.type ? ` (${d.holiday.type})` : '';
        rows.push([dayLabel(d), `HOLIDAY${type}${desc}`, '', '', '', u.h, u.m]);
        continue;
      }
      if (d.kind === 'leave') {
        const lt = (d.leaveType ?? 'LEAVE').toUpperCase();
        rows.push([dayLabel(d), lt, '', '', '', u.h, u.m]);
        continue;
      }
      rows.push([
        dayLabel(d),
        fmtTime(d.entry.amIn),
        fmtTime(d.entry.amOut),
        fmtTime(d.entry.pmIn),
        fmtTime(d.entry.pmOut),
        u.h,
        u.m,
      ]);
    }
    const tot = totalUndertime(b.days);
    rows.push(['Total Undertime', '', '', '', '', tot.h, tot.m]);
    rows.push([]);
    rows.push(['I certify on my honor that the above is a true and correct report of the hours of work performed, record of which was made daily at the time of arrival and departure from office.']);
    rows.push([b.info.name]);
    rows.push(['Verified as to the prescribed office hours']);
    rows.push(['Standard Automated Recording of Attendance Host Generated']);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 14 }, { wch: 13 }, { wch: 14 }, { wch: 13 }, { wch: 14 }, { wch: 10 }, { wch: 8 }];
    // merges for header area (optional visual)
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
    ];
    const safe = (b.info.name || 'DTR').replace(/[\\/?*[\]:]/g, '').slice(0, 28) || 'DTR';
    XLSX.utils.book_append_sheet(wb, ws, safe);
  }
  return wb;
}

export async function downloadXlsx(bundles: ExportBundle[], filename: string) {
  const XLSX = await import('xlsx');
  const wb = await buildBatchWorkbook(bundles);
  XLSX.writeFile(wb, filename);
}

export async function downloadZip(bundles: ExportBundle[], filename: string, fileBase: string) {
  const XLSX = await import('xlsx');
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const b of bundles) {
    const wb = await buildBatchWorkbook([b]);
    const buf: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const safe = (b.info.name || 'DTR').replace(/[\\/?*[\]:]/g, '_').slice(0, 60) || 'DTR';
    zip.file(`${fileBase}_${safe}.xlsx`, buf);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
