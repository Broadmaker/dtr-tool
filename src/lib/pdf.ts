// Client-side PDF: print-faithful A4 DTR (CSC Form 48 replica).
// Mirrors the print sheet (DtrSheet + dtr.css + print.css): ONE portrait A4
// page holding TWO identical copies side by side, same geometry, same type
// scale (print px → pt), same wording, same verification QR per copy.
// Lazy-loaded alongside the xlsx/jszip chunks — never part of the app shell.
// Input is the same ExportBundle the print sheet, Excel and ZIP already use,
// so attendance data still never leaves the browser.
import type { jsPDF } from 'jspdf';
import qrcode from 'qrcode-generator';
import type { ExportBundle } from './export';
import { monthName } from './dateUtils';
import { totalUndertime, undertimeForDay } from './rules';
import { buildQRPayload } from './qr';

// ── Print geometry (print.css print block + dtr.css) ─────────────────────────
const PAGE_W = 210;
const PAGE_H = 297;
const PAD_TOP = 5;
const PAD_SIDE = 9;
const PAD_BOTTOM = 6;
const COPY_GAP = 7;
const CW = (PAGE_W - PAD_SIDE * 2 - COPY_GAP) / 2; // 92.5mm per copy

// Column proportions from dtr.css (day 24.4 + 4×12.8 time + 15.0 undertime
// span = 7.5 per half; normalized to the copy width, exactly as the browser's
// fixed table layout distributes them).
const COL_SUM = 24.4 + 12.8 * 4 + 7.5 * 2;
const DAY_W = (CW * 24.4) / COL_SUM;
const T_W = (CW * 12.8) / COL_SUM;
const U_W = (CW * 7.5) / COL_SUM;

// Type scale: print px → pt (×72/96), matching dtr.css after the +1px bump.
const F_FORM_NO = 6.2;
const F_TITLE = 11.2;
const F_FIELD = 6.9;
const F_MONTH_VAL = 7.5;
const F_OFFICIAL = 7;
const F_THEAD = 6.8;
const F_SUB = 6;
const F_BODY = 6.9;
const F_HOLIDAY = 6.4;
const F_TOTAL_LABEL = 7.5;
const F_CERT = 6.3;
const F_SIG_NAME = 6.9;
const F_SIG_EM = 6.2;
const F_VERIFIER = 6.9;

// Row heights from dtr.css (mm). Title/identity/signature blocks below follow
// the exact dtr.css box flow (margins + px line boxes) so the PDF keeps the
// print sheet's vertical rhythm all the way to the bottom line.
const H_TOP_LINE = 9;
const H_TITLE = 5.2; // -1 margin + 15px line box (line-height:1) + 2.2 margin
const H_FIELD = 5.2;
const H_MONTH = 6;
const H_OFFICIAL = 5.6; // 1.6 margin + 9.4px Times line box + 1.2 margin
const H_HEAD_1 = 7;
const H_HEAD_2 = 4.7;
const H_TOTAL = 6.2;
const ROW_H_PRINT = 6.35;
const QR_SIZE = 9.5;

function fmtTime(t: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

function dayLabel(dayOfMonth: number, weekday: number): string {
  const wd = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday];
  if (weekday === 0 || weekday === 6) return `${dayOfMonth} ${wd}`;
  return String(dayOfMonth);
}

/** Truncate with ellipsis until the text fits maxW in the current font. */
function fit(doc: jsPDF, text: string, maxW: number): string {
  let t = text;
  while (t.length > 1 && doc.getTextWidth(t) > maxW) t = t.slice(0, -2);
  return t.length < text.length ? `${t.trimEnd()}…` : t;
}

function drawQR(doc: jsPDF, payload: string, x: number, y: number, size: number) {
  const qr = qrcode(0, 'M');
  qr.addData(payload);
  qr.make();
  const n = qr.getModuleCount();
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, size, size, 'F');
  const qz = 1; // quiet-zone modules, like the breathing room on the sheet
  const cell = size / (n + qz * 2);
  doc.setFillColor(0, 0, 0);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) {
        // Slight overlap so no hairline gaps appear between modules.
        doc.rect(x + (c + qz) * cell, y + (r + qz) * cell, cell + 0.03, cell + 0.03, 'F');
      }
    }
  }
}

