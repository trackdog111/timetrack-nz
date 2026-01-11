import { Shift, Theme, Employee, CompanySettings, Expense } from '../shared/types';
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
  // NEW: Expenses props
  expenses?: Expense[];
  exportExpensesCSV?: () => void;
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
  getEmployeeName,
  expenses = [],
  exportExpensesCSV
}: ReportsViewProps) {
  const styles = {
    card: { background: theme.card, borderRadius: '12px', padding: '20px', marginBottom: '16px', border: `1px solid ${theme.cardBorder}` },
    input: { padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.inputBorder}`, background: theme.input, color: theme.text, fontSize: '14px', width: '100%', boxSizing: 'border-box' as const },
    btn: { padding: '10px 20px', borderRadius: '8px', border: 'none', background: theme.primary, color: 'white', cursor: 'pointer', fontWeight: '600' as const, fontSize: '14px' },
    btnDanger: { padding: '10px 20px', borderRadius: '8px', border: 'none', background: theme.danger, color: 'white', cursor: 'pointer', fontWeight: '600' as const, fontSize: '14px' },
    btnWarning: { padding: '10px 20px', borderRadius: '8px', border: 'none', background: theme.warning, color: 'white', cursor: 'pointer', fontWeight: '600' as const, fontSize: '14px' }
  };

  // Calculate approved expenses in date range
  const approvedExpensesInRange = expenses.filter(exp => {
    if (exp.status !== 'approved') return false;
    if (!reportStart || !reportEnd) return false;
    const s = new Date(reportStart); s.setHours(0,0,0,0);
    const e = new Date(reportEnd); e.setHours(23,59,59,999);
    const expDate: Date = exp.date?.toDate ? exp.date.toDate() : new Date(exp.date as any);
    return expDate >= s && expDate <= e;
  });

  const totalExpenses = approvedExpensesInRange.reduce((sum, e) => sum + e.amount, 0);

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
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button onClick={exportCSV} style={{ ...styles.btn, background: theme.success }}>📄 Timesheet CSV</button>
              <button onClick={exportPDF} style={styles.btnDanger}>📑 PDF</button>
              {exportExpensesCSV && approvedExpensesInRange.length > 0 && (
                <button onClick={exportExpensesCSV} style={styles.btnWarning}>🧾 Expenses CSV</button>
              )}
            </div>
          </div>

          {/* Expenses Summary (if any in range) */}
          {approvedExpensesInRange.length > 0 && (
            <div style={{ 
              background: theme.warningBg, 
              borderRadius: '8px', 
              padding: '12px 16px', 
              marginBottom: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px'
            }}>
              <span style={{ color: theme.warning, fontWeight: '600', fontSize: '14px' }}>
                🧾 {approvedExpensesInRange.length} approved expense{approvedExpensesInRange.length !== 1 ? 's' : ''} in this period
              </span>
              <span style={{ color: theme.warning, fontWeight: '700', fontSize: '16px' }}>
                ${totalExpenses.toFixed(2)}
              </span>
            </div>
          )}

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
