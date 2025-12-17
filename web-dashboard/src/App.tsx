import { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, User, createUserWithEmailAndPassword, deleteUser, sendPasswordResetEmail } from 'firebase/auth';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc, query, where, orderBy, onSnapshot, Timestamp, writeBatch } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBcyz4DyzExGFRmjQ41W3SvQ3xgvYszzUE",
  authDomain: "timetrack-nz.firebaseapp.com",
  projectId: "timetrack-nz",
  storageBucket: "timetrack-nz.firebasestorage.app",
  messagingSenderId: "600938431502",
  appId: "1:600938431502:web:b661556289a2634c8d285f"
};

const API_URL = 'https://timetrack-dashboard-v2.vercel.app';
const MOBILE_APP_URL = 'https://timetrack-mobile-v2.vercel.app';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

interface Location { latitude: number; longitude: number; accuracy: number; timestamp: number; }
interface Break { startTime: Timestamp; endTime?: Timestamp; durationMinutes?: number; manualEntry?: boolean; }
interface TravelSegment { startTime: Timestamp; endTime?: Timestamp; durationMinutes?: number; startLocation?: Location; endLocation?: Location; }
interface JobLog { field1?: string; field2?: string; field3?: string; notes?: string; }
interface Shift { id: string; userId: string; userEmail: string; clockIn: Timestamp; clockOut?: Timestamp; clockInLocation?: Location; clockOutLocation?: Location; locationHistory: Location[]; breaks: Break[]; travelSegments?: TravelSegment[]; jobLog: JobLog; status: 'active' | 'completed'; manualEntry?: boolean; editedAt?: Timestamp; editedBy?: string; editedByEmail?: string; finalized?: boolean; finalizedAt?: Timestamp; finalizedBy?: string; finalizedByEmail?: string; }
interface EmployeeSettings { gpsTracking: boolean; gpsInterval: number; requireNotes: boolean; chatEnabled: boolean; }
interface Employee { id: string; email: string; name: string; role: string; settings: EmployeeSettings; createdAt: Timestamp; }
interface ChatMessage { id: string; type: string; senderId: string; senderEmail: string; text: string; timestamp: Timestamp; participants?: string[]; }
interface CompanySettings { field1Label: string; field2Label: string; field3Label: string; managerDisplayName: string; paidRestMinutes: number; payWeekEndDay: number; }

const defaultSettings: EmployeeSettings = { gpsTracking: true, gpsInterval: 10, requireNotes: false, chatEnabled: true };
const defaultCompanySettings: CompanySettings = { field1Label: 'Notes', field2Label: 'Materials', field3Label: 'Other', managerDisplayName: 'Manager', paidRestMinutes: 10, payWeekEndDay: 0 };

const weekDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getBreakEntitlements(hoursWorked: number, paidRestMinutes: number = 10) {
  let paid = 0, unpaid = 0;
  if (hoursWorked >= 14) { paid = 5; unpaid = 2; }
  else if (hoursWorked >= 12) { paid = 4; unpaid = 2; }
  else if (hoursWorked >= 10) { paid = 3; unpaid = 1; }
  else if (hoursWorked >= 6) { paid = 2; unpaid = 1; }
  else if (hoursWorked >= 4) { paid = 1; unpaid = 1; }
  else if (hoursWorked >= 2) { paid = 1; unpaid = 0; }
  return { paidMinutes: paid * paidRestMinutes, unpaidMinutes: unpaid * 30 };
}

function calcBreaks(breaks: Break[], hours: number, paidRestMinutes: number = 10) {
  const total = breaks.reduce((s, b) => s + (b.durationMinutes || 0), 0);
  const ent = getBreakEntitlements(hours, paidRestMinutes);
  const paid = Math.min(total, ent.paidMinutes);
  return { paid, unpaid: Math.max(0, total - paid), total };
}

function calcTravel(travelSegments: TravelSegment[]): number {
  return (travelSegments || []).reduce((s, t) => s + (t.durationMinutes || 0), 0);
}

function fmtDur(m: number): string {
  const h = Math.floor(m / 60);
  const mins = Math.round(m % 60);
  if (h === 0) return `${mins}m`;
  if (mins === 0) return `${h}h`;
  return `${h}h ${mins}m`;
}

