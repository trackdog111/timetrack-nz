import { Shift, Theme, Employee, CompanySettings } from '../shared/types';
import { getHours, calcBreaks, fmtDur, fmtTime, fmtDateShort } from '../shared/utils';

interface ReportsViewProps {
  theme: Theme;
  isMobile: boolean;
  employees: Employee[];
  companySettings: CompanySettings;
  reportStart: string;
  setReportStart: (v: string) => void;
  reportEnd: string;
  setReportEnd: (v: string) => void;
  reportEmp: string;
  setReportEmp: (v: string) => void;
  reportData: Shift[];
  genReport: () => void;
  exportCSV: () => void;
  exportPDF: () => void;
  getEmployeeName: (userId?: string, userEmail?: string) => string;
}

export function ReportsView({
  theme,
  isMobile,
  employees,
  companySettings,
  reportStart,
  setReportStart,
  reportEnd,
  setReportEnd,
  reportEmp,
  setReportEmp,
  reportData,
  genReport,
  exportCSV,
  exportPDF,
  getEmployeeName
}: ReportsViewProps) {
  const styles = {
    card: { background: theme.card, borderRadius: '12px', padding: '20px', marginBottom: '16px', border: `1px solid ${theme.cardBorder}` },
    input: { padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.inputBorder}`, background: theme.input, color: theme.text, fontSize: '14px', width: '100%', boxSizing: 'border-box' as const },
    btn: { padding: '10px 20px', borderRadius: '8px', border: 'none', background: theme.primary, color: 'white', cursor: 'pointer', fontWeight: '600' as const, fontSize: '14px' },
    btnDanger: { padding: '10px 20px', borderRadius: '8px', border: 'none', background: theme.danger, color: 'white', cursor: 'pointer', fontWeight: '600' as const, fontSize: '14px' }
  };

  return (
    <div>
      <h1 style={{ color: theme.text, marginBottom: '24px', fontSize: isMobile ? '22px' : '28px' }}>Reports</h1>
      
      <div style={styles.card}>
        <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Generate Report</h3>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'end' }}>
          <div style={{ flex: '1', minWidth: '140px' }}>
            <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Start</label>
            <input type="date" value={reportStart} onChange={e => setReportStart(e.target.value)} style={styles.input} />
          </div>
          <div style={{ flex: '1', minWidth: '140px' }}>
            <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>End</label>
            <input type="date" value={reportEnd} onChange={e => setReportEnd(e.target.value)} style={styles.input} />
          </div>
          <div style={{ flex: '1', minWidth: '180px' }}>
            <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Employee</label>
            <select value={reportEmp} onChange={e => setReportEmp(e.target.value)} style={styles.input}>
              <option value="all">All</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name || e.email}</option>)}
            </select>
          </div>
          <button onClick={genReport} style={styles.btn}>Generate</button>
        </div>
      </div>
      
      {reportData.length > 0 && (
        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ color: theme.text, margin: 0 }}>{reportData.length} shifts</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={exportCSV} style={{ ...styles.btn, background: theme.success }}>📄 CSV</button>
              <button onClick={exportPDF} style={styles.btnDanger}>📑 PDF</button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${theme.cardBorder}` }}>
                  <th style={{ padding: '12px 8px', textAlign: 'left', color: theme.textMuted, fontSize: '13px' }}>Date</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', color: theme.textMuted, fontSize: '13px' }}>Employee</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', color: theme.textMuted, fontSize: '13px' }}>In</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', color: theme.textMuted, fontSize: '13px' }}>Out</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', color: theme.textMuted, fontSize: '13px' }}>Worked</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', color: theme.success, fontSize: '13px' }}>Paid</th>
                  <th style={{ padding: '12px 8px', textAlign: 'left', color: theme.warning, fontSize: '13px' }}>Unpaid</th>
                </tr>
              </thead>
              <tbody>
                {reportData.map(sh => {
                  const h = getHours(sh.clockIn, sh.clockOut);
                  const b = calcBreaks(sh.breaks || [], h, companySettings.paidRestMinutes);
                  return (
                    <tr key={sh.id} style={{ borderBottom: `1px solid ${theme.cardBorder}` }}>
                      <td style={{ padding: '12px 8px', color: theme.text, fontSize: '13px' }}>{fmtDateShort(sh.clockIn)}</td>
                      <td style={{ padding: '12px 8px', color: theme.text, fontSize: '13px' }}>{getEmployeeName(sh.userId, sh.userEmail)}</td>
                      <td style={{ padding: '12px 8px', color: theme.textMuted, fontSize: '13px' }}>{fmtTime(sh.clockIn)}</td>
                      <td style={{ padding: '12px 8px', color: theme.textMuted, fontSize: '13px' }}>{sh.clockOut ? fmtTime(sh.clockOut) : '-'}</td>
                      <td style={{ padding: '12px 8px', color: theme.text, fontWeight: '600', fontSize: '13px' }}>{fmtDur((h * 60) - b.unpaid)}</td>
                      <td style={{ padding: '12px 8px', color: theme.success, fontSize: '13px' }}>{b.paid}m</td>
                      <td style={{ padding: '12px 8px', color: theme.warning, fontSize: '13px' }}>{b.unpaid}m</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}