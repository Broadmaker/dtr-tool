import React from "react";

type AttendanceRow = {
day: number;
label?: string;
amArrival?: string;
amDeparture?: string;
pmArrival?: string;
pmDeparture?: string;
undertimeHours: string;
undertimeMin: string;
};

const rows: AttendanceRow[] = [
{ day: 1, undertimeHours: "8", undertimeMin: "0" },
{ day: 2, undertimeHours: "8", undertimeMin: "0" },
{ day: 3, undertimeHours: "8", undertimeMin: "0" },
{ day: 4, label: "4 Saturday", undertimeHours: "0", undertimeMin: "0" },
{ day: 5, label: "5 Sunday", undertimeHours: "0", undertimeMin: "0" },
{ day: 6, amArrival: "07:43:00", amDeparture: "12:02:00", pmArrival: "12:34:00", pmDeparture: "17:01:00", undertimeHours: "0", undertimeMin: "0" },
{ day: 7, amArrival: "07:46:00", amDeparture: "12:05:00", pmArrival: "12:45:00", pmDeparture: "17:01:00", undertimeHours: "0", undertimeMin: "0" },
{ day: 8, amArrival: "07:42:00", amDeparture: "12:03:00", pmArrival: "12:41:00", pmDeparture: "17:03:00", undertimeHours: "0", undertimeMin: "0" },
{ day: 9, undertimeHours: "8", undertimeMin: "0" },
{ day: 10, undertimeHours: "8", undertimeMin: "0" },
{ day: 11, label: "11 Saturday", undertimeHours: "0", undertimeMin: "0" },
{ day: 12, label: "12 Sunday", undertimeHours: "0", undertimeMin: "0" },
{ day: 13, amArrival: "07:52:00", pmDeparture: "17:01:00", undertimeHours: "8", undertimeMin: "0" },
{ day: 14, amArrival: "07:52:00", amDeparture: "12:03:00", pmArrival: "12:42:00", undertimeHours: "4", undertimeMin: "0" },
{ day: 15, amArrival: "07:47:00", amDeparture: "12:03:00", pmArrival: "12:40:00", pmDeparture: "17:05:00", undertimeHours: "0", undertimeMin: "0" },
{ day: 16, amArrival: "07:56:00", amDeparture: "12:02:00", pmArrival: "12:43:00", pmDeparture: "17:06:00", undertimeHours: "0", undertimeMin: "0" },
{ day: 17, undertimeHours: "8", undertimeMin: "0" },
{ day: 18, label: "18 Saturday", undertimeHours: "0", undertimeMin: "0" },
{ day: 19, label: "19 Sunday", undertimeHours: "0", undertimeMin: "0" },
{ day: 20, amArrival: "07:50:00", amDeparture: "12:03:00", pmArrival: "12:41:00", pmDeparture: "17:04:00", undertimeHours: "0", undertimeMin: "0" },
{ day: 21, amArrival: "07:52:00", amDeparture: "12:04:00", pmArrival: "12:43:00", pmDeparture: "17:05:00", undertimeHours: "0", undertimeMin: "0" },
{ day: 22, amArrival: "07:55:00", amDeparture: "12:11:00", pmArrival: "12:42:00", pmDeparture: "17:03:00", undertimeHours: "0", undertimeMin: "0" },
{ day: 23, amArrival: "07:54:00", amDeparture: "12:02:00", pmArrival: "12:47:00", pmDeparture: "17:05:00", undertimeHours: "0", undertimeMin: "0" },
{ day: 24, undertimeHours: "8", undertimeMin: "0" },
{ day: 25, label: "25 Saturday", undertimeHours: "0", undertimeMin: "0" },
{ day: 26, label: "26 Sunday", undertimeHours: "0", undertimeMin: "0" },
{ day: 27, amArrival: "07:50:00", amDeparture: "12:03:00", pmArrival: "12:36:00", pmDeparture: "17:06:00", undertimeHours: "0", undertimeMin: "0" },
{ day: 28, amArrival: "07:50:00", amDeparture: "12:07:00", pmArrival: "12:48:00", pmDeparture: "17:02:00", undertimeHours: "0", undertimeMin: "0" },
{ day: 29, amArrival: "07:54:00", amDeparture: "12:08:00", pmArrival: "12:42:00", pmDeparture: "17:06:00", undertimeHours: "0", undertimeMin: "0" },
{ day: 30, undertimeHours: "8", undertimeMin: "0" },
];

