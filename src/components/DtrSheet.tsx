import { memo, useMemo } from 'react';
import type { EmployeeInfo, HolidayEntry, LeaveEntry, ResolvedDay } from '../lib/types';
import { monthName } from '../lib/dateUtils';
import { totalUndertime, undertimeForDay } from '../lib/rules';
import { QRCodeSVG } from 'qrcode.react';
import { buildQRPayload } from '../lib/qr';

function fmtTime(t: string): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

function DTRSection({
  info,
  month,
  year,
  days,
}: {
  info: EmployeeInfo;
  month: number;
  year: number;
  days: ResolvedDay[];
}) {
  const capMonth = useMemo(() => {
    const up = monthName(month);
    return up.charAt(0) + up.slice(1).toLowerCase();
  }, [month]);
  const official = info.officialHours || '08:00:00-12:00:00  13:00:00-17:00:00';
  const total = useMemo(() => totalUndertime(days), [days]);
  const qrValue = useMemo(() => buildQRPayload(info, month, year, days), [info, month, year, days]);

  return (
    <section className="dtr">
      <div className="top-line">
        <span className="form-no">Civil Service Form No. 48</span>
        <QRCodeSVG
          value={qrValue}
          size={128}
          level="M"
          marginSize={0}
          bgColor="#ffffff"
          fgColor="#000000"
          className="qr"
          aria-label={`QR verification code for ${info.name || 'employee'}`}
        />
      </div>

      <h1>DAILY TIME RECORD</h1>

      <div className="identity">
        <div className="field-row">
          <span className="field-label">Name:</span>
          <span className="field-value">{info.name || ''}</span>
        </div>
        <div className="field-row">
          <span className="field-label">Station:</span>
          <span className="field-value">{info.office || ''}</span>
        </div>
        <div className="field-row">
          <span className="field-label">Official Hours:</span>
          <span className="field-value">{official}</span>
        </div>
        <div className="field-row month-row">
          <span className="month-label">For the month of</span>
          <span className="month-value">{capMonth}, {year}</span>
        </div>
      </div>

      <div className="official-hours">Official hours for arrival and departure</div>

      <table className="attendance">
        <thead>
          <tr className="header-main">
            <th className="day-col" rowSpan={2}>
              Day
            </th>
            <th rowSpan={2}>
              A.M.
              <br />
              Arrival
            </th>
            <th rowSpan={2}>
              A.M.
              <br />
              Departure
            </th>
            <th rowSpan={2}>
              P.M.
              <br />
              Arrival
            </th>
            <th rowSpan={2}>
              P.M.
              <br />
              Departure
            </th>
            <th colSpan={2}>Undertime</th>
          </tr>
          <tr className="header-sub">
            <th>Hours</th>
            <th>Min</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const u = undertimeForDay(d);
            const isWeekend = d.weekday === 0 || d.weekday === 6;
            const label = isWeekend ? `${d.dayOfMonth} ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.weekday]}` : String(d.dayOfMonth);
            const isHoliday = d.kind === 'holiday';
            const isLeave = d.kind === 'leave';
            if (isHoliday) {
              const desc = d.holiday?.description ? ` — ${d.holiday.description}` : '';
              const type = d.holiday?.type ? ` (${d.holiday.type})` : '';
              return (
                <tr key={d.date} className="holiday-row">
                  <td className="day-cell">{label}</td>
                  <td colSpan={4} className="holiday-cell">HOLIDAY{type}{desc}</td>
                  <td>{u.h}</td>
                  <td>{u.m}</td>
                </tr>
              );
            }
            if (isLeave) {
              const lt = (d.leaveType ?? 'LEAVE').toUpperCase();
              return (
                <tr key={d.date} className="leave-row">
                  <td className="day-cell">{label}</td>
                  <td colSpan={4} className="leave-cell">{lt}</td>
                  <td>{u.h}</td>
                  <td>{u.m}</td>
                </tr>
              );
            }
            return (
              <tr key={d.date}>
                <td className="day-cell">{label}</td>
                <td>{fmtTime(d.entry.amIn)}</td>
                <td>{fmtTime(d.entry.amOut)}</td>
                <td>{fmtTime(d.entry.pmIn)}</td>
                <td>{fmtTime(d.entry.pmOut)}</td>
                <td>{u.h}</td>
                <td>{u.m}</td>
              </tr>
            );
          })}
          <tr className="total-row">
            <td colSpan={5}>Total Undertime</td>
            <td>{total.h}</td>
            <td>{total.m}</td>
          </tr>
        </tbody>
      </table>

      <p className="certification">
        I certify on my honor that the above is a true and correct report of the hours of work performed, record of which was made daily at the time of arrival and departure from office.
      </p>

      <div className="signature">
        <strong>{info.name || ''}</strong>
        <div className="signature-line" />
        <em>VERIFIED as to the prescribed office hours</em>
        <div className="verifier-name">{info.verifier || '\u00A0'}</div>
        <div className="verification-line" />
      </div>
    </section>
  );
}

const MemoDTRSection = memo(DTRSection);

function DtrSheet(props: {
  info: EmployeeInfo;
  month: number;
  year: number;
  days: ResolvedDay[];
  holidays: HolidayEntry[];
  leaves: LeaveEntry[];
}) {
  // holidays/leaves already applied via resolved days
  return (
    <div className="dtr-page">
      <MemoDTRSection info={props.info} month={props.month} year={props.year} days={props.days} />
      <MemoDTRSection info={props.info} month={props.month} year={props.year} days={props.days} />
    </div>
  );
}

export default memo(DtrSheet);

export { fmtTime };
