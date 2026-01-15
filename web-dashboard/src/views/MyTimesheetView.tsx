import { useState, useMemo } from 'react';
import { Shift, Theme, Employee, CompanySettings, Location, EmployeeSettings } from '../shared/types';
import { getHours, calcBreaks, calcTravel, fmtDur, fmtTime, fmtDate, getJobLogField, getBreakEntitlements } from '../shared/utils';
import { BreakRulesInfo } from '../components/BreakRulesInfo';
interface MyTimesheetViewProps {
  theme: Theme;
  isMobile: boolean;
  user: { uid: string } | null;
  myShift: Shift | null;
  myShiftHistory: Shift[];
  onBreak: boolean;
  breakStart: Date | null;
  myTraveling: boolean;
  myTravelStart: Date | null;
  myField1: string;
  setMyField1: (v: string) => void;
  saveMyField1: () => void;
  myField2: string;
  setMyField2: (v: string) => void;
  saveMyField2: () => void;
  myField3: string;
  setMyField3: (v: string) => void;
  saveMyField3: () => void;
  myCurrentLocation: Location | null;
  companySettings: CompanySettings;
  employees: Employee[];
  myClockIn: () => void;
  myClockOut: () => void;
  clockingIn: boolean;
  clockingOut: boolean;
  myStartBreak: () => void;
  myEndBreak: () => void;
  myStartTravel: () => void;
  myEndTravel: () => void;
  myAddBreak: (mins: number) => void;
  showAddManualShift: boolean;
  setShowAddManualShift: (v: boolean) => void;
  manualDate: string;
  setManualDate: (v: string) => void;
  manualStartHour: string;
  setManualStartHour: (v: string) => void;
  manualStartMinute: string;
  setManualStartMinute: (v: string) => void;
  manualStartAmPm: 'AM' | 'PM';
  setManualStartAmPm: (v: 'AM' | 'PM') => void;
  manualEndHour: string;
  setManualEndHour: (v: string) => void;
  manualEndMinute: string;
  setManualEndMinute: (v: string) => void;
  manualEndAmPm: 'AM' | 'PM';
  setManualEndAmPm: (v: 'AM' | 'PM') => void;
  manualBreaks: number[];
  setManualBreaks: (v: number[]) => void;
  manualTravel: number[];
  setManualTravel: (v: number[]) => void;
  manualNotes: string;
  setManualNotes: (v: string) => void;
  addingManualShift: boolean;
  myAddManualShift: () => void;
  expandedMyShifts: Set<string>;
  toggleMyShift: (id: string) => void;
  editingMyShift: string | null;
  setEditingMyShift: (id: string | null) => void;
  myEditMode: 'breaks' | 'travel' | 'times' | null;
  setMyEditMode: (mode: 'breaks' | 'travel' | 'times' | null) => void;
  addTravelStartHour: string;
  setAddTravelStartHour: (v: string) => void;
  addTravelStartMinute: string;
  setAddTravelStartMinute: (v: string) => void;
  addTravelStartAmPm: 'AM' | 'PM';
  setAddTravelStartAmPm: (v: 'AM' | 'PM') => void;
  addTravelEndHour: string;
  setAddTravelEndHour: (v: string) => void;
  addTravelEndMinute: string;
  setAddTravelEndMinute: (v: string) => void;
  addTravelEndAmPm: 'AM' | 'PM';
  setAddTravelEndAmPm: (v: 'AM' | 'PM') => void;
  addingTravelToShift: boolean;
  addingBreakToShift: boolean;
  myAddBreakToShift: (shiftId: string, mins: number) => void;
  myAddTravelToShift: (shiftId: string, baseDate: Date) => void;
  myDeleteBreakFromShift: (shiftId: string, index: number) => void;
  myDeleteTravelFromShift: (shiftId: string, index: number) => void;
  myDeleteShift: (shiftId: string) => void;
  closeMyEditPanel: () => void;
  updateSettings: (empId: string, updates: Partial<EmployeeSettings>) => void;
  setMapModal: (modal: { locations: Location[], title: string, clockInLocation?: Location, clockOutLocation?: Location } | null) => void;
}



// Helper: Get week ending date based on pay week end day
function getWeekEndingDate(shiftDate: Date, payWeekEndDay: number): Date {
  const date = new Date(shiftDate);
  const currentDay = date.getDay();
  let daysUntilEnd = payWeekEndDay - currentDay;
  if (daysUntilEnd < 0) daysUntilEnd += 7;
  date.setDate(date.getDate() + daysUntilEnd);
  date.setHours(23, 59, 59, 999);
  return date;
}

// Helper: Get week key for grouping
function getWeekEndingKey(shiftDate: Date, payWeekEndDay: number): string {
  const weekEnd = getWeekEndingDate(shiftDate, payWeekEndDay);
  return weekEnd.toISOString().split('T')[0];
}

