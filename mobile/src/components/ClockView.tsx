// TimeTrack NZ - Clock View Component

import { useState, useRef, useCallback } from 'react';
import { Theme, createStyles } from '../theme';
import { Shift, Location, EmployeeSettings } from '../types';
import { fmtDur, fmtTime, getHours, calcBreaks, calcTravel, getBreakEntitlements } from '../utils';
import { BreakRulesInfo } from './BreakRulesInfo';

interface ClockViewProps {
  theme: Theme;
  currentShift: Shift | null;
  currentLocation: Location | null;
  onBreak: boolean;
  currentBreakStart: Date | null;
  traveling: boolean;
  currentTravelStart: Date | null;
  settings: EmployeeSettings;
  paidRestMinutes: number;
  photoVerification: boolean;
  autoTravelEnabled?: boolean;
  autoTravelActive?: boolean;
  onClockIn: (photoBase64?: string) => void;
  onClockOut: () => void;
  onStartBreak: () => void;
  onEndBreak: () => void;
  onStartTravel: () => void;
  onEndTravel: () => void;
  onAddPresetBreak: (minutes: number) => Promise<boolean>;
  onDeleteBreak: (index: number) => Promise<boolean>;
  onAddManualShift: (
    date: string,
    startHour: string,
    startMinute: string,
    startAmPm: 'AM' | 'PM',
    endHour: string,
    endMinute: string,
    endAmPm: 'AM' | 'PM',
    breaks: number[],
    travel: number[],
    notes: string
  ) => Promise<boolean>;
  showToast: (message: string) => void;
  // Job log fields
  field1: string;
  field2: string;
  field3: string;
  setField1: (v: string) => void;
  setField2: (v: string) => void;
  setField3: (v: string) => void;
  onSaveFields: () => void;
  labels: {
    field1Label: string;
    field2Label: string;
    field3Label: string;
    paidRestMinutes: number;
    payWeekEndDay: number;
  };
}

