import { Theme, Employee, EmployeeSettings, Invite } from '../shared/types';

interface EmployeesViewProps {
  theme: Theme;
  isMobile: boolean;
  user: { uid: string } | null;
  employees: Employee[];
  invites: Invite[];
  newEmpEmail: string;
  setNewEmpEmail: (v: string) => void;
  newEmpName: string;
  setNewEmpName: (v: string) => void;
  inviteEmployee: (e: React.FormEvent) => void;
  cancelInvite: (id: string) => void;
  sendInviteEmail: (inv: Invite) => void;
  copyInviteLink: (inv: Invite) => void;
  sendingEmail: string | null;
  updateSettings: (empId: string, updates: Partial<EmployeeSettings>) => void;
  setRemoveConfirm: (id: string | null) => void;
}

export function EmployeesView({
  theme,
  isMobile,
  user,
  employees,
  invites,
  newEmpEmail,
  setNewEmpEmail,
  newEmpName,
  setNewEmpName,
  inviteEmployee,
  cancelInvite,
  sendInviteEmail,
  copyInviteLink,
  sendingEmail,
  updateSettings,
  setRemoveConfirm
}: EmployeesViewProps) {
  const styles = {
    card: { background: theme.card, borderRadius: '12px', padding: '20px', marginBottom: '16px', border: `1px solid ${theme.cardBorder}` },
    input: { padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.inputBorder}`, background: theme.input, color: theme.text, fontSize: '14px', width: '100%', boxSizing: 'border-box' as const },
    btn: { padding: '10px 20px', borderRadius: '8px', border: 'none', background: theme.primary, color: 'white', cursor: 'pointer', fontWeight: '600' as const, fontSize: '14px' }
  };

  const Toggle = ({ enabled, onClick, color }: { enabled: boolean; onClick: () => void; color?: string }) => (
    <button 
      onClick={onClick} 
      style={{ 
        width: '50px', 
        height: '26px', 
        borderRadius: '13px', 
        border: 'none', 
        cursor: 'pointer', 
        background: enabled ? (color || theme.success) : '#cbd5e1', 
        position: 'relative' 
      }}
    >
      <span style={{ 
        position: 'absolute', 
        top: '3px', 
        width: '20px', 
        height: '20px', 
        borderRadius: '50%', 
        background: 'white', 
        left: enabled ? '27px' : '3px', 
        transition: 'left 0.2s' 
      }} />
    </button>
  );

  return (
    <div>
      <h1 style={{ color: theme.text, marginBottom: '24px', fontSize: isMobile ? '22px' : '28px' }}>Employees</h1>
      
      {/* Invite Form */}
      <div style={styles.card}>
        <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Invite New Employee</h3>
        <form onSubmit={inviteEmployee}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <input 
              placeholder="Email" 
              type="email" 
              value={newEmpEmail} 
              onChange={e => setNewEmpEmail(e.target.value)} 
              required 
              style={{ ...styles.input, flex: '2', minWidth: '200px' }} 
            />
            <input 
              placeholder="Name (optional)" 
              value={newEmpName} 
              onChange={e => setNewEmpName(e.target.value)} 
              style={{ ...styles.input, flex: '1', minWidth: '150px' }} 
            />
            <button type="submit" style={styles.btn}>Create Invite</button>
          </div>
        </form>
      </div>
      
      {/* Pending Invites */}
      {invites.filter(i => i.status === 'pending').length > 0 && (
        <div style={styles.card}>
          <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Pending Invites</h3>
          {invites.filter(i => i.status === 'pending').map(inv => (
            <div key={inv.id} style={{ background: theme.cardAlt, padding: '16px', borderRadius: '8px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                <div>
                  <p style={{ color: theme.text, fontWeight: '600' }}>{inv.name || inv.email}</p>
                  <p style={{ color: theme.textMuted, fontSize: '13px' }}>{inv.email}</p>
                  {inv.emailSent && <p style={{ color: theme.success, fontSize: '12px', marginTop: '4px' }}>✓ Email sent</p>}
                </div>
                <button 
                  onClick={() => cancelInvite(inv.id)} 
                  style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${theme.danger}`, background: 'transparent', color: theme.danger, cursor: 'pointer', fontSize: '12px' }}
                >
                  Cancel
                </button>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button 
                  onClick={() => sendInviteEmail(inv)} 
                  disabled={sendingEmail === inv.id} 
                  style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: theme.primary, color: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '600', opacity: sendingEmail === inv.id ? 0.7 : 1 }}
                >
                  {sendingEmail === inv.id ? '⏳ Sending...' : '📧 Send Email'}
                </button>
                <button 
                  onClick={() => copyInviteLink(inv)} 
                  style={{ padding: '10px 16px', borderRadius: '8px', border: `1px solid ${theme.cardBorder}`, background: theme.card, color: theme.text, cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                >
                  📋 Copy Link
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Employee List */}
      {employees.map(emp => (
        <div key={emp.id} style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
            <div>
              <p style={{ color: theme.text, fontWeight: '600', marginBottom: '4px' }}>{emp.name || emp.email}</p>
              <p style={{ color: theme.textMuted, fontSize: '14px' }}>{emp.email}</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {emp.role === 'manager' && (
                <span style={{ background: theme.primary, color: 'white', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600' }}>Manager</span>
              )}
              {emp.id !== user?.uid && (
                <button 
                  onClick={() => setRemoveConfirm(emp.id)} 
                  style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${theme.danger}`, background: 'transparent', color: theme.danger, cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.cardAlt, padding: '12px', borderRadius: '8px' }}>
              <span style={{ color: theme.textMuted, fontSize: '14px' }}>GPS Tracking</span>
              <Toggle enabled={emp.settings?.gpsTracking ?? true} onClick={() => updateSettings(emp.id, { gpsTracking: !emp.settings?.gpsTracking })} />
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.cardAlt, padding: '12px', borderRadius: '8px' }}>
              <span style={{ color: theme.textMuted, fontSize: '14px' }}>GPS Interval</span>
              <select 
                value={emp.settings?.gpsInterval || 10} 
                onChange={e => updateSettings(emp.id, { gpsInterval: parseInt(e.target.value) })} 
                style={{ padding: '6px', borderRadius: '6px', background: theme.input, color: theme.text, border: `1px solid ${theme.inputBorder}` }}
              >
                <option value={2}>2 min</option>
                <option value={4}>4 min</option>
                <option value={6}>6 min</option>
                <option value={8}>8 min</option>
                <option value={10}>10 min</option>
                <option value={12}>12 min</option>
                <option value={14}>14 min</option>
                <option value={16}>16 min</option>
                <option value={18}>18 min</option>
                <option value={20}>20 min</option>
              </select>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.cardAlt, padding: '12px', borderRadius: '8px' }}>
              <span style={{ color: theme.textMuted, fontSize: '14px' }}>Require Notes</span>
              <Toggle enabled={emp.settings?.requireNotes ?? false} onClick={() => updateSettings(emp.id, { requireNotes: !emp.settings?.requireNotes })} />
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.cardAlt, padding: '12px', borderRadius: '8px' }}>
              <span style={{ color: theme.textMuted, fontSize: '14px' }}>Chat Access</span>
              <Toggle enabled={emp.settings?.chatEnabled !== false} onClick={() => updateSettings(emp.id, { chatEnabled: emp.settings?.chatEnabled === false })} />
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: emp.settings?.autoTravel ? theme.travelBg : theme.cardAlt, padding: '12px', borderRadius: '8px' }}>
              <span style={{ color: emp.settings?.autoTravel ? theme.travel : theme.textMuted, fontSize: '14px' }}>🚗 Auto-Travel</span>
              <Toggle enabled={emp.settings?.autoTravel ?? false} onClick={() => updateSettings(emp.id, { autoTravel: !emp.settings?.autoTravel })} color={theme.travel} />
            </div>
            
            {emp.settings?.autoTravel && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.cardAlt, padding: '12px', borderRadius: '8px' }}>
                  <span style={{ color: theme.textMuted, fontSize: '14px' }}>GPS Interval</span>
                  <select 
                    value={emp.settings?.autoTravelInterval || 2} 
                    onChange={e => updateSettings(emp.id, { autoTravelInterval: parseInt(e.target.value) })} 
                    style={{ padding: '6px', borderRadius: '6px', background: theme.input, color: theme.text, border: `1px solid ${theme.inputBorder}` }}
                  >
                    <option value={1}>1 min</option>
                    <option value={2}>2 min</option>
                    <option value={5}>5 min</option>
                  </select>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.cardAlt, padding: '12px', borderRadius: '8px' }}>
                  <span style={{ color: theme.textMuted, fontSize: '14px' }}>Detection Dist</span>
                  <select 
                    value={emp.settings?.detectionDistance || 200} 
                    onChange={e => updateSettings(emp.id, { detectionDistance: parseInt(e.target.value) })} 
                    style={{ padding: '6px', borderRadius: '6px', background: theme.input, color: theme.text, border: `1px solid ${theme.inputBorder}` }}
                  >
                    <option value={100}>100m</option>
                    <option value={200}>200m</option>
                    <option value={500}>500m</option>
                  </select>
                </div>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}