/**
 * Draw one copy of the DTR at left edge x0. Returns nothing; y-flow is
 * fully determined by the shared rowH so both copies stay identical.
 */
function drawCopy(doc: jsPDF, b: ExportBundle, x0: number, rowH: number, capMonth: string) {
  const R = x0 + CW;
  const xT = (i: number) => x0 + DAY_W + i * T_W;
  const xU1 = x0 + DAY_W + T_W * 4;
  const xU2 = xU1 + U_W;
  const official = b.info.officialHours || '08:00:00-12:00:00  13:00:00-17:00:00';

  doc.setDrawColor(40);
  doc.setLineWidth(0.28);
  doc.setTextColor(0, 0, 0);

  // Top line: form number (left) + verification QR (right), like .top-line.
  let y = PAD_TOP;
  doc.setFont('times', 'italic');
  doc.setFontSize(F_FORM_NO);
  doc.text('Civil Service Form No. 48', x0, y + 3);
  drawQR(doc, buildQRPayload(b.info, b.month, b.year, b.days), R - QR_SIZE, y, QR_SIZE);
  y += H_TOP_LINE;

  // Title, like .dtr h1 (-1mm top margin + 15px line box + 2.2mm margin;
  // baseline sits a Times ascent below the line-box top).
  doc.setFont('times', 'bold');
  doc.setFontSize(F_TITLE);
  doc.text('DAILY TIME RECORD', x0 + CW / 2, y + 2.5, { align: 'center' });
  y += H_TITLE;

  // Identity rows, like .field-row (label + underlined bold value).
  const identity = [
    ['Name:', b.info.name || ''],
    ['Station:', b.info.office || ''],
    ['Official Hours:', official],
  ] as const;
  doc.setFontSize(F_FIELD);
  for (const [label, value] of identity) {
    doc.setFont('helvetica', 'normal');
    const lw = doc.getTextWidth(label);
    doc.text(label, x0, y + 4.7);
    const vx = x0 + lw + 2;
    doc.setFont('helvetica', 'bold');
    doc.text(fit(doc, value.toUpperCase(), R - vx), vx, y + 4.3);
    doc.line(vx, y + H_FIELD, R, y + H_FIELD);
    y += H_FIELD;
  }
  // Month row, like .month-row (italic label offset 4mm, value centered in
  // the true remainder and underlined across it).
  doc.setFont('times', 'italic');
  const monthLabel = 'For the month of';
  doc.text(monthLabel, x0 + 4, y + 5.5);
  const mvx = x0 + 4 + doc.getTextWidth(monthLabel) + 2;
  doc.setFont('times', 'bold');
  doc.setFontSize(F_MONTH_VAL);
  doc.text(`${capMonth}, ${b.year}`, (mvx + R) / 2, y + 5.0, { align: 'center' });
  doc.line(mvx, y + H_MONTH, R, y + H_MONTH);
  y += H_MONTH;

  // Caption, like .official-hours (1.6mm margin + 9.4px Times line box).
  doc.setFont('times', 'italic');
  doc.setFontSize(F_OFFICIAL);
  doc.text('Official hours for arrival and departure', x0 + CW / 2, y + 3.8, { align: 'center' });
  y += H_OFFICIAL;

  // Table header, like .header-main + .header-sub.
  const yH2 = y + H_HEAD_1;
  doc.setLineWidth(0.28);
  doc.rect(x0, y, DAY_W, H_HEAD_1 + H_HEAD_2, 'S');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(F_THEAD);
  doc.text('Day', x0 + DAY_W / 2, y + (H_HEAD_1 + H_HEAD_2) / 2, { align: 'center', baseline: 'middle' });
  const timeHeads = ['A.M.\nArrival', 'A.M.\nDeparture', 'P.M.\nArrival', 'P.M.\nDeparture'];
  timeHeads.forEach((t, i) => {
    const x = xT(i);
    doc.rect(x, y, T_W, H_HEAD_1 + H_HEAD_2, 'S');
    const [l1, l2] = t.split('\n');
    const cx = x + T_W / 2;
    const cy = y + (H_HEAD_1 + H_HEAD_2) / 2;
    doc.text(l1, cx, cy - 1.9, { align: 'center', baseline: 'middle' });
    doc.text(l2, cx, cy + 1.9, { align: 'center', baseline: 'middle' });
  });
  doc.rect(xU1, y, U_W * 2, H_HEAD_1, 'S');
  doc.text('Undertime', xU1 + U_W, y + H_HEAD_1 / 2, { align: 'center', baseline: 'middle' });
  doc.setFontSize(F_SUB);
  doc.rect(xU1, yH2, U_W, H_HEAD_2, 'S');
  doc.rect(xU2, yH2, U_W, H_HEAD_2, 'S');
  doc.text('Hours', xU1 + U_W / 2, yH2 + H_HEAD_2 / 2, { align: 'center', baseline: 'middle' });
  doc.text('Min', xU2 + U_W / 2, yH2 + H_HEAD_2 / 2, { align: 'center', baseline: 'middle' });
  y += H_HEAD_1 + H_HEAD_2;

  // Body rows, like the DtrSheet tbody.
  doc.setFontSize(F_BODY);
  for (const d of b.days) {
    const u = undertimeForDay(d, b.info.officialHours);
    const cy = y + rowH / 2;
    doc.rect(x0, y, DAY_W, rowH, 'S');
    doc.setFont('helvetica', 'normal');
    doc.text(fit(doc, dayLabel(d.dayOfMonth, d.weekday), DAY_W - 2.5), x0 + 1.1, cy, {
      baseline: 'middle',
    });
    if (d.kind === 'holiday') {
      const desc = d.holiday?.description ? ` — ${d.holiday.description}` : '';
      const type = d.holiday?.type ? ` (${d.holiday.type})` : '';
      doc.rect(xT(0), y, T_W * 4, rowH, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(F_HOLIDAY);
      doc.setTextColor(185, 28, 28);
      doc.text(fit(doc, `HOLIDAY${type}${desc}`.toUpperCase(), T_W * 4 - 2), xT(0) + T_W * 2, cy, {
        align: 'center',
        baseline: 'middle',
      });
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(F_BODY);
    } else if (d.kind === 'leave') {
      doc.rect(xT(0), y, T_W * 4, rowH, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(F_HOLIDAY);
      doc.setTextColor(3, 105, 161);
      doc.text((d.leaveType ?? 'LEAVE').toUpperCase(), xT(0) + T_W * 2, cy, {
        align: 'center',
        baseline: 'middle',
      });
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(F_BODY);
    } else {
      const times = [d.entry.amIn, d.entry.amOut, d.entry.pmIn, d.entry.pmOut].map(fmtTime);
      times.forEach((t, i) => {
        const x = xT(i);
        doc.rect(x, y, T_W, rowH, 'S');
        if (t) {
          doc.setFont('helvetica', 'normal');
          doc.text(t, x + T_W / 2, cy, { align: 'center', baseline: 'middle' });
        }
      });
    }
    doc.rect(xU1, y, U_W, rowH, 'S');
    doc.rect(xU2, y, U_W, rowH, 'S');
    doc.setFont('helvetica', 'normal');
    doc.text(String(u.h), xU1 + U_W / 2, cy, { align: 'center', baseline: 'middle' });
    doc.text(String(u.m), xU2 + U_W / 2, cy, { align: 'center', baseline: 'middle' });
    y += rowH;
  }

  // Total row, like .total-row.
  const tot = totalUndertime(b.days, b.info.officialHours);
  doc.rect(x0, y, DAY_W + T_W * 4, H_TOTAL, 'S');
  doc.setFont('times', 'normal');
  doc.setFontSize(F_TOTAL_LABEL);
  doc.text('Total Undertime', x0 + DAY_W + T_W * 4 - 2, y + H_TOTAL / 2, {
    align: 'right',
    baseline: 'middle',
  });
  doc.rect(xU1, y, U_W, H_TOTAL, 'S');
  doc.rect(xU2, y, U_W, H_TOTAL, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(F_BODY);
  doc.text(String(tot.h), xU1 + U_W / 2, y + H_TOTAL / 2, { align: 'center', baseline: 'middle' });
  doc.text(String(tot.m), xU2 + U_W / 2, y + H_TOTAL / 2, { align: 'center', baseline: 'middle' });
  y += H_TOTAL;

  // Certification, like .certification (2.1mm margin + 8.4px Times italic at
  // 1.25 line-height = 2.78mm per line).
  y += 2.1;
  doc.setFont('times', 'italic');
  doc.setFontSize(F_CERT);
  for (const line of doc.splitTextToSize(CERT_TEXT, CW)) {
    doc.text(line, x0, y);
    y += 2.78;
  }

  // Signature block, following the exact .signature box flow: 3.5 margin +
  // name box (9.2px Arial ≈ 2.72) + 0.7 rule gap + 1.2 em margin + em box
  // (8.3px Times ≈ 2.43) + 3.5 verifier margin + verifier box (3.5 min-height
  // wins) + 0.7 rule gap. Total 18.25mm — keep SIG_BLOCK in sync.
  y += 3.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(F_SIG_NAME);
  doc.text(fit(doc, (b.info.name || '').toUpperCase(), CW), x0 + CW / 2, y + 2.2, { align: 'center' });
  y += 2.72 + 0.7;
  doc.line(x0, y, R, y);
  y += 1.2;
  doc.setFont('times', 'italic');
  doc.setFontSize(F_SIG_EM);
  doc.text('VERIFIED as to the prescribed office hours', x0, y + 1.95);
  y += 2.43 + 3.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(F_VERIFIER);
  doc.text(fit(doc, (b.info.verifier || '').toUpperCase(), CW), x0 + CW / 2, y + 2.2, {
    align: 'center',
  });
  y += 3.5 + 0.7;
  doc.line(x0, y, R, y);
}

function capMonthName(month: number): string {
  const up = monthName(month);
  return up.charAt(0) + up.slice(1).toLowerCase();
}

const CERT_TEXT =
  'I certify on my honor that the above is a true and correct report of the hours of work performed, record of which was made daily at the time of arrival and departure from office.';

/**
 * Build the print-faithful single-page A4 PDF for one employee
 * (two identical copies side by side, like the print sheet).
 */
export async function buildDtrPdf(bundle: ExportBundle, opts?: { compress?: boolean }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: opts?.compress ?? true });
  doc.setProperties({
    title: `DTR — ${bundle.info.name || 'Employee'} — ${monthName(bundle.month)} ${bundle.year}`,
  });

  // Rows use the exact print height, shaved only as much as the month needs
  // so certification + signatures still fit on the one page. The budget uses
  // the measured cert line count and the exact 18.25mm signature block.
  const n = bundle.days.length || 1;
  const fixedTop = PAD_TOP + H_TOP_LINE + H_TITLE + H_FIELD * 3 + H_MONTH + H_OFFICIAL;
  doc.setFont('times', 'italic');
  doc.setFontSize(F_CERT);
  const certLines = doc.splitTextToSize(CERT_TEXT, CW).length;
  const fixedBottom = H_HEAD_1 + H_HEAD_2 + H_TOTAL + 2.1 + certLines * 2.78 + 18.25;
  const rowH = Math.min(
    ROW_H_PRINT,
    (PAGE_H - PAD_TOP - PAD_BOTTOM - fixedTop - fixedBottom) / n,
  );

  const capMonth = capMonthName(bundle.month);
  drawCopy(doc, bundle, PAD_SIDE, rowH, capMonth);
  drawCopy(doc, bundle, PAD_SIDE + CW + COPY_GAP, rowH, capMonth);
  return doc;
}

/** Raw PDF bytes for one employee, ready to store in the ZIP. */
export async function bundleToPdfBytes(bundle: ExportBundle): Promise<ArrayBuffer> {
  const doc = await buildDtrPdf(bundle);
  return doc.output('arraybuffer') as ArrayBuffer;
}