function FakeQR() {
// Visual QR placeholder matching the reference's small monochrome QR area.
// Replace this component with your actual QR generator if the QR payload is known.
const cells = [
"111111100101101111111",
"100000101011001000001",
"101110100110101011101",
"101110101101101011101",
"101110100011001011101",
"100000101101101000001",
"111111101010101111111",
"000000001101100000000",
"110101111001011010101",
"001011001110100110010",
"101101110101011101101",
"011010001011110010110",
"110111101100101111001",
"000000001011001001010",
"111111101101111010101",
"100000100011001110010",
"101110101110101011101",
"101110100101101100110",
"101110101011001011101",
"100000101101101100010",
"111111101010101011111",
];
return (
<svg className="qr" viewBox="0 0 21 21" aria-label="QR code placeholder">
<rect width="21" height="21" fill="#fff" />
{cells.map((row, y) =>
[...row].map((v, x) =>
v === "1" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#000" /> : null
)
)}
</svg>
);
}

function DTRSection() {
return (
<section className="dtr">
<div className="top-line">
<span className="form-no">Civil Service Form No. 48</span>
<FakeQR />
</div>

      <h1>DAILY TIME RECORD</h1>

      <div className="identity">
        <div className="field-row">
          <span className="field-label">Name:</span>
          <span className="field-value">SANIG, MARK KEVIN SALON</span>
        </div>
        <div className="field-row">
          <span className="field-label">Station:</span>
          <span className="field-value">DIVISION OFFICE/OSDS/ICT</span>
        </div>
        <div className="field-row">
          <span className="field-label">Official Hours:</span>
          <span className="field-value">08:00:00-12:00:00&nbsp;&nbsp;13:00:00-17:00:00</span>
        </div>
        <div className="field-row month-row">
          <span className="month-label">For the month of</span>
          <span className="month-value">April, 2026</span>
        </div>
      </div>

      <div className="official-hours">Official hours for arrival and departure</div>

      <table className="attendance">
        <thead>
          <tr className="header-main">
            <th className="day-col" rowSpan={2}>Day</th>
            <th rowSpan={2}>A.M.<br />Arrival</th>
            <th rowSpan={2}>A.M.<br />Departure</th>
            <th rowSpan={2}>P.M.<br />Arrival</th>
            <th rowSpan={2}>P.M.<br />Departure</th>
            <th colSpan={2}>Undertime</th>
          </tr>
          <tr className="header-sub">
            <th>Hours</th>
            <th>Min</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.day}>
              <td className="day-cell">{r.label ?? r.day}</td>
              <td>{r.amArrival ?? ""}</td>
              <td>{r.amDeparture ?? ""}</td>
              <td>{r.pmArrival ?? ""}</td>
              <td>{r.pmDeparture ?? ""}</td>
              <td>{r.undertimeHours}</td>
              <td>{r.undertimeMin}</td>
            </tr>
          ))}
          <tr className="total-row">
            <td colSpan={5}>Total Undertime</td>
            <td>76</td>
            <td>0</td>
          </tr>
        </tbody>
      </table>

      <p className="certification">
        I certify on my honor that the above is a true and correct report of the hours of work performed, record of which was made daily at the time of arrival and departure from office.
      </p>

      <div className="signature">
        <strong>MARK KEVIN S. SANIG</strong>
        <div className="signature-line" />
        <em>VERIFIED as to the prescribed office hours</em>
        <div className="verification-line" />
      </div>
    </section>

);
}

