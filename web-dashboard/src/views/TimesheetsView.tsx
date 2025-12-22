import { Shift, Theme, CompanySettings, Location } from '../shared/types';
import { getHours, calcBreaks, calcTravel, fmtDur, fmtTime, fmtDate, fmtDateShort, fmtWeekEnding, getJobLogField, weekDayNames } from '../shared/utils';

interface GroupedWeek {
  weekEnd: Date;
  shifts: Shift[];
  totalMinutes: number;
  finalized: boolean;
}

interface GroupedEmployee {
  name: string;
  email: string;
  exists: boolean;
  weeks: Record<string, GroupedWeek>;
}

interface TimesheetsViewProps {
  theme: Theme;
  isMobile: boolean;
  companySettings: CompanySettings;
  timesheetFilterStart: string;
  setTimesheetFilterStart: (v: string) => void;
  timesheetFilterEnd: string;
  setTimesheetFilterEnd: (v: string) => void;
  setThisWeek: () => void;
  setLastWeek: () => void;
  setThisMonth: () => void;
  setLastMonth: () => void;
  clearTimesheetFilter: () => void;
  getGroupedTimesheets: () => Record<string, GroupedEmployee>;
  expandedEmployees: Set<string>;
  toggleEmployee: (empId: string) => void;
  expandedWeeks: Set<string>;
  toggleWeek: (weekKey: string) => void;
  finalizingWeek: string | null;
  finalizeWeek: (empEmail: string, weekKey: string, shifts: Shift[]) => void;
  timesheetEditingShiftId: string | null;
  setTimesheetEditingShiftId: (id: string | null) => void;
  timesheetEditMode: 'breaks' | 'travel' | null;
  setTimesheetEditMode: (mode: 'breaks' | 'travel' | null) => void;
  timesheetDeleteConfirmId: string | null;
  setTimesheetDeleteConfirmId: (id: string | null) => void;
  deletingTimesheetShift: boolean;
  addingBreakToShift: boolean;
  addingTravelToShift: boolean;
  handleTimesheetAddBreak: (shiftId: string, minutes: number) => void;
  handleTimesheetAddTravel: (shiftId: string, minutes: number) => void;
  handleTimesheetDeleteShift: (shiftId: string) => void;
  closeTimesheetEditPanel: () => void;
  setEditShiftModal: (shift: Shift | null) => void;
  setMapModal: (modal: { locations: Location[], title: string, clockInLocation?: Location, clockOutLocation?: Location } | null) => void;
}

