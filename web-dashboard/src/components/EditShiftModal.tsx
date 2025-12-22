import { useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { updateDoc, doc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../shared/firebase';
import { Shift, Break, TravelSegment, Theme, CompanySettings } from '../shared/types';
import { getTimeComponents, roundTime } from '../shared/utils';

interface EditShiftModalProps {
  shift: Shift;
  onClose: () => void;
  onSave: () => void;
  theme: Theme;
  user: User;
  companySettings: CompanySettings;
}

export function EditShiftModal({ shift, onClose, onSave, theme, user, companySettings }: EditShiftModalProps) {
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
      
      if (newClockOut <= newClockIn) {
        newClockOut.setDate(newClockOut.getDate() + 1);
      }
      
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