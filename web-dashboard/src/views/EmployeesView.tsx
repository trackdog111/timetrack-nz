import React, { useState } from 'react';
import { Theme, Employee, EmployeeSettings, EmployeeCosting, Invite } from '../shared/types';

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
  updateCosting: (empId: string, costing: EmployeeCosting) => void;
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
  updateCosting,
  setRemoveConfirm
}: EmployeesViewProps) {
  const [expandedCosting, setExpandedCosting] = useState<string | null>(null);

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

  const RadioOption = ({ label, sublabel, selected, onClick }: { label: string; sublabel?: string; selected: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: selected ? theme.primary + '15' : 'transparent',
        border: `1px solid ${selected ? theme.primary : theme.inputBorder}`,
        borderRadius: '8px',
        padding: '8px 12px',
        cursor: 'pointer',
        color: selected ? theme.primary : theme.text,
        fontSize: '13px',
        fontWeight: selected ? '600' : '400',
        whiteSpace: 'nowrap' as const,
      }}
    >
      <span style={{
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        border: `2px solid ${selected ? theme.primary : theme.inputBorder}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        {selected && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: theme.primary }} />}
      </span>
      <span>{label}</span>
      {sublabel && <span style={{ fontSize: '11px', color: theme.textMuted, fontWeight: '400' }}>{sublabel}</span>}
    </button>
  );

  const getWorkerType = (costing?: EmployeeCosting): string => {
    return costing?.workerType || 'paye';
  };

  const getKiwiSaverPercent = (costing?: EmployeeCosting): number => {
    if (!costing || !costing.kiwiSaverOption || costing.kiwiSaverOption === 'none') return 0;
    if (costing.kiwiSaverOption === 'custom') return costing.kiwiSaverCustom || 0;
    return parseFloat(costing.kiwiSaverOption);
  };

  const getHolidayPayPercent = (costing?: EmployeeCosting): number => {
    if (!costing || !costing.holidayPayOption) return 8;
    if (costing.holidayPayOption === 'custom') return costing.holidayPayCustom || 0;
    return 8;
  };

  const getCostSummary = (costing?: EmployeeCosting) => {
    const rate = costing?.hourlyRate || 0;
    if (rate === 0) return null;
    const type = getWorkerType(costing);
    
    if (type === 'contractor_gst') {
      const gst = rate * 0.15;
      return { rate, gst, totalCost: rate + gst, type };
    }
    if (type === 'contractor_no_gst') {
      return { rate, totalCost: rate, type };
    }
    const ks = getKiwiSaverPercent(costing);
    const hp = getHolidayPayPercent(costing);
    const acc = costing?.accLevy || 0;
    const totalPercent = ks + hp + acc;
    const totalCost = rate * (1 + totalPercent / 100);
    return { rate, ks, hp, acc, totalPercent, totalCost, type };
  };

  const handleCostingChange = (empId: string, current: EmployeeCosting | undefined, updates: Partial<EmployeeCosting>) => {
    const merged: EmployeeCosting = { ...current, ...updates };
    const cleaned: any = {};
    for (const [key, value] of Object.entries(merged)) {
      cleaned[key] = value === undefined ? null : value;
    }
    updateCosting(empId, cleaned as EmployeeCosting);
  };

  const handleWorkerTypeChange = (empId: string, current: EmployeeCosting | undefined, newType: string) => {
    if (newType === 'contractor_gst' || newType === 'contractor_no_gst') {
      handleCostingChange(empId, current, {
        workerType: newType as any,
        kiwiSaverOption: null as any,
        kiwiSaverCustom: null as any,
        holidayPayOption: null as any,
        holidayPayCustom: null as any,
        accLevy: null as any,
      });
    } else {
      handleCostingChange(empId, current, { workerType: 'paye' as any });
    }
  };

  const getRatesSummaryText = (costing?: EmployeeCosting) => {
    const summary = getCostSummary(costing);
    if (!summary) return '';
    if (summary.type === 'contractor_gst') return `$${summary.rate.toFixed(2)}/hr + GST = $${summary.totalCost.toFixed(2)}/hr`;
    if (summary.type === 'contractor_no_gst') return `$${summary.rate.toFixed(2)}/hr`;
    return `$${summary.rate.toFixed(2)}/hr → $${summary.totalCost.toFixed(2)}/hr total`;
  };

  return (
    <div>
      <h1 style={{ color: theme.text, marginBottom: '24px', fontSize: isMobile ? '22px' : '28px' }}>Employees</h1>
      
      <div style={styles.card}>
        <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Invite New Employee</h3>
        <form onSubmit={inviteEmployee}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <input placeholder="Email" type="email" value={newEmpEmail} onChange={e => setNewEmpEmail(e.target.value)} required style={{ ...styles.input, flex: '2', minWidth: '200px' }} />
            <input placeholder="Name (optional)" value={newEmpName} onChange={e => setNewEmpName(e.target.value)} style={{ ...styles.input, flex: '1', minWidth: '150px' }} />
            <button type="submit" style={styles.btn}>Create Invite</button>
          </div>
        </form>
      </div>
      
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
                <button onClick={() => cancelInvite(inv.id)} style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${theme.danger}`, background: 'transparent', color: theme.danger, cursor: 'pointer', fontSize: '12px' }}>Cancel</button>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={() => sendInviteEmail(inv)} disabled={sendingEmail === inv.id} style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: theme.primary, color: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '600', opacity: sendingEmail === inv.id ? 0.7 : 1 }}>{sendingEmail === inv.id ? '⏳ Sending...' : '📧 Send Email'}</button>
                <button onClick={() => copyInviteLink(inv)} style={{ padding: '10px 16px', borderRadius: '8px', border: `1px solid ${theme.cardBorder}`, background: theme.card, color: theme.text, cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>📋 Copy Link</button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {employees.map(emp => {
        const isExpanded = expandedCosting === emp.id;
        const costing = emp.costing;
        const summary = getCostSummary(costing);
        const workerType = getWorkerType(costing);

        return (
          <div key={emp.id} style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
              <div>
                <p style={{ color: theme.text, fontWeight: '600', marginBottom: '4px' }}>{emp.name || emp.email}</p>
                <p style={{ color: theme.textMuted, fontSize: '14px' }}>{emp.email}</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {emp.role === 'manager' && <span style={{ background: theme.primary, color: 'white', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600' }}>Manager</span>}
                {emp.id !== user?.uid && <button onClick={() => setRemoveConfirm(emp.id)} style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${theme.danger}`, background: 'transparent', color: theme.danger, cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>Remove</button>}
              </div>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.cardAlt, padding: '12px', borderRadius: '8px' }}>
                <span style={{ color: theme.textMuted, fontSize: '14px' }}>GPS Tracking</span>
                <Toggle enabled={emp.settings?.gpsTracking ?? true} onClick={() => updateSettings(emp.id, { gpsTracking: !emp.settings?.gpsTracking })} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.cardAlt, padding: '12px', borderRadius: '8px' }}>
                <span style={{ color: theme.textMuted, fontSize: '14px' }}>Require Notes</span>
                <Toggle enabled={emp.settings?.requireNotes ?? false} onClick={() => updateSettings(emp.id, { requireNotes: !emp.settings?.requireNotes })} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.cardAlt, padding: '12px', borderRadius: '8px' }}>
                <span style={{ color: theme.textMuted, fontSize: '14px' }}>Chat Access</span>
                <Toggle enabled={emp.settings?.chatEnabled !== false} onClick={() => updateSettings(emp.id, { chatEnabled: emp.settings?.chatEnabled === false })} />
              </div>
            </div>

            <div style={{ marginTop: '12px' }}>
              <button
                onClick={() => setExpandedCosting(isExpanded ? null : emp.id)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: theme.cardAlt, border: `1px solid ${theme.cardBorder}`, borderRadius: isExpanded ? '8px 8px 0 0' : '8px', padding: '12px', cursor: 'pointer', color: theme.text }}
              >
                <span style={{ fontSize: '14px', fontWeight: '600' }}>
                  💰 Rates
                  {summary && <span style={{ fontWeight: '400', color: theme.textMuted, marginLeft: '12px', fontSize: '13px' }}>{getRatesSummaryText(costing)}</span>}
                </span>
                <span style={{ color: theme.textMuted, fontSize: '12px' }}>{isExpanded ? '▲' : '▼'}</span>
              </button>

              {isExpanded && (
                <div style={{ background: theme.cardAlt, border: `1px solid ${theme.cardBorder}`, borderTop: 'none', borderRadius: '0 0 8px 8px', padding: '16px' }}>
                  
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ color: theme.textMuted, fontSize: '13px', display: 'block', marginBottom: '6px' }}>Worker Type</label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <RadioOption label="PAYE Employee" selected={workerType === 'paye'} onClick={() => handleWorkerTypeChange(emp.id, costing, 'paye')} />
                      <RadioOption label="Contractor (GST)" sublabel="over $60k/yr" selected={workerType === 'contractor_gst'} onClick={() => handleWorkerTypeChange(emp.id, costing, 'contractor_gst')} />
                      <RadioOption label="Contractor (no GST)" sublabel="under $60k/yr" selected={workerType === 'contractor_no_gst'} onClick={() => handleWorkerTypeChange(emp.id, costing, 'contractor_no_gst')} />
                    </div>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ color: theme.textMuted, fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                      Hourly Rate ($){workerType === 'contractor_gst' ? ' (excl. GST)' : ''}
                    </label>
                    <input type="number" step="0.01" min="0" placeholder="0.00" value={costing?.hourlyRate || ''} onChange={(e) => handleCostingChange(emp.id, costing, { hourlyRate: e.target.value ? parseFloat(e.target.value) : null as any })} style={{ ...styles.input, maxWidth: '180px' }} />
                  </div>

                  {workerType === 'paye' && (
                    <>
                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ color: theme.textMuted, fontSize: '13px', display: 'block', marginBottom: '6px' }}>Employer KiwiSaver Contribution</label>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                          <RadioOption label="Not enrolled" selected={!costing?.kiwiSaverOption || costing.kiwiSaverOption === 'none'} onClick={() => handleCostingChange(emp.id, costing, { kiwiSaverOption: 'none', kiwiSaverCustom: null as any })} />
                          <RadioOption label="3%" sublabel="until 31 Mar 2026" selected={costing?.kiwiSaverOption === '3'} onClick={() => handleCostingChange(emp.id, costing, { kiwiSaverOption: '3', kiwiSaverCustom: null as any })} />
                          <RadioOption label="3.5%" sublabel="from 1 Apr 2026" selected={costing?.kiwiSaverOption === '3.5'} onClick={() => handleCostingChange(emp.id, costing, { kiwiSaverOption: '3.5', kiwiSaverCustom: null as any })} />
                          <RadioOption label="4%" sublabel="from 1 Apr 2028" selected={costing?.kiwiSaverOption === '4'} onClick={() => handleCostingChange(emp.id, costing, { kiwiSaverOption: '4', kiwiSaverCustom: null as any })} />
                          <RadioOption label="Custom" selected={costing?.kiwiSaverOption === 'custom'} onClick={() => handleCostingChange(emp.id, costing, { kiwiSaverOption: 'custom' })} />
                        </div>
                        {costing?.kiwiSaverOption === 'custom' && (
                          <input type="number" step="0.1" min="0" max="100" placeholder="e.g. 6" value={costing?.kiwiSaverCustom || ''} onChange={(e) => handleCostingChange(emp.id, costing, { kiwiSaverCustom: e.target.value ? parseFloat(e.target.value) : null as any })} style={{ ...styles.input, maxWidth: '120px' }} />
                        )}
                      </div>

                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ color: theme.textMuted, fontSize: '13px', display: 'block', marginBottom: '6px' }}>Holiday Pay</label>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                          <RadioOption label="8%" sublabel="standard" selected={!costing?.holidayPayOption || costing.holidayPayOption === '8'} onClick={() => handleCostingChange(emp.id, costing, { holidayPayOption: '8', holidayPayCustom: null as any })} />
                          <RadioOption label="Custom" selected={costing?.holidayPayOption === 'custom'} onClick={() => handleCostingChange(emp.id, costing, { holidayPayOption: 'custom' })} />
                        </div>
                        {costing?.holidayPayOption === 'custom' && (
                          <input type="number" step="0.1" min="0" max="100" placeholder="e.g. 10" value={costing?.holidayPayCustom || ''} onChange={(e) => handleCostingChange(emp.id, costing, { holidayPayCustom: e.target.value ? parseFloat(e.target.value) : null as any })} style={{ ...styles.input, maxWidth: '120px' }} />
                        )}
                      </div>

                      <div style={{ marginBottom: '16px' }}>
                        <label style={{ color: theme.textMuted, fontSize: '13px', display: 'block', marginBottom: '6px' }}>ACC Levy (%)</label>
                        <input type="number" step="0.01" min="0" max="100" placeholder="e.g. 1.39" value={costing?.accLevy || ''} onChange={(e) => handleCostingChange(emp.id, costing, { accLevy: e.target.value ? parseFloat(e.target.value) : null as any })} style={{ ...styles.input, maxWidth: '180px' }} />
                        <p style={{ color: theme.textMuted, fontSize: '11px', marginTop: '4px' }}>Varies by industry — check your ACC invoice for your rate</p>
                      </div>
                    </>
                  )}

                  {workerType === 'contractor_gst' && (
                    <div style={{ background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: theme.textMuted }}>
                      GST registered contractor — invoices at hourly rate + 15% GST. No employer KiwiSaver, holiday pay, or ACC obligations.
                    </div>
                  )}

                  {workerType === 'contractor_no_gst' && (
                    <div style={{ background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: theme.textMuted }}>
                      Non-GST contractor (under $60k/yr turnover) — invoices at hourly rate only. No employer KiwiSaver, holiday pay, or ACC obligations.
                    </div>
                  )}

                  {summary && (
                    <div style={{ background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: '8px', padding: '12px' }}>
                      <p style={{ color: theme.text, fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>Rate Summary</p>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: '13px' }}>
                        <span style={{ color: theme.textMuted }}>Base rate:</span>
                        <span style={{ color: theme.text }}>${summary.rate.toFixed(2)}/hr</span>
                        {summary.type === 'contractor_gst' && <>
                          <span style={{ color: theme.textMuted }}>GST (15%):</span>
                          <span style={{ color: theme.text }}>+${((summary as any).gst).toFixed(2)}/hr</span>
                        </>}
                        {summary.type === 'paye' && <>
                          {(summary as any).ks > 0 && <>
                            <span style={{ color: theme.textMuted }}>KiwiSaver ({(summary as any).ks}%):</span>
                            <span style={{ color: theme.text }}>+${(summary.rate * (summary as any).ks / 100).toFixed(2)}/hr</span>
                          </>}
                          <span style={{ color: theme.textMuted }}>Holiday pay ({(summary as any).hp}%):</span>
                          <span style={{ color: theme.text }}>+${(summary.rate * (summary as any).hp / 100).toFixed(2)}/hr</span>
                          {(summary as any).acc > 0 && <>
                            <span style={{ color: theme.textMuted }}>ACC levy ({(summary as any).acc}%):</span>
                            <span style={{ color: theme.text }}>+${(summary.rate * (summary as any).acc / 100).toFixed(2)}/hr</span>
                          </>}
                        </>}
                        <span style={{ color: theme.text, fontWeight: '600', borderTop: `1px solid ${theme.cardBorder}`, paddingTop: '4px', marginTop: '4px' }}>Total cost:</span>
                        <span style={{ color: theme.primary, fontWeight: '600', borderTop: `1px solid ${theme.cardBorder}`, paddingTop: '4px', marginTop: '4px' }}>${summary.totalCost.toFixed(2)}/hr</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
