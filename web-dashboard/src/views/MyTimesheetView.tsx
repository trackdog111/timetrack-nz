import { useState } from 'react';
import { Shift, Theme, Employee, CompanySettings, Location, EmployeeSettings } from '../shared/types';
import { getHours, calcBreaks, calcTravel, fmtDur, fmtTime, fmtDate, getJobLogField } from '../shared/utils';

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
  myCurrentLocation: Location | null;
  companySettings: CompanySettings;
  employees: Employee[];
  myClockIn: () => void;
  myClockOut: () => void;
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

export function MyTimesheetView(props: MyTimesheetViewProps) {
  const {
    theme, isMobile, user, myShift, myShiftHistory, onBreak, breakStart, myTraveling, myTravelStart,
    myField1, setMyField1, saveMyField1, myCurrentLocation, companySettings, employees,
    myClockIn, myClockOut, myStartBreak, myEndBreak, myStartTravel, myEndTravel, myAddBreak,
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

  // Tab state - matches mobile navigation
  const [activeTab, setActiveTab] = useState<'clock' | 'history'>('clock');

  const styles = {
    card: { background: theme.card, borderRadius: '12px', padding: '20px', marginBottom: '16px', border: `1px solid ${theme.cardBorder}` },
    input: { padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.inputBorder}`, background: theme.input, color: theme.text, fontSize: '14px', width: '100%', boxSizing: 'border-box' as const },
    // Primary button - filled
    btn: { padding: '12px 20px', borderRadius: '10px', border: 'none', background: theme.primary, color: 'white', cursor: 'pointer', fontWeight: '600' as const, fontSize: '14px' },
    // Secondary button - outline style (matching mobile btnSecondary)
    btnSecondary: { padding: '12px 20px', borderRadius: '10px', border: `2px solid ${theme.warning}`, background: theme.warningBg, color: theme.warning, cursor: 'pointer', fontWeight: '600' as const, fontSize: '14px' },
    btnDanger: { padding: '12px 20px', borderRadius: '10px', border: 'none', background: theme.danger, color: 'white', cursor: 'pointer', fontWeight: '600' as const, fontSize: '14px' },
    // Large button for main actions
    btnLarge: { padding: '20px', borderRadius: '12px', border: 'none', background: theme.success, color: 'white', cursor: 'pointer', fontWeight: '600' as const, fontSize: '18px' }
  };

  const myEmployee = employees.find(e => e.id === user?.uid);
  const totalBreakMinutes = myShift?.breaks?.reduce((s, b) => s + (b.durationMinutes || 0), 0) || 0;

  return (
    <div>
      <h1 style={{ color: theme.text, marginBottom: '16px', fontSize: isMobile ? '22px' : '28px' }}>My Timesheet</h1>
      
      {/* Tab Navigation - matching mobile style */}
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
          ⏱️ Clock In/Out
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
                <button onClick={myClockIn} style={{ ...styles.btnLarge, width: '100%' }}>
                  ⏱️ Clock In
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
                    {fmtDur(getHours(myShift.clockIn) * 60)} worked
                  </p>
                </div>

                {/* Break/Travel buttons - matching mobile layout */}
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
                  <button onClick={myClockOut} style={{ ...styles.btnDanger, width: '100%', padding: '20px', fontSize: '18px' }}>
                    Clock Out
                  </button>
                )}
              </>
            )}
          </div>

          {/* Add Break Card - matching mobile grid layout */}
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
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
            </div>
          )}

          {/* Break & Travel Summary */}
          {myShift && ((myShift.breaks || []).length > 0 || (myShift.travelSegments || []).length > 0) && (
            <div style={styles.card}>
              <h3 style={{ color: theme.text, fontWeight: '600', marginBottom: '12px' }}>Break & Travel Summary</h3>
              
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
                  <span style={{ color: theme.warning }}>Total breaks:</span>
                  <span style={{ color: theme.warning, fontWeight: '600' }}>{totalBreakMinutes}m</span>
                </div>
                {calcTravel(myShift.travelSegments || []) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                    <span style={{ color: '#2563eb' }}>Total travel:</span>
                    <span style={{ color: '#2563eb', fontWeight: '600' }}>{calcTravel(myShift.travelSegments || [])}m</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {myShift && (
            <div style={styles.card}>
              <label style={{ color: theme.textMuted, fontSize: '13px', display: 'block', marginBottom: '6px' }}>{companySettings.field1Label}</label>
              <textarea value={myField1} onChange={e => setMyField1(e.target.value)} onBlur={saveMyField1} style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }} />
            </div>
          )}

          {/* Current Location */}
          {myShift && myCurrentLocation && (
            <div style={{ ...styles.card, marginTop: '16px' }}>
              <h3 style={{ color: theme.text, fontWeight: '600', marginBottom: '8px' }}>📍 Current Location</h3>
              <p style={{ color: theme.textMuted, fontSize: '14px' }}>
                {myCurrentLocation.latitude.toFixed(6)}, {myCurrentLocation.longitude.toFixed(6)}
              </p>
              <p style={{ color: theme.textLight, fontSize: '12px' }}>
                Accuracy: ±{Math.round(myCurrentLocation.accuracy)}m
              </p>
            </div>
          )}

          {/* Map button for current shift */}
          {myShift && myShift.locationHistory && myShift.locationHistory.length > 0 && (
            <button 
              onClick={() => setMapModal({ locations: myShift.locationHistory, title: 'My Current Shift', clockInLocation: myShift.clockInLocation })} 
              style={{ ...styles.btn, width: '100%', marginTop: '16px', background: theme.cardAlt, color: theme.text, border: `1px solid ${theme.cardBorder}` }}
            >
              🗺️ View Map ({myShift.locationHistory.length} points)
            </button>
          )}

          {/* Auto-Travel Settings */}
          {myEmployee && (
            <div style={{ ...styles.card, marginTop: '16px' }}>
              <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>🚗 Auto-Travel Settings</h3>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: myEmployee.settings?.autoTravel ? theme.travelBg : theme.cardAlt, padding: '12px', borderRadius: '8px' }}>
                  <span style={{ color: myEmployee.settings?.autoTravel ? theme.travel : theme.textMuted, fontSize: '14px' }}>Auto-Travel Detection</span>
                  <button onClick={() => updateSettings(myEmployee.id, { autoTravel: !myEmployee.settings?.autoTravel })} style={{ width: '50px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer', background: myEmployee.settings?.autoTravel ? theme.travel : '#cbd5e1', position: 'relative' }}>
                    <span style={{ position: 'absolute', top: '3px', width: '20px', height: '20px', borderRadius: '50%', background: 'white', left: myEmployee.settings?.autoTravel ? '27px' : '3px', transition: 'left 0.2s' }} />
                  </button>
                </div>
                {myEmployee.settings?.autoTravel && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.cardAlt, padding: '12px', borderRadius: '8px' }}>
                      <span style={{ color: theme.textMuted, fontSize: '14px' }}>GPS Interval</span>
                      <select value={myEmployee.settings?.autoTravelInterval || 2} onChange={e => updateSettings(myEmployee.id, { autoTravelInterval: parseInt(e.target.value) })} style={{ padding: '6px', borderRadius: '6px', background: theme.input, color: theme.text, border: `1px solid ${theme.inputBorder}` }}>
                        <option value={1}>1 min</option>
                        <option value={2}>2 min</option>
                        <option value={5}>5 min</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.cardAlt, padding: '12px', borderRadius: '8px' }}>
                      <span style={{ color: theme.textMuted, fontSize: '14px' }}>Detection Distance</span>
                      <select value={myEmployee.settings?.detectionDistance || 200} onChange={e => updateSettings(myEmployee.id, { detectionDistance: parseInt(e.target.value) })} style={{ padding: '6px', borderRadius: '6px', background: theme.input, color: theme.text, border: `1px solid ${theme.inputBorder}` }}>
                        <option value={100}>100m</option>
                        <option value={200}>200m</option>
                        <option value={500}>500m</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
              {myEmployee.settings?.autoTravel && (
                <p style={{ color: theme.textMuted, fontSize: '12px', marginTop: '12px' }}>
                  ⚠️ Auto-travel uses more battery. Travel will start when you move {myEmployee.settings?.detectionDistance || 200}m from your clock-in location.
                </p>
              )}
            </div>
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
                <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '6px' }}>{companySettings.field1Label}</label>
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
          <h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>Shift History</h2>
          
          {myShiftHistory.length === 0 ? (
            <div style={{ ...styles.card, textAlign: 'center' }}>
              <p style={{ color: theme.textMuted }}>No completed shifts yet</p>
            </div>
          ) : (
            myShiftHistory.map(sh => {
              const h = getHours(sh.clockIn, sh.clockOut);
              const b = calcBreaks(sh.breaks || [], h, companySettings.paidRestMinutes);
              const t = calcTravel(sh.travelSegments || []);
              const isExpanded = expandedMyShifts.has(sh.id);
              const isEditing = editingMyShift === sh.id;

              return (
                <div key={sh.id} style={{ ...styles.card, padding: '16px', marginBottom: '12px' }}>
                  {/* Header */}
                  <div onClick={() => toggleMyShift(sh.id)} style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}>
                    <div>
                      <p style={{ color: theme.text, fontWeight: '600' }}>{fmtDate(sh.clockIn)}</p>
                      <p style={{ color: theme.textMuted, fontSize: '13px' }}>{fmtTime(sh.clockIn)} - {fmtTime(sh.clockOut)}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ color: theme.text, fontWeight: '600' }}>{fmtDur((h * 60) - b.unpaid)}</p>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', fontSize: '12px' }}>
                        {b.total > 0 && <span style={{ color: theme.warning }}>{b.total}m breaks</span>}
                        {t > 0 && <span style={{ color: theme.travel }}>{t}m travel</span>}
                      </div>
                    </div>
                  </div>

                  {/* Expanded */}
                  {isExpanded && (
                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${theme.cardBorder}` }}>
                      {/* Stats */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
                        <div style={{ background: theme.cardAlt, padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                          <p style={{ color: theme.success, fontSize: '11px' }}>Paid Breaks</p>
                          <p style={{ color: theme.success, fontWeight: '600' }}>{b.paid}m</p>
                        </div>
                        <div style={{ background: theme.cardAlt, padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                          <p style={{ color: theme.warning, fontSize: '11px' }}>Unpaid Breaks</p>
                          <p style={{ color: theme.warning, fontWeight: '600' }}>{b.unpaid}m</p>
                        </div>
                        <div style={{ background: theme.cardAlt, padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                          <p style={{ color: theme.travel, fontSize: '11px' }}>Travel</p>
                          <p style={{ color: theme.travel, fontWeight: '600' }}>{t}m</p>
                        </div>
                      </div>

                      {/* Breaks list */}
                      {(sh.breaks || []).length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                          <p style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '8px', fontWeight: '600' }}>BREAKS</p>
                          {sh.breaks.map((brk, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${theme.cardBorder}` }}>
                              <span style={{ color: theme.textMuted, fontSize: '13px' }}>{brk.manualEntry ? `Break ${i + 1} (added)` : `Break ${i + 1}`}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ color: theme.text, fontWeight: '600' }}>{brk.durationMinutes || 0}m</span>
                                <button onClick={() => myDeleteBreakFromShift(sh.id, i)} style={{ background: 'none', border: 'none', color: theme.danger, cursor: 'pointer', fontSize: '14px', padding: '2px' }}>✕</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Travel list */}
                      {(sh.travelSegments || []).length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                          <p style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '8px', fontWeight: '600' }}>TRAVEL</p>
                          {sh.travelSegments!.map((trv, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${theme.cardBorder}` }}>
                              <span style={{ color: theme.textMuted, fontSize: '13px' }}>🚗 Travel {i + 1}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ color: theme.travel, fontWeight: '600' }}>{trv.durationMinutes || 0}m</span>
                                <button onClick={() => myDeleteTravelFromShift(sh.id, i)} style={{ background: 'none', border: 'none', color: theme.danger, cursor: 'pointer', fontSize: '14px', padding: '2px' }}>✕</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Notes */}
                      {getJobLogField(sh.jobLog, 'field1') && (
                        <div style={{ background: theme.cardAlt, padding: '10px', borderRadius: '8px', marginBottom: '12px' }}>
                          <p style={{ color: theme.textMuted, fontSize: '11px', marginBottom: '4px' }}>{companySettings.field1Label}</p>
                          <p style={{ color: theme.text, fontSize: '13px' }}>{getJobLogField(sh.jobLog, 'field1')}</p>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                        <button onClick={() => { setEditingMyShift(sh.id); setMyEditMode('breaks'); }} style={{ padding: '8px 12px', borderRadius: '6px', background: theme.warningBg, color: theme.warning, border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>+ Add Break</button>
                        <button onClick={() => { setEditingMyShift(sh.id); setMyEditMode('travel'); }} style={{ padding: '8px 12px', borderRadius: '6px', background: theme.travelBg, color: theme.travel, border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>+ Add Travel</button>
                        {(sh.locationHistory?.length > 0 || sh.clockInLocation || sh.clockOutLocation) && (
                          <button onClick={() => setMapModal({ locations: sh.locationHistory || [], title: fmtDate(sh.clockIn), clockInLocation: sh.clockInLocation, clockOutLocation: sh.clockOutLocation })} style={{ padding: '8px 12px', borderRadius: '6px', border: `1px solid ${theme.primary}`, background: 'transparent', color: theme.primary, cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>🗺️ View Map</button>
                        )}
                        <button onClick={() => { if (confirm('Delete this shift?')) myDeleteShift(sh.id); }} style={{ padding: '8px 12px', borderRadius: '6px', background: theme.dangerBg, color: theme.danger, border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>🗑️ Delete</button>
                      </div>

                      {/* Add Break Panel */}
                      {isEditing && myEditMode === 'breaks' && (
                        <div style={{ background: theme.warningBg, borderRadius: '8px', padding: '12px', marginTop: '12px' }}>
                          <p style={{ color: theme.warning, fontSize: '12px', fontWeight: '600', marginBottom: '10px' }}>Add Break</p>
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
                          <p style={{ color: theme.travel, fontSize: '12px', fontWeight: '600', marginBottom: '10px' }}>Add Travel Time</p>
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
                    </div>
                  )}
                </div>
              );
            })
          )}
        </>
      )}
    </div>
  );
}