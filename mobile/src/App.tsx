// TimeTrack NZ - History View Component

import { useState, useMemo } from 'react';
import { Theme, createStyles } from '../theme';
import { Shift } from '../types';
import { fmtDur, fmtTime, fmtDate, getHours, calcBreaks, calcTravel } from '../utils';
import { BreakRulesInfo } from './BreakRulesInfo';

interface HistoryViewProps {
  theme: Theme;
  shiftHistory: Shift[];
  onAddTravelToShift: (
    shiftId: string,
    shiftDate: Date,
    startHour: string,
    startMinute: string,
    startAmPm: 'AM' | 'PM',
    endHour: string,
    endMinute: string,
    endAmPm: 'AM' | 'PM'
  ) => Promise<boolean>;
  onAddBreakToShift: (shiftId: string, minutes: number) => Promise<boolean>;
  onDeleteBreakFromShift: (shiftId: string, breakIndex: number) => Promise<boolean>;
  showToast: (message: string) => void;
  paidRestMinutes?: number;
  payWeekEndDay?: number;
}

// Helper function to get week ending date
function getWeekEndingDate(shiftDate: Date, payWeekEndDay: number): Date {
  const date = new Date(shiftDate);
  const currentDay = date.getDay();
  let daysUntilEnd = payWeekEndDay - currentDay;
  if (daysUntilEnd < 0) daysUntilEnd += 7;
  date.setDate(date.getDate() + daysUntilEnd);
  date.setHours(23, 59, 59, 999);
  return date;
}

// Helper function to get week key for grouping
function getWeekEndingKey(shiftDate: Date, payWeekEndDay: number): string {
  const weekEnd = getWeekEndingDate(shiftDate, payWeekEndDay);
  return weekEnd.toISOString().split('T')[0];
}