function fmtTime(t?: Timestamp): string {
  if (!t?.toDate) return '--:--';
  return t.toDate().toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtDate(t: Timestamp): string {
  if (!t?.toDate) return '--';
  return t.toDate().toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateShort(t: Timestamp): string {
  if (!t?.toDate) return '--';
  return t.toDate().toLocaleDateString('en-NZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtWeekEnding(date: Date): string {
  return date.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getHours(start: Timestamp, end?: Timestamp): number {
  if (!start?.toDate) return 0;
  const e = end?.toDate ? end.toDate() : new Date();
  return (e.getTime() - start.toDate().getTime()) / 3600000;
}

function getWeekEndingDate(shiftDate: Date, payWeekEndDay: number): Date {
  const date = new Date(shiftDate);
  const currentDay = date.getDay();
  let daysUntilEnd = payWeekEndDay - currentDay;
  if (daysUntilEnd < 0) daysUntilEnd += 7;
  date.setDate(date.getDate() + daysUntilEnd);
  date.setHours(23, 59, 59, 999);
  return date;
}

function getWeekEndingKey(shiftDate: Date, payWeekEndDay: number): string {
  const weekEnd = getWeekEndingDate(shiftDate, payWeekEndDay);
  return weekEnd.toISOString().split('T')[0];
}

function getJobLogField(jobLog: JobLog | undefined, field: 'field1' | 'field2' | 'field3'): string {
  if (!jobLog) return '';
  if (field === 'field1') return jobLog.field1 || jobLog.notes || '';
  return jobLog[field] || '';
}

// Helper to extract time components from Date
function getTimeComponents(date: Date): { hour: string, minute: string, ampm: 'AM' | 'PM' } {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm: 'AM' | 'PM' = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return { hour: hours.toString(), minute: minutes.toString().padStart(2, '0'), ampm };
}

// Round time: in rounds DOWN, out rounds UP
function roundTime(date: Date, roundTo: 15 | 30, direction: 'down' | 'up'): Date {
  const result = new Date(date);
  const minutes = result.getMinutes();
  let roundedMinutes: number;
  
  if (direction === 'down') {
    roundedMinutes = Math.floor(minutes / roundTo) * roundTo;
  } else {
    roundedMinutes = Math.ceil(minutes / roundTo) * roundTo;
    if (roundedMinutes === 60) {
      result.setHours(result.getHours() + 1);
      roundedMinutes = 0;
    }
  }
  
  result.setMinutes(roundedMinutes, 0, 0);
  return result;
}

// FIXED: MapModal with proper GPS marker handling
function MapModal({ locations, onClose, title, theme, clockInLocation, clockOutLocation }: { locations: Location[], onClose: () => void, title: string, theme: any, clockInLocation?: Location, clockOutLocation?: Location }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  
  // Build combined list with explicit types
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
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }} onClick={onClose}>
      <div style={{ background: theme.card, borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '900px', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ color: theme.text, margin: 0, fontSize: '18px' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: theme.textMuted }}>×</button>
        </div>
        <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '12px', height: '12px', borderRadius: '50%', background: markerColors.clockIn }}></span><span style={{ color: theme.textMuted, fontSize: '12px' }}>Clock In</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '12px', height: '12px', borderRadius: '50%', background: markerColors.clockOut }}></span><span style={{ color: theme.textMuted, fontSize: '12px' }}>Clock Out</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '12px', height: '12px', borderRadius: '50%', background: markerColors.tracking }}></span><span style={{ color: theme.textMuted, fontSize: '12px' }}>Tracking</span></div>
        </div>
        <div style={{ height: '350px', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px', position: 'relative' }}>
          <iframe src={`https://www.openstreetmap.org/export/embed.html?bbox=${minLng - 0.003},${minLat - 0.003},${maxLng + 0.003},${maxLat + 0.003}&layer=mapnik`} style={{ width: '100%', height: '100%', border: 'none' }} title="Map" />
        </div>
        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
          {allPoints.map((point, i) => (
            <div key={i} onClick={() => setSelectedIndex(selectedIndex === i ? null : i)} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: selectedIndex === i ? theme.primary + '20' : (i % 2 === 0 ? theme.cardAlt : 'transparent'), borderRadius: '6px', cursor: 'pointer', marginBottom: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: markerColors[point.type], color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>{i + 1}</span>
                <span style={{ color: theme.text, fontSize: '13px' }}>{markerLabels[point.type]}</span>
              </div>
              <span style={{ color: theme.textMuted, fontSize: '12px' }}>{new Date(point.loc.timestamp).toLocaleTimeString('en-NZ')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LocationMap({ locations, height = '200px' }: { locations: Location[], height?: string }) {
  if (!locations || locations.length === 0) return <div style={{ height, background: '#f3f4f6', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>No location data</div>;
  const lastLoc = locations[locations.length - 1];
  return <div style={{ height, borderRadius: '8px', overflow: 'hidden' }}><iframe src={`https://www.openstreetmap.org/export/embed.html?bbox=${lastLoc.longitude - 0.01},${lastLoc.latitude - 0.01},${lastLoc.longitude + 0.01},${lastLoc.latitude + 0.01}&layer=mapnik&marker=${lastLoc.latitude},${lastLoc.longitude}`} style={{ width: '100%', height: '100%', border: 'none' }} title="Map" /></div>;
}

// Edit Shift Modal for Managers
function EditShiftModal({ shift, onClose, onSave, theme, user, companySettings }: { shift: Shift, onClose: () => void, onSave: () => void, theme: any, user: User, companySettings: CompanySettings }) {
  const clockIn = shift.clockIn?.toDate?.() || new Date();
  const clockOut = shift.clockOut?.toDate?.() || new Date();
  
  const inTime = getTimeComponents(clockIn);
  const outTime = getTimeComponents(clockOut);
  
  const [editClockInHour, setEditClockInHour] = useState(inTime.hour);
  const [editClockInMinute, setEditClockInMinute] = useState(inTime.minute);
  const [editClockInAmPm, setEditClockInAmPm] = useState<'AM' | 'PM'>(inTime.ampm);
  const [editClockOutHour, setEditClockOutHour] = useState(outTime.hour);
  const [editClockOutMinute, setEditClockOutMinute] = useState(outTime.minute);
  const [editClockOutAmPm, setEditClockOutAmPm] = useState<'AM' | 'PM'>(outTime.ampm);
  const [editNotes, setEditNotes] = useState(shift.jobLog?.field1 || '');
  const [editBreaks, setEditBreaks] = useState<Break[]>([...(shift.breaks || [])]);
  const [editTravel, setEditTravel] = useState<TravelSegment[]>([...(shift.travelSegments || [])]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  
  const buildDateFromTime = (baseDate: Date, hour: string, minute: string, ampm: 'AM' | 'PM'): Date => {
    const result = new Date(baseDate);
    let h = parseInt(hour);
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    result.setHours(h, parseInt(minute), 0, 0);
    return result;
  };
  
  const applyRounding = (roundTo: 15 | 30) => {
    const newClockIn = roundTime(buildDateFromTime(clockIn, editClockInHour, editClockInMinute, editClockInAmPm), roundTo, 'down');
    const newClockOut = roundTime(buildDateFromTime(clockIn, editClockOutHour, editClockOutMinute, editClockOutAmPm), roundTo, 'up');
    
    const inComps = getTimeComponents(newClockIn);
    const outComps = getTimeComponents(newClockOut);
    
    setEditClockInHour(inComps.hour);
    setEditClockInMinute(inComps.minute);
    setEditClockInAmPm(inComps.ampm);
    setEditClockOutHour(outComps.hour);
    setEditClockOutMinute(outComps.minute);
    setEditClockOutAmPm(outComps.ampm);
  };
  
  const addBreak = (minutes: number) => {
    const now = Timestamp.now();
    setEditBreaks([...editBreaks, { startTime: now, endTime: now, durationMinutes: minutes, manualEntry: true }]);
  };
  
  const removeBreak = (index: number) => {
    setEditBreaks(editBreaks.filter((_, i) => i !== index));
  };
  
  const addTravel = (minutes: number) => {
    const now = Timestamp.now();
    setEditTravel([...editTravel, { startTime: now, endTime: now, durationMinutes: minutes }]);
  };
  
  const removeTravel = (index: number) => {
    setEditTravel(editTravel.filter((_, i) => i !== index));
  };
  
  const handleSave = async () => {
    setSaving(true);
    setError('');
    
    try {
      const newClockIn = buildDateFromTime(clockIn, editClockInHour, editClockInMinute, editClockInAmPm);
      let newClockOut = buildDateFromTime(clockIn, editClockOutHour, editClockOutMinute, editClockOutAmPm);
      
      // Handle overnight
      if (newClockOut <= newClockIn) {
        newClockOut.setDate(newClockOut.getDate() + 1);
      }
      
      // Validate
      const durationHours = (newClockOut.getTime() - newClockIn.getTime()) / 3600000;
      if (durationHours > 24) {
        setError('Shift cannot exceed 24 hours');
        setSaving(false);
        return;
      }
      
      await updateDoc(doc(db, 'shifts', shift.id), {
        clockIn: Timestamp.fromDate(newClockIn),
        clockOut: Timestamp.fromDate(newClockOut),
        'jobLog.field1': editNotes,
        breaks: editBreaks,
        travelSegments: editTravel,
        editedAt: Timestamp.now(),
        editedBy: user.uid,
        editedByEmail: user.email
      });
      
      onSave();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    }
    
    setSaving(false);
  };
  
  const styles = {
    input: { padding: '10px', borderRadius: '6px', border: `1px solid ${theme.inputBorder}`, background: theme.input, color: theme.text, fontSize: '14px', width: '100%', boxSizing: 'border-box' as const },
    select: { padding: '10px', borderRadius: '6px', border: `1px solid ${theme.inputBorder}`, background: theme.input, color: theme.text, fontSize: '14px' },
    btn: { padding: '10px 16px', borderRadius: '6px', background: theme.primary, color: 'white', border: 'none', cursor: 'pointer', fontWeight: '600' as const, fontSize: '13px' },
  };
  
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }} onClick={onClose}>
      <div style={{ background: theme.card, borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ color: theme.text, margin: 0, fontSize: '18px' }}>Edit Shift</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: theme.textMuted }}>×</button>
        </div>
        
        {error && <div style={{ background: theme.dangerBg, color: theme.danger, padding: '10px', borderRadius: '6px', marginBottom: '16px', fontSize: '13px' }}>{error}</div>}
        
        {/* Time Rounding */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '8px' }}>Round Times</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => applyRounding(15)} style={{ ...styles.btn, background: theme.cardAlt, color: theme.text, flex: 1 }}>Round 15m</button>
            <button onClick={() => applyRounding(30)} style={{ ...styles.btn, background: theme.cardAlt, color: theme.text, flex: 1 }}>Round 30m</button>
          </div>
          <p style={{ color: theme.textMuted, fontSize: '11px', marginTop: '4px' }}>In rounds down, out rounds up</p>
        </div>
        
        {/* Clock In */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '6px' }}>Clock In</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <select value={editClockInHour} onChange={e => setEditClockInHour(e.target.value)} style={{ ...styles.select, flex: 1 }}>
              {[12,1,2,3,4,5,6,7,8,9,10,11].map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <select value={editClockInMinute} onChange={e => setEditClockInMinute(e.target.value)} style={{ ...styles.select, flex: 1 }}>
              {['00','05','10','15','20','25','30','35','40','45','50','55'].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={editClockInAmPm} onChange={e => setEditClockInAmPm(e.target.value as 'AM'|'PM')} style={{ ...styles.select, flex: 1 }}>
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
        </div>
        
        {/* Clock Out */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '6px' }}>Clock Out</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <select value={editClockOutHour} onChange={e => setEditClockOutHour(e.target.value)} style={{ ...styles.select, flex: 1 }}>
              {[12,1,2,3,4,5,6,7,8,9,10,11].map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <select value={editClockOutMinute} onChange={e => setEditClockOutMinute(e.target.value)} style={{ ...styles.select, flex: 1 }}>
              {['00','05','10','15','20','25','30','35','40','45','50','55'].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={editClockOutAmPm} onChange={e => setEditClockOutAmPm(e.target.value as 'AM'|'PM')} style={{ ...styles.select, flex: 1 }}>
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
        </div>
        
        {/* Breaks */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '6px' }}>Breaks ({editBreaks.reduce((s, b) => s + (b.durationMinutes || 0), 0)}m total)</label>
          {editBreaks.map((b, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.cardAlt, padding: '8px 10px', borderRadius: '6px', marginBottom: '6px' }}>
              <span style={{ color: theme.text, fontSize: '13px' }}>{b.durationMinutes || 0}m</span>
              <button onClick={() => removeBreak(i)} style={{ padding: '4px 8px', borderRadius: '4px', background: theme.dangerBg, color: theme.danger, border: 'none', cursor: 'pointer', fontSize: '11px' }}>Remove</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[10, 15, 20, 30].map(m => (
              <button key={m} onClick={() => addBreak(m)} style={{ padding: '6px 12px', borderRadius: '6px', background: theme.warningBg, color: theme.warning, border: 'none', cursor: 'pointer', fontSize: '12px' }}>+{m}m</button>
            ))}
          </div>
        </div>
        
        {/* Travel */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '6px' }}>Travel ({editTravel.reduce((s, t) => s + (t.durationMinutes || 0), 0)}m total)</label>
          {editTravel.map((t, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.cardAlt, padding: '8px 10px', borderRadius: '6px', marginBottom: '6px' }}>
              <span style={{ color: theme.text, fontSize: '13px' }}>{t.durationMinutes || 0}m</span>
              <button onClick={() => removeTravel(i)} style={{ padding: '4px 8px', borderRadius: '4px', background: theme.dangerBg, color: theme.danger, border: 'none', cursor: 'pointer', fontSize: '11px' }}>Remove</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[15, 30, 45, 60].map(m => (
              <button key={m} onClick={() => addTravel(m)} style={{ padding: '6px 12px', borderRadius: '6px', background: theme.travelBg, color: theme.travel, border: 'none', cursor: 'pointer', fontSize: '12px' }}>+{m}m</button>
            ))}
          </div>
        </div>
        
        {/* Notes */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '6px' }}>{companySettings.field1Label}</label>
          <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }} />
        </div>
        
        {/* Buttons */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={onClose} style={{ ...styles.btn, flex: 1, background: theme.cardAlt, color: theme.text }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ ...styles.btn, flex: 1, opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
}

const lightTheme = { bg: '#f8fafc', sidebar: '#ffffff', sidebarBorder: '#e2e8f0', card: '#ffffff', cardAlt: '#f1f5f9', cardBorder: '#e2e8f0', text: '#1e293b', textMuted: '#64748b', textLight: '#94a3b8', primary: '#2563eb', primaryHover: '#1d4ed8', success: '#16a34a', successBg: '#dcfce7', warning: '#f59e0b', warningBg: '#fef3c7', danger: '#dc2626', dangerBg: '#fee2e2', input: '#ffffff', inputBorder: '#d1d5db', travel: '#2563eb', travelBg: '#dbeafe' };
const darkTheme = { bg: '#0f172a', sidebar: '#1e293b', sidebarBorder: '#334155', card: '#1e293b', cardAlt: '#0f172a', cardBorder: '#334155', text: '#f1f5f9', textMuted: '#94a3b8', textLight: '#64748b', primary: '#3b82f6', primaryHover: '#2563eb', success: '#22c55e', successBg: '#22c55e33', warning: '#f59e0b', warningBg: '#f59e0b33', danger: '#ef4444', dangerBg: '#ef444433', input: '#0f172a', inputBorder: '#334155', travel: '#3b82f6', travelBg: '#3b82f633' };

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dark, setDark] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [signupName, setSignupName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [view, setView] = useState('live');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [activeShifts, setActiveShifts] = useState<Shift[]>([]);
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedShift, setSelectedShift] = useState<string | null>(null);
  const [mapModal, setMapModal] = useState<{ locations: Location[], title: string, clockInLocation?: Location, clockOutLocation?: Location } | null>(null);
  const [editShiftModal, setEditShiftModal] = useState<Shift | null>(null);
  const [newEmpEmail, setNewEmpEmail] = useState('');
  const [newEmpName, setNewEmpName] = useState('');
  const [reportStart, setReportStart] = useState('');
  const [reportEnd, setReportEnd] = useState('');
  const [reportEmp, setReportEmp] = useState('all');
  const [reportData, setReportData] = useState<Shift[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [chatTab, setChatTab] = useState('team');
  const [cleanupStart, setCleanupStart] = useState('');
  const [cleanupEnd, setCleanupEnd] = useState('');
  const [cleanupConfirm, setCleanupConfirm] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [removeDeleteShifts, setRemoveDeleteShifts] = useState(false);
  const [myShift, setMyShift] = useState<Shift | null>(null);
  const [myShiftHistory, setMyShiftHistory] = useState<Shift[]>([]);
  const [onBreak, setOnBreak] = useState(false);
  const [breakStart, setBreakStart] = useState<Date | null>(null);
  const [myField1, setMyField1] = useState('');
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings>(defaultCompanySettings);
  const [editingCompanySettings, setEditingCompanySettings] = useState<CompanySettings>(defaultCompanySettings);
  const [savingCompanySettings, setSavingCompanySettings] = useState(false);
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [timesheetFilterStart, setTimesheetFilterStart] = useState('');
  const [timesheetFilterEnd, setTimesheetFilterEnd] = useState('');
  const [finalizingWeek, setFinalizingWeek] = useState<string | null>(null);

  const theme = dark ? darkTheme : lightTheme;

  // Get employee info - returns name, email, and whether employee exists
  const getEmployeeInfo = (userId?: string, userEmail?: string): { name: string, email: string, exists: boolean } => {
    if (userId) {
      const emp = employees.find(e => e.id === userId);
      if (emp) {
        return { name: emp.name || emp.email.split('@')[0], email: emp.email, exists: true };
      }
    }
    if (userEmail) {
      const emp = employees.find(e => e.email === userEmail);
      if (emp) {
        return { name: emp.name || emp.email.split('@')[0], email: emp.email, exists: true };
      }
      // Employee not found but we have email
      return { name: userEmail.split('@')[0], email: userEmail, exists: false };
    }
    return { name: 'Unknown', email: '', exists: false };
  };

  const getEmployeeName = (userId?: string, userEmail?: string): string => {
    return getEmployeeInfo(userId, userEmail).name;
  };

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => { const handleResize = () => setIsMobile(window.innerWidth < 768); window.addEventListener('resize', handleResize); return () => window.removeEventListener('resize', handleResize); }, []);

  useEffect(() => { return onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); }); }, []);
  useEffect(() => { if (!user) return; return onSnapshot(collection(db, 'employees'), (snap) => { setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee))); }); }, [user]);
  useEffect(() => { if (!user) return; return onSnapshot(collection(db, 'invites'), (snap) => { setInvites(snap.docs.map(d => ({ id: d.id, ...d.data() }))); }); }, [user]);
  useEffect(() => { if (!user) return; return onSnapshot(query(collection(db, 'shifts'), where('status', '==', 'active')), (snap) => { setActiveShifts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Shift))); }); }, [user]);
  useEffect(() => { if (!user) return; return onSnapshot(query(collection(db, 'shifts'), orderBy('clockIn', 'desc')), (snap) => { setAllShifts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Shift))); }); }, [user]);
  useEffect(() => { if (!user) return; return onSnapshot(query(collection(db, 'messages'), orderBy('timestamp', 'desc')), (snap) => { setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)).reverse()); }); }, [user]);
  useEffect(() => { if (!user) return; return onSnapshot(doc(db, 'company', 'settings'), (snap) => { if (snap.exists()) { const data = snap.data() as CompanySettings; setCompanySettings({ ...defaultCompanySettings, ...data }); setEditingCompanySettings({ ...defaultCompanySettings, ...data }); } }); }, [user]);
  useEffect(() => { if (!user) return; const q = query(collection(db, 'shifts'), where('userId', '==', user.uid)); return onSnapshot(q, (snap) => { const activeDoc = snap.docs.find(d => d.data().status === 'active'); if (activeDoc) { const shift = { id: activeDoc.id, ...activeDoc.data() } as Shift; setMyShift(shift); setMyField1(getJobLogField(shift.jobLog, 'field1')); const ab = shift.breaks?.find(b => !b.endTime && !b.manualEntry); if (ab) { setOnBreak(true); setBreakStart(ab.startTime.toDate()); } else { setOnBreak(false); setBreakStart(null); } } else { setMyShift(null); setOnBreak(false); setBreakStart(null); setMyField1(''); } }); }, [user]);
  useEffect(() => { if (!user) return; const q = query(collection(db, 'shifts'), where('userId', '==', user.uid)); return onSnapshot(q, (snap) => { const shifts = snap.docs.map(d => ({ id: d.id, ...d.data() } as Shift)).filter(s => s.status === 'completed').sort((a, b) => (b.clockIn?.toDate?.()?.getTime() || 0) - (a.clockIn?.toDate?.()?.getTime() || 0)).slice(0, 20); setMyShiftHistory(shifts); }); }, [user]);

  const handleLogin = async (e: React.FormEvent) => { e.preventDefault(); setError(''); try { await signInWithEmailAndPassword(auth, email, password); } catch (err: any) { setError(err.message); } };
  const handleSignUp = async (e: React.FormEvent) => { e.preventDefault(); setError(''); if (password.length < 6) { setError('Password must be at least 6 characters'); return; } try { const cred = await createUserWithEmailAndPassword(auth, email, password); await setDoc(doc(db, 'employees', cred.user.uid), { email, name: signupName || email.split('@')[0], role: 'manager', settings: defaultSettings, createdAt: Timestamp.now() }); setSuccess('Account created!'); } catch (err: any) { setError(err.message); } };
  const handleResetPassword = async (e: React.FormEvent) => { e.preventDefault(); setError(''); setSuccess(''); if (!email) { setError('Please enter your email'); return; } try { await sendPasswordResetEmail(auth, email); setSuccess('Reset email sent!'); } catch (err: any) { setError(err.message); } };

  const inviteEmployee = async (e: React.FormEvent) => { e.preventDefault(); setError(''); setSuccess(''); if (invites.find(i => i.email.toLowerCase() === newEmpEmail.toLowerCase() && i.status === 'pending')) { setError('Invite already sent'); return; } if (employees.find(emp => emp.email.toLowerCase() === newEmpEmail.toLowerCase())) { setError('Employee exists'); return; } try { await addDoc(collection(db, 'invites'), { email: newEmpEmail.toLowerCase(), name: newEmpName || newEmpEmail.split('@')[0], status: 'pending', createdAt: Timestamp.now(), createdBy: user?.uid }); setSuccess(`Invite created for ${newEmpEmail}`); setNewEmpEmail(''); setNewEmpName(''); } catch (err: any) { setError(err.message); } };
  const cancelInvite = async (id: string) => { await updateDoc(doc(db, 'invites', id), { status: 'cancelled' }); setSuccess('Cancelled'); };
  const sendInviteEmail = async (inv: any) => { setSendingEmail(inv.id); try { const r = await fetch(`${API_URL}/api/send-invite`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: inv.email, name: inv.name, inviteId: inv.id }) }); if (!r.ok) throw new Error('Failed'); setSuccess('Email sent!'); await updateDoc(doc(db, 'invites', inv.id), { emailSent: true, emailSentAt: Timestamp.now() }); } catch (err: any) { setError(err.message); } finally { setSendingEmail(null); } };
  const copyInviteLink = async (inv: any) => { const link = `${MOBILE_APP_URL}?invite=true&email=${encodeURIComponent(inv.email)}`; await navigator.clipboard.writeText(link); setSuccess('Link copied!'); };
  const removeEmployee = async (empId: string) => { const emp = employees.find(e => e.id === empId); if (!emp || empId === user?.uid) { setError("Can't remove"); setRemoveConfirm(null); return; } try { await fetch(`${API_URL}/api/delete-user`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: empId }) }); await deleteDoc(doc(db, 'employees', empId)); if (removeDeleteShifts) { const batch = writeBatch(db); allShifts.filter(s => s.userId === empId).forEach(s => batch.delete(doc(db, 'shifts', s.id))); await batch.commit(); } setSuccess(`Removed ${emp.name || emp.email}`); setRemoveConfirm(null); setRemoveDeleteShifts(false); } catch (err: any) { setError(err.message); setRemoveConfirm(null); } };
  const updateSettings = async (empId: string, updates: Partial<EmployeeSettings>) => { const ref = doc(db, 'employees', empId); const snap = await getDoc(ref); await updateDoc(ref, { settings: { ...(snap.data()?.settings || defaultSettings), ...updates } }); setSuccess('Updated!'); setTimeout(() => setSuccess(''), 2000); };
  const saveCompanySettings = async () => { setSavingCompanySettings(true); try { await setDoc(doc(db, 'company', 'settings'), editingCompanySettings); setSuccess('Saved!'); setTimeout(() => setSuccess(''), 2000); } catch (err: any) { setError(err.message); } finally { setSavingCompanySettings(false); } };

  // Finalize week
  const finalizeWeek = async (empEmail: string, weekKey: string, shifts: Shift[]) => {
    if (!user) return;
    setFinalizingWeek(`${empEmail}-${weekKey}`);
    
    try {
      const batch = writeBatch(db);
      shifts.forEach(shift => {
        batch.update(doc(db, 'shifts', shift.id), {
          finalized: true,
          finalizedAt: Timestamp.now(),
          finalizedBy: user.uid,
          finalizedByEmail: user.email
        });
      });
      await batch.commit();
      setSuccess('Week finalized ✓');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to finalize');
    }
    
    setFinalizingWeek(null);
  };

  const genReport = () => { if (!reportStart || !reportEnd) { setError('Select dates'); return; } const s = new Date(reportStart); s.setHours(0,0,0,0); const e = new Date(reportEnd); e.setHours(23,59,59,999); let data = allShifts.filter(sh => { if (!sh.clockIn?.toDate) return false; const d = sh.clockIn.toDate(); return d >= s && d <= e && sh.status === 'completed'; }); if (reportEmp !== 'all') data = data.filter(sh => sh.userId === reportEmp); setReportData(data); };
  const exportCSV = () => { if (!reportData.length) return; const rows = [['Date','Employee','In','Out','Worked','Paid','Unpaid','Travel']]; reportData.forEach(sh => { const h = getHours(sh.clockIn, sh.clockOut); const b = calcBreaks(sh.breaks || [], h, companySettings.paidRestMinutes); const t = calcTravel(sh.travelSegments || []); rows.push([fmtDateShort(sh.clockIn), getEmployeeName(sh.userId, sh.userEmail), fmtTime(sh.clockIn), sh.clockOut ? fmtTime(sh.clockOut) : '-', fmtDur((h*60)-b.unpaid), b.paid+'m', b.unpaid+'m', t+'m']); }); const csv = rows.map(r => r.join(',')).join('\n'); const blob = new Blob([csv], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `timetrack-${reportStart}-${reportEnd}.csv`; a.click(); };
  const exportPDF = () => { if (!reportData.length) return; let total = 0, tPaid = 0, tUnpaid = 0; const rows = reportData.map(sh => { const h = getHours(sh.clockIn, sh.clockOut); const b = calcBreaks(sh.breaks || [], h, companySettings.paidRestMinutes); const worked = (h*60) - b.unpaid; total += worked; tPaid += b.paid; tUnpaid += b.unpaid; return `<tr><td>${fmtDateShort(sh.clockIn)}</td><td>${getEmployeeName(sh.userId, sh.userEmail)}</td><td>${fmtTime(sh.clockIn)}</td><td>${sh.clockOut ? fmtTime(sh.clockOut) : '-'}</td><td>${fmtDur(worked)}</td><td>${b.paid}m</td><td>${b.unpaid}m</td></tr>`; }).join(''); const html = `<!DOCTYPE html><html><head><style>body{font-family:Arial;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px}th{background:#1e40af;color:white}</style></head><body><h1>TimeTrack Report</h1><p>${reportStart} to ${reportEnd}</p><table><tr><th>Date</th><th>Employee</th><th>In</th><th>Out</th><th>Worked</th><th>Paid</th><th>Unpaid</th></tr>${rows}</table><h3>Total: ${fmtDur(total)}, ${tPaid}m paid, ${tUnpaid}m unpaid</h3></body></html>`; const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); w.print(); } };

  const sendMsg = async () => { if (!newMsg.trim()) return; await addDoc(collection(db, 'messages'), { type: chatTab, senderId: 'employer', senderEmail: 'Employer', text: newMsg.trim(), timestamp: Timestamp.now(), participants: [] }); setNewMsg(''); };
  const cleanup = async () => { if (!cleanupStart || !cleanupEnd || !cleanupConfirm) { setError('Select dates and confirm'); return; } const s = new Date(cleanupStart); const e = new Date(cleanupEnd); e.setHours(23,59,59); const toDelete = allShifts.filter(sh => { if (!sh.clockIn?.toDate) return false; const d = sh.clockIn.toDate(); return d >= s && d <= e && sh.status === 'completed'; }); const batch = writeBatch(db); toDelete.forEach(sh => batch.delete(doc(db, 'shifts', sh.id))); await batch.commit(); setSuccess(`Deleted ${toDelete.length} shifts`); setCleanupConfirm(false); setCleanupStart(''); setCleanupEnd(''); };

  const myClockIn = async () => { if (!user) return; await addDoc(collection(db, 'shifts'), { userId: user.uid, userEmail: user.email, clockIn: Timestamp.now(), clockInLocation: null, locationHistory: [], breaks: [], travelSegments: [], jobLog: { field1: '', field2: '', field3: '' }, status: 'active' }); setSuccess('Clocked in!'); };
  const myClockOut = async () => { if (!myShift) return; let ub = [...(myShift.breaks || [])]; const ai = ub.findIndex(b => !b.endTime && !b.manualEntry); if (ai !== -1 && breakStart) { ub[ai] = { ...ub[ai], endTime: Timestamp.now(), durationMinutes: Math.round((Date.now() - breakStart.getTime()) / 60000) }; } await updateDoc(doc(db, 'shifts', myShift.id), { clockOut: Timestamp.now(), breaks: ub, 'jobLog.field1': myField1, status: 'completed' }); setSuccess('Clocked out!'); };
  const myStartBreak = async () => { if (!myShift) return; await updateDoc(doc(db, 'shifts', myShift.id), { breaks: [...(myShift.breaks || []), { startTime: Timestamp.now(), manualEntry: false }] }); setOnBreak(true); setBreakStart(new Date()); };
  const myEndBreak = async () => { if (!myShift || !breakStart) return; const ub = myShift.breaks.map((b, i) => i === myShift.breaks.length - 1 && !b.endTime && !b.manualEntry ? { ...b, endTime: Timestamp.now(), durationMinutes: Math.round((Date.now() - breakStart.getTime()) / 60000) } : b); await updateDoc(doc(db, 'shifts', myShift.id), { breaks: ub }); setOnBreak(false); setBreakStart(null); };
  const myAddBreak = async (m: number) => { if (!myShift) return; const now = Timestamp.now(); await updateDoc(doc(db, 'shifts', myShift.id), { breaks: [...(myShift.breaks || []), { startTime: now, endTime: now, durationMinutes: m, manualEntry: true }] }); };
  const saveMyField1 = async () => { if (!myShift) return; await updateDoc(doc(db, 'shifts', myShift.id), { 'jobLog.field1': myField1 }); };

  const navigateTo = (v: string) => { setView(v); setSidebarOpen(false); };
  const hasActiveTravel = (sh: Shift): boolean => (sh.travelSegments || []).some(t => !t.endTime);
  const toggleEmployee = (id: string) => { const s = new Set(expandedEmployees); if (s.has(id)) s.delete(id); else s.add(id); setExpandedEmployees(s); };
  const toggleWeek = (key: string) => { const s = new Set(expandedWeeks); if (s.has(key)) s.delete(key); else s.add(key); setExpandedWeeks(s); };

  // Quick date filter helpers
  const setThisWeek = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    setTimesheetFilterStart(startOfWeek.toISOString().split('T')[0]);
    setTimesheetFilterEnd(endOfWeek.toISOString().split('T')[0]);
  };
  const setLastWeek = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const startOfLastWeek = new Date(now);
    startOfLastWeek.setDate(now.getDate() - dayOfWeek - 7);
    const endOfLastWeek = new Date(startOfLastWeek);
    endOfLastWeek.setDate(startOfLastWeek.getDate() + 6);
    setTimesheetFilterStart(startOfLastWeek.toISOString().split('T')[0]);
    setTimesheetFilterEnd(endOfLastWeek.toISOString().split('T')[0]);
  };
  const setThisMonth = () => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setTimesheetFilterStart(startOfMonth.toISOString().split('T')[0]);
    setTimesheetFilterEnd(endOfMonth.toISOString().split('T')[0]);
  };
  const setLastMonth = () => {
    const now = new Date();
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    setTimesheetFilterStart(startOfLastMonth.toISOString().split('T')[0]);
    setTimesheetFilterEnd(endOfLastMonth.toISOString().split('T')[0]);
  };
  const clearTimesheetFilter = () => {
    setTimesheetFilterStart('');
    setTimesheetFilterEnd('');
  };

  // Group timesheets by EMAIL to consolidate shifts from same person (handles userId changes)
  const getGroupedTimesheets = () => {
    let completed = allShifts.filter(s => s.status === 'completed');
    
    // Apply date filter if set
    if (timesheetFilterStart || timesheetFilterEnd) {
      const filterStart = timesheetFilterStart ? new Date(timesheetFilterStart) : null;
      const filterEnd = timesheetFilterEnd ? new Date(timesheetFilterEnd) : null;
      if (filterStart) filterStart.setHours(0, 0, 0, 0);
      if (filterEnd) filterEnd.setHours(23, 59, 59, 999);
      
      completed = completed.filter(shift => {
        const shiftDate = shift.clockIn?.toDate?.();
        if (!shiftDate) return false;
        if (filterStart && shiftDate < filterStart) return false;
        if (filterEnd && shiftDate > filterEnd) return false;
        return true;
      });
    }
    
    const grouped: { [email: string]: { name: string, email: string, exists: boolean, weeks: { [weekKey: string]: { weekEnd: Date, shifts: Shift[], totalMinutes: number, finalized: boolean } } } } = {};
    
    completed.forEach(shift => {
      // Use email as the key (lowercase for consistency), fall back to oderId if no email
      const email = (shift.userEmail || shift.userId || 'unknown').toLowerCase();
      
      if (!grouped[email]) {
        const info = getEmployeeInfo(shift.userId, shift.userEmail);
        grouped[email] = { 
          name: info.name, 
          email: info.email,
          exists: info.exists,
          weeks: {} 
        };
      }
      
      const shiftDate = shift.clockIn?.toDate?.();
      if (!shiftDate) return;
      
      const weekKey = getWeekEndingKey(shiftDate, companySettings.payWeekEndDay);
      const weekEnd = getWeekEndingDate(shiftDate, companySettings.payWeekEndDay);
      
      if (!grouped[email].weeks[weekKey]) {
        grouped[email].weeks[weekKey] = { weekEnd, shifts: [], totalMinutes: 0, finalized: true };
      }
      
      const h = getHours(shift.clockIn, shift.clockOut);
      const b = calcBreaks(shift.breaks || [], h, companySettings.paidRestMinutes);
      grouped[email].weeks[weekKey].shifts.push(shift);
      grouped[email].weeks[weekKey].totalMinutes += (h * 60) - b.unpaid;
      
      // Week is only finalized if ALL shifts are finalized
      if (!shift.finalized) {
        grouped[email].weeks[weekKey].finalized = false;
      }
    });
    
    // Sort weeks newest first
    Object.values(grouped).forEach(emp => {
      const sorted: typeof emp.weeks = {};
      Object.keys(emp.weeks).sort((a, b) => b.localeCompare(a)).forEach(k => { sorted[k] = emp.weeks[k]; });
      emp.weeks = sorted;
    });
    
    return grouped;
  };

  const styles = {
    input: { padding: '12px', borderRadius: '8px', border: `1px solid ${theme.inputBorder}`, background: theme.input, color: theme.text, fontSize: '14px', width: '100%', boxSizing: 'border-box' as const },
    btn: { padding: '12px 20px', borderRadius: '8px', background: theme.primary, color: 'white', border: 'none', cursor: 'pointer', fontWeight: '600' as const, fontSize: '14px' },
    btnDanger: { padding: '12px 20px', borderRadius: '8px', background: theme.danger, color: 'white', border: 'none', cursor: 'pointer', fontWeight: '600' as const },
    card: { background: theme.card, padding: '20px', borderRadius: '12px', marginBottom: '16px', border: `1px solid ${theme.cardBorder}` },
  };

  if (loading) return <div style={{ minHeight: '100vh', background: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: theme.text }}>Loading...</p></div>;

  if (!user) return (
    <div style={{ minHeight: '100vh', background: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ ...styles.card, width: '100%', maxWidth: '400px' }}>
        <h1 style={{ color: theme.text, textAlign: 'center', marginBottom: '8px' }}>TimeTrack NZ</h1>
        <p style={{ color: theme.textMuted, textAlign: 'center', marginBottom: '24px' }}>Manager Dashboard</p>
        {authMode !== 'reset' && (<div style={{ display: 'flex', marginBottom: '24px', background: theme.cardAlt, borderRadius: '8px', padding: '4px' }}><button onClick={() => { setAuthMode('signin'); setError(''); }} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: '600', background: authMode === 'signin' ? theme.primary : 'transparent', color: authMode === 'signin' ? 'white' : theme.textMuted }}>Sign In</button><button onClick={() => { setAuthMode('signup'); setError(''); }} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: '600', background: authMode === 'signup' ? theme.primary : 'transparent', color: authMode === 'signup' ? 'white' : theme.textMuted }}>Sign Up</button></div>)}
        {error && <p style={{ color: theme.danger, marginBottom: '16px', fontSize: '14px' }}>{error}</p>}
        {success && <p style={{ color: theme.success, marginBottom: '16px', fontSize: '14px' }}>{success}</p>}
        <form onSubmit={authMode === 'signin' ? handleLogin : authMode === 'signup' ? handleSignUp : handleResetPassword}>
          {authMode === 'signup' && <input placeholder="Your Name" value={signupName} onChange={e => setSignupName(e.target.value)} style={{ ...styles.input, marginBottom: '12px' }} />}
          <input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} style={{ ...styles.input, marginBottom: '12px' }} />
          {authMode !== 'reset' && <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ ...styles.input, marginBottom: '16px' }} />}
          <button type="submit" style={{ ...styles.btn, width: '100%' }}>{authMode === 'signin' ? 'Sign In' : authMode === 'signup' ? 'Create Account' : 'Send Reset Email'}</button>
        </form>
        {authMode === 'signin' && <button onClick={() => setAuthMode('reset')} style={{ background: 'none', border: 'none', color: theme.primary, cursor: 'pointer', fontSize: '14px', marginTop: '16px', display: 'block', width: '100%', textAlign: 'center' }}>Forgot password?</button>}
        {authMode === 'reset' && <button onClick={() => setAuthMode('signin')} style={{ background: 'none', border: 'none', color: theme.primary, cursor: 'pointer', fontSize: '14px', marginTop: '16px', display: 'block', width: '100%', textAlign: 'center' }}>← Back</button>}
      </div>
    </div>
  );

  const navItems = [{ id: 'live', label: '🟢 Live View' }, { id: 'mysheet', label: '⏱️ My Timesheet' }, { id: 'employees', label: '👥 Employees' }, { id: 'timesheets', label: '📋 Timesheets' }, { id: 'reports', label: '📊 Reports' }, { id: 'chat', label: '💬 Chat' }, { id: 'settings', label: '⚙️ Settings' }];

  return (
    <div style={{ minHeight: '100vh', background: theme.bg }}>
      {isMobile && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '56px', background: theme.sidebar, borderBottom: `1px solid ${theme.sidebarBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', zIndex: 100 }}><button onClick={() => setSidebarOpen(true)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: theme.text }}>☰</button><span style={{ fontWeight: '700', color: theme.text }}>TimeTrack NZ</span><button onClick={() => setDark(!dark)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>{dark ? '☀️' : '🌙'}</button></div>}
      {isMobile && sidebarOpen && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }} onClick={() => setSidebarOpen(false)} />}
      <div style={{ position: 'fixed', top: 0, left: isMobile ? (sidebarOpen ? 0 : -280) : 0, width: '260px', height: '100vh', background: theme.sidebar, borderRight: `1px solid ${theme.sidebarBorder}`, padding: '20px', zIndex: 300, transition: 'left 0.3s', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}><h2 style={{ color: theme.text, fontSize: '18px', margin: 0 }}>TimeTrack NZ</h2>{isMobile && <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: theme.textMuted }}>×</button>}</div>
        {navItems.map(item => <button key={item.id} onClick={() => navigateTo(item.id)} style={{ display: 'block', width: '100%', padding: '12px 16px', marginBottom: '4px', borderRadius: '8px', border: 'none', cursor: 'pointer', textAlign: 'left', fontWeight: '500', fontSize: '14px', background: view === item.id ? theme.primary : 'transparent', color: view === item.id ? 'white' : theme.textMuted }}>{item.label}</button>)}
        <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: `1px solid ${theme.sidebarBorder}` }}>
          {!isMobile && <button onClick={() => setDark(!dark)} style={{ display: 'block', width: '100%', padding: '12px 16px', marginBottom: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer', textAlign: 'left', background: 'transparent', color: theme.textMuted }}>{dark ? '☀️ Light Mode' : '🌙 Dark Mode'}</button>}
          <button onClick={() => signOut(auth)} style={{ display: 'block', width: '100%', padding: '12px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', textAlign: 'left', background: 'transparent', color: theme.danger }}>🚪 Sign Out</button>
        </div>
      </div>

      <div style={{ marginLeft: isMobile ? 0 : '260px', padding: isMobile ? '72px 16px 16px' : '24px 32px' }}>
        {error && <div style={{ background: theme.dangerBg, color: theme.danger, padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}><span>{error}</span><button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.danger }}>×</button></div>}
        {success && <div style={{ background: theme.successBg, color: theme.success, padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}><span>{success}</span><button onClick={() => setSuccess('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.success }}>×</button></div>}
        {mapModal && <MapModal locations={mapModal.locations} onClose={() => setMapModal(null)} title={mapModal.title} theme={theme} clockInLocation={mapModal.clockInLocation} clockOutLocation={mapModal.clockOutLocation} />}
        {editShiftModal && user && <EditShiftModal shift={editShiftModal} onClose={() => setEditShiftModal(null)} onSave={() => setSuccess('Shift updated!')} theme={theme} user={user} companySettings={companySettings} />}
        {removeConfirm && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }} onClick={() => setRemoveConfirm(null)}><div style={{ background: theme.card, borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '400px' }} onClick={e => e.stopPropagation()}><h3 style={{ color: theme.text, marginBottom: '16px' }}>Remove Employee?</h3><label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: theme.text, marginBottom: '20px', cursor: 'pointer' }}><input type="checkbox" checked={removeDeleteShifts} onChange={e => setRemoveDeleteShifts(e.target.checked)} />Also delete their shifts</label><div style={{ display: 'flex', gap: '12px' }}><button onClick={() => setRemoveConfirm(null)} style={{ ...styles.btn, flex: 1, background: theme.cardAlt, color: theme.text }}>Cancel</button><button onClick={() => removeEmployee(removeConfirm)} style={{ ...styles.btnDanger, flex: 1 }}>Remove</button></div></div></div>}

        {/* Live View */}
        {view === 'live' && <div><h1 style={{ color: theme.text, marginBottom: '24px', fontSize: isMobile ? '22px' : '28px' }}>Live View</h1>{activeShifts.length === 0 ? <div style={styles.card}><p style={{ color: theme.textMuted, textAlign: 'center' }}>No active shifts</p></div> : <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(350px, 1fr))', gap: '16px' }}>{activeShifts.map(sh => { const h = getHours(sh.clockIn); const b = calcBreaks(sh.breaks || [], h, companySettings.paidRestMinutes); const ab = sh.breaks?.find(br => !br.endTime && !br.manualEntry); const t = calcTravel(sh.travelSegments || []); const isTraveling = hasActiveTravel(sh); const name = getEmployeeName(sh.userId, sh.userEmail); return <div key={sh.id} style={styles.card}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}><div><p style={{ color: theme.text, fontWeight: '600' }}>{name}</p><p style={{ color: theme.textMuted, fontSize: '13px' }}>In: {fmtTime(sh.clockIn)}</p></div><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}><span style={{ background: theme.successBg, color: theme.success, padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>Active</span>{ab && <span style={{ background: theme.warningBg, color: theme.warning, padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>On Break</span>}{isTraveling && <span style={{ background: theme.travelBg, color: theme.travel, padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>🚗 Traveling</span>}</div></div><div style={{ display: 'grid', gridTemplateColumns: t > 0 ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}><div style={{ background: theme.cardAlt, padding: '10px', borderRadius: '8px', textAlign: 'center' }}><p style={{ color: theme.textMuted, fontSize: '11px' }}>Worked</p><p style={{ color: theme.text, fontWeight: '600' }}>{fmtDur(h*60)}</p></div><div style={{ background: theme.cardAlt, padding: '10px', borderRadius: '8px', textAlign: 'center' }}><p style={{ color: theme.success, fontSize: '11px' }}>Paid</p><p style={{ color: theme.success, fontWeight: '600' }}>{b.paid}m</p></div><div style={{ background: theme.cardAlt, padding: '10px', borderRadius: '8px', textAlign: 'center' }}><p style={{ color: theme.warning, fontSize: '11px' }}>Unpaid</p><p style={{ color: theme.warning, fontWeight: '600' }}>{b.unpaid}m</p></div>{t > 0 && <div style={{ background: theme.travelBg, padding: '10px', borderRadius: '8px', textAlign: 'center' }}><p style={{ color: theme.travel, fontSize: '11px' }}>Travel</p><p style={{ color: theme.travel, fontWeight: '600' }}>{t}m</p></div>}</div>{sh.locationHistory?.length > 0 && <div><LocationMap locations={sh.locationHistory} height="150px" /><button onClick={() => setMapModal({ locations: sh.locationHistory, title: name, clockInLocation: sh.clockInLocation })} style={{ marginTop: '8px', padding: '8px', borderRadius: '6px', border: `1px solid ${theme.cardBorder}`, background: theme.cardAlt, color: theme.text, cursor: 'pointer', fontSize: '12px', width: '100%' }}>View Map ({sh.locationHistory.length} pts)</button></div>}</div>; })}</div>}</div>}

        {/* My Timesheet */}
        {view === 'mysheet' && <div><h1 style={{ color: theme.text, marginBottom: '24px', fontSize: isMobile ? '22px' : '28px' }}>My Timesheet</h1><div style={styles.card}><div style={{ textAlign: 'center', marginBottom: '20px' }}><span style={{ display: 'inline-block', padding: '6px 16px', borderRadius: '20px', fontSize: '14px', fontWeight: 'bold', background: myShift ? (onBreak ? theme.warningBg : theme.successBg) : theme.cardAlt, color: myShift ? (onBreak ? theme.warning : theme.success) : theme.textMuted }}>{myShift ? (onBreak ? '☕ On Break' : '🟢 Clocked In') : '⚪ Clocked Out'}</span></div>{myShift ? <><p style={{ textAlign: 'center', color: theme.textMuted, marginBottom: '8px' }}>Started: {fmtTime(myShift.clockIn)}</p><p style={{ textAlign: 'center', color: theme.text, fontSize: '32px', fontWeight: '700', marginBottom: '20px' }}>{fmtDur(getHours(myShift.clockIn) * 60)}</p><div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>{!onBreak ? <button onClick={myStartBreak} style={{ ...styles.btn, flex: 1, background: theme.warning }}>☕ Start Break</button> : <button onClick={myEndBreak} style={{ ...styles.btn, flex: 1, background: theme.success }}>✓ End Break</button>}<button onClick={myClockOut} style={{ ...styles.btnDanger, flex: 1 }}>🔴 Clock Out</button></div><div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}><span style={{ color: theme.textMuted, fontSize: '13px', width: '100%' }}>Quick add:</span>{[10, 15, 20, 30].map(m => <button key={m} onClick={() => myAddBreak(m)} style={{ padding: '8px 12px', borderRadius: '6px', background: theme.cardAlt, color: theme.text, border: `1px solid ${theme.cardBorder}`, cursor: 'pointer', fontSize: '13px' }}>+{m}m</button>)}</div><div><label style={{ color: theme.textMuted, fontSize: '13px', display: 'block', marginBottom: '6px' }}>{companySettings.field1Label}</label><textarea value={myField1} onChange={e => setMyField1(e.target.value)} onBlur={saveMyField1} style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }} /></div></> : <button onClick={myClockIn} style={{ ...styles.btn, width: '100%', padding: '16px', fontSize: '16px' }}>🟢 Clock In</button>}</div>{myShiftHistory.length > 0 && <div><h3 style={{ color: theme.text, marginBottom: '16px' }}>Recent Shifts</h3>{myShiftHistory.slice(0, 5).map(sh => { const h = getHours(sh.clockIn, sh.clockOut); const b = calcBreaks(sh.breaks || [], h, companySettings.paidRestMinutes); return <div key={sh.id} style={{ ...styles.card, padding: '16px' }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><div><p style={{ color: theme.text, fontWeight: '600' }}>{fmtDate(sh.clockIn)}</p><p style={{ color: theme.textMuted, fontSize: '13px' }}>{fmtTime(sh.clockIn)} - {fmtTime(sh.clockOut)}</p></div><div style={{ textAlign: 'right' }}><p style={{ color: theme.text, fontWeight: '600' }}>{fmtDur((h*60)-b.unpaid)}</p><p style={{ color: theme.textMuted, fontSize: '12px' }}>{b.paid}m paid, {b.unpaid}m unpaid</p></div></div></div>; })}</div>}</div>}

        {/* Employees */}
        {view === 'employees' && <div><h1 style={{ color: theme.text, marginBottom: '24px', fontSize: isMobile ? '22px' : '28px' }}>Employees</h1><div style={styles.card}><h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Invite New Employee</h3><form onSubmit={inviteEmployee}><div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}><input placeholder="Email" type="email" value={newEmpEmail} onChange={e => setNewEmpEmail(e.target.value)} required style={{ ...styles.input, flex: '2', minWidth: '200px' }} /><input placeholder="Name (optional)" value={newEmpName} onChange={e => setNewEmpName(e.target.value)} style={{ ...styles.input, flex: '1', minWidth: '150px' }} /><button type="submit" style={styles.btn}>Create Invite</button></div></form></div>{invites.filter(i => i.status === 'pending').length > 0 && <div style={styles.card}><h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Pending Invites</h3>{invites.filter(i => i.status === 'pending').map(inv => <div key={inv.id} style={{ background: theme.cardAlt, padding: '16px', borderRadius: '8px', marginBottom: '12px' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}><div><p style={{ color: theme.text, fontWeight: '600' }}>{inv.name || inv.email}</p><p style={{ color: theme.textMuted, fontSize: '13px' }}>{inv.email}</p>{inv.emailSent && <p style={{ color: theme.success, fontSize: '12px', marginTop: '4px' }}>✓ Email sent</p>}</div><button onClick={() => cancelInvite(inv.id)} style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${theme.danger}`, background: 'transparent', color: theme.danger, cursor: 'pointer', fontSize: '12px' }}>Cancel</button></div><div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}><button onClick={() => sendInviteEmail(inv)} disabled={sendingEmail === inv.id} style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: theme.primary, color: 'white', cursor: 'pointer', fontSize: '13px', fontWeight: '600', opacity: sendingEmail === inv.id ? 0.7 : 1 }}>{sendingEmail === inv.id ? '⏳ Sending...' : '📧 Send Email'}</button><button onClick={() => copyInviteLink(inv)} style={{ padding: '10px 16px', borderRadius: '8px', border: `1px solid ${theme.cardBorder}`, background: theme.card, color: theme.text, cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}>📋 Copy Link</button></div></div>)}</div>}{employees.map(emp => <div key={emp.id} style={styles.card}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}><div><p style={{ color: theme.text, fontWeight: '600', marginBottom: '4px' }}>{emp.name || emp.email}</p><p style={{ color: theme.textMuted, fontSize: '14px' }}>{emp.email}</p></div><div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>{emp.role === 'manager' && <span style={{ background: theme.primary, color: 'white', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600' }}>Manager</span>}{emp.id !== user?.uid && <button onClick={() => setRemoveConfirm(emp.id)} style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${theme.danger}`, background: 'transparent', color: theme.danger, cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>Remove</button>}</div></div><div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.cardAlt, padding: '12px', borderRadius: '8px' }}><span style={{ color: theme.textMuted, fontSize: '14px' }}>GPS Tracking</span><button onClick={() => updateSettings(emp.id, { gpsTracking: !emp.settings?.gpsTracking })} style={{ width: '50px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer', background: emp.settings?.gpsTracking ? theme.success : '#cbd5e1', position: 'relative' }}><span style={{ position: 'absolute', top: '3px', width: '20px', height: '20px', borderRadius: '50%', background: 'white', left: emp.settings?.gpsTracking ? '27px' : '3px', transition: 'left 0.2s' }} /></button></div><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.cardAlt, padding: '12px', borderRadius: '8px' }}><span style={{ color: theme.textMuted, fontSize: '14px' }}>GPS Interval</span><select value={emp.settings?.gpsInterval || 10} onChange={e => updateSettings(emp.id, { gpsInterval: parseInt(e.target.value) })} style={{ padding: '6px', borderRadius: '6px', background: theme.input, color: theme.text, border: `1px solid ${theme.inputBorder}` }}><option value={5}>5 min</option><option value={10}>10 min</option><option value={15}>15 min</option></select></div><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.cardAlt, padding: '12px', borderRadius: '8px' }}><span style={{ color: theme.textMuted, fontSize: '14px' }}>Require Notes</span><button onClick={() => updateSettings(emp.id, { requireNotes: !emp.settings?.requireNotes })} style={{ width: '50px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer', background: emp.settings?.requireNotes ? theme.success : '#cbd5e1', position: 'relative' }}><span style={{ position: 'absolute', top: '3px', width: '20px', height: '20px', borderRadius: '50%', background: 'white', left: emp.settings?.requireNotes ? '27px' : '3px', transition: 'left 0.2s' }} /></button></div><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.cardAlt, padding: '12px', borderRadius: '8px' }}><span style={{ color: theme.textMuted, fontSize: '14px' }}>Chat Access</span><button onClick={() => updateSettings(emp.id, { chatEnabled: emp.settings?.chatEnabled === false })} style={{ width: '50px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer', background: emp.settings?.chatEnabled !== false ? theme.success : '#cbd5e1', position: 'relative' }}><span style={{ position: 'absolute', top: '3px', width: '20px', height: '20px', borderRadius: '50%', background: 'white', left: emp.settings?.chatEnabled !== false ? '27px' : '3px', transition: 'left 0.2s' }} /></button></div></div></div>)}</div>}

        {/* Timesheets - Nested Accordion with Edit & Finalize */}
        {view === 'timesheets' && <div>
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
          {(() => {
            const grouped = getGroupedTimesheets();
            const empIds = Object.keys(grouped).sort((a, b) => grouped[a].name.localeCompare(grouped[b].name));
            if (empIds.length === 0) return <div style={styles.card}><p style={{ color: theme.textMuted, textAlign: 'center' }}>No completed shifts</p></div>;
            
            return empIds.map(empId => {
              const { name, email, exists, weeks } = grouped[empId];
              const isExpanded = expandedEmployees.has(empId);
              const shiftCount = Object.values(weeks).reduce((sum, w) => sum + w.shifts.length, 0);
              
              return (
                <div key={empId} style={{ ...styles.card, padding: 0, overflow: 'hidden' }}>
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
                              <div style={{ background: theme.bg }}>
                                {shifts.sort((a, b) => (b.clockIn?.toDate?.()?.getTime() || 0) - (a.clockIn?.toDate?.()?.getTime() || 0)).map(sh => {
                                  const h = getHours(sh.clockIn, sh.clockOut);
                                  const b = calcBreaks(sh.breaks || [], h, companySettings.paidRestMinutes);
                                  const t = calcTravel(sh.travelSegments || []);
                                  const worked = (h * 60) - b.unpaid;
                                  const isOpen = selectedShift === sh.id;
                                  const f1 = getJobLogField(sh.jobLog, 'field1');
                                  
                                  return (
                                    <div key={sh.id} style={{ padding: '12px 20px', paddingLeft: '72px', borderBottom: `1px solid ${theme.cardBorder}`, cursor: 'pointer' }} onClick={() => setSelectedShift(isOpen ? null : sh.id)}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                          <p style={{ color: theme.text, fontWeight: '500', margin: 0 }}>
                                            {fmtDate(sh.clockIn)}
                                            {sh.editedAt && <span style={{ marginLeft: '8px', fontSize: '10px', background: theme.warningBg, color: theme.warning, padding: '2px 6px', borderRadius: '4px' }}>Edited</span>}
                                            {sh.finalized && <span style={{ marginLeft: '8px', fontSize: '10px', background: theme.successBg, color: theme.success, padding: '2px 6px', borderRadius: '4px' }}>✓</span>}
                                          </p>
                                          <p style={{ color: theme.textMuted, fontSize: '13px', margin: 0 }}>{fmtTime(sh.clockIn)} - {sh.clockOut ? fmtTime(sh.clockOut) : 'Active'}</p>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                          <p style={{ color: theme.text, fontWeight: '600', margin: 0 }}>{fmtDur(worked)}</p>
                                          <p style={{ color: theme.textMuted, fontSize: '11px', margin: 0 }}>{b.paid}m paid, {b.unpaid}m unpaid{t > 0 && `, ${t}m travel`}</p>
                                        </div>
                                      </div>
                                      
                                      {/* Expanded shift details */}
                                      {isOpen && (
                                        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${theme.cardBorder}` }} onClick={e => e.stopPropagation()}>
                                          {f1 && <div style={{ background: theme.cardAlt, padding: '10px', borderRadius: '8px', marginBottom: '10px' }}><p style={{ color: theme.textMuted, fontSize: '11px', margin: 0 }}>📝 {companySettings.field1Label}</p><p style={{ color: theme.text, fontSize: '13px', margin: '4px 0 0 0' }}>{f1}</p></div>}
                                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            {(sh.locationHistory?.length > 0 || sh.clockInLocation) && <button onClick={() => setMapModal({ locations: sh.locationHistory || [], title: `${name} - ${fmtDateShort(sh.clockIn)}`, clockInLocation: sh.clockInLocation, clockOutLocation: sh.clockOutLocation })} style={{ padding: '8px 12px', borderRadius: '6px', border: `1px solid ${theme.cardBorder}`, background: theme.card, color: theme.text, cursor: 'pointer', fontSize: '12px' }}>📍 Map ({(sh.locationHistory?.length || 0) + (sh.clockInLocation ? 1 : 0) + (sh.clockOutLocation ? 1 : 0)})</button>}
                                            <button onClick={() => setEditShiftModal(sh)} style={{ padding: '8px 12px', borderRadius: '6px', border: `1px solid ${theme.primary}`, background: 'transparent', color: theme.primary, cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>✏️ Edit Shift</button>
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
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>}

        {/* Reports */}
        {view === 'reports' && <div><h1 style={{ color: theme.text, marginBottom: '24px', fontSize: isMobile ? '22px' : '28px' }}>Reports</h1><div style={styles.card}><h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Generate Report</h3><div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'end' }}><div style={{ flex: '1', minWidth: '140px' }}><label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Start</label><input type="date" value={reportStart} onChange={e => setReportStart(e.target.value)} style={styles.input} /></div><div style={{ flex: '1', minWidth: '140px' }}><label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>End</label><input type="date" value={reportEnd} onChange={e => setReportEnd(e.target.value)} style={styles.input} /></div><div style={{ flex: '1', minWidth: '180px' }}><label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Employee</label><select value={reportEmp} onChange={e => setReportEmp(e.target.value)} style={styles.input}><option value="all">All</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name || e.email}</option>)}</select></div><button onClick={genReport} style={styles.btn}>Generate</button></div></div>{reportData.length > 0 && <div style={styles.card}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}><h3 style={{ color: theme.text, margin: 0 }}>{reportData.length} shifts</h3><div style={{ display: 'flex', gap: '8px' }}><button onClick={exportCSV} style={{ ...styles.btn, background: theme.success }}>📄 CSV</button><button onClick={exportPDF} style={styles.btnDanger}>📑 PDF</button></div></div><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}><thead><tr style={{ borderBottom: `2px solid ${theme.cardBorder}` }}><th style={{ padding: '12px 8px', textAlign: 'left', color: theme.textMuted, fontSize: '13px' }}>Date</th><th style={{ padding: '12px 8px', textAlign: 'left', color: theme.textMuted, fontSize: '13px' }}>Employee</th><th style={{ padding: '12px 8px', textAlign: 'left', color: theme.textMuted, fontSize: '13px' }}>In</th><th style={{ padding: '12px 8px', textAlign: 'left', color: theme.textMuted, fontSize: '13px' }}>Out</th><th style={{ padding: '12px 8px', textAlign: 'left', color: theme.textMuted, fontSize: '13px' }}>Worked</th><th style={{ padding: '12px 8px', textAlign: 'left', color: theme.success, fontSize: '13px' }}>Paid</th><th style={{ padding: '12px 8px', textAlign: 'left', color: theme.warning, fontSize: '13px' }}>Unpaid</th></tr></thead><tbody>{reportData.map(sh => { const h = getHours(sh.clockIn, sh.clockOut); const b = calcBreaks(sh.breaks||[], h, companySettings.paidRestMinutes); return <tr key={sh.id} style={{ borderBottom: `1px solid ${theme.cardBorder}` }}><td style={{ padding: '12px 8px', color: theme.text, fontSize: '13px' }}>{fmtDateShort(sh.clockIn)}</td><td style={{ padding: '12px 8px', color: theme.text, fontSize: '13px' }}>{getEmployeeName(sh.userId, sh.userEmail)}</td><td style={{ padding: '12px 8px', color: theme.textMuted, fontSize: '13px' }}>{fmtTime(sh.clockIn)}</td><td style={{ padding: '12px 8px', color: theme.textMuted, fontSize: '13px' }}>{sh.clockOut ? fmtTime(sh.clockOut) : '-'}</td><td style={{ padding: '12px 8px', color: theme.text, fontWeight: '600', fontSize: '13px' }}>{fmtDur((h*60)-b.unpaid)}</td><td style={{ padding: '12px 8px', color: theme.success, fontSize: '13px' }}>{b.paid}m</td><td style={{ padding: '12px 8px', color: theme.warning, fontSize: '13px' }}>{b.unpaid}m</td></tr>; })}</tbody></table></div></div>}</div>}

        {/* Chat */}
        {view === 'chat' && <div style={{ display: 'flex', flexDirection: 'column', height: isMobile ? 'calc(100vh - 120px)' : 'calc(100vh - 80px)' }}><h1 style={{ color: theme.text, marginBottom: '16px', fontSize: isMobile ? '22px' : '28px' }}>Chat</h1><div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}><button onClick={() => setChatTab('team')} style={{ ...styles.btn, flex: 1, background: chatTab === 'team' ? theme.primary : theme.cardAlt, color: chatTab === 'team' ? 'white' : theme.text }}>Team Chat</button><button onClick={() => setChatTab('dm')} style={{ ...styles.btn, flex: 1, background: chatTab === 'dm' ? theme.primary : theme.cardAlt, color: chatTab === 'dm' ? 'white' : theme.text }}>Direct Messages</button></div><div style={{ flex: 1, background: theme.card, borderRadius: '12px', padding: '16px', overflowY: 'auto', marginBottom: '16px', border: `1px solid ${theme.cardBorder}` }}>{messages.filter(m => m.type === chatTab).length === 0 ? <p style={{ color: theme.textMuted, textAlign: 'center', marginTop: '40px' }}>No messages yet</p> : messages.filter(m => m.type === chatTab).map(m => <div key={m.id} style={{ display: 'flex', justifyContent: m.senderId === 'employer' ? 'flex-end' : 'flex-start', marginBottom: '12px' }}><div style={{ maxWidth: '75%', padding: '10px 14px', borderRadius: '12px', background: m.senderId === 'employer' ? theme.primary : theme.cardAlt }}>{m.senderId !== 'employer' && <p style={{ color: theme.textMuted, fontSize: '11px', marginBottom: '4px' }}>{getEmployeeName(m.senderId, m.senderEmail)}</p>}<p style={{ color: m.senderId === 'employer' ? 'white' : theme.text, fontSize: '14px', margin: 0 }}>{m.text}</p><p style={{ color: m.senderId === 'employer' ? 'rgba(255,255,255,0.6)' : theme.textLight, fontSize: '10px', marginTop: '4px' }}>{fmtTime(m.timestamp)}</p></div></div>)}</div><div style={{ display: 'flex', gap: '8px' }}><input placeholder="Message..." value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyPress={e => e.key === 'Enter' && sendMsg()} style={{ ...styles.input, flex: 1, borderRadius: '24px' }} /><button onClick={sendMsg} style={{ ...styles.btn, borderRadius: '24px' }}>Send</button></div></div>}

        {/* Settings */}
        {view === 'settings' && <div><h1 style={{ color: theme.text, marginBottom: '24px', fontSize: isMobile ? '22px' : '28px' }}>Settings</h1><div style={styles.card}><h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>🏢 Company Settings</h3><div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}><div><label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Field 1 Label</label><input value={editingCompanySettings.field1Label} onChange={e => setEditingCompanySettings({ ...editingCompanySettings, field1Label: e.target.value })} style={styles.input} /></div><div><label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Field 2 Label</label><input value={editingCompanySettings.field2Label} onChange={e => setEditingCompanySettings({ ...editingCompanySettings, field2Label: e.target.value })} style={styles.input} /></div><div><label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Field 3 Label</label><input value={editingCompanySettings.field3Label} onChange={e => setEditingCompanySettings({ ...editingCompanySettings, field3Label: e.target.value })} style={styles.input} /></div><div><label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Manager Display Name</label><input value={editingCompanySettings.managerDisplayName} onChange={e => setEditingCompanySettings({ ...editingCompanySettings, managerDisplayName: e.target.value })} style={styles.input} /></div></div><div style={{ marginBottom: '16px' }}><label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Paid Rest Break Duration</label><select value={editingCompanySettings.paidRestMinutes || 10} onChange={e => setEditingCompanySettings({ ...editingCompanySettings, paidRestMinutes: parseInt(e.target.value) })} style={{ ...styles.input, maxWidth: isMobile ? '100%' : '300px' }}><option value={10}>10 minutes (NZ law minimum)</option><option value={15}>15 minutes</option><option value={20}>20 minutes</option><option value={25}>25 minutes</option><option value={30}>30 minutes</option></select></div><div style={{ marginBottom: '16px' }}><label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Pay Week End Day</label><select value={editingCompanySettings.payWeekEndDay} onChange={e => setEditingCompanySettings({ ...editingCompanySettings, payWeekEndDay: parseInt(e.target.value) })} style={{ ...styles.input, maxWidth: isMobile ? '100%' : '300px' }}>{weekDayNames.map((d, i) => <option key={i} value={i}>{d}</option>)}</select><p style={{ color: theme.textMuted, fontSize: '11px', marginTop: '4px' }}>Timesheets grouped by weeks ending on this day</p></div><button onClick={saveCompanySettings} disabled={savingCompanySettings} style={{ ...styles.btn, opacity: savingCompanySettings ? 0.7 : 1 }}>{savingCompanySettings ? 'Saving...' : 'Save Settings'}</button></div><div style={styles.card}><h3 style={{ color: theme.danger, marginBottom: '16px', fontSize: '16px' }}>⚠️ Delete Old Data</h3><div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}><div style={{ flex: '1', minWidth: '140px' }}><label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Start</label><input type="date" value={cleanupStart} onChange={e => setCleanupStart(e.target.value)} style={styles.input} /></div><div style={{ flex: '1', minWidth: '140px' }}><label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>End</label><input type="date" value={cleanupEnd} onChange={e => setCleanupEnd(e.target.value)} style={styles.input} /></div></div>{cleanupStart && cleanupEnd && <div style={{ background: theme.dangerBg, padding: '16px', borderRadius: '8px', marginBottom: '16px' }}><p style={{ color: theme.danger, marginBottom: '12px' }}>Will delete {allShifts.filter(s => { if (!s.clockIn?.toDate) return false; const d = s.clockIn.toDate(); const st = new Date(cleanupStart); const en = new Date(cleanupEnd); en.setHours(23,59,59); return d >= st && d <= en && s.status === 'completed'; }).length} shifts</p><label style={{ color: theme.danger, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}><input type="checkbox" checked={cleanupConfirm} onChange={e => setCleanupConfirm(e.target.checked)} />I understand this cannot be undone</label></div>}<button onClick={cleanup} disabled={!cleanupConfirm} style={{ ...styles.btnDanger, opacity: cleanupConfirm ? 1 : 0.5, cursor: cleanupConfirm ? 'pointer' : 'not-allowed' }}>Delete Data</button></div><div style={{ ...styles.card, marginTop: '24px' }}><h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Database Stats</h3><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}><div style={{ background: theme.cardAlt, padding: '16px', borderRadius: '8px', textAlign: 'center' }}><p style={{ color: theme.text, fontSize: '24px', fontWeight: '700' }}>{allShifts.length}</p><p style={{ color: theme.textMuted, fontSize: '13px' }}>Shifts</p></div><div style={{ background: theme.cardAlt, padding: '16px', borderRadius: '8px', textAlign: 'center' }}><p style={{ color: theme.text, fontSize: '24px', fontWeight: '700' }}>{employees.length}</p><p style={{ color: theme.textMuted, fontSize: '13px' }}>Employees</p></div><div style={{ background: theme.cardAlt, padding: '16px', borderRadius: '8px', textAlign: 'center' }}><p style={{ color: theme.text, fontSize: '24px', fontWeight: '700' }}>{messages.length}</p><p style={{ color: theme.textMuted, fontSize: '13px' }}>Messages</p></div></div></div></div>}
      </div>
    </div>
  );
}
