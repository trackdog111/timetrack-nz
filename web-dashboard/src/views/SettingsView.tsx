import { Shift, Theme, Employee, CompanySettings, ChatMessage } from '../shared/types';
import { weekDayNames } from '../shared/utils';

interface SettingsViewProps {
  theme: Theme;
  isMobile: boolean;
  allShifts: Shift[];
  employees: Employee[];
  messages: ChatMessage[];
  editingCompanySettings: CompanySettings;
  setEditingCompanySettings: (settings: CompanySettings) => void;
  saveCompanySettings: () => void;
  savingCompanySettings: boolean;
  cleanupStart: string;
  setCleanupStart: (v: string) => void;
  cleanupEnd: string;
  setCleanupEnd: (v: string) => void;
  cleanupConfirm: boolean;
  setCleanupConfirm: (v: boolean) => void;
  cleanup: () => void;
}

export function SettingsView({
  theme,
  isMobile,
  allShifts,
  employees,
  messages,
  editingCompanySettings,
  setEditingCompanySettings,
  saveCompanySettings,
  savingCompanySettings,
  cleanupStart,
  setCleanupStart,
  cleanupEnd,
  setCleanupEnd,
  cleanupConfirm,
  setCleanupConfirm,
  cleanup
}: SettingsViewProps) {
  const styles = {
    card: { background: theme.card, borderRadius: '12px', padding: '20px', marginBottom: '16px', border: `1px solid ${theme.cardBorder}` },
    input: { padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.inputBorder}`, background: theme.input, color: theme.text, fontSize: '14px', width: '100%', boxSizing: 'border-box' as const },
    btn: { padding: '10px 20px', borderRadius: '8px', border: 'none', background: theme.primary, color: 'white', cursor: 'pointer', fontWeight: '600' as const, fontSize: '14px' },
    btnDanger: { padding: '10px 20px', borderRadius: '8px', border: 'none', background: theme.danger, color: 'white', cursor: 'pointer', fontWeight: '600' as const, fontSize: '14px' }
  };

  const shiftsToDelete = allShifts.filter(s => {
    if (!s.clockIn?.toDate) return false;
    const d = s.clockIn.toDate();
    const st = new Date(cleanupStart);
    const en = new Date(cleanupEnd);
    en.setHours(23, 59, 59);
    return d >= st && d <= en && s.status === 'completed';
  }).length;

  return (
    <div>
      <h1 style={{ color: theme.text, marginBottom: '24px', fontSize: isMobile ? '22px' : '28px' }}>Settings</h1>
      
      <div style={styles.card}>
        <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>🏢 Company Settings</h3>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>
          <div>
            <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Field 1 Label</label>
            <input value={editingCompanySettings.field1Label} onChange={e => setEditingCompanySettings({ ...editingCompanySettings, field1Label: e.target.value })} style={styles.input} />
          </div>
          <div>
            <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Field 2 Label</label>
            <input value={editingCompanySettings.field2Label} onChange={e => setEditingCompanySettings({ ...editingCompanySettings, field2Label: e.target.value })} style={styles.input} />
          </div>
          <div>
            <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Field 3 Label</label>
            <input value={editingCompanySettings.field3Label} onChange={e => setEditingCompanySettings({ ...editingCompanySettings, field3Label: e.target.value })} style={styles.input} />
          </div>
          <div>
            <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Manager Display Name</label>
            <input value={editingCompanySettings.managerDisplayName} onChange={e => setEditingCompanySettings({ ...editingCompanySettings, managerDisplayName: e.target.value })} style={styles.input} />
          </div>
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Paid Rest Break Duration</label>
          <select value={editingCompanySettings.paidRestMinutes || 10} onChange={e => setEditingCompanySettings({ ...editingCompanySettings, paidRestMinutes: parseInt(e.target.value) })} style={{ ...styles.input, maxWidth: isMobile ? '100%' : '300px' }}>
            <option value={10}>10 minutes (NZ law minimum)</option>
            <option value={15}>15 minutes</option>
            <option value={20}>20 minutes</option>
            <option value={25}>25 minutes</option>
            <option value={30}>30 minutes</option>
          </select>
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Pay Week End Day</label>
          <select value={editingCompanySettings.payWeekEndDay} onChange={e => setEditingCompanySettings({ ...editingCompanySettings, payWeekEndDay: parseInt(e.target.value) })} style={{ ...styles.input, maxWidth: isMobile ? '100%' : '300px' }}>
            {weekDayNames.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
          <p style={{ color: theme.textMuted, fontSize: '11px', marginTop: '4px' }}>Timesheets grouped by weeks ending on this day</p>
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '8px' }}>Photo Verification at Clock-In</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input type="checkbox" checked={editingCompanySettings.photoVerification || false} onChange={e => setEditingCompanySettings({ ...editingCompanySettings, photoVerification: e.target.checked })} style={{ width: '20px', height: '20px' }} />
            <span style={{ color: theme.text, fontSize: '14px' }}>Require employees to take a selfie when clocking in</span>
          </label>
        </div>
        
        <button onClick={saveCompanySettings} disabled={savingCompanySettings} style={{ ...styles.btn, opacity: savingCompanySettings ? 0.7 : 1 }}>
          {savingCompanySettings ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
      
      <div style={styles.card}>
        <h3 style={{ color: theme.danger, marginBottom: '16px', fontSize: '16px' }}>⚠️ Delete Old Data</h3>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <div style={{ flex: '1', minWidth: '140px' }}>
            <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Start</label>
            <input type="date" value={cleanupStart} onChange={e => setCleanupStart(e.target.value)} style={styles.input} />
          </div>
          <div style={{ flex: '1', minWidth: '140px' }}>
            <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>End</label>
            <input type="date" value={cleanupEnd} onChange={e => setCleanupEnd(e.target.value)} style={styles.input} />
          </div>
        </div>
        
        {cleanupStart && cleanupEnd && (
          <div style={{ background: theme.dangerBg, padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
            <p style={{ color: theme.danger, marginBottom: '12px' }}>Will delete {shiftsToDelete} shifts</p>
            <label style={{ color: theme.danger, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={cleanupConfirm} onChange={e => setCleanupConfirm(e.target.checked)} />
              I understand this cannot be undone
            </label>
          </div>
        )}
        
        <button onClick={cleanup} disabled={!cleanupConfirm} style={{ ...styles.btnDanger, opacity: cleanupConfirm ? 1 : 0.5, cursor: cleanupConfirm ? 'pointer' : 'not-allowed' }}>
          Delete Data
        </button>
      </div>
      
      <div style={{ ...styles.card, marginTop: '24px' }}>
        <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Database Stats</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <div style={{ background: theme.cardAlt, padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
            <p style={{ color: theme.text, fontSize: '24px', fontWeight: '700' }}>{allShifts.length}</p>
            <p style={{ color: theme.textMuted, fontSize: '13px' }}>Shifts</p>
          </div>
          <div style={{ background: theme.cardAlt, padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
            <p style={{ color: theme.text, fontSize: '24px', fontWeight: '700' }}>{employees.length}</p>
            <p style={{ color: theme.textMuted, fontSize: '13px' }}>Employees</p>
          </div>
          <div style={{ background: theme.cardAlt, padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
            <p style={{ color: theme.text, fontSize: '24px', fontWeight: '700' }}>{messages.length}</p>
            <p style={{ color: theme.textMuted, fontSize: '13px' }}>Messages</p>
          </div>
        </div>
      </div>
    </div>
  );
}