export function TimesheetsView({
  theme,
  isMobile,
  companySettings,
  timesheetFilterStart,
  setTimesheetFilterStart,
  timesheetFilterEnd,
  setTimesheetFilterEnd,
  setThisWeek,
  setLastWeek,
  setThisMonth,
  setLastMonth,
  clearTimesheetFilter,
  getGroupedTimesheets,
  expandedEmployees,
  toggleEmployee,
  expandedWeeks,
  toggleWeek,
  finalizingWeek,
  finalizeWeek,
  timesheetEditingShiftId,
  setTimesheetEditingShiftId,
  timesheetEditMode,
  setTimesheetEditMode,
  timesheetDeleteConfirmId,
  setTimesheetDeleteConfirmId,
  deletingTimesheetShift,
  addingBreakToShift,
  addingTravelToShift,
  handleTimesheetAddBreak,
  handleTimesheetAddTravel,
  handleTimesheetDeleteShift,
  closeTimesheetEditPanel,
  setEditShiftModal,
  setMapModal
}: TimesheetsViewProps) {
  const styles = {
    card: { background: theme.card, borderRadius: '12px', padding: '20px', marginBottom: '16px', border: `1px solid ${theme.cardBorder}` },
    input: { padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.inputBorder}`, background: theme.input, color: theme.text, fontSize: '14px', width: '100%', boxSizing: 'border-box' as const }
  };

  const grouped = getGroupedTimesheets();
  const empIds = Object.keys(grouped).sort((a, b) => grouped[a].name.localeCompare(grouped[b].name));

  return (
    <div>
      <h1 style={{ color: theme.text, marginBottom: '16px', fontSize: isMobile ? '22px' : '28px' }}>Timesheets</h1>
      
      {/* Date Filter */}
      <div style={{ ...styles.card, marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <button onClick={setThisWeek} style={{ padding: '8px 12px', borderRadius: '6px', border: `1px solid ${theme.cardBorder}`, background: theme.cardAlt, color: theme.text, cursor: 'pointer', fontSize: '13px' }}>This Week</button>
          <button onClick={setLastWeek} style={{ padding: '8px 12px', borderRadius: '6px', border: `1px solid ${theme.cardBorder}`, background: theme.cardAlt, color: theme.text, cursor: 'pointer', fontSize: '13px' }}>Last Week</button>
          <button onClick={setThisMonth} style={{ padding: '8px 12px', borderRadius: '6px', border: `1px solid ${theme.cardBorder}`, background: theme.cardAlt, color: theme.text, cursor: 'pointer', fontSize: '13px' }}>This Month</button>
          <button onClick={setLastMonth} style={{ padding: '8px 12px', borderRadius: '6px', border: `1px solid ${theme.cardBorder}`, background: theme.cardAlt, color: theme.text, cursor: 'pointer', fontSize: '13px' }}>Last Month</button>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'end' }}>
          <div style={{ flex: '1', minWidth: '140px' }}>
            <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>From</label>
            <input type="date" value={timesheetFilterStart} onChange={e => setTimesheetFilterStart(e.target.value)} style={styles.input} />
          </div>
          <div style={{ flex: '1', minWidth: '140px' }}>
            <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>To</label>
            <input type="date" value={timesheetFilterEnd} onChange={e => setTimesheetFilterEnd(e.target.value)} style={styles.input} />
          </div>
          {(timesheetFilterStart || timesheetFilterEnd) && (
            <button onClick={clearTimesheetFilter} style={{ padding: '12px 16px', borderRadius: '8px', border: `1px solid ${theme.danger}`, background: 'transparent', color: theme.danger, cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>Clear</button>
          )}
        </div>
        {(timesheetFilterStart || timesheetFilterEnd) && (
          <p style={{ color: theme.primary, fontSize: '13px', marginTop: '12px', fontWeight: '500' }}>
            Showing shifts: {timesheetFilterStart || 'any'} → {timesheetFilterEnd || 'any'}
          </p>
        )}
      </div>
      
      <p style={{ color: theme.textMuted, marginBottom: '16px', fontSize: '14px' }}>Week ends on {weekDayNames[companySettings.payWeekEndDay]}</p>
      
      {empIds.length === 0 ? (
        <div style={styles.card}><p style={{ color: theme.textMuted, textAlign: 'center' }}>No completed shifts</p></div>
      ) : (
        empIds.map(empId => {
          const { name, email, exists, weeks } = grouped[empId];
          const isExpanded = expandedEmployees.has(empId);
          const shiftCount = Object.values(weeks).reduce((sum, w) => sum + w.shifts.length, 0);
          
          return (
            <div key={empId} style={{ ...styles.card, padding: 0, overflow: 'hidden', marginBottom: '12px' }}>
              {/* Employee Row */}
              <div onClick={() => toggleEmployee(empId)} style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: isExpanded ? theme.primary : theme.card }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '16px', color: isExpanded ? 'white' : theme.text }}>{isExpanded ? '▼' : '▶'}</span>
                  <div>
                    <p style={{ color: isExpanded ? 'white' : theme.text, fontWeight: '600', fontSize: '16px', margin: 0 }}>{name}</p>
                    {email && <p style={{ color: isExpanded ? 'rgba(255,255,255,0.7)' : theme.textMuted, fontSize: '12px', margin: '2px 0 0 0' }}>{email}</p>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {!exists && <span style={{ background: theme.warningBg, color: theme.warning, padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>Deleted</span>}
                  <span style={{ color: isExpanded ? 'rgba(255,255,255,0.7)' : theme.textMuted, fontSize: '13px' }}>{shiftCount} shifts</span>
                </div>
              </div>
              
              {/* Weeks */}
              {isExpanded && (
                <div style={{ borderTop: `1px solid ${theme.cardBorder}` }}>
                  {Object.entries(weeks).map(([weekKey, { weekEnd, shifts, totalMinutes, finalized }]) => {
                    const isWeekExpanded = expandedWeeks.has(`${empId}-${weekKey}`);
                    const isFinalizing = finalizingWeek === `${email}-${weekKey}`;
                    
                    return (
                      <div key={weekKey}>
                        {/* Week Row */}
                        <div style={{ padding: '14px 20px', paddingLeft: '48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isWeekExpanded ? theme.cardAlt : theme.card, borderBottom: `1px solid ${theme.cardBorder}` }}>
                          <div onClick={() => toggleWeek(`${empId}-${weekKey}`)} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1 }}>
                            <span style={{ fontSize: '14px', color: theme.textMuted }}>{isWeekExpanded ? '▼' : '▶'}</span>
                            <div>
                              <p style={{ color: theme.text, fontWeight: '500', margin: 0 }}>Week Ending: {fmtWeekEnding(weekEnd)}</p>
                              {finalized && <span style={{ fontSize: '11px', color: theme.success }}>✓ Finalized</span>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <p style={{ color: theme.primary, fontWeight: '700', fontSize: '16px', margin: 0 }}>{fmtDur(totalMinutes)}</p>
                            {!finalized && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); finalizeWeek(email, weekKey, shifts); }}
                                disabled={isFinalizing}
                                style={{ padding: '6px 12px', borderRadius: '6px', background: theme.success, color: 'white', border: 'none', cursor: isFinalizing ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '600', opacity: isFinalizing ? 0.7 : 1 }}
                              >
                                {isFinalizing ? '...' : 'Finalize'}
                              </button>
                            )}
                          </div>
                        </div>
                        
                        {/* Shifts */}
                        {isWeekExpanded && (
                          <div style={{ background: theme.cardAlt }}>
                            {shifts.sort((a, b) => (b.clockIn?.toDate?.()?.getTime() || 0) - (a.clockIn?.toDate?.()?.getTime() || 0)).map(sh => {
                              const shiftHours = getHours(sh.clockIn, sh.clockOut);
                              const breakAllocation = calcBreaks(sh.breaks || [], shiftHours, companySettings.paidRestMinutes);
                              const travelMinutes = calcTravel(sh.travelSegments || []);
                              const workingMinutes = (shiftHours * 60) - breakAllocation.unpaid;
                              const f1 = getJobLogField(sh.jobLog, 'field1');
                              const isTimesheetEditing = timesheetEditingShiftId === sh.id;
                              const locationCount = (sh.locationHistory?.length || 0) + (sh.clockInLocation ? 1 : 0) + (sh.clockOutLocation ? 1 : 0);
                              
                              return (
                                <div key={sh.id} style={{ background: theme.card, padding: '14px 16px', marginLeft: '24px', borderBottom: `1px solid ${theme.cardBorder}` }}>
                                  {/* Shift Header */}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                                    <div>
                                      <p style={{ color: theme.text, fontWeight: '600', fontSize: '14px', margin: 0 }}>
                                        {fmtDate(sh.clockIn)}
                                        {sh.manualEntry && <span style={{ marginLeft: '8px', fontSize: '10px', background: theme.cardAlt, color: theme.textMuted, padding: '2px 6px', borderRadius: '4px' }}>Manual</span>}
                                        {sh.editedAt && <span style={{ marginLeft: '8px', fontSize: '10px', background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: '4px' }}>Edited</span>}
                                        {sh.finalized && <span style={{ marginLeft: '8px', fontSize: '10px', background: theme.successBg, color: theme.success, padding: '2px 6px', borderRadius: '4px' }}>✓</span>}
                                      </p>
                                      <p style={{ color: theme.textMuted, fontSize: '13px', margin: '2px 0 0 0' }}>
                                        {fmtTime(sh.clockIn)} - {sh.clockOut ? fmtTime(sh.clockOut) : 'Active'}
                                      </p>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                      <p style={{ color: theme.text, fontWeight: '700', fontSize: '16px', margin: 0 }}>{fmtDur(workingMinutes)}</p>
                                      <p style={{ color: theme.textLight, fontSize: '11px', margin: '2px 0 0 0' }}>worked</p>
                                    </div>
                                  </div>

                                  {/* Summary Box */}
                                  <div style={{ background: theme.cardAlt, borderRadius: '8px', padding: '8px 10px', marginTop: '8px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                      <span style={{ color: theme.textMuted }}>Total shift:</span>
                                      <span style={{ color: theme.text }}>{fmtDur(shiftHours * 60)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                      <span style={{ color: theme.success }}>Paid breaks:</span>
                                      <span style={{ color: theme.success }}>{breakAllocation.paid}m</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                      <span style={{ color: theme.warning }}>Unpaid breaks:</span>
                                      <span style={{ color: theme.warning }}>{breakAllocation.unpaid}m</span>
                                    </div>
                                    {travelMinutes > 0 && (
                                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                        <span style={{ color: '#2563eb' }}>Travel time:</span>
                                        <span style={{ color: '#2563eb' }}>{travelMinutes}m</span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Notes */}
                                  {f1 && <p style={{ color: theme.textMuted, fontSize: '12px', marginTop: '8px', margin: '8px 0 0 0' }}>📝 {f1}</p>}

                                  {/* Clock-in Photo */}
                                  {sh.clockInPhotoUrl && (
                                    <div style={{ marginTop: '8px' }}>
                                      <img src={sh.clockInPhotoUrl} alt="Clock in" style={{ width: '50px', height: '50px', borderRadius: '50%', objectFit: 'cover', border: `2px solid ${theme.success}` }} />
                                    </div>
                                  )}

                                  {/* Map Button */}
                                  {locationCount > 0 && (
                                    <button onClick={() => setMapModal({ locations: sh.locationHistory || [], title: `${name} - ${fmtDateShort(sh.clockIn)}`, clockInLocation: sh.clockInLocation, clockOutLocation: sh.clockOutLocation })} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', padding: '8px 12px', background: theme.cardAlt, border: `1px solid ${theme.primary}`, borderRadius: '8px', color: theme.primary, fontSize: '12px', fontWeight: '500', cursor: 'pointer', width: '100%', justifyContent: 'center' }}>
                                      📍 View {locationCount} location point{locationCount !== 1 ? 's' : ''} on map
                                    </button>
                                  )}

                                  {/* Action Buttons */}
                                  {!isTimesheetEditing && timesheetDeleteConfirmId !== sh.id && (
                                    <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                                      <button onClick={() => setEditShiftModal(sh)} style={{ flex: 1, minWidth: '80px', padding: '8px', borderRadius: '8px', background: 'transparent', color: theme.primary, border: `1px dashed ${theme.primary}`, cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>Edit Shift</button>
                                      <button onClick={() => { setTimesheetEditingShiftId(sh.id); setTimesheetEditMode('breaks'); }} style={{ flex: 1, minWidth: '80px', padding: '8px', borderRadius: '8px', background: 'transparent', color: '#f59e0b', border: '1px dashed #fcd34d', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>+ Break</button>
                                      <button onClick={() => { setTimesheetEditingShiftId(sh.id); setTimesheetEditMode('travel'); }} style={{ flex: 1, minWidth: '80px', padding: '8px', borderRadius: '8px', background: 'transparent', color: '#2563eb', border: '1px dashed #bfdbfe', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>+ Travel</button>
                                      <button onClick={() => setTimesheetDeleteConfirmId(sh.id)} style={{ padding: '8px 12px', borderRadius: '8px', background: 'transparent', color: '#dc2626', border: '1px dashed #fca5a5', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>Delete</button>
                                    </div>
                                  )}

                                  {/* Delete Confirmation */}
                                  {timesheetDeleteConfirmId === sh.id && (
                                    <div style={{ marginTop: '10px', background: '#fee2e2', borderRadius: '8px', padding: '12px' }}>
                                      <p style={{ color: '#991b1b', fontSize: '13px', fontWeight: '600', margin: '0 0 10px 0' }}>Delete this shift?</p>
                                      <p style={{ color: '#b91c1c', fontSize: '12px', margin: '0 0 12px 0' }}>This cannot be undone.</p>
                                      <div style={{ display: 'flex', gap: '8px' }}>
                                        <button onClick={() => handleTimesheetDeleteShift(sh.id)} disabled={deletingTimesheetShift} style={{ flex: 1, padding: '10px', borderRadius: '6px', background: '#dc2626', color: 'white', border: 'none', cursor: deletingTimesheetShift ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '13px', opacity: deletingTimesheetShift ? 0.7 : 1 }}>{deletingTimesheetShift ? 'Deleting...' : 'Yes, Delete'}</button>
                                        <button onClick={() => setTimesheetDeleteConfirmId(null)} style={{ padding: '10px 16px', borderRadius: '6px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}>Cancel</button>
                                      </div>
                                    </div>
                                  )}

                                  {/* Add Break Panel */}
                                  {isTimesheetEditing && timesheetEditMode === 'breaks' && (
                                    <div style={{ marginTop: '10px', background: '#fefce8', borderRadius: '8px', padding: '12px' }}>
                                      <p style={{ color: '#854d0e', fontSize: '12px', fontWeight: '600', marginBottom: '10px', margin: '0 0 10px 0' }}>Add Break</p>
                                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                        {[10, 15, 20, 30, 45, 60].map(mins => (
                                          <button key={mins} onClick={() => handleTimesheetAddBreak(sh.id, mins)} disabled={addingBreakToShift} style={{ padding: '8px 14px', borderRadius: '6px', background: '#fef08a', color: '#854d0e', border: '1px solid #fde047', cursor: addingBreakToShift ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '13px', opacity: addingBreakToShift ? 0.7 : 1 }}>+{mins}m</button>
                                        ))}
                                      </div>
                                      <button onClick={closeTimesheetEditPanel} style={{ width: '100%', padding: '8px', borderRadius: '6px', background: 'white', color: '#64748b', border: '1px solid #fde047', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}>Done</button>
                                    </div>
                                  )}

                                  {/* Add Travel Panel */}
                                  {isTimesheetEditing && timesheetEditMode === 'travel' && (
                                    <div style={{ marginTop: '10px', background: '#eff6ff', borderRadius: '8px', padding: '12px' }}>
                                      <p style={{ color: '#1e40af', fontSize: '12px', fontWeight: '600', marginBottom: '10px', margin: '0 0 10px 0' }}>Add Travel Time</p>
                                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                        {[10, 15, 20, 30, 45, 60].map(mins => (
                                          <button key={mins} onClick={() => handleTimesheetAddTravel(sh.id, mins)} disabled={addingTravelToShift} style={{ padding: '8px 14px', borderRadius: '6px', background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe', cursor: addingTravelToShift ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '13px', opacity: addingTravelToShift ? 0.7 : 1 }}>+{mins}m</button>
                                        ))}
                                      </div>
                                      <button onClick={closeTimesheetEditPanel} style={{ width: '100%', padding: '8px', borderRadius: '6px', background: 'white', color: '#64748b', border: '1px solid #bfdbfe', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}>Done</button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
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
    </div>
  );
}