export default function DTRPage() {
return (
<>
<style>{`
@page {
size: A4 portrait;
margin: 0;
}

        * {
          box-sizing: border-box;
        }

        html, body, #root {
          margin: 0;
          min-height: 100%;
          background: #f1f1f1;
        }

        body {
          font-family: Arial, Helvetica, sans-serif;
          color: #111;
        }

        .page {
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          padding: 9mm 9mm 7mm;
          background: #fff;
          display: grid;
          grid-template-columns: 1fr 1fr;
          column-gap: 7mm;
          align-items: start;
        }

        .dtr {
          width: 100%;
          min-width: 0;
          font-size: 9.2px;
        }

        .top-line {
          position: relative;
          height: 9mm;
        }

        .form-no {
          position: absolute;
          left: 0;
          top: 0;
          font-size: 8.2px;
        }

        .qr {
          position: absolute;
          right: 0;
          top: 0;
          width: 9.5mm;
          height: 9.5mm;
          shape-rendering: crispEdges;
        }

        h1 {
          margin: -1mm 0 2.2mm;
          text-align: center;
          font-family: "Times New Roman", Times, serif;
          font-size: 15px;
          line-height: 1;
          letter-spacing: .1px;
        }

        .identity {
          width: 100%;
        }

        .field-row {
          display: flex;
          height: 5.2mm;
          align-items: flex-end;
          white-space: nowrap;
          gap: 2mm;
        }

        .field-label {
          flex: 0 0 auto;
        }

        .field-value {
          flex: 1;
          font-weight: 700;
          letter-spacing: .05px;
          border-bottom: 0.28mm solid #222;
          align-self: stretch;
          display: flex;
          align-items: flex-end;
          padding-bottom: 0.4mm;
          min-width: 0;
        }

        .month-row {
          position: relative;
          height: 6mm;
        }

        .month-label {
          margin-left: 4mm;
          font-style: italic;
          font-family: "Times New Roman", Times, serif;
        }

        .month-value {
          flex: 1;
          text-align: center;
          font-weight: 700;
          font-family: "Times New Roman", Times, serif;
          font-size: 10px;
          border-bottom: 0.28mm solid #222;
          align-self: stretch;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding-bottom: 0.4mm;
        }

        .official-hours {
          text-align: center;
          font-style: italic;
          font-family: "Times New Roman", Times, serif;
          font-size: 9.4px;
          margin: 1.6mm 0 1.2mm;
        }

        .attendance {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 8.2px;
        }

        .attendance th,
        .attendance td {
          border: 0.28mm solid #222;
          padding: 0;
          text-align: center;
          vertical-align: middle;
          height: 6.35mm;
          line-height: 1.03;
          white-space: nowrap;
        }

        .attendance thead th {
          font-weight: 400;
          font-size: 8px;
          padding: 0 0.5mm;
        }

        .attendance thead .header-main th {
          height: 7mm;
        }

        .attendance thead .header-sub th {
          height: 4.7mm;
          font-size: 7px;
          letter-spacing: 0;
          padding: 0 0.3mm;
        }

        .attendance .day-col {
          width: 28%;
        }

        .attendance th:nth-child(2),
        .attendance th:nth-child(3),
        .attendance th:nth-child(4),
        .attendance th:nth-child(5) {
          width: 12.8%;
        }

        .attendance th:nth-child(6),
        .attendance th:nth-child(7) {
          width: 7.2%;
        }

        .attendance thead .header-main th[colspan="2"] {
          width: 11.4%;
          white-space: nowrap;
        }

        .attendance .day-cell {
          text-align: left;
          padding-left: 1.1mm;
        }

        .total-row td {
          height: 6.2mm;
          font-weight: 700;
        }

        .total-row td:first-child {
          text-align: right;
          padding-right: 2mm;
          font-family: "Times New Roman", Times, serif;
          font-size: 10px;
        }

        .certification {
          margin: 2.1mm 0 0;
          padding: 0;
          width: 100%;
          box-sizing: border-box;
          font-family: "Times New Roman", Times, serif;
          font-size: 8.4px;
          line-height: 1.25;
          font-style: italic;
          text-align: left;
        }

        .signature {
          margin-top: 3.5mm;
          text-align: center;
          font-size: 8.6px;
        }

        .signature strong {
          display: block;
          font-size: 9.2px;
        }

        .signature-line {
          border-top: 0.28mm solid #222;
          margin-top: 0.7mm;
        }

        .signature em {
          display: block;
          text-align: left;
          margin-top: 1.2mm;
          font-family: "Times New Roman", Times, serif;
          font-size: 8.3px;
        }

        .verification-line {
          border-top: 0.28mm solid #222;
          margin-top: 5mm;
        }

        .page::after {
          content: "Standard Automated Recording of Attendance Host Generated";
          position: absolute;
          left: 0;
          right: 0;
          margin-top: 253mm;
          text-align: center;
          color: #777;
          font-family: "Times New Roman", Times, serif;
          font-size: 7.5px;
          font-style: italic;
          pointer-events: none;
        }

        @media screen {
          .page {
            box-shadow: 0 0 18px rgba(0,0,0,.16);
            margin-top: 20px;
            margin-bottom: 20px;
          }
        }

        @media print {
          html, body, #root {
            background: #fff;
          }

          .page {
            margin: 0;
            box-shadow: none;
          }
        }
      `}</style>

      <main className="page">
        <DTRSection />
        <DTRSection />
      </main>
    </>

);
}
