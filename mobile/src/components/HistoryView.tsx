// TimeTrack NZ - History View Component

import { useState } from 'react';
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
  showToast: (message: string) => void;
}

export function HistoryView({
  theme,
  shiftHistory,
  onAddTravelToShift,
  showToast
}: HistoryViewProps) {
  const styles = createStyles(theme);
  
  const [showBreakRules, setShowBreakRules] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [addTravelStartHour, setAddTravelStartHour] = useState('9');
  const [addTravelStartMinute, setAddTravelStartMinute] = useState('00');
  const [addTravelStartAmPm, setAddTravelStartAmPm] = useState<'AM' | 'PM'>('AM');
  const [addTravelEndHour, setAddTravelEndHour] = useState('9');
  const [addTravelEndMinute, setAddTravelEndMinute] = useState('30');
  const [addTravelEndAmPm, setAddTravelEndAmPm] = useState<'AM' | 'PM'>('AM');
  const [addingTravelToShift, setAddingTravelToShift] = useState(false);

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

  return (
    <div style={{ padding: '16px' }}>
      <h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>
        Shift History
      </h2>

      {shiftHistory.length === 0 ? (
        <div style={{ ...styles.card, textAlign: 'center' }}>
          <p style={{ color: theme.textMuted }}>No completed shifts yet</p>
        </div>
      ) : (
        shiftHistory.map(shift => {
          const shiftHours = getHours(shift.clockIn, shift.clockOut);
          const breakAllocation = calcBreaks(shift.breaks || [], shiftHours);
          const travelMinutes = calcTravel(shift.travelSegments || []);
          const workingMinutes = (shiftHours * 60) - breakAllocation.unpaid;

          return (
            <div key={shift.id} style={styles.card}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                <div>
                  <p style={{ color: theme.text, fontWeight: '600' }}>
                    {fmtDate(shift.clockIn)}
                    {shift.manualEntry && (
                      <span style={{ marginLeft: '8px', fontSize: '11px', background: theme.cardAlt, color: theme.textMuted, padding: '2px 8px', borderRadius: '4px' }}>
                        Manual
                      </span>
                    )}
                  </p>
                  <p style={{ color: theme.textMuted, fontSize: '14px' }}>
                    {fmtTime(shift.clockIn)} - {fmtTime(shift.clockOut)}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ color: theme.text, fontWeight: '700', fontSize: '18px' }}>{fmtDur(workingMinutes)}</p>
                  <p style={{ color: theme.textLight, fontSize: '12px' }}>worked</p>
                </div>
              </div>

              {/* Summary stats */}
              <div style={{ background: theme.cardAlt, borderRadius: '10px', padding: '10px 12px', marginTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: theme.textMuted }}>Total shift:</span>
                  <span style={{ color: theme.text }}>{fmtDur(shiftHours * 60)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: theme.success }}>Paid breaks:</span>
                  <span style={{ color: theme.success }}>{breakAllocation.paid}m</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                  <span style={{ color: theme.warning }}>Unpaid breaks:</span>
                  <span style={{ color: theme.warning }}>{breakAllocation.unpaid}m</span>
                </div>
                {travelMinutes > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#2563eb' }}>Travel time:</span>
                    <span style={{ color: '#2563eb' }}>{travelMinutes}m</span>
                  </div>
                )}
              </div>

              {/* Job log fields */}
              {shift.jobLog?.field1 && (
                <p style={{ color: theme.textMuted, fontSize: '13px', marginTop: '8px' }}>
                  📝 {shift.jobLog.field1}
                </p>
              )}

              {shift.jobLog?.field2 && (
                <p style={{ color: theme.textMuted, fontSize: '13px', marginTop: '4px' }}>
                  🔧 {shift.jobLog.field2}
                </p>
              )}

              {shift.jobLog?.field3 && (
                <p style={{ color: theme.textMuted, fontSize: '13px', marginTop: '4px' }}>
                  📋 {shift.jobLog.field3}
                </p>
              )}

              {/* Location points */}
              {shift.locationHistory?.length > 0 && (
                <p style={{ color: theme.textLight, fontSize: '12px', marginTop: '8px' }}>
                  📍 {shift.locationHistory.length} location points recorded
                </p>
              )}

              {/* Add Travel Section */}
              {editingShiftId !== shift.id ? (
                <button
                  onClick={() => setEditingShiftId(shift.id)}
                  style={{
                    marginTop: '12px',
                    width: '100%',
                    padding: '10px',
                    borderRadius: '10px',
                    background: 'transparent',
                    color: '#2563eb',
                    border: '1px dashed #bfdbfe',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '500'
                  }}
                >
                  + Add Travel
                </button>
              ) : (
                <div style={{ marginTop: '12px', background: '#dbeafe', borderRadius: '10px', padding: '12px' }}>
                  <p style={{ color: '#1d4ed8', fontSize: '13px', fontWeight: '600', marginBottom: '12px' }}>
                    Add Travel Time
                  </p>

                  {/* Start Time */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', color: '#1d4ed8', fontSize: '12px', marginBottom: '4px' }}>Start</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <select
                        value={addTravelStartHour}
                        onChange={(e) => setAddTravelStartHour(e.target.value)}
                        style={{ ...styles.select, flex: 1, padding: '8px', fontSize: '14px' }}
                      >
                        {[12,1,2,3,4,5,6,7,8,9,10,11].map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <select
                        value={addTravelStartMinute}
                        onChange={(e) => setAddTravelStartMinute(e.target.value)}
                        style={{ ...styles.select, flex: 1, padding: '8px', fontSize: '14px' }}
                      >
                        {['00','15','30','45'].map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <select
                        value={addTravelStartAmPm}
                        onChange={(e) => setAddTravelStartAmPm(e.target.value as 'AM'|'PM')}
                        style={{ ...styles.select, flex: 1, padding: '8px', fontSize: '14px' }}
                      >
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                      </select>
                    </div>
                  </div>

                  {/* End Time */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', color: '#1d4ed8', fontSize: '12px', marginBottom: '4px' }}>End</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <select
                        value={addTravelEndHour}
                        onChange={(e) => setAddTravelEndHour(e.target.value)}
                        style={{ ...styles.select, flex: 1, padding: '8px', fontSize: '14px' }}
                      >
                        {[12,1,2,3,4,5,6,7,8,9,10,11].map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <select
                        value={addTravelEndMinute}
                        onChange={(e) => setAddTravelEndMinute(e.target.value)}
                        style={{ ...styles.select, flex: 1, padding: '8px', fontSize: '14px' }}
                      >
                        {['00','15','30','45'].map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <select
                        value={addTravelEndAmPm}
                        onChange={(e) => setAddTravelEndAmPm(e.target.value as 'AM'|'PM')}
                        style={{ ...styles.select, flex: 1, padding: '8px', fontSize: '14px' }}
                      >
                        <option value="AM">AM</option>
                        <option value="PM">PM</option>
                      </select>
                    </div>
                  </div>

                  {/* Buttons */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleAddTravel(shift.id, shift.clockIn.toDate())}
                      disabled={addingTravelToShift}
                      style={{
                        flex: 1,
                        padding: '10px',
                        borderRadius: '8px',
                        background: '#2563eb',
                        color: 'white',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '14px',
                        opacity: addingTravelToShift ? 0.7 : 1
                      }}
                    >
                      {addingTravelToShift ? 'Adding...' : 'Add Travel'}
                    </button>
                    <button
                      onClick={() => setEditingShiftId(null)}
                      style={{
                        padding: '10px 16px',
                        borderRadius: '8px',
                        background: 'white',
                        color: '#64748b',
                        border: '1px solid #e2e8f0',
                        cursor: 'pointer',
                        fontWeight: '500',
                        fontSize: '14px'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Break Rules */}
      <div style={{ marginTop: '16px' }}>
        <BreakRulesInfo isOpen={showBreakRules} onToggle={() => setShowBreakRules(!showBreakRules)} theme={theme} />
      </div>
    </div>
  );
}
