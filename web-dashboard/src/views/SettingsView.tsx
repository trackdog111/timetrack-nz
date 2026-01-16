import { useState, useEffect } from 'react';
import { Shift, Theme, Employee, CompanySettings, ChatMessage } from '../shared/types';
import { weekDayNames } from '../shared/utils';
import { getFunctions, httpsCallable } from 'firebase/functions';

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
  companyId: string;
}

interface XeroStatus {
  connected: boolean;
  tenantName?: string;
  connectedAt?: string;
}

interface ReimbursementType {
  id: string;
  name: string;
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
  cleanup,
  companyId
}: SettingsViewProps) {
  const styles = {
    card: { background: theme.card, borderRadius: '12px', padding: '20px', marginBottom: '16px', border: `1px solid ${theme.cardBorder}` },
    input: { padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.inputBorder}`, background: theme.input, color: theme.text, fontSize: '14px', width: '100%', boxSizing: 'border-box' as const },
    btn: { padding: '10px 20px', borderRadius: '8px', border: 'none', background: theme.primary, color: 'white', cursor: 'pointer', fontWeight: '600' as const, fontSize: '14px' },
    btnDanger: { padding: '10px 20px', borderRadius: '8px', border: 'none', background: theme.danger, color: 'white', cursor: 'pointer', fontWeight: '600' as const, fontSize: '14px' }
  };

  // Xero integration state
  const [xeroStatus, setXeroStatus] = useState<XeroStatus | null>(null);
  const [xeroLoading, setXeroLoading] = useState(true);
  const [xeroConnecting, setXeroConnecting] = useState(false);
  const [xeroDisconnecting, setXeroDisconnecting] = useState(false);
  const [xeroError, setXeroError] = useState<string | null>(null);

  // Expense mapping state
  const [reimbursementTypes, setReimbursementTypes] = useState<ReimbursementType[]>([]);
  const [expenseMappings, setExpenseMappings] = useState<Record<string, string>>({});
  const [mappingsLoading, setMappingsLoading] = useState(false);
  const [mappingsSaving, setMappingsSaving] = useState(false);
  const [mappingsSuccess, setMappingsSuccess] = useState(false);
  const [mappingsError, setMappingsError] = useState<string | null>(null);

  // Trackable expense categories
  const trackableCategories = ['Fuel', 'Mileage', 'Materials', 'Equipment', 'Phone', 'Other'];

  const functions = getFunctions(undefined, 'australia-southeast1');

  // Check for OAuth callback results in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const xeroConnected = params.get('xero_connected');
    const xeroErrorParam = params.get('xero_error');

    if (xeroConnected === 'true') {
      setXeroError(null);
      window.history.replaceState({}, '', window.location.pathname);
      // Refresh status
      fetchXeroStatus();
    } else if (xeroErrorParam) {
      const errorMessages: Record<string, string> = {
        'missing_params': 'OAuth callback missing required parameters',
        'invalid_state': 'Invalid or expired authorization session',
        'no_organisation': 'No Xero organisation found. Please ensure you have access to a Xero organisation.',
        'token_exchange_failed': 'Failed to connect to Xero. Please try again.'
      };
      setXeroError(errorMessages[xeroErrorParam] || `Connection error: ${xeroErrorParam}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Fetch Xero connection status
  const fetchXeroStatus = async () => {
    if (!companyId) return;
    try {
      const xeroGetStatus = httpsCallable<{ companyId: string }, XeroStatus>(functions, 'xeroGetStatus');
      const result = await xeroGetStatus({ companyId });
      setXeroStatus(result.data);
      
      // If connected, fetch expense mappings
      if (result.data.connected) {
        fetchExpenseMappings();
      }
    } catch (err: any) {
      console.error('Error fetching Xero status:', err);
    } finally {
      setXeroLoading(false);
    }
  };

  useEffect(() => {
    fetchXeroStatus();
  }, [companyId]);

  // Fetch expense mappings and reimbursement types
  const fetchExpenseMappings = async () => {
    setMappingsLoading(true);
    setMappingsError(null);
    try {
      const xeroGetExpenseMappings = httpsCallable<{ companyId: string }, { mappings: Record<string, string>, reimbursementTypes: ReimbursementType[] }>(functions, 'xeroGetExpenseMappings');
      const result = await xeroGetExpenseMappings({ companyId });
      setExpenseMappings(result.data.mappings || {});
      setReimbursementTypes(result.data.reimbursementTypes || []);
    } catch (err: any) {
      console.error('Error fetching expense mappings:', err);
      setMappingsError('Failed to load expense mappings');
    } finally {
      setMappingsLoading(false);
    }
  };

  // Refresh reimbursement types from Xero
  const refreshReimbursementTypes = async () => {
    setMappingsLoading(true);
    setMappingsError(null);
    try {
      const xeroGetReimbursementTypes = httpsCallable<{ companyId: string }, { reimbursementTypes: ReimbursementType[] }>(functions, 'xeroGetReimbursementTypes');
      const result = await xeroGetReimbursementTypes({ companyId });
      setReimbursementTypes(result.data.reimbursementTypes || []);
    } catch (err: any) {
      console.error('Error fetching reimbursement types:', err);
      setMappingsError('Failed to fetch reimbursement types from Xero. Make sure you have reimbursement types configured in Xero Payroll > Pay Items > Reimbursements');
    } finally {
      setMappingsLoading(false);
    }
  };

  // Save expense mappings
  const saveExpenseMappings = async () => {
    setMappingsSaving(true);
    setMappingsError(null);
    setMappingsSuccess(false);
    try {
      // Remove empty mappings
      const cleanMappings = Object.fromEntries(
        Object.entries(expenseMappings).filter(([_, v]) => v)
      );
      
      const xeroSaveExpenseMappings = httpsCallable<{ companyId: string, mappings: Record<string, string> }, { success: boolean }>(functions, 'xeroSaveExpenseMappings');
      await xeroSaveExpenseMappings({ companyId, mappings: cleanMappings });
      setMappingsSuccess(true);
      setTimeout(() => setMappingsSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error saving expense mappings:', err);
      setMappingsError('Failed to save expense mappings');
    } finally {
      setMappingsSaving(false);
    }
  };

  // Handle mapping change
  const handleMappingChange = (category: string, xeroTypeId: string) => {
    setExpenseMappings(prev => ({
      ...prev,
      [category]: xeroTypeId
    }));
    setMappingsSuccess(false);
  };

  // Connect to Xero
  const handleXeroConnect = async () => {
    setXeroConnecting(true);
    setXeroError(null);
    try {
      const xeroGetAuthUrl = httpsCallable<{ companyId: string }, { authUrl: string }>(functions, 'xeroGetAuthUrl');
      const result = await xeroGetAuthUrl({ companyId });
      window.location.href = result.data.authUrl;
    } catch (err: any) {
      console.error('Error getting auth URL:', err);
      setXeroError('Failed to initiate Xero connection');
      setXeroConnecting(false);
    }
  };

  // Disconnect from Xero
  const handleXeroDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Xero? You will need to reconnect to export timesheets.')) return;
    setXeroDisconnecting(true);
    setXeroError(null);
    try {
      const xeroDisconnect = httpsCallable<{ companyId: string }, { success: boolean }>(functions, 'xeroDisconnect');
      await xeroDisconnect({ companyId });
      setXeroStatus({ connected: false });
      setReimbursementTypes([]);
      setExpenseMappings({});
    } catch (err: any) {
      console.error('Error disconnecting Xero:', err);
      setXeroError('Failed to disconnect Xero');
    } finally {
      setXeroDisconnecting(false);
    }
  };

  const shiftsToDelete = allShifts.filter(s => {
    if (!s.clockIn?.toDate) return false;
    const d = s.clockIn.toDate();
    const st = new Date(cleanupStart);
    const en = new Date(cleanupEnd);
    en.setHours(23, 59, 59);
    return d >= st && d <= en && s.status === 'completed';
  }).length;

  // Toggle component for cleaner code
  const Toggle = ({ checked, onChange }: { checked: boolean, onChange: (v: boolean) => void }) => (
    <button 
      onClick={() => onChange(!checked)} 
      style={{ 
        width: '44px', 
        height: '24px', 
        borderRadius: '12px', 
        border: 'none', 
        cursor: 'pointer', 
        background: checked ? theme.success : '#cbd5e1', 
        position: 'relative',
        flexShrink: 0
      }}
    >
      <span style={{ 
        position: 'absolute', 
        top: '2px', 
        width: '20px', 
        height: '20px', 
        borderRadius: '50%', 
        background: 'white', 
        left: checked ? '22px' : '2px', 
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
      }} />
    </button>
  );

  return (
    <div>
      <h1 style={{ color: theme.text, marginBottom: '24px', fontSize: isMobile ? '22px' : '28px' }}>Settings</h1>
      
      <div style={styles.card}>
        <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>🏢 Company Settings</h3>
        
        {/* Job Log Fields */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '12px', fontWeight: '600' }}>Job Log Fields</label>
          
          {/* Field 1 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', padding: '12px', background: theme.cardAlt, borderRadius: '8px' }}>
            <Toggle 
              checked={editingCompanySettings.field1Enabled !== false} 
              onChange={(v) => setEditingCompanySettings({ ...editingCompanySettings, field1Enabled: v })} 
            />
            <input 
              value={editingCompanySettings.field1Label || 'Notes'} 
              onChange={e => setEditingCompanySettings({ ...editingCompanySettings, field1Label: e.target.value })} 
              placeholder="Field 1 label"
              disabled={editingCompanySettings.field1Enabled === false}
              style={{ 
                ...styles.input, 
                flex: 1,
                opacity: editingCompanySettings.field1Enabled === false ? 0.5 : 1 
              }} 
            />
          </div>
          
          {/* Field 2 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', padding: '12px', background: theme.cardAlt, borderRadius: '8px' }}>
            <Toggle 
              checked={editingCompanySettings.field2Enabled === true} 
              onChange={(v) => setEditingCompanySettings({ ...editingCompanySettings, field2Enabled: v })} 
            />
            <input 
              value={editingCompanySettings.field2Label || 'Lists'} 
              onChange={e => setEditingCompanySettings({ ...editingCompanySettings, field2Label: e.target.value })} 
              placeholder="Field 2 label"
              disabled={editingCompanySettings.field2Enabled !== true}
              style={{ 
                ...styles.input, 
                flex: 1,
                opacity: editingCompanySettings.field2Enabled !== true ? 0.5 : 1 
              }} 
            />
          </div>
          
          {/* Field 3 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: theme.cardAlt, borderRadius: '8px' }}>
            <Toggle 
              checked={editingCompanySettings.field3Enabled === true} 
              onChange={(v) => setEditingCompanySettings({ ...editingCompanySettings, field3Enabled: v })} 
            />
            <input 
              value={editingCompanySettings.field3Label || 'Other'} 
              onChange={e => setEditingCompanySettings({ ...editingCompanySettings, field3Label: e.target.value })} 
              placeholder="Field 3 label"
              disabled={editingCompanySettings.field3Enabled !== true}
              style={{ 
                ...styles.input, 
                flex: 1,
                opacity: editingCompanySettings.field3Enabled !== true ? 0.5 : 1 
              }} 
            />
          </div>
          
          <p style={{ color: theme.textMuted, fontSize: '11px', marginTop: '8px' }}>Toggle fields on/off. Enabled fields appear in employee timesheets.</p>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>
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

      {/* Xero Integration Card */}
      <div style={styles.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ color: theme.text, fontSize: '16px', margin: 0 }}>📊 Xero Integration</h3>
          {xeroStatus?.connected && (
            <span style={{ background: theme.successBg, color: theme.success, padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>Connected</span>
          )}
        </div>

        {xeroError && (
          <div style={{ marginBottom: '16px', padding: '12px', background: theme.dangerBg, borderRadius: '8px' }}>
            <p style={{ color: theme.danger, fontSize: '13px', margin: 0 }}>{xeroError}</p>
          </div>
        )}

        {xeroLoading ? (
          <p style={{ color: theme.textMuted, fontSize: '14px' }}>Checking Xero connection...</p>
        ) : xeroStatus?.connected ? (
          <div>
            <div style={{ marginBottom: '16px', padding: '16px', background: theme.cardAlt, borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', background: '#13B5EA', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: 'white', fontWeight: '700', fontSize: '18px' }}>X</span>
                </div>
                <div>
                  <p style={{ color: theme.text, fontWeight: '600', fontSize: '14px', margin: 0 }}>{xeroStatus.tenantName}</p>
                  <p style={{ color: theme.textMuted, fontSize: '12px', margin: '2px 0 0 0' }}>
                    Connected {xeroStatus.connectedAt ? new Date(xeroStatus.connectedAt).toLocaleDateString('en-NZ') : ''}
                  </p>
                </div>
              </div>
            </div>

            {/* Expense Category Mapping Section */}
            <div style={{ marginBottom: '20px', padding: '16px', background: theme.cardAlt, borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h4 style={{ color: theme.text, fontSize: '14px', margin: 0, fontWeight: '600' }}>💰 Expense Category Mapping</h4>
                <button
                  onClick={refreshReimbursementTypes}
                  disabled={mappingsLoading}
                  style={{ padding: '6px 12px', borderRadius: '6px', background: 'transparent', color: theme.primary, border: `1px solid ${theme.primary}`, cursor: mappingsLoading ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '500', opacity: mappingsLoading ? 0.7 : 1 }}
                >
                  {mappingsLoading ? 'Loading...' : 'Refresh from Xero'}
                </button>
              </div>
              
              <p style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '12px' }}>
                Map your Trackable expense categories to Xero reimbursement types. Unmapped categories will be skipped during export.
              </p>

              {mappingsError && (
                <div style={{ marginBottom: '12px', padding: '10px', background: theme.dangerBg, borderRadius: '6px' }}>
                  <p style={{ color: theme.danger, fontSize: '12px', margin: 0 }}>{mappingsError}</p>
                </div>
              )}

              {mappingsSuccess && (
                <div style={{ marginBottom: '12px', padding: '10px', background: theme.successBg, borderRadius: '6px' }}>
                  <p style={{ color: theme.success, fontSize: '12px', margin: 0 }}>Mappings saved successfully!</p>
                </div>
              )}

              {reimbursementTypes.length === 0 ? (
                <div style={{ padding: '12px', background: '#fff8e0', borderRadius: '6px', marginBottom: '12px' }}>
                  <p style={{ color: '#92600c', fontSize: '12px', margin: 0 }}>
                    <strong>No reimbursement types found in Xero.</strong><br />
                    Set them up in Xero: Payroll → Pay Items → Reimbursements → Add
                  </p>
                </div>
              ) : (
                <div style={{ marginBottom: '12px' }}>
                  {trackableCategories.map(category => (
                    <div key={category} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                      <span style={{ color: theme.text, fontSize: '13px', width: '80px', flexShrink: 0 }}>{category}</span>
                      <select
                        value={expenseMappings[category] || ''}
                        onChange={(e) => handleMappingChange(category, e.target.value)}
                        style={{ ...styles.input, flex: 1, fontSize: '13px', padding: '8px 10px' }}
                      >
                        <option value="">-- Not mapped --</option>
                        {reimbursementTypes.map(type => (
                          <option key={type.id} value={type.id}>{type.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              {reimbursementTypes.length > 0 && (
                <button
                  onClick={saveExpenseMappings}
                  disabled={mappingsSaving}
                  style={{ ...styles.btn, fontSize: '13px', padding: '8px 16px', opacity: mappingsSaving ? 0.7 : 1 }}
                >
                  {mappingsSaving ? 'Saving...' : 'Save Mappings'}
                </button>
              )}
            </div>

            <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '16px' }}>
              Your Xero account is connected. You can export finalized timesheets directly to Xero Payroll from the Timesheets page.
            </p>
            <button
              onClick={handleXeroDisconnect}
              disabled={xeroDisconnecting}
              style={{ padding: '8px 16px', borderRadius: '6px', background: 'transparent', color: theme.danger, border: `1px solid ${theme.danger}`, cursor: xeroDisconnecting ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '500', opacity: xeroDisconnecting ? 0.7 : 1 }}
            >
              {xeroDisconnecting ? 'Disconnecting...' : 'Disconnect Xero'}
            </button>
          </div>
        ) : (
          <div>
            <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '16px' }}>
              Connect your Xero account to export finalized timesheets directly to Xero Payroll for seamless payroll processing.
            </p>
            <div style={{ marginBottom: '16px', padding: '12px', background: '#eff6ff', borderRadius: '8px' }}>
              <p style={{ color: '#1e40af', fontSize: '12px', margin: 0 }}>
                <strong>Note:</strong> You'll need to be an admin of your Xero organisation to connect.
              </p>
            </div>
            <button
              onClick={handleXeroConnect}
              disabled={xeroConnecting}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '8px', background: '#13B5EA', color: 'white', border: 'none', cursor: xeroConnecting ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '600', opacity: xeroConnecting ? 0.7 : 1 }}
            >
              {xeroConnecting ? (
                'Connecting...'
              ) : (
                <>
                  <span style={{ fontWeight: '700' }}>X</span>
                  Connect to Xero
                </>
              )}
            </button>
          </div>
        )}
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