// Format week ending for display
function fmtWeekEnding(date: Date): string {
  return date.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

const weekDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function MyTimesheetView(props: MyTimesheetViewProps) {
  const {
    theme, isMobile, user, myShift, myShiftHistory, onBreak, breakStart, myTraveling, myTravelStart,
    myField1, setMyField1, saveMyField1, myField2, setMyField2, saveMyField2, myField3, setMyField3, saveMyField3, myCurrentLocation, companySettings, employees,
    myClockIn, myClockOut, clockingIn, clockingOut, myStartBreak, myEndBreak, myStartTravel, myEndTravel, myAddBreak,
    showAddManualShift, setShowAddManualShift, manualDate, setManualDate,
    manualStartHour, setManualStartHour, manualStartMinute, setManualStartMinute, manualStartAmPm, setManualStartAmPm,
    manualEndHour, setManualEndHour, manualEndMinute, setManualEndMinute, manualEndAmPm, setManualEndAmPm,
    manualBreaks, setManualBreaks, manualTravel, setManualTravel, manualNotes, setManualNotes,
    addingManualShift, myAddManualShift, expandedMyShifts, toggleMyShift,
    editingMyShift, setEditingMyShift, myEditMode, setMyEditMode,
    addTravelStartHour, setAddTravelStartHour, addTravelStartMinute, setAddTravelStartMinute, addTravelStartAmPm, setAddTravelStartAmPm,
    addTravelEndHour, setAddTravelEndHour, addTravelEndMinute, setAddTravelEndMinute, addTravelEndAmPm, setAddTravelEndAmPm,
    addingTravelToShift, addingBreakToShift, myAddBreakToShift, myAddTravelToShift,
    myDeleteBreakFromShift, myDeleteTravelFromShift, myDeleteShift, closeMyEditPanel,
    updateSettings, setMapModal
  } = props;

  // Tab state
  const [activeTab, setActiveTab] = useState<'clock' | 'history'>('clock');
  
  // Custom break input
  const [showCustomBreak, setShowCustomBreak] = useState(false);
  const [customBreakMinutes, setCustomBreakMinutes] = useState('');
  
  // Break rules expanded
  const [showBreakRules, setShowBreakRules] = useState(false);
  
  // History date filters
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  
  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const styles = {
    card: { background: theme.card, borderRadius: '12px', padding: '20px', marginBottom: '16px', border: `1px solid ${theme.cardBorder}` },
    input: { padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.inputBorder}`, background: theme.input, color: theme.text, fontSize: '14px', width: '100%', boxSizing: 'border-box' as const },
    btn: { padding: '12px 20px', borderRadius: '10px', border: 'none', background: theme.primary, color: 'white', cursor: 'pointer', fontWeight: '600' as const, fontSize: '14px' },
    btnSecondary: { padding: '12px 20px', borderRadius: '10px', border: 'none', background: '#f59e0b', color: 'white', cursor: 'pointer', fontWeight: '600' as const, fontSize: '14px' },
    btnDanger: { padding: '12px 20px', borderRadius: '10px', border: 'none', background: theme.danger, color: 'white', cursor: 'pointer', fontWeight: '600' as const, fontSize: '14px' },
    btnLarge: { padding: '20px', borderRadius: '12px', border: 'none', background: theme.success, color: 'white', cursor: 'pointer', fontWeight: '600' as const, fontSize: '18px' }
  };

  const myEmployee = employees.find(e => e.id === user?.uid);
  const paidRestMinutes = companySettings.paidRestMinutes || 10;
  const payWeekEndDay = companySettings.payWeekEndDay ?? 5; // Default Friday
  
  // Current shift calculations
  const shiftHours = myShift ? getHours(myShift.clockIn) : 0;
  const totalBreakMinutes = myShift?.breaks?.reduce((s, b) => s + (b.durationMinutes || 0), 0) || 0;
  const entitlements = getBreakEntitlements(shiftHours, paidRestMinutes);
  const breakAllocation = myShift ? calcBreaks(myShift.breaks || [], shiftHours, paidRestMinutes) : null;

  // Date filter helpers
  const setThisWeek = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    setFilterStart(startOfWeek.toISOString().split('T')[0]);
    setFilterEnd(now.toISOString().split('T')[0]);
  };

  const setLastWeek = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const endOfLastWeek = new Date(now);
    endOfLastWeek.setDate(now.getDate() - dayOfWeek - 1);
    const startOfLastWeek = new Date(endOfLastWeek);
    startOfLastWeek.setDate(endOfLastWeek.getDate() - 6);
    setFilterStart(startOfLastWeek.toISOString().split('T')[0]);
    setFilterEnd(endOfLastWeek.toISOString().split('T')[0]);
  };

  const setThisMonth = () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    setFilterStart(startOfMonth.toISOString().split('T')[0]);
    setFilterEnd(now.toISOString().split('T')[0]);
  };

  const setLastMonth = () => {
    const now = new Date();
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    setFilterStart(startOfLastMonth.toISOString().split('T')[0]);
    setFilterEnd(endOfLastMonth.toISOString().split('T')[0]);
  };

  const clearFilter = () => {
    setFilterStart('');
    setFilterEnd('');
  };

  const toggleWeek = (weekKey: string) => {
    const newExpanded = new Set(expandedWeeks);
    if (newExpanded.has(weekKey)) {
      newExpanded.delete(weekKey);
    } else {
      newExpanded.add(weekKey);
    }
    setExpandedWeeks(newExpanded);
  };

  // Filter and group shifts by week
  const filteredGroupedShifts = useMemo(() => {
    let filtered = myShiftHistory;
    
    if (filterStart) {
      const start = new Date(filterStart);
      start.setHours(0, 0, 0, 0);
      filtered = filtered.filter(s => {
        const shiftDate = s.clockIn?.toDate?.();
        return shiftDate && shiftDate >= start;
      });
    }
    
    if (filterEnd) {
      const end = new Date(filterEnd);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter(s => {
        const shiftDate = s.clockIn?.toDate?.();
        return shiftDate && shiftDate <= end;
      });
    }

    // Group by week
    const grouped: Record<string, { weekEnd: Date, shifts: Shift[], totalMinutes: number }> = {};
    
    filtered.forEach(shift => {
      const shiftDate = shift.clockIn?.toDate?.();
      if (!shiftDate) return;
      
      const weekKey = getWeekEndingKey(shiftDate, payWeekEndDay);
      
      if (!grouped[weekKey]) {
        grouped[weekKey] = {
          weekEnd: getWeekEndingDate(shiftDate, payWeekEndDay),
          shifts: [],
          totalMinutes: 0
        };
      }
      
      grouped[weekKey].shifts.push(shift);
      
      const h = getHours(shift.clockIn, shift.clockOut);
      const b = calcBreaks(shift.breaks || [], h, paidRestMinutes);
      const ent = getBreakEntitlements(h, paidRestMinutes);
      const untakenPaid = Math.max(0, ent.paidMinutes - b.paid);
      grouped[weekKey].totalMinutes += (h * 60) - b.unpaid + untakenPaid;
    });

    // Sort weeks descending
    const sortedKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
    const result: Record<string, { weekEnd: Date, shifts: Shift[], totalMinutes: number }> = {};
    sortedKeys.forEach(key => {
      result[key] = grouped[key];
      // Sort shifts within week descending
      result[key].shifts.sort((a, b) => {
        const dateA = a.clockIn?.toDate?.()?.getTime() || 0;
        const dateB = b.clockIn?.toDate?.()?.getTime() || 0;
        return dateB - dateA;
      });
    });
    
    return result;
  }, [myShiftHistory, filterStart, filterEnd, payWeekEndDay, paidRestMinutes]);

  const handleAddCustomBreak = () => {
    const mins = parseInt(customBreakMinutes);
    if (!isNaN(mins) && mins > 0) {
      myAddBreak(mins);
      setCustomBreakMinutes('');
      setShowCustomBreak(false);
    }
  };

  // Helper to get location count
  const getLocationCount = (shift: Shift): number => {
    let count = shift.locationHistory?.length || 0;
    if (shift.clockInLocation) count++;
    if (shift.clockOutLocation) count++;
    return count;
  };

  return (
    <div style={{ paddingBottom: isMobile ? '300px' : '0' }}>
      <h1 style={{ color: theme.text, marginBottom: '16px', fontSize: isMobile ? '22px' : '28px' }}>My Timesheet</h1>
      
      {/* App Download Notice */}
      <div style={{ 
        background: theme.card, 
        borderRadius: '12px', 
        padding: '16px 20px', 
        marginBottom: '12px',
        border: `1px solid ${theme.cardBorder}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <span style={{ fontSize: '20px' }}>📱</span>
          <p style={{ fontWeight: '700', fontSize: '15px', margin: 0, color: theme.text }}>Track your time on the go</p>
        </div>
        <p style={{ fontSize: '13px', color: theme.textMuted, margin: '0 0 12px 0' }}>Download the app for better GPS tracking. Use your same login - no invite needed.</p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <a 
            href="https://apps.apple.com/app/trackable-nz/id6740708887" 
            target="_blank" 
            rel="noopener noreferrer"
          >
            <img 
              src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg" 
              alt="Download on the App Store" 
              style={{ height: '40px' }}
            />
          </a>
          <a 
            href="https://play.google.com/store/apps/details?id=nz.trackable.app" 
            target="_blank" 
            rel="noopener noreferrer"
          >
            <img 
              src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png" 
              alt="Get it on Google Play" 
              style={{ height: '40px' }}
            />
          </a>
        </div>
      </div>
      
      {/* PWA Instructions */}
      <div style={{ 
        background: theme.card, 
        borderRadius: '12px', 
        padding: '16px 20px', 
        marginBottom: '20px',
        border: `1px solid ${theme.cardBorder}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <span style={{ fontSize: '20px' }}>💡</span>
          <p style={{ fontWeight: '700', fontSize: '15px', margin: 0, color: theme.text }}>Add this Dashboard to your phone's home screen</p>
        </div>
        <p style={{ fontSize: '13px', color: theme.textMuted, margin: '0 0 12px 0' }}>Quick access without downloading - works like an app!</p>
        
        <div style={{ background: theme.successBg, borderRadius: '8px', padding: '10px 12px', marginBottom: '8px' }}>
          <p style={{ fontWeight: '600', fontSize: '13px', margin: '0 0 4px 0', color: theme.success }}>🍎 iPhone / iPad:</p>
          <p style={{ fontSize: '12px', margin: 0, color: theme.text }}>1. Open <strong>dashboard.trackable.co.nz</strong> in Safari → 2. Tap <strong>Share</strong> (square with arrow) → 3. Tap <strong>"Add to Home Screen"</strong></p>
        </div>
        
        <div style={{ background: theme.successBg, borderRadius: '8px', padding: '10px 12px' }}>
          <p style={{ fontWeight: '600', fontSize: '13px', margin: '0 0 4px 0', color: theme.success }}>🤖 Android:</p>
          <p style={{ fontSize: '12px', margin: 0, color: theme.text }}>1. Open <strong>dashboard.trackable.co.nz</strong> in Chrome → 2. Tap <strong>Menu</strong> (⋮) → 3. Tap <strong>"Add to Home Screen"</strong></p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', marginBottom: '20px', background: theme.cardAlt, borderRadius: '12px', padding: '4px' }}>
        <button
          onClick={() => setActiveTab('clock')}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: '10px',
            border: 'none',
            background: activeTab === 'clock' ? theme.card : 'transparent',
            color: activeTab === 'clock' ? theme.primary : theme.textMuted,
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '14px',
            boxShadow: activeTab === 'clock' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
          }}
        >
          ⏱️ {myShift ? 'Live' : 'Clock In/Out'}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: '10px',
            border: 'none',
            background: activeTab === 'history' ? theme.card : 'transparent',
            color: activeTab === 'history' ? theme.primary : theme.textMuted,
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '14px',
            boxShadow: activeTab === 'history' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
          }}
        >
          📋 History
        </button>
      </div>

      {/* ============ CLOCK TAB ============ */}
      {activeTab === 'clock' && (
        <>
          {/* Clock In/Out Card */}
          <div style={styles.card}>
            {!myShift ? (
              <>
                <h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '600', marginBottom: '16px', textAlign: 'center' }}>
                  Ready to start?
                </h2>
                <button onClick={myClockIn} disabled={clockingIn} style={{ ...styles.btnLarge, width: '100%', opacity: clockingIn ? 0.7 : 1, cursor: clockingIn ? 'not-allowed' : 'pointer' }}>
                  {clockingIn ? '⏳ Clocking In...' : '⏱️ Clock In'}
                </button>
                <button
                  onClick={() => setShowAddManualShift(!showAddManualShift)}
                  style={{ width: '100%', marginTop: '12px', padding: '14px', borderRadius: '12px', background: 'transparent', border: `1px dashed ${theme.cardBorder}`, color: theme.textMuted, cursor: 'pointer', fontSize: '14px' }}
                >
                  {showAddManualShift ? '✕ Cancel' : '+ Add Past Shift Manually'}
                </button>
              </>
            ) : (
              <>
                {/* Clocked in display */}
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                  <p style={{ color: theme.textMuted, fontSize: '14px', marginBottom: '4px' }}>Clocked in at</p>
                  <p style={{ color: theme.text, fontSize: '28px', fontWeight: '700' }}>{fmtTime(myShift.clockIn)}</p>
                  <p style={{ color: theme.success, fontSize: '16px', fontWeight: '600', marginTop: '8px' }}>
                    {fmtDur(shiftHours * 60)} worked
                  </p>
                </div>

                {/* Break/Travel buttons - Orange Start Break */}
                {!onBreak && !myTraveling && (
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                    <button onClick={myStartBreak} style={{ ...styles.btnSecondary, flex: 1 }}>
                      ☕ Start Break
                    </button>
                    <button onClick={myStartTravel} style={{ ...styles.btn, flex: 1, background: '#2563eb' }}>
                      🚗 Start Travel
                    </button>
                  </div>
                )}

                {/* On Break state */}
                {onBreak && breakStart && (
                  <div style={{ background: theme.warningBg, borderRadius: '12px', padding: '16px', marginBottom: '16px', textAlign: 'center' }}>
                    <p style={{ color: theme.warning, fontWeight: '600', marginBottom: '4px' }}>☕ On Break</p>
                    <p style={{ color: theme.warning, fontSize: '24px', fontWeight: '700' }}>
                      {fmtDur(Math.round((Date.now() - breakStart.getTime()) / 60000))}
                    </p>
                    <button onClick={myEndBreak} style={{ ...styles.btn, marginTop: '12px', background: theme.warning }}>
                      End Break
                    </button>
                  </div>
                )}

                {/* Traveling state */}
                {myTraveling && myTravelStart && (
                  <div style={{ background: '#dbeafe', borderRadius: '12px', padding: '16px', marginBottom: '16px', textAlign: 'center' }}>
                    <p style={{ color: '#1d4ed8', fontWeight: '600', marginBottom: '4px' }}>🚗 Traveling</p>
                    <p style={{ color: '#2563eb', fontSize: '24px', fontWeight: '700' }}>
                      {fmtDur(Math.round((Date.now() - myTravelStart.getTime()) / 60000))}
                    </p>
                    <button onClick={myEndTravel} style={{ ...styles.btn, marginTop: '12px', background: '#2563eb' }}>
                      End Travel
                    </button>
                  </div>
                )}

                {/* Clock Out button */}
                {!onBreak && !myTraveling && (
                  <button onClick={myClockOut} disabled={clockingOut} style={{ ...styles.btnDanger, width: '100%', padding: '20px', fontSize: '18px', opacity: clockingOut ? 0.7 : 1, cursor: clockingOut ? 'not-allowed' : 'pointer' }}>
                    {clockingOut ? '⏳ Clocking Out...' : 'Clock Out'}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Add Break Card - with Custom minutes */}
          {myShift && !onBreak && !myTraveling && (
            <div style={styles.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3 style={{ color: theme.text, fontWeight: '600', margin: 0 }}>Add Break</h3>
                {totalBreakMinutes > 0 && (
                  <span style={{ background: theme.warningBg, color: theme.warning, padding: '4px 10px', borderRadius: '12px', fontSize: '13px', fontWeight: '600' }}>
                    Total: {fmtDur(totalBreakMinutes)}
                  </span>
                )}
              </div>
              <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '12px' }}>Forgot to start timer? Add break time:</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
                {[10, 15, 20, 30].map(mins => (
                  <button
                    key={mins}
                    onClick={() => myAddBreak(mins)}
                    style={{ padding: '12px', borderRadius: '10px', background: theme.cardAlt, color: theme.text, border: `1px solid ${theme.cardBorder}`, cursor: 'pointer', fontWeight: '600' }}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
              
              {/* Custom minutes - matching mobile */}
              {!showCustomBreak ? (
                <button
                  onClick={() => setShowCustomBreak(true)}
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'transparent', color: theme.textMuted, border: `1px dashed ${theme.cardBorder}`, cursor: 'pointer' }}
                >
                  + Custom minutes
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="number"
                    placeholder="Minutes"
                    value={customBreakMinutes}
                    onChange={(e) => setCustomBreakMinutes(e.target.value)}
                    style={{ ...styles.input, flex: 1 }}
                    min="1"
                    max="120"
                  />
                  <button onClick={handleAddCustomBreak} style={{ ...styles.btn, padding: '12px 20px' }}>Add</button>
                  <button
                    onClick={() => { setShowCustomBreak(false); setCustomBreakMinutes(''); }}
                    style={{ padding: '12px', borderRadius: '10px', background: theme.cardAlt, color: theme.textMuted, border: 'none', cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Break & Travel Summary - matching mobile */}
          {myShift && breakAllocation && (
            <div style={styles.card}>
              <h3 style={{ color: theme.text, fontWeight: '600', marginBottom: '12px' }}>Break & Travel Summary</h3>
              
              {/* Entitlements info */}
              <div style={{ background: theme.cardAlt, borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
                <p style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '4px' }}>
                  Your entitlement for {fmtDur(shiftHours * 60)} shift:
                </p>
                <p style={{ color: theme.text, fontSize: '14px' }}>
                  {entitlements.paidMinutes}m paid rest + {entitlements.unpaidMinutes}m unpaid meal
                </p>
                {paidRestMinutes > 10 && (
                  <p style={{ color: theme.success, fontSize: '12px', marginTop: '4px' }}>
                    ✨ Enhanced: {paidRestMinutes}min paid rest breaks
                  </p>
                )}
              </div>

              {(myShift.breaks || []).length === 0 && (myShift.travelSegments || []).length === 0 && (
                <p style={{ color: theme.textLight, fontSize: '14px', marginBottom: '12px' }}>No breaks or travel recorded yet</p>
              )}

              {((myShift.breaks || []).length > 0 || (myShift.travelSegments || []).length > 0) && (
                <>
                  {/* Breaks list */}
                  {(myShift.breaks || []).length > 0 && (
                    <>
                      <p style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '8px', fontWeight: '600' }}>BREAKS</p>
                      {myShift.breaks.map((b, i) => (
                        <div key={`break-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${theme.cardBorder}` }}>
                          <span style={{ color: theme.textMuted, fontSize: '14px' }}>
                            {b.manualEntry ? `Break ${i + 1} (added)` : `Break ${i + 1}`}
                          </span>
                          <span style={{ color: theme.text, fontWeight: '600' }}>{b.durationMinutes || 0}m</span>
                        </div>
                      ))}
                    </>
                  )}

                  {/* Travel list */}
                  {(myShift.travelSegments || []).length > 0 && (
                    <>
                      <p style={{ color: theme.textMuted, fontSize: '12px', marginTop: '16px', marginBottom: '8px', fontWeight: '600' }}>TRAVEL</p>
                      {myShift.travelSegments!.map((t, i) => (
                        <div key={`travel-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${theme.cardBorder}` }}>
                          <span style={{ color: theme.textMuted, fontSize: '14px' }}>🚗 Travel {i + 1}</span>
                          <span style={{ color: '#2563eb', fontWeight: '600' }}>{t.durationMinutes || 0}m</span>
                        </div>
                      ))}
                    </>
                  )}

                  {/* Totals */}
                  <div style={{ borderTop: `1px solid ${theme.cardBorder}`, paddingTop: '12px', marginTop: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}>
                      <span style={{ color: theme.success }}>Paid breaks:</span>
                      <span style={{ color: theme.success, fontWeight: '600' }}>{breakAllocation.paid}m</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}>
                      <span style={{ color: theme.warning }}>Unpaid breaks:</span>
                      <span style={{ color: theme.warning, fontWeight: '600' }}>{breakAllocation.unpaid}m</span>
                    </div>
                    {calcTravel(myShift.travelSegments || []) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                        <span style={{ color: '#2563eb' }}>Travel time:</span>
                        <span style={{ color: '#2563eb', fontWeight: '600' }}>{calcTravel(myShift.travelSegments || [])}m</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
<BreakRulesInfo isOpen={showBreakRules} onToggle={() => setShowBreakRules(!showBreakRules)} theme={theme} paidRestMinutes={paidRestMinutes} />

          {/* Notes */}
          {myShift && companySettings.field1Enabled !== false && (
            <div style={styles.card}>
              <label style={{ color: theme.textMuted, fontSize: '13px', display: 'block', marginBottom: '6px' }}>{companySettings.field1Label || 'Notes'}</label>
              <textarea value={myField1} onChange={e => setMyField1(e.target.value)} onBlur={saveMyField1} style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }} />
            </div>
          )}

          {/* Field 2 */}
          {myShift && companySettings.field2Enabled === true && (
            <div style={styles.card}>
              <label style={{ color: theme.textMuted, fontSize: '13px', display: 'block', marginBottom: '6px' }}>{companySettings.field2Label || 'Field 2'}</label>
              <textarea value={myField2} onChange={e => setMyField2(e.target.value)} onBlur={saveMyField2} style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }} />
            </div>
          )}

          {/* Field 3 */}
          {myShift && companySettings.field3Enabled === true && (
            <div style={styles.card}>
              <label style={{ color: theme.textMuted, fontSize: '13px', display: 'block', marginBottom: '6px' }}>{companySettings.field3Label || 'Field 3'}</label>
              <textarea value={myField3} onChange={e => setMyField3(e.target.value)} onBlur={saveMyField3} style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }} />
            </div>
          )}

          {/* Map button - show if any locations exist */}
          {myShift && (myShift.locationHistory?.length > 0 || myShift.clockInLocation) && (
            <button 
              onClick={() => setMapModal({ locations: myShift.locationHistory || [], title: 'My Current Shift', clockInLocation: myShift.clockInLocation })} 
              style={{ ...styles.btn, width: '100%', background: theme.cardAlt, color: theme.text, border: `1px solid ${theme.cardBorder}` }}
            >
              🗺️ View Map ({(myShift.locationHistory?.length || 0) + (myShift.clockInLocation ? 1 : 0)} points)
            </button>
          )}

          {/* Manual Shift Entry */}
          {showAddManualShift && !myShift && (
            <div style={{ ...styles.card, marginTop: '16px' }}>
              <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Add Past Shift</h3>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '6px' }}>Date</label>
                <input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} style={styles.input} />
              </div>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '6px' }}>Start Time</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select value={manualStartHour} onChange={e => setManualStartHour(e.target.value)} style={{ ...styles.input, flex: 1 }}>
                    {[12,1,2,3,4,5,6,7,8,9,10,11].map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <select value={manualStartMinute} onChange={e => setManualStartMinute(e.target.value)} style={{ ...styles.input, flex: 1 }}>
                    {['00','15','30','45'].map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select value={manualStartAmPm} onChange={e => setManualStartAmPm(e.target.value as 'AM' | 'PM')} style={{ ...styles.input, flex: 1 }}>
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '6px' }}>End Time</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select value={manualEndHour} onChange={e => setManualEndHour(e.target.value)} style={{ ...styles.input, flex: 1 }}>
                    {[12,1,2,3,4,5,6,7,8,9,10,11].map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <select value={manualEndMinute} onChange={e => setManualEndMinute(e.target.value)} style={{ ...styles.input, flex: 1 }}>
                    {['00','15','30','45'].map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select value={manualEndAmPm} onChange={e => setManualEndAmPm(e.target.value as 'AM' | 'PM')} style={{ ...styles.input, flex: 1 }}>
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
              </div>

              {/* Breaks */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '6px' }}>Breaks</label>
                {manualBreaks.map((mins, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.warningBg, padding: '8px 12px', borderRadius: '6px', marginBottom: '6px' }}>
                    <span style={{ color: theme.warning, fontSize: '13px' }}>{mins}m break</span>
                    <button onClick={() => setManualBreaks(manualBreaks.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: theme.warning, cursor: 'pointer' }}>✕</button>
                  </div>
                ))}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  {[10, 15, 20, 30].map(m => (
                    <button key={m} onClick={() => setManualBreaks([...manualBreaks, m])} style={{ padding: '12px', borderRadius: '10px', background: theme.cardAlt, color: theme.text, border: `1px solid ${theme.cardBorder}`, cursor: 'pointer', fontWeight: '600' }}>+{m}m</button>
                  ))}
                </div>
              </div>

              {/* Travel */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '6px' }}>Travel</label>
                {manualTravel.map((mins, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.travelBg, padding: '8px 12px', borderRadius: '6px', marginBottom: '6px' }}>
                    <span style={{ color: theme.travel, fontSize: '13px' }}>{mins}m travel</span>
                    <button onClick={() => setManualTravel(manualTravel.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: theme.travel, cursor: 'pointer' }}>✕</button>
                  </div>
                ))}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  {[15, 30, 45, 60].map(m => (
                    <button key={m} onClick={() => setManualTravel([...manualTravel, m])} style={{ padding: '12px', borderRadius: '10px', background: theme.cardAlt, color: theme.text, border: `1px solid ${theme.cardBorder}`, cursor: 'pointer', fontWeight: '600' }}>+{m}m</button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '6px' }}>{companySettings.field1Label || 'Notes'}</label>
                <textarea value={manualNotes} onChange={e => setManualNotes(e.target.value)} style={{ ...styles.input, minHeight: '60px', resize: 'vertical' }} />
              </div>

              <button onClick={myAddManualShift} disabled={addingManualShift} style={{ ...styles.btnLarge, width: '100%', opacity: addingManualShift ? 0.7 : 1 }}>
                {addingManualShift ? 'Adding...' : 'Add Shift'}
              </button>
            </div>
          )}
        </>
      )}

      {/* ============ HISTORY TAB ============ */}
      {activeTab === 'history' && (
        <>
          <h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '600', marginBottom: '12px' }}>Shift History</h2>
          
          {/* Date Filter Card - matching mobile */}
          <div style={{ ...styles.card, marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <button onClick={setThisWeek} style={{ padding: '8px 12px', borderRadius: '6px', border: `1px solid ${theme.cardAlt}`, background: theme.cardAlt, color: theme.text, cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>This Week</button>
              <button onClick={setLastWeek} style={{ padding: '8px 12px', borderRadius: '6px', border: `1px solid ${theme.cardAlt}`, background: theme.cardAlt, color: theme.text, cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>Last Week</button>
              <button onClick={setThisMonth} style={{ padding: '8px 12px', borderRadius: '6px', border: `1px solid ${theme.cardAlt}`, background: theme.cardAlt, color: theme.text, cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>This Month</button>
              <button onClick={setLastMonth} style={{ padding: '8px 12px', borderRadius: '6px', border: `1px solid ${theme.cardAlt}`, background: theme.cardAlt, color: theme.text, cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>Last Month</button>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'end' }}>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>From</label>
                <input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} style={{ ...styles.input }} />
              </div>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>To</label>
                <input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} style={{ ...styles.input }} />
              </div>
              {(filterStart || filterEnd) && (
                <button onClick={clearFilter} style={{ padding: '10px 16px', borderRadius: '8px', border: `1px solid ${theme.danger}`, background: 'transparent', color: theme.danger, cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>Clear</button>
              )}
            </div>
          </div>

          <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '16px' }}>
            Week ends on {weekDayNames[payWeekEndDay]}
          </p>

          {Object.keys(filteredGroupedShifts).length === 0 ? (
            <div style={{ ...styles.card, textAlign: 'center' }}>
              <p style={{ color: theme.textMuted }}>No completed shifts yet</p>
            </div>
          ) : (
            Object.entries(filteredGroupedShifts).map(([weekKey, { weekEnd, shifts, totalMinutes }]) => {
              const isWeekExpanded = expandedWeeks.has(weekKey);
              
              return (
                <div key={weekKey} style={{ marginBottom: '12px' }}>
                  {/* Week Header */}
                  <div
                    onClick={() => toggleWeek(weekKey)}
                    style={{
                      background: isWeekExpanded ? theme.primary : theme.card,
                      padding: '16px',
                      borderRadius: isWeekExpanded ? '12px 12px 0 0' : '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      border: `1px solid ${isWeekExpanded ? theme.primary : theme.cardAlt}`,
                      borderBottom: isWeekExpanded ? 'none' : undefined
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '16px', color: isWeekExpanded ? 'white' : theme.text }}>
                        {isWeekExpanded ? '▼' : '▶'}
                      </span>
                      <div>
                        <p style={{ color: isWeekExpanded ? 'white' : theme.text, fontWeight: '600', fontSize: '15px', margin: 0 }}>
                          Week Ending: {fmtWeekEnding(weekEnd)}
                        </p>
                        <p style={{ color: isWeekExpanded ? 'rgba(255,255,255,0.7)' : theme.textMuted, fontSize: '12px', margin: '2px 0 0 0' }}>
                          {shifts.length} shift{shifts.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ color: isWeekExpanded ? 'white' : theme.primary, fontWeight: '700', fontSize: '16px', margin: 0 }}>
                        {fmtDur(totalMinutes)}
                      </p>
                      <p style={{ color: isWeekExpanded ? 'rgba(255,255,255,0.7)' : theme.textMuted, fontSize: '11px', margin: '2px 0 0 0' }}>total</p>
                    </div>
                  </div>

                  {/* Week Shifts */}
                  {isWeekExpanded && (
                    <div style={{ background: theme.cardAlt, border: `1px solid ${theme.cardAlt}`, borderTop: 'none', borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
                      {shifts.map(sh => {
                        const h = getHours(sh.clockIn, sh.clockOut);
                        const b = calcBreaks(sh.breaks || [], h, paidRestMinutes);
                        const t = calcTravel(sh.travelSegments || []);
                        const ent = getBreakEntitlements(h, paidRestMinutes);
                        const untakenPaid = Math.max(0, ent.paidMinutes - b.paid);
                        const workingMinutes = (h * 60) - b.unpaid + untakenPaid;
                        const isEditing = editingMyShift === sh.id;
                        const locationCount = getLocationCount(sh);

                        return (
                          <div key={sh.id} style={{ background: theme.card, padding: '14px 16px', borderBottom: `1px solid ${theme.cardAlt}` }}>
                            {/* Shift Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                              <div>
                                <p style={{ color: theme.text, fontWeight: '600', fontSize: '14px', margin: 0 }}>
                                  {fmtDate(sh.clockIn)}
                                  {sh.manualEntry && <span style={{ marginLeft: '8px', fontSize: '10px', background: theme.cardAlt, color: theme.textMuted, padding: '2px 6px', borderRadius: '4px' }}>Manual</span>}
                                  {sh.editedAt && <span style={{ marginLeft: '8px', fontSize: '10px', background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: '4px' }}>Edited</span>}
                                </p>
                                <p style={{ color: theme.textMuted, fontSize: '13px', margin: '2px 0 0 0' }}>{fmtTime(sh.clockIn)} - {fmtTime(sh.clockOut)}</p>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <p style={{ color: theme.text, fontWeight: '700', fontSize: '16px', margin: 0 }}>{fmtDur(workingMinutes)}</p>
                                <p style={{ color: theme.textLight, fontSize: '11px', margin: '2px 0 0 0' }}>worked</p>
                              </div>
                            </div>

                            {/* Stats - matching mobile style */}
                            <div style={{ background: theme.cardAlt, borderRadius: '8px', padding: '8px 10px', marginTop: '8px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                <span style={{ color: theme.textMuted }}>Total shift:</span>
                                <span style={{ color: theme.text }}>{fmtDur(h * 60)}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                <span style={{ color: theme.success }}>Paid breaks:</span>
                                <span style={{ color: theme.success }}>{b.paid}m</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                <span style={{ color: theme.warning }}>Unpaid breaks:</span>
                                <span style={{ color: theme.warning }}>{b.unpaid}m</span>
                              </div>
                              {t > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                  <span style={{ color: '#2563eb' }}>Travel time:</span>
                                  <span style={{ color: '#2563eb' }}>{t}m</span>
                                </div>
                              )}
                            </div>

                            {/* Notes */}
                            {getJobLogField(sh.jobLog, 'field1') && (
                              <p style={{ color: theme.textMuted, fontSize: '12px', marginTop: '8px', margin: '8px 0 0 0' }}>Notes: {getJobLogField(sh.jobLog, 'field1')}</p>
                            )}
                            {getJobLogField(sh.jobLog, 'field2') && (
                              <p style={{ color: theme.textMuted, fontSize: '12px', margin: '4px 0 0 0' }}>Job: {getJobLogField(sh.jobLog, 'field2')}</p>
                            )}
                            {getJobLogField(sh.jobLog, 'field3') && (
                              <p style={{ color: theme.textMuted, fontSize: '12px', margin: '4px 0 0 0' }}>Details: {getJobLogField(sh.jobLog, 'field3')}</p>
                            )}

                            {/* Map button - full width, matching mobile */}
                            {locationCount > 0 && (
                              <button 
                                onClick={() => setMapModal({ locations: sh.locationHistory || [], title: fmtDate(sh.clockIn), clockInLocation: sh.clockInLocation, clockOutLocation: sh.clockOutLocation })} 
                                style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: '6px', 
                                  marginTop: '10px', 
                                  padding: '8px 12px', 
                                  background: theme.cardAlt, 
                                  border: `1px solid ${theme.primary}`, 
                                  borderRadius: '8px', 
                                  color: theme.primary, 
                                  fontSize: '12px', 
                                  fontWeight: '500', 
                                  cursor: 'pointer', 
                                  width: '100%', 
                                  justifyContent: 'center' 
                                }}
                              >
                                View {locationCount} location point{locationCount !== 1 ? 's' : ''} on map
                              </button>
                            )}

                            {/* Action buttons - matching mobile dashed style */}
                            {!isEditing && deleteConfirmId !== sh.id && (
                              <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                                <button onClick={() => { setEditingMyShift(sh.id); setMyEditMode('times'); }} style={{ flex: 1, minWidth: '80px', padding: '8px', borderRadius: '8px', background: 'transparent', color: theme.primary, border: `1px dashed ${theme.primary}`, cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>Edit Times</button>
                                <button onClick={() => { setEditingMyShift(sh.id); setMyEditMode('breaks'); }} style={{ flex: 1, minWidth: '80px', padding: '8px', borderRadius: '8px', background: 'transparent', color: '#f59e0b', border: '1px dashed #fcd34d', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>+ Break</button>
                                <button onClick={() => { setEditingMyShift(sh.id); setMyEditMode('travel'); }} style={{ flex: 1, minWidth: '80px', padding: '8px', borderRadius: '8px', background: 'transparent', color: '#2563eb', border: '1px dashed #bfdbfe', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>+ Travel</button>
                                <button onClick={() => setDeleteConfirmId(sh.id)} style={{ padding: '8px 12px', borderRadius: '8px', background: 'transparent', color: '#dc2626', border: '1px dashed #fca5a5', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>Delete</button>
                              </div>
                            )}

                            {/* Delete confirmation */}
                            {deleteConfirmId === sh.id && (
                              <div style={{ marginTop: '10px', background: '#fee2e2', borderRadius: '8px', padding: '12px' }}>
                                <p style={{ color: '#991b1b', fontSize: '13px', fontWeight: '600', margin: '0 0 10px 0' }}>Delete this shift?</p>
                                <p style={{ color: '#b91c1c', fontSize: '12px', margin: '0 0 12px 0' }}>This cannot be undone.</p>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button onClick={() => { myDeleteShift(sh.id); setDeleteConfirmId(null); }} style={{ flex: 1, padding: '10px', borderRadius: '6px', background: '#dc2626', color: 'white', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>Yes, Delete</button>
                                  <button onClick={() => setDeleteConfirmId(null)} style={{ padding: '10px 16px', borderRadius: '6px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}>Cancel</button>
                                </div>
                              </div>
                            )}

                            {/* Add Break Panel */}
                            {isEditing && myEditMode === 'breaks' && (
                              <div style={{ background: theme.warningBg, borderRadius: '8px', padding: '12px', marginTop: '12px' }}>
                                <p style={{ color: theme.warning, fontSize: '12px', fontWeight: '600', marginBottom: '10px', margin: '0 0 10px 0' }}>Add Break</p>
                                
                                {/* Show existing breaks */}
                                {(sh.breaks || []).length > 0 && (
                                  <div style={{ marginBottom: '10px' }}>
                                    <p style={{ color: '#92400e', fontSize: '11px', marginBottom: '6px', margin: '0 0 6px 0' }}>Existing breaks:</p>
                                    {sh.breaks!.map((brk, i) => (
                                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: 'white', borderRadius: '6px', marginBottom: '4px' }}>
                                        <span style={{ color: '#1e293b', fontSize: '13px' }}>{brk.durationMinutes || 0}m break{brk.manualEntry && <span style={{ color: '#64748b', fontSize: '10px', marginLeft: '4px' }}>(manual)</span>}</span>
                                        <button onClick={() => myDeleteBreakFromShift(sh.id, i)} style={{ padding: '4px 8px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}>Remove</button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                  {[10, 15, 20, 30, 45, 60].map(mins => (
                                    <button key={mins} onClick={() => myAddBreakToShift(sh.id, mins)} disabled={addingBreakToShift} style={{ padding: '8px 14px', borderRadius: '6px', background: '#fef08a', color: '#854d0e', border: '1px solid #fde047', cursor: addingBreakToShift ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '13px', opacity: addingBreakToShift ? 0.7 : 1 }}>+{mins}m</button>
                                  ))}
                                </div>
                                <button onClick={closeMyEditPanel} style={{ width: '100%', padding: '8px', borderRadius: '6px', background: 'white', color: theme.textMuted, border: '1px solid #fde047', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}>Done</button>
                              </div>
                            )}

                            {/* Add Travel Panel */}
                            {isEditing && myEditMode === 'travel' && (
                              <div style={{ background: theme.travelBg, borderRadius: '8px', padding: '12px', marginTop: '12px' }}>
                                <p style={{ color: theme.travel, fontSize: '12px', fontWeight: '600', marginBottom: '10px', margin: '0 0 10px 0' }}>Add Travel Time</p>
                                
                                {/* Show existing travel */}
                                {(sh.travelSegments || []).length > 0 && (
                                  <div style={{ marginBottom: '10px' }}>
                                    <p style={{ color: '#1d4ed8', fontSize: '11px', marginBottom: '6px', margin: '0 0 6px 0' }}>Existing travel:</p>
                                    {sh.travelSegments!.map((trv, i) => (
                                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: 'white', borderRadius: '6px', marginBottom: '4px' }}>
                                        <span style={{ color: '#1e293b', fontSize: '13px' }}>{trv.durationMinutes || 0}m travel</span>
                                        <button onClick={() => myDeleteTravelFromShift(sh.id, i)} style={{ padding: '4px 8px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}>Remove</button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                
                                <div style={{ marginBottom: '8px' }}>
                                  <label style={{ display: 'block', color: theme.travel, fontSize: '11px', marginBottom: '4px' }}>Start</label>
                                  <div style={{ display: 'flex', gap: '4px' }}>
                                    <select value={addTravelStartHour} onChange={e => setAddTravelStartHour(e.target.value)} style={{ flex: 1, padding: '8px', fontSize: '13px', borderRadius: '6px', border: '1px solid #bfdbfe', background: 'white' }}>
                                      {[12,1,2,3,4,5,6,7,8,9,10,11].map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                    <select value={addTravelStartMinute} onChange={e => setAddTravelStartMinute(e.target.value)} style={{ flex: 1, padding: '8px', fontSize: '13px', borderRadius: '6px', border: '1px solid #bfdbfe', background: 'white' }}>
                                      {['00','05','10','15','20','25','30','35','40','45','50','55'].map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                    <select value={addTravelStartAmPm} onChange={e => setAddTravelStartAmPm(e.target.value as 'AM' | 'PM')} style={{ flex: 1, padding: '8px', fontSize: '13px', borderRadius: '6px', border: '1px solid #bfdbfe', background: 'white' }}>
                                      <option value="AM">AM</option>
                                      <option value="PM">PM</option>
                                    </select>
                                  </div>
                                </div>
                                <div style={{ marginBottom: '10px' }}>
                                  <label style={{ display: 'block', color: theme.travel, fontSize: '11px', marginBottom: '4px' }}>End</label>
                                  <div style={{ display: 'flex', gap: '4px' }}>
                                    <select value={addTravelEndHour} onChange={e => setAddTravelEndHour(e.target.value)} style={{ flex: 1, padding: '8px', fontSize: '13px', borderRadius: '6px', border: '1px solid #bfdbfe', background: 'white' }}>
                                      {[12,1,2,3,4,5,6,7,8,9,10,11].map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                    <select value={addTravelEndMinute} onChange={e => setAddTravelEndMinute(e.target.value)} style={{ flex: 1, padding: '8px', fontSize: '13px', borderRadius: '6px', border: '1px solid #bfdbfe', background: 'white' }}>
                                      {['00','05','10','15','20','25','30','35','40','45','50','55'].map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                    <select value={addTravelEndAmPm} onChange={e => setAddTravelEndAmPm(e.target.value as 'AM' | 'PM')} style={{ flex: 1, padding: '8px', fontSize: '13px', borderRadius: '6px', border: '1px solid #bfdbfe', background: 'white' }}>
                                      <option value="AM">AM</option>
                                      <option value="PM">PM</option>
                                    </select>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button onClick={() => myAddTravelToShift(sh.id, sh.clockIn?.toDate?.() || new Date())} disabled={addingTravelToShift} style={{ flex: 1, padding: '10px', borderRadius: '6px', background: '#2563eb', color: 'white', border: 'none', cursor: addingTravelToShift ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '13px', opacity: addingTravelToShift ? 0.7 : 1 }}>{addingTravelToShift ? 'Adding...' : 'Add Travel'}</button>
                                  <button onClick={closeMyEditPanel} style={{ padding: '10px 16px', borderRadius: '6px', background: 'white', color: theme.textMuted, border: '1px solid #bfdbfe', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}>Cancel</button>
                                </div>
                              </div>
                            )}

                            {/* Edit Times Panel */}
                            {isEditing && myEditMode === 'times' && (
                              <div style={{ marginTop: '10px', background: '#e0f2fe', borderRadius: '8px', padding: '12px' }}>
                                <p style={{ color: '#0369a1', fontSize: '12px', fontWeight: '600', marginBottom: '10px', margin: '0 0 10px 0' }}>Edit Shift Times</p>
                                <p style={{ color: '#64748b', fontSize: '11px', marginBottom: '10px', margin: '0 0 10px 0' }}>Edit times feature coming soon. Use + Break and + Travel for now.</p>
                                <button onClick={closeMyEditPanel} style={{ width: '100%', padding: '8px', borderRadius: '6px', background: 'white', color: '#64748b', border: '1px solid #bae6fd', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}>Close</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}

          <BreakRulesInfo isOpen={showBreakRules} onToggle={() => setShowBreakRules(!showBreakRules)} theme={theme} paidRestMinutes={paidRestMinutes} />
        </>
      )}
    </div>
  );
}