// Format week ending for display
function fmtWeekEnding(date: Date): string {
  return date.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

const weekDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function HistoryView({
  theme,
  shiftHistory,
  onAddTravelToShift,
  onAddBreakToShift,
  onDeleteBreakFromShift,
  showToast,
  paidRestMinutes = 10,
  payWeekEndDay = 0
}: HistoryViewProps) {
  const styles = createStyles(theme);
  
  const [showBreakRules, setShowBreakRules] = useState(false);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<'travel' | 'breaks' | null>(null);
  const [addTravelStartHour, setAddTravelStartHour] = useState('9');
  const [addTravelStartMinute, setAddTravelStartMinute] = useState('00');
  const [addTravelStartAmPm, setAddTravelStartAmPm] = useState<'AM' | 'PM'>('AM');
  const [addTravelEndHour, setAddTravelEndHour] = useState('9');
  const [addTravelEndMinute, setAddTravelEndMinute] = useState('30');
  const [addTravelEndAmPm, setAddTravelEndAmPm] = useState<'AM' | 'PM'>('AM');
  const [addingTravelToShift, setAddingTravelToShift] = useState(false);
  const [addingBreak, setAddingBreak] = useState(false);

  // Group shifts by week ending date
  const groupedShifts = useMemo(() => {
    const grouped: { [weekKey: string]: { weekEnd: Date, shifts: Shift[], totalMinutes: number } } = {};
    
    shiftHistory.forEach(shift => {
      const shiftDate = shift.clockIn?.toDate?.();
      if (!shiftDate) return;
      
      const weekKey = getWeekEndingKey(shiftDate, payWeekEndDay);
      const weekEnd = getWeekEndingDate(shiftDate, payWeekEndDay);
      
      if (!grouped[weekKey]) {
        grouped[weekKey] = { weekEnd, shifts: [], totalMinutes: 0 };
      }
      
      const h = getHours(shift.clockIn, shift.clockOut);
      const b = calcBreaks(shift.breaks || [], h, paidRestMinutes);
      grouped[weekKey].shifts.push(shift);
      grouped[weekKey].totalMinutes += (h * 60) - b.unpaid;
    });
    
    // Sort weeks newest first
    const sorted: typeof grouped = {};
    Object.keys(grouped).sort((a, b) => b.localeCompare(a)).forEach(k => {
      sorted[k] = grouped[k];
    });
    
    return sorted;
  }, [shiftHistory, payWeekEndDay, paidRestMinutes]);

  const toggleWeek = (weekKey: string) => {
    const newExpanded = new Set(expandedWeeks);
    if (newExpanded.has(weekKey)) {
      newExpanded.delete(weekKey);
    } else {
      newExpanded.add(weekKey);
    }
    setExpandedWeeks(newExpanded);
  };

  const handleAddTravel = async (shiftId: string, shiftDate: Date) => {
    setAddingTravelToShift(true);
    const success = await onAddTravelToShift(
      shiftId,
      shiftDate,
      addTravelStartHour,
      addTravelStartMinute,
      addTravelStartAmPm,
      addTravelEndHour,
      addTravelEndMinute,
      addTravelEndAmPm
    );
    
    if (success) {
      showToast('Travel added ✓');
      setEditingShiftId(null);
      setEditMode(null);
      // Reset form
      setAddTravelStartHour('9');
      setAddTravelStartMinute('00');
      setAddTravelStartAmPm('AM');
      setAddTravelEndHour('9');
      setAddTravelEndMinute('30');
      setAddTravelEndAmPm('AM');
    }
    setAddingTravelToShift(false);
  };

  const handleAddBreak = async (shiftId: string, minutes: number) => {
    setAddingBreak(true);
    const success = await onAddBreakToShift(shiftId, minutes);
    if (success) {
      showToast(`${minutes}m break added ✓`);
    }
    setAddingBreak(false);
  };

  const handleDeleteBreak = async (shiftId: string, breakIndex: number) => {
    const success = await onDeleteBreakFromShift(shiftId, breakIndex);
    if (success) {
      showToast('Break removed ✓');
    }
  };

  const openEditPanel = (shiftId: string, mode: 'travel' | 'breaks') => {
    setEditingShiftId(shiftId);
    setEditMode(mode);
  };

  const closeEditPanel = () => {
    setEditingShiftId(null);
    setEditMode(null);
  };

  const weekKeys = Object.keys(groupedShifts);

  return (
    <div style={{ padding: '16px' }}>
      <h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>
        Shift History
      </h2>
      <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '16px' }}>
        Week ends on {weekDayNames[payWeekEndDay]}
      </p>

      {weekKeys.length === 0 ? (
        <div style={{ ...styles.card, textAlign: 'center' }}>
          <p style={{ color: theme.textMuted }}>No completed shifts yet</p>
        </div>
      ) : (
        weekKeys.map(weekKey => {
          const { weekEnd, shifts, totalMinutes } = groupedShifts[weekKey];
          const isExpanded = expandedWeeks.has(weekKey);
          
          return (
            <div key={weekKey} style={{ marginBottom: '12px' }}>
              {/* Week Header - Collapsed by default */}
              <div
                onClick={() => toggleWeek(weekKey)}
                style={{
                  background: isExpanded ? theme.primary : theme.card,
                  padding: '16px',
                  borderRadius: isExpanded ? '12px 12px 0 0' : '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  border: `1px solid ${isExpanded ? theme.primary : theme.cardAlt}`,
                  borderBottom: isExpanded ? 'none' : undefined
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '16px', color: isExpanded ? 'white' : theme.text }}>
                    {isExpanded ? '▼' : '▶'}
                  </span>
                  <div>
                    <p style={{ 
                      color: isExpanded ? 'white' : theme.text, 
                      fontWeight: '600', 
                      fontSize: '15px',
                      margin: 0 
                    }}>
                      Week Ending: {fmtWeekEnding(weekEnd)}
                    </p>
                    <p style={{ 
                      color: isExpanded ? 'rgba(255,255,255,0.7)' : theme.textMuted, 
                      fontSize: '12px',
                      margin: '2px 0 0 0'
                    }}>
                      {shifts.length} shift{shifts.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ 
                    color: isExpanded ? 'white' : theme.primary, 
                    fontWeight: '700', 
                    fontSize: '18px',
                    margin: 0
                  }}>
                    {fmtDur(totalMinutes)}
                  </p>
                  <p style={{ 
                    color: isExpanded ? 'rgba(255,255,255,0.7)' : theme.textMuted, 
                    fontSize: '11px',
                    margin: '2px 0 0 0'
                  }}>
                    total
                  </p>
                </div>
              </div>

              {/* Expanded Shifts */}
              {isExpanded && (
                <div style={{
                  background: theme.cardAlt,
                  borderRadius: '0 0 12px 12px',
                  border: `1px solid ${theme.cardAlt}`,
                  borderTop: 'none',
                  overflow: 'hidden'
                }}>
                  {shifts.sort((a, b) => (b.clockIn?.toDate?.()?.getTime() || 0) - (a.clockIn?.toDate?.()?.getTime() || 0)).map(shift => {
                    const shiftHours = getHours(shift.clockIn, shift.clockOut);
                    const breakAllocation = calcBreaks(shift.breaks || [], shiftHours, paidRestMinutes);
                    const travelMinutes = calcTravel(shift.travelSegments || []);
                    const workingMinutes = (shiftHours * 60) - breakAllocation.unpaid;
                    const isEditing = editingShiftId === shift.id;

                    return (
                      <div key={shift.id} style={{ 
                        background: theme.card,
                        padding: '14px 16px',
                        borderBottom: `1px solid ${theme.cardAlt}`
                      }}>
                        {/* Shift Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                          <div>
                            <p style={{ color: theme.text, fontWeight: '600', fontSize: '14px', margin: 0 }}>
                              {fmtDate(shift.clockIn)}
                              {shift.manualEntry && (
                                <span style={{ marginLeft: '8px', fontSize: '10px', background: theme.cardAlt, color: theme.textMuted, padding: '2px 6px', borderRadius: '4px' }}>
                                  Manual
                                </span>
                              )}
                            </p>
                            <p style={{ color: theme.textMuted, fontSize: '13px', margin: '2px 0 0 0' }}>
                              {fmtTime(shift.clockIn)} - {fmtTime(shift.clockOut)}
                            </p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ color: theme.text, fontWeight: '700', fontSize: '16px', margin: 0 }}>{fmtDur(workingMinutes)}</p>
                            <p style={{ color: theme.textLight, fontSize: '11px', margin: '2px 0 0 0' }}>worked</p>
                          </div>
                        </div>

                        {/* Summary stats */}
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

                        {/* Breaks list (when editing breaks) */}
                        {isEditing && editMode === 'breaks' && (shift.breaks || []).length > 0 && (
                          <div style={{ marginTop: '10px', background: '#fef3c7', borderRadius: '8px', padding: '10px' }}>
                            <p style={{ color: '#92400e', fontSize: '12px', fontWeight: '600', marginBottom: '6px', margin: 0 }}>
                              Breaks ({shift.breaks!.length})
                            </p>
                            {shift.breaks!.map((b, i) => (
                              <div key={i} style={{ 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center',
                                padding: '6px 8px',
                                background: 'white',
                                borderRadius: '6px',
                                marginTop: '6px'
                              }}>
                                <span style={{ color: '#1e293b', fontSize: '13px' }}>
                                  {b.durationMinutes || 0}m break
                                  {b.manualEntry && <span style={{ color: '#64748b', fontSize: '10px', marginLeft: '4px' }}>(manual)</span>}
                                </span>
                                <button
                                  onClick={() => handleDeleteBreak(shift.id, i)}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    background: '#fee2e2',
                                    color: '#dc2626',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    fontWeight: '500'
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Job log fields */}
                        {shift.jobLog?.field1 && (
                          <p style={{ color: theme.textMuted, fontSize: '12px', marginTop: '8px', margin: '8px 0 0 0' }}>
                            📝 {shift.jobLog.field1}
                          </p>
                        )}

                        {shift.jobLog?.field2 && (
                          <p style={{ color: theme.textMuted, fontSize: '12px', margin: '4px 0 0 0' }}>
                            🔧 {shift.jobLog.field2}
                          </p>
                        )}

                        {shift.jobLog?.field3 && (
                          <p style={{ color: theme.textMuted, fontSize: '12px', margin: '4px 0 0 0' }}>
                            📋 {shift.jobLog.field3}
                          </p>
                        )}

                        {/* Location points */}
                        {shift.locationHistory?.length > 0 && (
                          <p style={{ color: theme.textLight, fontSize: '11px', margin: '8px 0 0 0' }}>
                            📍 {shift.locationHistory.length} location points recorded
                          </p>
                        )}

                        {/* Action buttons when not editing */}
                        {!isEditing && (
                          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                            <button
                              onClick={() => openEditPanel(shift.id, 'breaks')}
                              style={{
                                flex: 1,
                                padding: '8px',
                                borderRadius: '8px',
                                background: 'transparent',
                                color: '#f59e0b',
                                border: '1px dashed #fcd34d',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: '500'
                              }}
                            >
                              + Add Break
                            </button>
                            <button
                              onClick={() => openEditPanel(shift.id, 'travel')}
                              style={{
                                flex: 1,
                                padding: '8px',
                                borderRadius: '8px',
                                background: 'transparent',
                                color: '#2563eb',
                                border: '1px dashed #bfdbfe',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: '500'
                              }}
                            >
                              + Add Travel
                            </button>
                          </div>
                        )}

                        {/* Add Break Panel */}
                        {isEditing && editMode === 'breaks' && (
                          <div style={{ marginTop: '10px', background: '#fef3c7', borderRadius: '8px', padding: '12px' }}>
                            <p style={{ color: '#92400e', fontSize: '12px', fontWeight: '600', marginBottom: '10px', margin: '0 0 10px 0' }}>
                              Add Break
                            </p>
                            
                            {/* Quick add buttons */}
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                              {[10, 15, 20, 30].map(mins => (
                                <button
                                  key={mins}
                                  onClick={() => handleAddBreak(shift.id, mins)}
                                  disabled={addingBreak}
                                  style={{
                                    flex: 1,
                                    minWidth: '50px',
                                    padding: '10px 6px',
                                    borderRadius: '6px',
                                    background: '#f59e0b',
                                    color: 'white',
                                    border: 'none',
                                    cursor: addingBreak ? 'not-allowed' : 'pointer',
                                    fontWeight: '600',
                                    fontSize: '13px',
                                    opacity: addingBreak ? 0.7 : 1
                                  }}
                                >
                                  {mins}m
                                </button>
                              ))}
                            </div>

                            <button
                              onClick={closeEditPanel}
                              style={{
                                width: '100%',
                                padding: '8px',
                                borderRadius: '6px',
                                background: 'white',
                                color: '#64748b',
                                border: '1px solid #e2e8f0',
                                cursor: 'pointer',
                                fontWeight: '500',
                                fontSize: '13px'
                              }}
                            >
                              Done
                            </button>
                          </div>
                        )}

                        {/* Add Travel Panel */}
                        {isEditing && editMode === 'travel' && (
                          <div style={{ marginTop: '10px', background: '#dbeafe', borderRadius: '8px', padding: '12px' }}>
                            <p style={{ color: '#1d4ed8', fontSize: '12px', fontWeight: '600', marginBottom: '10px', margin: '0 0 10px 0' }}>
                              Add Travel Time
                            </p>

                            {/* Start Time */}
                            <div style={{ marginBottom: '10px' }}>
                              <label style={{ display: 'block', color: '#1d4ed8', fontSize: '11px', marginBottom: '4px' }}>Start</label>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <select
                                  value={addTravelStartHour}
                                  onChange={(e) => setAddTravelStartHour(e.target.value)}
                                  style={{ ...styles.select, flex: 1, padding: '8px', fontSize: '13px' }}
                                >
                                  {[12,1,2,3,4,5,6,7,8,9,10,11].map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                                <select
                                  value={addTravelStartMinute}
                                  onChange={(e) => setAddTravelStartMinute(e.target.value)}
                                  style={{ ...styles.select, flex: 1, padding: '8px', fontSize: '13px' }}
                                >
                                  {['00','15','30','45'].map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                                <select
                                  value={addTravelStartAmPm}
                                  onChange={(e) => setAddTravelStartAmPm(e.target.value as 'AM'|'PM')}
                                  style={{ ...styles.select, flex: 1, padding: '8px', fontSize: '13px' }}
                                >
                                  <option value="AM">AM</option>
                                  <option value="PM">PM</option>
                                </select>
                              </div>
                            </div>

                            {/* End Time */}
                            <div style={{ marginBottom: '10px' }}>
                              <label style={{ display: 'block', color: '#1d4ed8', fontSize: '11px', marginBottom: '4px' }}>End</label>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <select
                                  value={addTravelEndHour}
                                  onChange={(e) => setAddTravelEndHour(e.target.value)}
                                  style={{ ...styles.select, flex: 1, padding: '8px', fontSize: '13px' }}
                                >
                                  {[12,1,2,3,4,5,6,7,8,9,10,11].map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                                <select
                                  value={addTravelEndMinute}
                                  onChange={(e) => setAddTravelEndMinute(e.target.value)}
                                  style={{ ...styles.select, flex: 1, padding: '8px', fontSize: '13px' }}
                                >
                                  {['00','15','30','45'].map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                                <select
                                  value={addTravelEndAmPm}
                                  onChange={(e) => setAddTravelEndAmPm(e.target.value as 'AM'|'PM')}
                                  style={{ ...styles.select, flex: 1, padding: '8px', fontSize: '13px' }}
                                >
                                  <option value="AM">AM</option>
                                  <option value="PM">PM</option>
                                </select>
                              </div>
                            </div>

                            {/* Buttons */}
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                onClick={() => handleAddTravel(shift.id, shift.clockIn.toDate())}
                                disabled={addingTravelToShift}
                                style={{
                                  flex: 1,
                                  padding: '10px',
                                  borderRadius: '6px',
                                  background: '#2563eb',
                                  color: 'white',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontWeight: '600',
                                  fontSize: '13px',
                                  opacity: addingTravelToShift ? 0.7 : 1
                                }}
                              >
                                {addingTravelToShift ? 'Adding...' : 'Add Travel'}
                              </button>
                              <button
                                onClick={closeEditPanel}
                                style={{
                                  padding: '10px 14px',
                                  borderRadius: '6px',
                                  background: 'white',
                                  color: '#64748b',
                                  border: '1px solid #e2e8f0',
                                  cursor: 'pointer',
                                  fontWeight: '500',
                                  fontSize: '13px'
                                }}
                              >
                                Cancel
                              </button>
                            </div>
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

      {/* Break Rules */}
      <div style={{ marginTop: '16px' }}>
        <BreakRulesInfo 
          isOpen={showBreakRules} 
          onToggle={() => setShowBreakRules(!showBreakRules)} 
          theme={theme}
          paidRestMinutes={paidRestMinutes}
        />
      </div>
    </div>
  );
}