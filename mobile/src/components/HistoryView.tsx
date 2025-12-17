// TimeTrack NZ - History View Component

import { useState, useMemo } from 'react';
import { Theme, createStyles } from '../theme';
import { Shift, Location } from '../types';
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
  onDeleteTravelFromShift: (shiftId: string, travelIndex: number) => Promise<boolean>;
  onAddBreakToShift: (shiftId: string, minutes: number) => Promise<boolean>;
  onDeleteBreakFromShift: (shiftId: string, breakIndex: number) => Promise<boolean>;
  onEditShift: (shiftId: string, clockIn: Date, clockOut: Date, notes?: string) => Promise<boolean>;
  onDeleteShift: (shiftId: string) => Promise<boolean>;
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

// Helper to extract time components from Date
function getTimeComponents(date: Date): { hour: string, minute: string, ampm: 'AM' | 'PM' } {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm: 'AM' | 'PM' = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return {
    hour: hours.toString(),
    minute: minutes.toString().padStart(2, '0'),
    ampm
  };
}

// Helper to build Date from components
function buildDateFromTime(baseDate: Date, hour: string, minute: string, ampm: 'AM' | 'PM'): Date {
  const result = new Date(baseDate);
  let h = parseInt(hour);
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  result.setHours(h, parseInt(minute), 0, 0);
  return result;
}

const weekDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Map Modal Component
function MapModal({ 
  locations, 
  onClose, 
  title, 
  theme,
  clockInLocation,
  clockOutLocation
}: { 
  locations: Location[], 
  onClose: () => void, 
  title: string, 
  theme: Theme,
  clockInLocation?: Location,
  clockOutLocation?: Location
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  
  const markerColors = { clockIn: '#16a34a', clockOut: '#dc2626', tracking: '#2563eb' };
  const markerLabels = { clockIn: 'Clock In', clockOut: 'Clock Out', tracking: 'Tracking' };
  
  // Combine all locations with their types
  const allPoints: { loc: Location, type: 'clockIn' | 'clockOut' | 'tracking' }[] = [];
  
  // Add clock-in location first (if exists)
  if (clockInLocation && clockInLocation.latitude && clockInLocation.longitude) {
    allPoints.push({ loc: clockInLocation, type: 'clockIn' });
  }
  
  // Add tracking locations (filter out duplicates of clock in/out)
  (locations || []).forEach(loc => {
    if (!loc || !loc.latitude || !loc.longitude) return;
    
    // Skip if this is the same as clock-in location
    if (clockInLocation && 
        Math.abs(loc.latitude - clockInLocation.latitude) < 0.0001 && 
        Math.abs(loc.longitude - clockInLocation.longitude) < 0.0001 &&
        Math.abs(loc.timestamp - clockInLocation.timestamp) < 5000) {
      return;
    }
    
    // Skip if this is the same as clock-out location
    if (clockOutLocation && 
        Math.abs(loc.latitude - clockOutLocation.latitude) < 0.0001 && 
        Math.abs(loc.longitude - clockOutLocation.longitude) < 0.0001 &&
        Math.abs(loc.timestamp - clockOutLocation.timestamp) < 5000) {
      return;
    }
    
    // Everything else is a tracking point
    allPoints.push({ loc, type: 'tracking' });
  });
  
  // Add clock-out location last (if exists)
  if (clockOutLocation && clockOutLocation.latitude && clockOutLocation.longitude) {
    allPoints.push({ loc: clockOutLocation, type: 'clockOut' });
  }
  
  // Sort by timestamp
  allPoints.sort((a, b) => a.loc.timestamp - b.loc.timestamp);
  
  if (allPoints.length === 0) return null;
  
  const lats = allPoints.map(p => p.loc.latitude);
  const lngs = allPoints.map(p => p.loc.longitude);
  const minLat = Math.min(...lats); const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs); const maxLng = Math.max(...lngs);
  
  return (
    <div 
      style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0, 
        background: 'rgba(0,0,0,0.5)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        zIndex: 1000, 
        padding: '16px' 
      }} 
      onClick={onClose}
    >
      <div 
        style={{ 
          background: theme.card, 
          borderRadius: '12px', 
          padding: '16px', 
          width: '100%', 
          maxWidth: '500px', 
          maxHeight: '85vh', 
          overflow: 'auto' 
        }} 
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ color: theme.text, margin: 0, fontSize: '16px' }}>{title}</h2>
          <button 
            onClick={onClose} 
            style={{ 
              background: 'none', 
              border: 'none', 
              fontSize: '24px', 
              cursor: 'pointer', 
              color: theme.textMuted,
              padding: '4px'
            }}
          >
            ×
          </button>
        </div>
        
        {/* Legend */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: markerColors.clockIn }}></span>
            <span style={{ color: theme.textMuted, fontSize: '11px' }}>Clock In</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: markerColors.clockOut }}></span>
            <span style={{ color: theme.textMuted, fontSize: '11px' }}>Clock Out</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: markerColors.tracking }}></span>
            <span style={{ color: theme.textMuted, fontSize: '11px' }}>Tracking</span>
          </div>
        </div>
        
        {/* Map */}
        <div style={{ height: '250px', borderRadius: '8px', overflow: 'hidden', marginBottom: '12px' }}>
          <iframe 
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${minLng - 0.005},${minLat - 0.005},${maxLng + 0.005},${maxLat + 0.005}&layer=mapnik`} 
            style={{ width: '100%', height: '100%', border: 'none' }} 
            title="Location Map" 
          />
        </div>
        
        {/* Location List */}
        <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
          {allPoints.map((point, i) => (
            <div 
              key={i} 
              onClick={() => setSelectedIndex(selectedIndex === i ? null : i)} 
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                padding: '8px 10px', 
                background: selectedIndex === i ? theme.primary + '20' : (i % 2 === 0 ? theme.cardAlt : 'transparent'), 
                borderRadius: '6px', 
                cursor: 'pointer', 
                marginBottom: '4px' 
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ 
                  width: '20px', 
                  height: '20px', 
                  borderRadius: '50%', 
                  background: markerColors[point.type], 
                  color: 'white', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontSize: '10px',
                  fontWeight: '600'
                }}>
                  {i + 1}
                </span>
                <span style={{ color: theme.text, fontSize: '13px' }}>{markerLabels[point.type]}</span>
              </div>
              <span style={{ color: theme.textMuted, fontSize: '12px' }}>
                {new Date(point.loc.timestamp).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HistoryView({
  theme,
  shiftHistory,
  onAddTravelToShift,
  onDeleteTravelFromShift,
  onAddBreakToShift,
  onDeleteBreakFromShift,
  onEditShift,
  onDeleteShift,
  showToast,
  paidRestMinutes = 10,
  payWeekEndDay = 0
}: HistoryViewProps) {
  const styles = createStyles(theme);
  
  const [showBreakRules, setShowBreakRules] = useState(false);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<'travel' | 'breaks' | 'times' | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // Map modal state
  const [mapModal, setMapModal] = useState<{
    locations: Location[],
    title: string,
    clockInLocation?: Location,
    clockOutLocation?: Location
  } | null>(null);
  
  // Travel form state
  const [addTravelStartHour, setAddTravelStartHour] = useState('9');
  const [addTravelStartMinute, setAddTravelStartMinute] = useState('00');
  const [addTravelStartAmPm, setAddTravelStartAmPm] = useState<'AM' | 'PM'>('AM');
  const [addTravelEndHour, setAddTravelEndHour] = useState('9');
  const [addTravelEndMinute, setAddTravelEndMinute] = useState('30');
  const [addTravelEndAmPm, setAddTravelEndAmPm] = useState<'AM' | 'PM'>('AM');
  
  // Edit times form state
  const [editClockInHour, setEditClockInHour] = useState('9');
  const [editClockInMinute, setEditClockInMinute] = useState('00');
  const [editClockInAmPm, setEditClockInAmPm] = useState<'AM' | 'PM'>('AM');
  const [editClockOutHour, setEditClockOutHour] = useState('5');
  const [editClockOutMinute, setEditClockOutMinute] = useState('00');
  const [editClockOutAmPm, setEditClockOutAmPm] = useState<'AM' | 'PM'>('PM');
  const [editNotes, setEditNotes] = useState('');
  
  // Loading states
  const [addingTravelToShift, setAddingTravelToShift] = useState(false);
  const [addingBreak, setAddingBreak] = useState(false);
  const [deletingShift, setDeletingShift] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

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

  const handleDeleteTravel = async (shiftId: string, travelIndex: number) => {
    const success = await onDeleteTravelFromShift(shiftId, travelIndex);
    if (success) {
      showToast('Travel removed ✓');
    }
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

  const handleDeleteShift = async (shiftId: string) => {
    setDeletingShift(true);
    const success = await onDeleteShift(shiftId);
    if (success) {
      showToast('Shift deleted ✓');
      setDeleteConfirmId(null);
    }
    setDeletingShift(false);
  };

  const openEditPanel = (shiftId: string, mode: 'travel' | 'breaks' | 'times', shift?: Shift) => {
    setEditingShiftId(shiftId);
    setEditMode(mode);
    
    // Pre-populate times if editing times
    if (mode === 'times' && shift) {
      const clockIn = shift.clockIn?.toDate?.();
      const clockOut = shift.clockOut?.toDate?.();
      
      if (clockIn) {
        const inTime = getTimeComponents(clockIn);
        setEditClockInHour(inTime.hour);
        setEditClockInMinute(inTime.minute);
        setEditClockInAmPm(inTime.ampm);
      }
      
      if (clockOut) {
        const outTime = getTimeComponents(clockOut);
        setEditClockOutHour(outTime.hour);
        setEditClockOutMinute(outTime.minute);
        setEditClockOutAmPm(outTime.ampm);
      }
      
      setEditNotes(shift.jobLog?.field1 || '');
    }
  };

  const closeEditPanel = () => {
    setEditingShiftId(null);
    setEditMode(null);
  };

  const handleSaveEditTimes = async (shift: Shift) => {
    setSavingEdit(true);
    
    const baseDate = shift.clockIn?.toDate?.() || new Date();
    const clockIn = buildDateFromTime(baseDate, editClockInHour, editClockInMinute, editClockInAmPm);
    let clockOut = buildDateFromTime(baseDate, editClockOutHour, editClockOutMinute, editClockOutAmPm);
    
    // Handle overnight shifts
    if (clockOut <= clockIn) {
      clockOut.setDate(clockOut.getDate() + 1);
    }
    
    const success = await onEditShift(shift.id, clockIn, clockOut, editNotes);
    
    if (success) {
      showToast('Shift updated ✓');
      closeEditPanel();
    }
    
    setSavingEdit(false);
  };

  const openMapModal = (shift: Shift) => {
    const shiftDate = shift.clockIn?.toDate?.();
    const dateStr = shiftDate ? fmtDate(shift.clockIn) : 'Shift';
    setMapModal({
      locations: shift.locationHistory || [],
      title: dateStr,
      clockInLocation: shift.clockInLocation,
      clockOutLocation: shift.clockOutLocation
    });
  };

  // Count total location points for a shift
  const getLocationCount = (shift: Shift): number => {
    let count = shift.locationHistory?.length || 0;
    if (shift.clockInLocation) count++;
    if (shift.clockOutLocation) count++;
    return count;
  };

  const weekKeys = Object.keys(groupedShifts);

  return (
    <div style={{ padding: '16px' }}>
      {/* Map Modal */}
      {mapModal && (
        <MapModal
          locations={mapModal.locations}
          onClose={() => setMapModal(null)}
          title={mapModal.title}
          theme={theme}
          clockInLocation={mapModal.clockInLocation}
          clockOutLocation={mapModal.clockOutLocation}
        />
      )}

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
                    const locationCount = getLocationCount(shift);

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
                              {shift.editedAt && (
                                <span style={{ marginLeft: '8px', fontSize: '10px', background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: '4px' }}>
                                  Edited
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

                        {/* Travel list (when editing travel) */}
                        {isEditing && editMode === 'travel' && (shift.travelSegments || []).length > 0 && (
                          <div style={{ marginTop: '10px', background: '#dbeafe', borderRadius: '8px', padding: '10px' }}>
                            <p style={{ color: '#1d4ed8', fontSize: '12px', fontWeight: '600', marginBottom: '6px', margin: 0 }}>
                              Travel ({shift.travelSegments!.length})
                            </p>
                            {shift.travelSegments!.map((t, i) => (
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
                                  {t.durationMinutes || 0}m travel
                                </span>
                                <button
                                  onClick={() => handleDeleteTravel(shift.id, i)}
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

                        {/* Location points with view button */}
                        {locationCount > 0 && (
                          <button
                            onClick={() => openMapModal(shift)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              marginTop: '8px',
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
                            📍 View {locationCount} location point{locationCount !== 1 ? 's' : ''} on map
                          </button>
                        )}

                        {/* Action buttons when not editing */}
                        {!isEditing && deleteConfirmId !== shift.id && (
                          <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                            <button
                              onClick={() => openEditPanel(shift.id, 'times', shift)}
                              style={{
                                flex: 1,
                                minWidth: '80px',
                                padding: '8px',
                                borderRadius: '8px',
                                background: 'transparent',
                                color: theme.primary,
                                border: `1px dashed ${theme.primary}`,
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: '500'
                              }}
                            >
                              ✏️ Edit Times
                            </button>
                            <button
                              onClick={() => openEditPanel(shift.id, 'breaks')}
                              style={{
                                flex: 1,
                                minWidth: '80px',
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
                              + Break
                            </button>
                            <button
                              onClick={() => openEditPanel(shift.id, 'travel')}
                              style={{
                                flex: 1,
                                minWidth: '80px',
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
                              + Travel
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(shift.id)}
                              style={{
                                padding: '8px 12px',
                                borderRadius: '8px',
                                background: 'transparent',
                                color: '#dc2626',
                                border: '1px dashed #fca5a5',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: '500'
                              }}
                            >
                              🗑️
                            </button>
                          </div>
                        )}

                        {/* Delete confirmation */}
                        {deleteConfirmId === shift.id && (
                          <div style={{ marginTop: '10px', background: '#fee2e2', borderRadius: '8px', padding: '12px' }}>
                            <p style={{ color: '#991b1b', fontSize: '13px', fontWeight: '600', margin: '0 0 10px 0' }}>
                              Delete this shift?
                            </p>
                            <p style={{ color: '#b91c1c', fontSize: '12px', margin: '0 0 12px 0' }}>
                              This cannot be undone.
                            </p>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => handleDeleteShift(shift.id)}
                                disabled={deletingShift}
                                style={{
                                  flex: 1,
                                  padding: '10px',
                                  borderRadius: '6px',
                                  background: '#dc2626',
                                  color: 'white',
                                  border: 'none',
                                  cursor: deletingShift ? 'not-allowed' : 'pointer',
                                  fontWeight: '600',
                                  fontSize: '13px',
                                  opacity: deletingShift ? 0.7 : 1
                                }}
                              >
                                {deletingShift ? 'Deleting...' : 'Yes, Delete'}
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                style={{
                                  padding: '10px 16px',
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

                        {/* Edit Times Panel */}
                        {isEditing && editMode === 'times' && (
                          <div style={{ marginTop: '10px', background: '#e0f2fe', borderRadius: '8px', padding: '12px' }}>
                            <p style={{ color: '#0369a1', fontSize: '12px', fontWeight: '600', marginBottom: '10px', margin: '0 0 10px 0' }}>
                              Edit Shift Times
                            </p>

                            {/* Clock In */}
                            <div style={{ marginBottom: '10px' }}>
                              <label style={{ display: 'block', color: '#0369a1', fontSize: '11px', marginBottom: '4px' }}>Clock In</label>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <select
                                  value={editClockInHour}
                                  onChange={(e) => setEditClockInHour(e.target.value)}
                                  style={{ flex: 1, padding: '8px', fontSize: '13px', borderRadius: '6px', border: '1px solid #bae6fd', background: 'white' }}
                                >
                                  {[12,1,2,3,4,5,6,7,8,9,10,11].map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                                <select
                                  value={editClockInMinute}
                                  onChange={(e) => setEditClockInMinute(e.target.value)}
                                  style={{ flex: 1, padding: '8px', fontSize: '13px', borderRadius: '6px', border: '1px solid #bae6fd', background: 'white' }}
                                >
                                  {['00','05','10','15','20','25','30','35','40','45','50','55'].map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                                <select
                                  value={editClockInAmPm}
                                  onChange={(e) => setEditClockInAmPm(e.target.value as 'AM' | 'PM')}
                                  style={{ flex: 1, padding: '8px', fontSize: '13px', borderRadius: '6px', border: '1px solid #bae6fd', background: 'white' }}
                                >
                                  <option value="AM">AM</option>
                                  <option value="PM">PM</option>
                                </select>
                              </div>
                            </div>

                            {/* Clock Out */}
                            <div style={{ marginBottom: '10px' }}>
                              <label style={{ display: 'block', color: '#0369a1', fontSize: '11px', marginBottom: '4px' }}>Clock Out</label>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <select
                                  value={editClockOutHour}
                                  onChange={(e) => setEditClockOutHour(e.target.value)}
                                  style={{ flex: 1, padding: '8px', fontSize: '13px', borderRadius: '6px', border: '1px solid #bae6fd', background: 'white' }}
                                >
                                  {[12,1,2,3,4,5,6,7,8,9,10,11].map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                                <select
                                  value={editClockOutMinute}
                                  onChange={(e) => setEditClockOutMinute(e.target.value)}
                                  style={{ flex: 1, padding: '8px', fontSize: '13px', borderRadius: '6px', border: '1px solid #bae6fd', background: 'white' }}
                                >
                                  {['00','05','10','15','20','25','30','35','40','45','50','55'].map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                                <select
                                  value={editClockOutAmPm}
                                  onChange={(e) => setEditClockOutAmPm(e.target.value as 'AM' | 'PM')}
                                  style={{ flex: 1, padding: '8px', fontSize: '13px', borderRadius: '6px', border: '1px solid #bae6fd', background: 'white' }}
                                >
                                  <option value="AM">AM</option>
                                  <option value="PM">PM</option>
                                </select>
                              </div>
                            </div>

                            {/* Notes */}
                            <div style={{ marginBottom: '12px' }}>
                              <label style={{ display: 'block', color: '#0369a1', fontSize: '11px', marginBottom: '4px' }}>Notes</label>
                              <textarea
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                style={{ 
                                  width: '100%', 
                                  padding: '8px', 
                                  fontSize: '13px', 
                                  borderRadius: '6px', 
                                  border: '1px solid #bae6fd', 
                                  background: 'white',
                                  minHeight: '60px',
                                  resize: 'vertical',
                                  boxSizing: 'border-box'
                                }}
                              />
                            </div>

                            {/* Buttons */}
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => handleSaveEditTimes(shift)}
                                disabled={savingEdit}
                                style={{
                                  flex: 1,
                                  padding: '10px',
                                  borderRadius: '6px',
                                  background: '#0284c7',
                                  color: 'white',
                                  border: 'none',
                                  cursor: savingEdit ? 'not-allowed' : 'pointer',
                                  fontWeight: '600',
                                  fontSize: '13px',
                                  opacity: savingEdit ? 0.7 : 1
                                }}
                              >
                                {savingEdit ? 'Saving...' : 'Save Changes'}
                              </button>
                              <button
                                onClick={closeEditPanel}
                                style={{
                                  padding: '10px 16px',
                                  borderRadius: '6px',
                                  background: 'white',
                                  color: '#64748b',
                                  border: '1px solid #bae6fd',
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

                        {/* Add Break Panel */}
                        {isEditing && editMode === 'breaks' && (
                          <div style={{ marginTop: '10px', background: '#fefce8', borderRadius: '8px', padding: '12px' }}>
                            <p style={{ color: '#854d0e', fontSize: '12px', fontWeight: '600', marginBottom: '10px', margin: '0 0 10px 0' }}>
                              Add Break
                            </p>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                              {[10, 15, 20, 30, 45, 60].map(mins => (
                                <button
                                  key={mins}
                                  onClick={() => handleAddBreak(shift.id, mins)}
                                  disabled={addingBreak}
                                  style={{
                                    padding: '8px 14px',
                                    borderRadius: '6px',
                                    background: '#fef08a',
                                    color: '#854d0e',
                                    border: '1px solid #fde047',
                                    cursor: addingBreak ? 'not-allowed' : 'pointer',
                                    fontWeight: '600',
                                    fontSize: '13px',
                                    opacity: addingBreak ? 0.7 : 1
                                  }}
                                >
                                  +{mins}m
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
                                border: '1px solid #fde047',
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
                          <div style={{ marginTop: '10px', background: '#eff6ff', borderRadius: '8px', padding: '12px' }}>
                            <p style={{ color: '#1e40af', fontSize: '12px', fontWeight: '600', marginBottom: '10px', margin: '0 0 10px 0' }}>
                              Add Travel Time
                            </p>

                            {/* Start Time */}
                            <div style={{ marginBottom: '8px' }}>
                              <label style={{ display: 'block', color: '#1e40af', fontSize: '11px', marginBottom: '4px' }}>Start</label>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <select
                                  value={addTravelStartHour}
                                  onChange={(e) => setAddTravelStartHour(e.target.value)}
                                  style={{ flex: 1, padding: '8px', fontSize: '13px', borderRadius: '6px', border: '1px solid #bfdbfe', background: 'white' }}
                                >
                                  {[12,1,2,3,4,5,6,7,8,9,10,11].map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                                <select
                                  value={addTravelStartMinute}
                                  onChange={(e) => setAddTravelStartMinute(e.target.value)}
                                  style={{ flex: 1, padding: '8px', fontSize: '13px', borderRadius: '6px', border: '1px solid #bfdbfe', background: 'white' }}
                                >
                                  {['00','05','10','15','20','25','30','35','40','45','50','55'].map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                                <select
                                  value={addTravelStartAmPm}
                                  onChange={(e) => setAddTravelStartAmPm(e.target.value as 'AM' | 'PM')}
                                  style={{ flex: 1, padding: '8px', fontSize: '13px', borderRadius: '6px', border: '1px solid #bfdbfe', background: 'white' }}
                                >
                                  <option value="AM">AM</option>
                                  <option value="PM">PM</option>
                                </select>
                              </div>
                            </div>

                            {/* End Time */}
                            <div style={{ marginBottom: '10px' }}>
                              <label style={{ display: 'block', color: '#1e40af', fontSize: '11px', marginBottom: '4px' }}>End</label>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <select
                                  value={addTravelEndHour}
                                  onChange={(e) => setAddTravelEndHour(e.target.value)}
                                  style={{ flex: 1, padding: '8px', fontSize: '13px', borderRadius: '6px', border: '1px solid #bfdbfe', background: 'white' }}
                                >
                                  {[12,1,2,3,4,5,6,7,8,9,10,11].map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                                <select
                                  value={addTravelEndMinute}
                                  onChange={(e) => setAddTravelEndMinute(e.target.value)}
                                  style={{ flex: 1, padding: '8px', fontSize: '13px', borderRadius: '6px', border: '1px solid #bfdbfe', background: 'white' }}
                                >
                                  {['00','05','10','15','20','25','30','35','40','45','50','55'].map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                                <select
                                  value={addTravelEndAmPm}
                                  onChange={(e) => setAddTravelEndAmPm(e.target.value as 'AM' | 'PM')}
                                  style={{ flex: 1, padding: '8px', fontSize: '13px', borderRadius: '6px', border: '1px solid #bfdbfe', background: 'white' }}
                                >
                                  <option value="AM">AM</option>
                                  <option value="PM">PM</option>
                                </select>
                              </div>
                            </div>

                            {/* Buttons */}
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => handleAddTravel(shift.id, shift.clockIn?.toDate?.() || new Date())}
                                disabled={addingTravelToShift}
                                style={{
                                  flex: 1,
                                  padding: '10px',
                                  borderRadius: '6px',
                                  background: '#2563eb',
                                  color: 'white',
                                  border: 'none',
                                  cursor: addingTravelToShift ? 'not-allowed' : 'pointer',
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
                                  padding: '10px 16px',
                                  borderRadius: '6px',
                                  background: 'white',
                                  color: '#64748b',
                                  border: '1px solid #bfdbfe',
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

      {/* Break rules info button */}
      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <button
          onClick={() => setShowBreakRules(true)}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            background: 'transparent',
            color: theme.textMuted,
            border: `1px solid ${theme.cardAlt}`,
            cursor: 'pointer',
            fontSize: '13px'
          }}
        >
          ℹ️ NZ Break Rules
        </button>
      </div>

      {showBreakRules && (
        <BreakRulesInfo
          theme={theme}
          onClose={() => setShowBreakRules(false)}
          paidRestMinutes={paidRestMinutes}
        />
      )}
    </div>
  );
}