export function ClockView({
  theme,
  currentShift,
  currentLocation,
  onBreak,
  currentBreakStart,
  traveling,
  currentTravelStart,
  settings,
  paidRestMinutes,
  photoVerification,
  onClockIn,
  onClockOut,
  onStartBreak,
  onEndBreak,
  onStartTravel,
  onEndTravel,
  onAddPresetBreak,
  onDeleteBreak,
  onAddManualShift,
  showToast,
  field1,
  field2,
  field3,
  setField1,
  setField2,
  setField3,
  onSaveFields,
  labels
}: ClockViewProps) {
  const styles = createStyles(theme);
  
  const [showBreakRules, setShowBreakRules] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualMinutes, setManualMinutes] = useState('');
  
  // Camera state
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Manual shift entry state
  const [showAddShift, setShowAddShift] = useState(false);
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [manualStartHour, setManualStartHour] = useState('7');
  const [manualStartMinute, setManualStartMinute] = useState('00');
  const [manualStartAmPm, setManualStartAmPm] = useState<'AM' | 'PM'>('AM');
  const [manualEndHour, setManualEndHour] = useState('5');
  const [manualEndMinute, setManualEndMinute] = useState('00');
  const [manualEndAmPm, setManualEndAmPm] = useState<'AM' | 'PM'>('PM');
  const [manualBreaks, setManualBreaks] = useState<number[]>([]);
  const [manualCustomBreak, setManualCustomBreak] = useState('');
  const [showManualCustomBreak, setShowManualCustomBreak] = useState(false);
  const [manualTravel, setManualTravel] = useState<number[]>([]);
  const [manualCustomTravel, setManualCustomTravel] = useState('');
  const [showManualCustomTravel, setShowManualCustomTravel] = useState(false);
  const [manualNotes, setManualNotes] = useState('');
  const [addingShift, setAddingShift] = useState(false);

  // Calculations
  const shiftHours = currentShift ? getHours(currentShift.clockIn) : 0;
  const breakAllocation = currentShift ? calcBreaks(currentShift.breaks || [], shiftHours, paidRestMinutes) : null;
  const entitlements = getBreakEntitlements(shiftHours, paidRestMinutes);
  const totalBreakMinutes = currentShift?.breaks?.reduce((s, b) => s + (b.durationMinutes || 0), 0) || 0;

  // Start camera
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCapturedPhoto(null);
    setCameraReady(false);
    setShowCamera(true);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraReady(true);
        };
      }
    } catch (err: any) {
      console.error('Camera error:', err);
      setCameraError(err.name === 'NotAllowedError' 
        ? 'Camera access denied. Please allow camera permission and try again.'
        : 'Could not access camera. Please check your device settings.');
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
    setCapturedPhoto(null);
    setCameraReady(false);
    setCameraError(null);
  }, []);

  // Capture photo
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !cameraReady) return;
    
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    
    // Set canvas size (smaller for compression)
    const maxSize = 480;
    const scale = Math.min(maxSize / video.videoWidth, maxSize / video.videoHeight);
    canvas.width = video.videoWidth * scale;
    canvas.height = video.videoHeight * scale;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Mirror the image (front camera is mirrored)
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convert to base64 JPEG with compression
    const photoData = canvas.toDataURL('image/jpeg', 0.7);
    setCapturedPhoto(photoData);
    
    // Stop video stream after capture
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, [cameraReady]);

  // Retake photo
  const retakePhoto = useCallback(() => {
    setCapturedPhoto(null);
    startCamera();
  }, [startCamera]);

  // Confirm and clock in with photo
  const confirmClockIn = useCallback(() => {
    onClockIn(capturedPhoto || undefined);
    stopCamera();
  }, [capturedPhoto, onClockIn, stopCamera]);

  // Skip photo and clock in without
  const skipPhoto = useCallback(() => {
    onClockIn();
    stopCamera();
  }, [onClockIn, stopCamera]);

  const handleAddPresetBreak = async (minutes: number) => {
    const success = await onAddPresetBreak(minutes);
    if (success) {
      showToast(`${minutes}m break added ✓`);
    }
  };

  const handleAddManualBreak = async () => {
    const minutes = parseInt(manualMinutes);
    if (isNaN(minutes) || minutes <= 0) return;
    const success = await onAddPresetBreak(minutes);
    if (success) {
      showToast(`${minutes}m break added ✓`);
      setManualMinutes('');
      setShowManualEntry(false);
    }
  };

  const handleDeleteBreak = async (index: number) => {
    const success = await onDeleteBreak(index);
    if (success) {
      showToast('Break removed');
    }
  };

  const handleAddManualShift = async () => {
    setAddingShift(true);
    const success = await onAddManualShift(
      manualDate,
      manualStartHour,
      manualStartMinute,
      manualStartAmPm,
      manualEndHour,
      manualEndMinute,
      manualEndAmPm,
      manualBreaks,
      manualTravel,
      manualNotes
    );
    
    if (success) {
      showToast('Shift added ✓');
      setShowAddShift(false);
      setManualBreaks([]);
      setManualTravel([]);
      setManualNotes('');
    }
    setAddingShift(false);
  };

  // Camera Modal
  if (showCamera) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: '#000',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ color: 'white', fontSize: '18px', fontWeight: '600', margin: 0 }}>
            📸 Clock-In Photo
          </h2>
          <button
            onClick={stopCamera}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              fontSize: '16px',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        </div>

        {/* Camera View / Captured Photo */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative'
        }}>
          {cameraError ? (
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <p style={{ color: '#ef4444', fontSize: '16px', marginBottom: '16px' }}>{cameraError}</p>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>Photo is required to clock in. Please allow camera access and try again.</p>
            </div>
          ) : capturedPhoto ? (
            <img
              src={capturedPhoto}
              alt="Captured"
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                borderRadius: '12px'
              }}
            />
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  transform: 'scaleX(-1)' // Mirror for selfie view
                }}
              />
              {!cameraReady && (
                <div style={{
                  position: 'absolute',
                  color: 'white',
                  fontSize: '16px'
                }}>
                  Starting camera...
                </div>
              )}
            </>
          )}
        </div>

        {/* Controls */}
        <div style={{
          padding: '20px',
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          justifyContent: 'center',
          gap: '16px'
        }}>
          {!capturedPhoto && !cameraError && (
            <button
              onClick={capturePhoto}
              disabled={!cameraReady}
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: cameraReady ? 'white' : 'rgba(255,255,255,0.3)',
                border: '4px solid rgba(255,255,255,0.5)',
                cursor: cameraReady ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: cameraReady ? theme.success : 'rgba(255,255,255,0.5)'
              }} />
            </button>
          )}
          
          {capturedPhoto && (
            <>
              <button
                onClick={retakePhoto}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  color: 'white',
                  padding: '16px 24px',
                  borderRadius: '12px',
                  border: 'none',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                🔄 Retake
              </button>
              <button
                onClick={confirmClockIn}
                style={{
                  background: theme.success,
                  color: 'white',
                  padding: '16px 32px',
                  borderRadius: '12px',
                  border: 'none',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                ✓ Clock In
              </button>
            </>
          )}
        </div>

        
      </div>
    );
  }

  return (
    <div style={{ padding: '16px' }}>
      {/* Clock In/Out Card */}
      <div style={styles.card}>
        {!currentShift ? (
          <>
            <h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>
              Ready to start?
            </h2>
            <button onClick={photoVerification ? startCamera : () => onClockIn()} style={{ ...styles.btn, width: '100%', padding: '20px', fontSize: '18px', background: theme.success }}>
              {photoVerification ? '📸 Clock In' : '⏱️ Clock In'}
            </button>
            <button
              onClick={() => setShowAddShift(!showAddShift)}
              style={{ width: '100%', marginTop: '12px', padding: '14px', borderRadius: '12px', background: 'transparent', border: `1px dashed ${theme.cardBorder}`, color: theme.textMuted, cursor: 'pointer', fontSize: '14px' }}
            >
              {showAddShift ? '✕ Cancel' : '+ Add Past Shift Manually'}
            </button>
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <p style={{ color: theme.textMuted, fontSize: '14px', marginBottom: '4px' }}>Clocked in at</p>
              <p style={{ color: theme.text, fontSize: '28px', fontWeight: '700' }}>{fmtTime(currentShift.clockIn)}</p>
              <p style={{ color: theme.success, fontSize: '16px', fontWeight: '600', marginTop: '8px' }}>
                {fmtDur(shiftHours * 60)} worked
              </p>
              {currentShift.clockInPhotoUrl && (
                <div style={{ marginTop: '12px' }}>
                  <img 
                    src={currentShift.clockInPhotoUrl} 
                    alt="Clock in" 
                    style={{ 
                      width: '60px', 
                      height: '60px', 
                      borderRadius: '50%', 
                      objectFit: 'cover',
                      border: `3px solid ${theme.success}`
                    }} 
                  />
                </div>
              )}
            </div>

            {/* Break/Travel buttons */}
            {!onBreak && !traveling && (
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <button onClick={onStartBreak} style={{ ...styles.btn, flex: 1, background: '#f59e0b', border: '2px solid #f59e0b' }}>
                  ☕ Start Break
                </button>
                <button onClick={onStartTravel} style={{ ...styles.btn, flex: 1, background: '#2563eb' }}>
                  🚗 Start Travel
                </button>
              </div>
            )}

            {onBreak && currentBreakStart && (
              <div style={{ background: theme.warningBg, borderRadius: '12px', padding: '16px', marginBottom: '16px', textAlign: 'center' }}>
                <p style={{ color: theme.warningText, fontWeight: '600', marginBottom: '4px' }}>☕ On Break</p>
                <p style={{ color: theme.warning, fontSize: '24px', fontWeight: '700' }}>
                  {fmtDur(Math.round((Date.now() - currentBreakStart.getTime()) / 60000))}
                </p>
                <button onClick={onEndBreak} style={{ ...styles.btn, marginTop: '12px', background: theme.warning }}>
                  End Break
                </button>
              </div>
            )}

            {traveling && currentTravelStart && (
              <div style={{ background: '#dbeafe', borderRadius: '12px', padding: '16px', marginBottom: '16px', textAlign: 'center' }}>
                <p style={{ color: '#1d4ed8', fontWeight: '600', marginBottom: '4px' }}>🚗 Traveling</p>
                <p style={{ color: '#2563eb', fontSize: '24px', fontWeight: '700' }}>
                  {fmtDur(Math.round((Date.now() - currentTravelStart.getTime()) / 60000))}
                </p>
                <button onClick={onEndTravel} style={{ ...styles.btn, marginTop: '12px', background: '#2563eb' }}>
                  End Travel
                </button>
              </div>
            )}

            <button onClick={onClockOut} style={{ ...styles.btnDanger, width: '100%', padding: '20px', fontSize: '18px' }}>
              Clock Out
            </button>
          </>
        )}
      </div>

      {/* Manual Shift Entry Form */}
      {!currentShift && showAddShift && (
        <div style={styles.card}>
          <h3 style={{ color: theme.text, fontWeight: '600', marginBottom: '16px' }}>Add Past Shift</h3>
          
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: theme.textMuted, fontSize: '13px', marginBottom: '6px' }}>Date</label>
            <input
              type="date"
              value={manualDate}
              onChange={(e) => setManualDate(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: theme.textMuted, fontSize: '13px', marginBottom: '6px' }}>Start Time</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select value={manualStartHour} onChange={(e) => setManualStartHour(e.target.value)} style={{ ...styles.select, flex: 1 }}>
                {[12,1,2,3,4,5,6,7,8,9,10,11].map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              <select value={manualStartMinute} onChange={(e) => setManualStartMinute(e.target.value)} style={{ ...styles.select, flex: 1 }}>
                {['00','15','30','45'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={manualStartAmPm} onChange={(e) => setManualStartAmPm(e.target.value as 'AM'|'PM')} style={{ ...styles.select, flex: 1 }}>
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: theme.textMuted, fontSize: '13px', marginBottom: '6px' }}>End Time</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select value={manualEndHour} onChange={(e) => setManualEndHour(e.target.value)} style={{ ...styles.select, flex: 1 }}>
                {[12,1,2,3,4,5,6,7,8,9,10,11].map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              <select value={manualEndMinute} onChange={(e) => setManualEndMinute(e.target.value)} style={{ ...styles.select, flex: 1 }}>
                {['00','15','30','45'].map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={manualEndAmPm} onChange={(e) => setManualEndAmPm(e.target.value as 'AM'|'PM')} style={{ ...styles.select, flex: 1 }}>
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </div>
          </div>

          {/* Breaks */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: theme.textMuted, fontSize: '13px', marginBottom: '6px' }}>Breaks</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
              {[10,15,20,30].map(mins => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setManualBreaks([...manualBreaks, mins])}
                  style={{ padding: '12px', borderRadius: '10px', background: theme.cardAlt, color: theme.text, border: `1px solid ${theme.cardBorder}`, cursor: 'pointer', fontWeight: '600' }}
                >
                  +{mins}m
                </button>
              ))}
            </div>
            
            {!showManualCustomBreak ? (
              <button
                type="button"
                onClick={() => setShowManualCustomBreak(true)}
                style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'transparent', color: theme.textMuted, border: `1px dashed ${theme.cardBorder}`, cursor: 'pointer' }}
              >
                + Custom minutes
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="number"
                  placeholder="Minutes"
                  value={manualCustomBreak}
                  onChange={(e) => setManualCustomBreak(e.target.value)}
                  style={{ ...styles.input, flex: 1 }}
                  min="1"
                  max="120"
                />
                <button
                  type="button"
                  onClick={() => {
                    const mins = parseInt(manualCustomBreak);
                    if (!isNaN(mins) && mins > 0) {
                      setManualBreaks([...manualBreaks, mins]);
                      setManualCustomBreak('');
                      setShowManualCustomBreak(false);
                    }
                  }}
                  style={{ ...styles.btn, padding: '12px 20px' }}
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setShowManualCustomBreak(false); setManualCustomBreak(''); }}
                  style={{ padding: '12px', borderRadius: '10px', background: theme.cardAlt, color: theme.textMuted, border: 'none', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
            )}

            {manualBreaks.length > 0 && (
              <div style={{ marginTop: '12px', background: theme.cardAlt, borderRadius: '10px', padding: '12px' }}>
                {manualBreaks.map((mins, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < manualBreaks.length - 1 ? `1px solid ${theme.cardBorder}` : 'none' }}>
                    <span style={{ color: theme.text, fontSize: '14px' }}>Break {i + 1}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ color: theme.text, fontWeight: '600' }}>{mins}m</span>
                      <button
                        type="button"
                        onClick={() => setManualBreaks(manualBreaks.filter((_, idx) => idx !== i))}
                        style={{ background: 'none', border: 'none', color: theme.danger, cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                <div style={{ borderTop: `1px solid ${theme.cardBorder}`, paddingTop: '8px', marginTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: theme.textMuted, fontSize: '13px' }}>Total break time:</span>
                  <span style={{ color: theme.text, fontWeight: '600', fontSize: '13px' }}>{manualBreaks.reduce((a, b) => a + b, 0)}m</span>
                </div>
              </div>
            )}
          </div>

          {/* Travel */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: theme.textMuted, fontSize: '13px', marginBottom: '6px' }}>Travel</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
              {[10,15,20,30].map(mins => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setManualTravel([...manualTravel, mins])}
                  style={{ padding: '12px', borderRadius: '10px', background: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe', cursor: 'pointer', fontWeight: '600' }}
                >
                  +{mins}m
                </button>
              ))}
            </div>

            {!showManualCustomTravel ? (
              <button
                type="button"
                onClick={() => setShowManualCustomTravel(true)}
                style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'transparent', color: theme.textMuted, border: `1px dashed ${theme.cardBorder}`, cursor: 'pointer' }}
              >
                + Custom travel minutes
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="number"
                  placeholder="Minutes"
                  value={manualCustomTravel}
                  onChange={(e) => setManualCustomTravel(e.target.value)}
                  style={{ ...styles.input, flex: 1 }}
                  min="1"
                  max="180"
                />
                <button
                  type="button"
                  onClick={() => {
                    const mins = parseInt(manualCustomTravel);
                    if (!isNaN(mins) && mins > 0) {
                      setManualTravel([...manualTravel, mins]);
                      setManualCustomTravel('');
                      setShowManualCustomTravel(false);
                    }
                  }}
                  style={{ ...styles.btn, padding: '12px 20px', background: '#2563eb' }}
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setShowManualCustomTravel(false); setManualCustomTravel(''); }}
                  style={{ padding: '12px', borderRadius: '10px', background: theme.cardAlt, color: theme.textMuted, border: 'none', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
            )}

            {manualTravel.length > 0 && (
              <div style={{ marginTop: '12px', background: '#dbeafe', borderRadius: '10px', padding: '12px' }}>
                {manualTravel.map((mins, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < manualTravel.length - 1 ? '1px solid #bfdbfe' : 'none' }}>
                    <span style={{ color: '#1d4ed8', fontSize: '14px' }}>🚗 Travel {i + 1}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ color: '#1d4ed8', fontWeight: '600' }}>{mins}m</span>
                      <button
                        type="button"
                        onClick={() => setManualTravel(manualTravel.filter((_, idx) => idx !== i))}
                        style={{ background: 'none', border: 'none', color: theme.danger, cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid #bfdbfe', paddingTop: '8px', marginTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#1d4ed8', fontSize: '13px' }}>Total travel time:</span>
                  <span style={{ color: '#1d4ed8', fontWeight: '600', fontSize: '13px' }}>{manualTravel.reduce((a, b) => a + b, 0)}m</span>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: theme.textMuted, fontSize: '13px', marginBottom: '6px' }}>Notes (optional)</label>
            <textarea
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              placeholder="What did you work on?"
              rows={2}
              style={{ ...styles.input, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {/* Preview */}
          <div style={{ background: theme.cardAlt, borderRadius: '10px', padding: '12px', marginBottom: '16px' }}>
            <p style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '4px' }}>Preview:</p>
            <p style={{ color: theme.text, fontSize: '14px', fontWeight: '600' }}>
              {manualStartHour}:{manualStartMinute} {manualStartAmPm} → {manualEndHour}:{manualEndMinute} {manualEndAmPm}
            </p>
            {(manualBreaks.length > 0 || manualTravel.length > 0) && (
              <p style={{ color: theme.textMuted, fontSize: '13px', marginTop: '4px' }}>
                {manualBreaks.length > 0 && <span style={{ color: theme.warning }}>{manualBreaks.reduce((a, b) => a + b, 0)}m breaks</span>}
                {manualBreaks.length > 0 && manualTravel.length > 0 && ' · '}
                {manualTravel.length > 0 && <span style={{ color: '#2563eb' }}>{manualTravel.reduce((a, b) => a + b, 0)}m travel</span>}
              </p>
            )}
          </div>

          <button
            onClick={handleAddManualShift}
            disabled={addingShift}
            style={{ ...styles.btn, width: '100%', background: theme.success, opacity: addingShift ? 0.7 : 1 }}
          >
            {addingShift ? 'Adding...' : 'Add Shift'}
          </button>
        </div>
      )}

      {/* Add Break */}
      {currentShift && !onBreak && !traveling && (
        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ color: theme.text, fontWeight: '600', margin: 0 }}>Add Break</h3>
            {totalBreakMinutes > 0 && (
              <span style={{ background: theme.warningBg, color: theme.warningText, padding: '4px 10px', borderRadius: '12px', fontSize: '13px', fontWeight: '600' }}>
                Total: {fmtDur(totalBreakMinutes)}
              </span>
            )}
          </div>
          <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '12px' }}>Forgot to start timer? Add break time:</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
            {[10, 15, 20, 30].map(mins => (
              <button
                key={mins}
                onClick={() => handleAddPresetBreak(mins)}
                style={{ padding: '12px', borderRadius: '10px', background: theme.cardAlt, color: theme.text, border: `1px solid ${theme.cardBorder}`, cursor: 'pointer', fontWeight: '600' }}
              >
                {mins}m
              </button>
            ))}
          </div>
          
          {!showManualEntry ? (
            <button
              onClick={() => setShowManualEntry(true)}
              style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'transparent', color: theme.textMuted, border: `1px dashed ${theme.cardBorder}`, cursor: 'pointer' }}
            >
              + Custom minutes
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="number"
                placeholder="Minutes"
                value={manualMinutes}
                onChange={(e) => setManualMinutes(e.target.value)}
                style={{ ...styles.input, flex: 1 }}
                min="1"
                max="120"
              />
              <button onClick={handleAddManualBreak} style={{ ...styles.btn, padding: '12px 20px' }}>Add</button>
              <button
                onClick={() => { setShowManualEntry(false); setManualMinutes(''); }}
                style={{ padding: '12px', borderRadius: '10px', background: theme.cardAlt, color: theme.textMuted, border: 'none', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      {/* Break & Travel Summary */}
      {currentShift && breakAllocation && (
        <div style={styles.card}>
          <h3 style={{ color: theme.text, fontWeight: '600', marginBottom: '12px' }}>Break & Travel Summary</h3>
          
          <div style={{ background: theme.cardAlt, borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
            <p style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '4px' }}>
              Your entitlement for {fmtDur(shiftHours * 60)} shift:
            </p>
            <p style={{ color: theme.text, fontSize: '14px' }}>
              {entitlements.paidBreaks}× paid rest ({entitlements.paidMinutes}m) + {entitlements.unpaidBreaks}× unpaid meal ({entitlements.unpaidMinutes}m)
            </p>
            {paidRestMinutes > 10 && (
              <p style={{ color: theme.success, fontSize: '12px', marginTop: '4px' }}>
                ✨ Enhanced: {paidRestMinutes}min paid rest breaks
              </p>
            )}
          </div>

          {(currentShift.breaks || []).length === 0 && (currentShift.travelSegments || []).length === 0 && (
            <p style={{ color: theme.textLight, fontSize: '14px', marginBottom: '12px' }}>No breaks or travel recorded yet</p>
          )}

          {((currentShift.breaks || []).length > 0 || (currentShift.travelSegments || []).length > 0) && (
            <>
              {/* Breaks list */}
              {(currentShift.breaks || []).length > 0 && (
                <>
                  <p style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '8px', fontWeight: '600' }}>BREAKS</p>
                  {currentShift.breaks.map((b, i) => (
                    <div key={`break-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${theme.cardBorder}` }}>
                      <span style={{ color: theme.textMuted, fontSize: '14px' }}>
                        {b.manualEntry ? `Break ${i + 1}: (added)` : `Break ${i + 1}: ${fmtTime(b.startTime)} - ${b.endTime ? fmtTime(b.endTime) : 'ongoing'}`}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ color: theme.text, fontWeight: '600' }}>{b.durationMinutes ? `${b.durationMinutes}m` : '...'}</span>
                        {b.durationMinutes && (
                          <button
                            onClick={() => handleDeleteBreak(i)}
                            style={{ background: 'none', border: 'none', color: theme.danger, cursor: 'pointer', fontSize: '16px', padding: '0 4px', opacity: 0.7 }}
                            title="Remove break"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Travel list */}
              {(currentShift.travelSegments || []).length > 0 && (
                <>
                  <p style={{ color: theme.textMuted, fontSize: '12px', marginTop: '16px', marginBottom: '8px', fontWeight: '600' }}>TRAVEL</p>
                  {currentShift.travelSegments!.map((t, i) => (
                    <div key={`travel-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${theme.cardBorder}` }}>
                      <span style={{ color: theme.textMuted, fontSize: '14px' }}>
                        🚗 Travel {i + 1}: {fmtTime(t.startTime)} - {t.endTime ? fmtTime(t.endTime) : 'ongoing'}
                      </span>
                      <span style={{ color: '#2563eb', fontWeight: '600' }}>{t.durationMinutes ? `${t.durationMinutes}m` : '...'}</span>
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
                {calcTravel(currentShift.travelSegments || []) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                    <span style={{ color: '#2563eb' }}>Travel time:</span>
                    <span style={{ color: '#2563eb', fontWeight: '600' }}>{calcTravel(currentShift.travelSegments || [])}m</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Job Log Fields */}
      {currentShift && (
        <>
          {/* Field 1 (Notes) */}
          {settings.field1Enabled !== false && (
            <div style={styles.card}>
              <label style={{ color: theme.textMuted, fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                {labels.field1Label || 'Notes'}
              </label>
              <textarea
                value={field1}
                onChange={e => setField1(e.target.value)}
                onBlur={onSaveFields}
                placeholder={`Enter ${labels.field1Label || 'notes'}...`}
                style={{ 
                  ...styles.input, 
                  minHeight: '80px', 
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
              />
            </div>
          )}

          {/* Field 2 */}
          {settings.field2Enabled === true && (
            <div style={styles.card}>
              <label style={{ color: theme.textMuted, fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                {labels.field2Label || 'Field 2'}
              </label>
              <textarea
                value={field2}
                onChange={e => setField2(e.target.value)}
                onBlur={onSaveFields}
                placeholder={`Enter ${labels.field2Label || 'field 2'}...`}
                style={{ 
                  ...styles.input, 
                  minHeight: '80px', 
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
              />
            </div>
          )}

          {/* Field 3 */}
          {settings.field3Enabled === true && (
            <div style={styles.card}>
              <label style={{ color: theme.textMuted, fontSize: '13px', display: 'block', marginBottom: '6px' }}>
                {labels.field3Label || 'Field 3'}
              </label>
              <textarea
                value={field3}
                onChange={e => setField3(e.target.value)}
                onBlur={onSaveFields}
                placeholder={`Enter ${labels.field3Label || 'field 3'}...`}
                style={{ 
                  ...styles.input, 
                  minHeight: '80px', 
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
              />
            </div>
          )}
        </>
      )}

      {/* Break Rules Info */}
      <BreakRulesInfo 
        isOpen={showBreakRules} 
        onToggle={() => setShowBreakRules(!showBreakRules)} 
        theme={theme} 
        paidRestMinutes={paidRestMinutes}
      />

      {/* Current Location */}
      {currentLocation && (
        <div style={{ ...styles.card, marginTop: '16px' }}>
          <h3 style={{ color: theme.text, fontWeight: '600', marginBottom: '8px' }}>Current Location</h3>
          <p style={{ color: theme.textMuted, fontSize: '14px' }}>
            {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)}
          </p>
          <p style={{ color: theme.textLight, fontSize: '12px' }}>
            Accuracy: ±{Math.round(currentLocation.accuracy)}m
          </p>
        </div>
      )}
    </div>
  );
}