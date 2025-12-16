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
interface Shift { id: string; userId: string; userEmail: string; clockIn: Timestamp; clockOut?: Timestamp; clockInLocation?: Location; clockOutLocation?: Location; locationHistory: Location[]; breaks: Break[]; travelSegments?: TravelSegment[]; jobLog: JobLog; status: 'active' | 'completed'; manualEntry?: boolean; }
interface EmployeeSettings { gpsTracking: boolean; gpsInterval: number; requireNotes: boolean; chatEnabled: boolean; }
interface Employee { id: string; email: string; name: string; role: string; settings: EmployeeSettings; createdAt: Timestamp; }
interface ChatMessage { id: string; type: string; senderId: string; senderEmail: string; text: string; timestamp: Timestamp; participants?: string[]; }
interface CompanySettings { field1Label: string; field2Label: string; field3Label: string; managerDisplayName: string; paidRestMinutes: number; }

const defaultSettings: EmployeeSettings = { gpsTracking: true, gpsInterval: 10, requireNotes: false, chatEnabled: true };
const defaultCompanySettings: CompanySettings = { field1Label: 'Notes', field2Label: 'Materials', field3Label: 'Other', managerDisplayName: 'Manager', paidRestMinutes: 10 };

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

function getHours(start: Timestamp, end?: Timestamp): number {
  if (!start?.toDate) return 0;
  const e = end?.toDate ? end.toDate() : new Date();
  return (e.getTime() - start.toDate().getTime()) / 3600000;
}

// Helper to get job log field value (handles old 'notes' format and new field1/2/3 format)
function getJobLogField(jobLog: JobLog | undefined, field: 'field1' | 'field2' | 'field3'): string {
  if (!jobLog) return '';
  // For field1, also check legacy 'notes' field
  if (field === 'field1') {
    return jobLog.field1 || jobLog.notes || '';
  }
  return jobLog[field] || '';
}

// Enhanced Map Modal Component with multiple markers and interactivity
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
  theme: any,
  clockInLocation?: Location,
  clockOutLocation?: Location
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  
  if (!locations || locations.length === 0) return null;
  
  // Calculate bounds
  const lats = locations.map(l => l.latitude);
  const lngs = locations.map(l => l.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  
  // Calculate zoom level based on bounds
  const latDiff = maxLat - minLat;
  const lngDiff = maxLng - minLng;
  const maxDiff = Math.max(latDiff, lngDiff);
  let zoom = 15;
  if (maxDiff > 0.1) zoom = 12;
  else if (maxDiff > 0.05) zoom = 13;
  else if (maxDiff > 0.02) zoom = 14;
  else if (maxDiff > 0.01) zoom = 15;
  else zoom = 16;
  
  // Determine marker type for each location
  const getMarkerType = (loc: Location, index: number): 'clockIn' | 'clockOut' | 'tracking' => {
    if (clockInLocation && loc.latitude === clockInLocation.latitude && loc.longitude === clockInLocation.longitude) {
      return 'clockIn';
    }
    if (clockOutLocation && loc.latitude === clockOutLocation.latitude && loc.longitude === clockOutLocation.longitude) {
      return 'clockOut';
    }
    if (index === 0) return 'clockIn';
    if (index === locations.length - 1 && !clockOutLocation) return 'tracking';
    return 'tracking';
  };
  
  const markerColors = {
    clockIn: '#16a34a',    // Green
    clockOut: '#dc2626',   // Red
    tracking: '#2563eb'    // Blue
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }} onClick={onClose}>
      <div style={{ background: theme.card, borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '900px', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ color: theme.text, margin: 0, fontSize: '18px' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: theme.textMuted }}>×</button>
        </div>
        
        {/* Legend */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: markerColors.clockIn }}></span>
            <span style={{ color: theme.textMuted, fontSize: '12px' }}>Clock In</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: markerColors.clockOut }}></span>
            <span style={{ color: theme.textMuted, fontSize: '12px' }}>Clock Out</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: markerColors.tracking }}></span>
            <span style={{ color: theme.textMuted, fontSize: '12px' }}>Tracking Point</span>
          </div>
        </div>
        
        {/* Map Container with SVG overlay */}
        <div style={{ height: '350px', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px', position: 'relative' }}>
          {/* Base map from OpenStreetMap */}
          <iframe 
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${minLng - 0.003},${minLat - 0.003},${maxLng + 0.003},${maxLat + 0.003}&layer=mapnik`}
            style={{ width: '100%', height: '100%', border: 'none' }} 
            title="Location Map"
            onLoad={() => setMapLoaded(true)}
          />
          
          {/* SVG Overlay for markers - positioned over the map */}
          {mapLoaded && (
            <svg 
              style={{ 
                position: 'absolute', 
                top: 0, 
                left: 0, 
                width: '100%', 
                height: '100%', 
                pointerEvents: 'none' 
              }}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {/* Draw path line connecting points */}
              <polyline
                points={locations.map((loc, i) => {
                  const x = ((loc.longitude - (minLng - 0.003)) / ((maxLng + 0.003) - (minLng - 0.003))) * 100;
                  const y = (1 - (loc.latitude - (minLat - 0.003)) / ((maxLat + 0.003) - (minLat - 0.003))) * 100;
                  return `${x},${y}`;
                }).join(' ')}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="0.3"
                strokeOpacity="0.6"
                strokeDasharray="1,0.5"
              />
              
              {/* Draw markers */}
              {locations.map((loc, i) => {
                const x = ((loc.longitude - (minLng - 0.003)) / ((maxLng + 0.003) - (minLng - 0.003))) * 100;
                const y = (1 - (loc.latitude - (minLat - 0.003)) / ((maxLat + 0.003) - (minLat - 0.003))) * 100;
                const type = getMarkerType(loc, i);
                const isSelected = selectedIndex === i;
                const size = isSelected ? 2.5 : (type === 'tracking' ? 1.2 : 2);
                
                return (
                  <g key={i}>
                    <circle
                      cx={x}
                      cy={y}
                      r={size}
                      fill={markerColors[type]}
                      stroke="white"
                      strokeWidth="0.3"
                      opacity={isSelected ? 1 : 0.8}
                    />
                    {/* Number label for non-tracking points or selected */}
                    {(type !== 'tracking' || isSelected) && (
                      <text
                        x={x}
                        y={y + 0.4}
                        textAnchor="middle"
                        fill="white"
                        fontSize="1.5"
                        fontWeight="bold"
                      >
                        {i + 1}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>
        
        {/* Location History List */}
        <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
          <h4 style={{ color: theme.text, marginBottom: '8px' }}>Location History ({locations.length} points)</h4>
          <p style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '12px' }}>Click a row to highlight on map</p>
          {locations.map((loc, i) => {
            const type = getMarkerType(loc, i);
            const isSelected = selectedIndex === i;
            return (
              <div 
                key={i} 
                onClick={() => setSelectedIndex(isSelected ? null : i)}
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '10px 12px', 
                  background: isSelected ? (theme.primary + '20') : (i % 2 === 0 ? theme.cardAlt : 'transparent'), 
                  borderRadius: '6px', 
                  fontSize: '13px', 
                  cursor: 'pointer',
                  border: isSelected ? `2px solid ${theme.primary}` : '2px solid transparent',
                  marginBottom: '4px',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ 
                    width: '24px', 
                    height: '24px', 
                    borderRadius: '50%', 
                    background: markerColors[type], 
                    color: 'white', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    flexShrink: 0
                  }}>
                    {i + 1}
                  </span>
                  <div>
                    <span style={{ color: theme.text, fontWeight: type !== 'tracking' ? '600' : '400' }}>
                      {type === 'clockIn' ? '🟢 Clock In' : type === 'clockOut' ? '🔴 Clock Out' : `Point ${i + 1}`}
                    </span>
                    <div style={{ color: theme.textMuted, fontSize: '12px' }}>
                      {new Date(loc.timestamp).toLocaleString('en-NZ')}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ color: theme.text, fontFamily: 'monospace', fontSize: '12px' }}>
                    {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                  </span>
                  {loc.accuracy && (
                    <div style={{ color: theme.textMuted, fontSize: '11px' }}>±{Math.round(loc.accuracy)}m</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Location Map Component (simple preview)
function LocationMap({ locations, height = '200px' }: { locations: Location[], height?: string }) {
  if (!locations || locations.length === 0) {
    return <div style={{ height, background: '#f3f4f6', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>No location data</div>;
  }
  const lastLoc = locations[locations.length - 1];
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lastLoc.longitude - 0.01},${lastLoc.latitude - 0.01},${lastLoc.longitude + 0.01},${lastLoc.latitude + 0.01}&layer=mapnik&marker=${lastLoc.latitude},${lastLoc.longitude}`;
  return (
    <div style={{ height, borderRadius: '8px', overflow: 'hidden' }}>
      <iframe src={mapUrl} style={{ width: '100%', height: '100%', border: 'none' }} title="Location Map" />
    </div>
  );
}

// Theme definitions
const lightTheme = {
  bg: '#f8fafc', sidebar: '#ffffff', sidebarBorder: '#e2e8f0', card: '#ffffff', cardAlt: '#f1f5f9', cardBorder: '#e2e8f0',
  text: '#1e293b', textMuted: '#64748b', textLight: '#94a3b8', primary: '#2563eb', primaryHover: '#1d4ed8',
  success: '#16a34a', successBg: '#dcfce7', warning: '#f59e0b', warningBg: '#fef3c7', danger: '#dc2626', dangerBg: '#fee2e2',
  input: '#ffffff', inputBorder: '#d1d5db', travel: '#2563eb', travelBg: '#dbeafe',
};

const darkTheme = {
  bg: '#0f172a', sidebar: '#1e293b', sidebarBorder: '#334155', card: '#1e293b', cardAlt: '#0f172a', cardBorder: '#334155',
  text: '#f1f5f9', textMuted: '#94a3b8', textLight: '#64748b', primary: '#3b82f6', primaryHover: '#2563eb',
  success: '#22c55e', successBg: '#22c55e33', warning: '#f59e0b', warningBg: '#f59e0b33', danger: '#ef4444', dangerBg: '#ef444433',
  input: '#0f172a', inputBorder: '#334155', travel: '#3b82f6', travelBg: '#3b82f633',
};

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
  
  // Remove employee state
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [removeDeleteShifts, setRemoveDeleteShifts] = useState(false);
  
  // My Timesheet state
  const [myShift, setMyShift] = useState<Shift | null>(null);
  const [myShiftHistory, setMyShiftHistory] = useState<Shift[]>([]);
  const [onBreak, setOnBreak] = useState(false);
  const [breakStart, setBreakStart] = useState<Date | null>(null);
  const [myField1, setMyField1] = useState('');
  
  // Email sending state
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

  // Company settings state
  const [companySettings, setCompanySettings] = useState<CompanySettings>(defaultCompanySettings);
  const [editingCompanySettings, setEditingCompanySettings] = useState<CompanySettings>(defaultCompanySettings);
  const [savingCompanySettings, setSavingCompanySettings] = useState(false);

  const theme = dark ? darkTheme : lightTheme;

  // Helper function to get employee name by ID or email
  const getEmployeeName = (userId?: string, userEmail?: string): string => {
    if (userId) {
      const emp = employees.find(e => e.id === userId);
      if (emp?.name) return emp.name;
    }
    if (userEmail) {
      const emp = employees.find(e => e.email === userEmail);
      if (emp?.name) return emp.name;
    }
    return userEmail || 'Unknown';
  };

  // Check screen size
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => { return onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); }); }, []);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, 'employees'), (snap) => {
      setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee)));
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, 'invites'), (snap) => {
      setInvites(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(query(collection(db, 'shifts'), where('status', '==', 'active')), (snap) => {
      setActiveShifts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Shift)));
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(query(collection(db, 'shifts'), orderBy('clockIn', 'desc')), (snap) => {
      setAllShifts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Shift)));
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(query(collection(db, 'messages'), orderBy('timestamp', 'desc')), (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)).reverse());
    });
  }, [user]);

  // Company settings subscription
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, 'company', 'settings'), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as CompanySettings;
        setCompanySettings({ ...defaultCompanySettings, ...data });
        setEditingCompanySettings({ ...defaultCompanySettings, ...data });
      }
    });
  }, [user]);

  // My active shift (simplified - filter client-side)
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'shifts'), where('userId', '==', user.uid));
    return onSnapshot(q, (snap) => {
      const activeDoc = snap.docs.find(d => d.data().status === 'active');
      if (activeDoc) {
        const shift = { id: activeDoc.id, ...activeDoc.data() } as Shift;
        setMyShift(shift);
        setMyField1(getJobLogField(shift.jobLog, 'field1'));
        const activeBreak = shift.breaks?.find(b => !b.endTime && !b.manualEntry);
        if (activeBreak) { setOnBreak(true); setBreakStart(activeBreak.startTime.toDate()); }
        else { setOnBreak(false); setBreakStart(null); }
      } else { setMyShift(null); setOnBreak(false); setBreakStart(null); setMyField1(''); }
    });
  }, [user]);

  // My shift history (simplified - filter and sort client-side)
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'shifts'), where('userId', '==', user.uid));
    return onSnapshot(q, (snap) => {
      const shifts = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Shift))
        .filter(s => s.status === 'completed')
        .sort((a, b) => {
          const aTime = a.clockIn?.toDate?.()?.getTime() || 0;
          const bTime = b.clockIn?.toDate?.()?.getTime() || 0;
          return bTime - aTime;
        })
        .slice(0, 20);
      setMyShiftHistory(shifts);
    });
  }, [user]);

  const handleLogin = async (e: React.FormEvent) => { e.preventDefault(); setError(''); try { await signInWithEmailAndPassword(auth, email, password); } catch (err: any) { setError(err.message); } };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      // Add to employees collection as manager
      await setDoc(doc(db, 'employees', cred.user.uid), {
        email: email,
        name: signupName || email.split('@')[0],
        role: 'manager',
        settings: defaultSettings,
        createdAt: Timestamp.now()
      });
      // User is automatically signed in after createUserWithEmailAndPassword
      setSuccess('Account created!');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!email) {
      setError('Please enter your email address');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccess('Password reset email sent! Check your inbox.');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const inviteEmployee = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setSuccess('');
    // Check if invite already exists
    const existingInvite = invites.find(i => i.email.toLowerCase() === newEmpEmail.toLowerCase() && i.status === 'pending');
    if (existingInvite) {
      setError('Invite already sent to this email');
      return;
    }
    // Check if employee already exists
    const existingEmp = employees.find(emp => emp.email.toLowerCase() === newEmpEmail.toLowerCase());
    if (existingEmp) {
      setError('Employee with this email already exists');
      return;
    }
    try {
      await addDoc(collection(db, 'invites'), {
        email: newEmpEmail.toLowerCase(),
        name: newEmpName || newEmpEmail.split('@')[0],
        status: 'pending',
        createdAt: Timestamp.now(),
        createdBy: user?.uid
      });
      setSuccess(`Invite created for ${newEmpEmail}. Send email or copy link below.`);
      setNewEmpEmail(''); setNewEmpName('');
    } catch (err: any) { setError(err.message); }
  };

  const cancelInvite = async (inviteId: string) => {
    try {
      await updateDoc(doc(db, 'invites', inviteId), { status: 'cancelled' });
      setSuccess('Invite cancelled');
    } catch (err: any) { setError(err.message); }
  };

  // Send invite email via API
  const sendInviteEmail = async (invite: any) => {
    setSendingEmail(invite.id);
    setError('');
    try {
      const response = await fetch(`${API_URL}/api/send-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: invite.email,
          name: invite.name,
          inviteId: invite.id
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send email');
      }
      setSuccess(`Email sent to ${invite.email}!`);
      // Update invite to track that email was sent
      await updateDoc(doc(db, 'invites', invite.id), { 
        emailSent: true, 
        emailSentAt: Timestamp.now() 
      });
    } catch (err: any) {
      setError(`Failed to send email: ${err.message}`);
    } finally {
      setSendingEmail(null);
    }
  };

  // Copy invite link to clipboard
  const copyInviteLink = async (invite: any) => {
    const link = `${MOBILE_APP_URL}?invite=true&email=${encodeURIComponent(invite.email)}`;
    try {
      await navigator.clipboard.writeText(link);
      setSuccess('Link copied to clipboard!');
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = link;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setSuccess('Link copied to clipboard!');
    }
  };

  // Remove employee function
  const removeEmployee = async (empId: string) => {
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;
    
    // Prevent removing yourself
    if (empId === user?.uid) {
      setError("You can't remove yourself");
      setRemoveConfirm(null);
      return;
    }
    
    try {
      // Delete from Firebase Auth
      await fetch(`${API_URL}/api/delete-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: empId })
      });
      
      // Delete employee document
      await deleteDoc(doc(db, 'employees', empId));
      
      // Optionally delete their shifts
      if (removeDeleteShifts) {
        const batch = writeBatch(db);
        const empShifts = allShifts.filter(s => s.userId === empId);
        empShifts.forEach(s => batch.delete(doc(db, 'shifts', s.id)));
        if (empShifts.length > 0) await batch.commit();
      }
      
      setSuccess(`Removed ${emp.name || emp.email}`);
      setRemoveConfirm(null);
      setRemoveDeleteShifts(false);
    } catch (err: any) { 
      setError(err.message); 
      setRemoveConfirm(null);
    }
  };

  const updateSettings = async (empId: string, updates: Partial<EmployeeSettings>) => {
    const ref = doc(db, 'employees', empId);
    const snap = await getDoc(ref);
    const current = snap.data()?.settings || defaultSettings;
    await updateDoc(ref, { settings: { ...current, ...updates } });
    setSuccess('Updated!'); setTimeout(() => setSuccess(''), 2000);
  };

  // Save company settings
  const saveCompanySettings = async () => {
    setSavingCompanySettings(true);
    try {
      await setDoc(doc(db, 'company', 'settings'), editingCompanySettings);
      setSuccess('Company settings saved!');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingCompanySettings(false);
    }
  };

  const genReport = () => {
    if (!reportStart || !reportEnd) { setError('Select dates'); return; }
    const s = new Date(reportStart); s.setHours(0,0,0,0);
    const e = new Date(reportEnd); e.setHours(23,59,59,999);
    let data = allShifts.filter(sh => { if (!sh.clockIn?.toDate) return false; const d = sh.clockIn.toDate(); return d >= s && d <= e; });
    if (reportEmp !== 'all') data = data.filter(sh => sh.userId === reportEmp);
    setReportData(data);
  };

  const exportCSV = () => {
    if (!reportData.length) { setError('No data'); return; }
    const rows = [['Date','Employee','In','Out','Worked','Paid','Unpaid','Travel', companySettings.field1Label, companySettings.field2Label, companySettings.field3Label]];
    reportData.forEach(sh => { 
      const h = getHours(sh.clockIn, sh.clockOut); 
      const b = calcBreaks(sh.breaks || [], h, companySettings.paidRestMinutes); 
      const travel = calcTravel(sh.travelSegments || []); 
      const empName = getEmployeeName(sh.userId, sh.userEmail);
      const f1 = getJobLogField(sh.jobLog, 'field1');
      const f2 = getJobLogField(sh.jobLog, 'field2');
      const f3 = getJobLogField(sh.jobLog, 'field3');
      rows.push([
        fmtDateShort(sh.clockIn), 
        empName, 
        fmtTime(sh.clockIn), 
        sh.clockOut ? fmtTime(sh.clockOut) : 'Active', 
        fmtDur((h*60)-b.unpaid), 
        b.paid+'m', 
        b.unpaid+'m', 
        travel+'m', 
        `"${(f1).replace(/"/g,'""')}"`,
        `"${(f2).replace(/"/g,'""')}"`,
        `"${(f3).replace(/"/g,'""')}"`
      ]); 
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `timetrack-${reportStart}-${reportEnd}.csv`; a.click();
  };

  const exportPDF = () => {
    if (!reportData.length) { setError('No data'); return; }
    let total = 0, tPaid = 0, tUnpaid = 0, tTravel = 0;
    const rows = reportData.map(sh => { 
      const h = getHours(sh.clockIn, sh.clockOut); 
      const b = calcBreaks(sh.breaks || [], h, companySettings.paidRestMinutes); 
      const travel = calcTravel(sh.travelSegments || []); 
      const worked = (h*60) - b.unpaid; 
      const empName = getEmployeeName(sh.userId, sh.userEmail);
      const f1 = getJobLogField(sh.jobLog, 'field1');
      const f2 = getJobLogField(sh.jobLog, 'field2');
      const f3 = getJobLogField(sh.jobLog, 'field3');
      total += worked; 
      tPaid += b.paid; 
      tUnpaid += b.unpaid; 
      tTravel += travel;
      let jobLogRows = '';
      if (f1) jobLogRows += `<tr><td colspan="8" style="background:#f5f5f5;font-size:12px;padding:6px 8px;">📝 <strong>${companySettings.field1Label}:</strong> ${f1}</td></tr>`;
      if (f2) jobLogRows += `<tr><td colspan="8" style="background:#f5f5f5;font-size:12px;padding:6px 8px;">📦 <strong>${companySettings.field2Label}:</strong> ${f2}</td></tr>`;
      if (f3) jobLogRows += `<tr><td colspan="8" style="background:#f5f5f5;font-size:12px;padding:6px 8px;">📋 <strong>${companySettings.field3Label}:</strong> ${f3}</td></tr>`;
      return `<tr><td>${fmtDateShort(sh.clockIn)}</td><td>${empName}</td><td>${fmtTime(sh.clockIn)}</td><td>${sh.clockOut ? fmtTime(sh.clockOut) : 'Active'}</td><td>${fmtDur(worked)}</td><td>${b.paid}m</td><td>${b.unpaid}m</td><td>${travel}m</td></tr>${jobLogRows}`; 
    }).join('');
    const html = `<!DOCTYPE html><html><head><title>Report</title><style>body{font-family:Arial;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#1e40af;color:white}@media print{body{padding:0}}</style></head><body><h1>TimeTrack NZ Report</h1><p>${reportStart} to ${reportEnd}</p><table><tr><th>Date</th><th>Employee</th><th>In</th><th>Out</th><th>Worked</th><th>Paid</th><th>Unpaid</th><th>Travel</th></tr>${rows}</table><h3>Totals: ${fmtDur(total)} worked, ${tPaid}m paid breaks, ${tUnpaid}m unpaid, ${tTravel}m travel</h3></body></html>`;
    const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  const sendMsg = async () => { if (!newMsg.trim()) return; await addDoc(collection(db, 'messages'), { type: chatTab, senderId: 'employer', senderEmail: 'Employer', text: newMsg.trim(), timestamp: Timestamp.now(), participants: [] }); setNewMsg(''); };

  const cleanup = async () => {
    if (!cleanupStart || !cleanupEnd || !cleanupConfirm) { setError('Select dates and confirm'); return; }
    const s = new Date(cleanupStart); const e = new Date(cleanupEnd); e.setHours(23,59,59);
    const toDelete = allShifts.filter(sh => { if (!sh.clockIn?.toDate) return false; const d = sh.clockIn.toDate(); return d >= s && d <= e && sh.status === 'completed'; });
    const batch = writeBatch(db); toDelete.forEach(sh => batch.delete(doc(db, 'shifts', sh.id))); await batch.commit();
    setSuccess(`Deleted ${toDelete.length} shifts`); setCleanupConfirm(false); setCleanupStart(''); setCleanupEnd('');
  };

  // My Timesheet functions
  const myClockIn = async () => { if (!user) return; await addDoc(collection(db, 'shifts'), { userId: user.uid, userEmail: user.email, clockIn: Timestamp.now(), clockInLocation: null, locationHistory: [], breaks: [], travelSegments: [], jobLog: { field1: '', field2: '', field3: '' }, status: 'active' }); setSuccess('Clocked in!'); };
  
  const myClockOut = async () => {
    if (!myShift) return;
    let updatedBreaks = [...(myShift.breaks || [])];
    const activeBreakIndex = updatedBreaks.findIndex(b => !b.endTime && !b.manualEntry);
    if (activeBreakIndex !== -1 && breakStart) { const durationMinutes = Math.round((new Date().getTime() - breakStart.getTime()) / 60000); updatedBreaks[activeBreakIndex] = { ...updatedBreaks[activeBreakIndex], endTime: Timestamp.now(), durationMinutes }; }
    await updateDoc(doc(db, 'shifts', myShift.id), { clockOut: Timestamp.now(), breaks: updatedBreaks, 'jobLog.field1': myField1, status: 'completed' });
    setSuccess('Clocked out!');
  };
  
  const myStartBreak = async () => { if (!myShift) return; await updateDoc(doc(db, 'shifts', myShift.id), { breaks: [...(myShift.breaks || []), { startTime: Timestamp.now(), manualEntry: false }] }); setOnBreak(true); setBreakStart(new Date()); };
  
  const myEndBreak = async () => {
    if (!myShift || !breakStart) return;
    const durationMinutes = Math.round((new Date().getTime() - breakStart.getTime()) / 60000);
    const updatedBreaks = myShift.breaks.map((b, i) => { if (i === myShift.breaks.length - 1 && !b.endTime && !b.manualEntry) { return { ...b, endTime: Timestamp.now(), durationMinutes }; } return b; });
    await updateDoc(doc(db, 'shifts', myShift.id), { breaks: updatedBreaks }); setOnBreak(false); setBreakStart(null);
  };
  
  const myAddBreak = async (minutes: number) => { if (!myShift) return; const now = Timestamp.now(); await updateDoc(doc(db, 'shifts', myShift.id), { breaks: [...(myShift.breaks || []), { startTime: now, endTime: now, durationMinutes: minutes, manualEntry: true }] }); };
  
  const saveMyField1 = async () => { if (!myShift) return; await updateDoc(doc(db, 'shifts', myShift.id), { 'jobLog.field1': myField1 }); };

  const navigateTo = (v: string) => { setView(v); setSidebarOpen(false); };
  
  // Helper to check if shift has active travel
  const hasActiveTravel = (sh: Shift): boolean => {
    return (sh.travelSegments || []).some(t => !t.endTime);
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
        
        {/* Auth Mode Toggle */}
        {authMode !== 'reset' && (
          <div style={{ display: 'flex', marginBottom: '24px', background: theme.cardAlt, borderRadius: '8px', padding: '4px' }}>
            <button 
              onClick={() => { setAuthMode('signin'); setError(''); setSuccess(''); }} 
              style={{ 
                flex: 1, 
                padding: '10px', 
                borderRadius: '6px', 
                border: 'none', 
                cursor: 'pointer',
                fontWeight: '600',
                background: authMode === 'signin' ? theme.primary : 'transparent',
                color: authMode === 'signin' ? 'white' : theme.textMuted
              }}
            >
              Sign In
            </button>
            <button 
              onClick={() => { setAuthMode('signup'); setError(''); setSuccess(''); }} 
              style={{ 
                flex: 1, 
                padding: '10px', 
                borderRadius: '6px', 
                border: 'none', 
                cursor: 'pointer',
                fontWeight: '600',
                background: authMode === 'signup' ? theme.primary : 'transparent',
                color: authMode === 'signup' ? 'white' : theme.textMuted
              }}
            >
              Sign Up
            </button>
          </div>
        )}
        
        {authMode === 'reset' && (
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ color: theme.text, fontSize: '18px', marginBottom: '8px' }}>Reset Password</h2>
            <p style={{ color: theme.textMuted, fontSize: '14px' }}>Enter your email and we'll send you a reset link.</p>
          </div>
        )}
        
        {error && <p style={{ color: theme.danger, marginBottom: '16px', fontSize: '14px' }}>{error}</p>}
        {success && <p style={{ color: theme.success, marginBottom: '16px', fontSize: '14px' }}>{success}</p>}
        
        <form onSubmit={authMode === 'signin' ? handleLogin : authMode === 'signup' ? handleSignUp : handleResetPassword}>
          {authMode === 'signup' && (
            <input 
              placeholder="Your Name" 
              value={signupName} 
              onChange={e => setSignupName(e.target.value)} 
              style={{ ...styles.input, marginBottom: '12px' }} 
            />
          )}
          <input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} style={{ ...styles.input, marginBottom: '12px' }} />
          {authMode !== 'reset' && (
            <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ ...styles.input, marginBottom: '16px' }} />
          )}
          <button type="submit" style={{ ...styles.btn, width: '100%' }}>
            {authMode === 'signin' ? 'Sign In' : authMode === 'signup' ? 'Create Account' : 'Send Reset Email'}
          </button>
        </form>
        
        {authMode === 'signin' && (
          <button 
            onClick={() => { setAuthMode('reset'); setError(''); setSuccess(''); }} 
            style={{ 
              background: 'none', 
              border: 'none', 
              color: theme.primary, 
              cursor: 'pointer', 
              fontSize: '14px', 
              marginTop: '16px',
              display: 'block',
              width: '100%',
              textAlign: 'center'
            }}
          >
            Forgot password?
          </button>
        )}
        
        {authMode === 'reset' && (
          <button 
            onClick={() => { setAuthMode('signin'); setError(''); setSuccess(''); }} 
            style={{ 
              background: 'none', 
              border: 'none', 
              color: theme.primary, 
              cursor: 'pointer', 
              fontSize: '14px', 
              marginTop: '16px',
              display: 'block',
              width: '100%',
              textAlign: 'center'
            }}
          >
            ← Back to Sign In
          </button>
        )}
        
        {authMode === 'signup' && (
          <p style={{ color: theme.textMuted, fontSize: '12px', marginTop: '16px', textAlign: 'center' }}>
            By signing up, you create a manager account to invite and manage employees.
          </p>
        )}
      </div>
    </div>
  );

  const navItems = [
    { id: 'live', label: '🟢 Live View' },
    { id: 'mysheet', label: '⏱️ My Timesheet' },
    { id: 'employees', label: '👥 Employees' },
    { id: 'timesheets', label: '📋 Timesheets' },
    { id: 'reports', label: '📊 Reports' },
    { id: 'chat', label: '💬 Chat' },
    { id: 'settings', label: '⚙️ Settings' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: theme.bg }}>
      {/* Mobile Header */}
      {isMobile && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '56px', background: theme.sidebar, borderBottom: `1px solid ${theme.sidebarBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', zIndex: 100 }}>
          <button onClick={() => setSidebarOpen(true)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: theme.text }}>☰</button>
          <span style={{ fontWeight: '700', color: theme.text }}>TimeTrack NZ</span>
          <button onClick={() => setDark(!dark)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>{dark ? '☀️' : '🌙'}</button>
        </div>
      )}

      {/* Sidebar Overlay for Mobile */}
      {isMobile && sidebarOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }} onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div style={{ 
        position: 'fixed', 
        top: 0, 
        left: isMobile ? (sidebarOpen ? 0 : -280) : 0, 
        width: '260px', 
        height: '100vh', 
        background: theme.sidebar, 
        borderRight: `1px solid ${theme.sidebarBorder}`, 
        padding: '20px', 
        zIndex: 300,
        transition: 'left 0.3s',
        overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <h2 style={{ color: theme.text, fontSize: '18px', margin: 0 }}>TimeTrack NZ</h2>
          {isMobile && <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: theme.textMuted }}>×</button>}
        </div>
        
        {navItems.map(item => (
          <button key={item.id} onClick={() => navigateTo(item.id)} style={{ display: 'block', width: '100%', padding: '12px 16px', marginBottom: '4px', borderRadius: '8px', border: 'none', cursor: 'pointer', textAlign: 'left', fontWeight: '500', fontSize: '14px', background: view === item.id ? theme.primary : 'transparent', color: view === item.id ? 'white' : theme.textMuted }}>{item.label}</button>
        ))}
        
        <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: `1px solid ${theme.sidebarBorder}` }}>
          {!isMobile && <button onClick={() => setDark(!dark)} style={{ display: 'block', width: '100%', padding: '12px 16px', marginBottom: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer', textAlign: 'left', background: 'transparent', color: theme.textMuted }}>{dark ? '☀️ Light Mode' : '🌙 Dark Mode'}</button>}
          <button onClick={() => signOut(auth)} style={{ display: 'block', width: '100%', padding: '12px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', textAlign: 'left', background: 'transparent', color: theme.danger }}>🚪 Sign Out</button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ marginLeft: isMobile ? 0 : '260px', padding: isMobile ? '72px 16px 16px' : '24px 32px' }}>
        {error && <div style={{ background: theme.dangerBg, color: theme.danger, padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>{error}</span><button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.danger }}>×</button></div>}
        {success && <div style={{ background: theme.successBg, color: theme.success, padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>{success}</span><button onClick={() => setSuccess('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.success }}>×</button></div>}

        {/* Map Modal */}
        {mapModal && <MapModal locations={mapModal.locations} onClose={() => setMapModal(null)} title={mapModal.title} theme={theme} clockInLocation={mapModal.clockInLocation} clockOutLocation={mapModal.clockOutLocation} />}

        {/* Remove Employee Confirmation Modal */}
        {removeConfirm && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }} onClick={() => setRemoveConfirm(null)}>
            <div style={{ background: theme.card, borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ color: theme.text, marginBottom: '16px' }}>Remove Employee?</h3>
              <p style={{ color: theme.textMuted, marginBottom: '16px' }}>
                This will remove {employees.find(e => e.id === removeConfirm)?.name || employees.find(e => e.id === removeConfirm)?.email} from the system.
              </p>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: theme.text, marginBottom: '20px', cursor: 'pointer' }}>
                <input type="checkbox" checked={removeDeleteShifts} onChange={e => setRemoveDeleteShifts(e.target.checked)} />
                Also delete their {allShifts.filter(s => s.userId === removeConfirm).length} shifts
              </label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setRemoveConfirm(null)} style={{ ...styles.btn, flex: 1, background: theme.cardAlt, color: theme.text }}>Cancel</button>
                <button onClick={() => removeEmployee(removeConfirm)} style={{ ...styles.btnDanger, flex: 1 }}>Remove</button>
              </div>
            </div>
          </div>
        )}

        {/* Live View */}
        {view === 'live' && (
          <div>
            <h1 style={{ color: theme.text, marginBottom: '24px', fontSize: isMobile ? '22px' : '28px' }}>Live View</h1>
            {activeShifts.length === 0 ? (
              <div style={styles.card}><p style={{ color: theme.textMuted, textAlign: 'center' }}>No active shifts</p></div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(350px, 1fr))', gap: '16px' }}>
                {activeShifts.map(sh => {
                  const h = getHours(sh.clockIn, sh.clockOut);
                  const b = calcBreaks(sh.breaks || [], h, companySettings.paidRestMinutes);
                  const activeBreak = sh.breaks?.find(br => !br.endTime && !br.manualEntry);
                  const travel = calcTravel(sh.travelSegments || []);
                  const isTraveling = hasActiveTravel(sh);
                  const empName = getEmployeeName(sh.userId, sh.userEmail);
                  return (
                    <div key={sh.id} style={styles.card}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                        <div>
                          <p style={{ color: theme.text, fontWeight: '600', wordBreak: 'break-all' }}>{empName}</p>
                          <p style={{ color: theme.textMuted, fontSize: '13px' }}>In: {fmtTime(sh.clockIn)}</p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          <span style={{ background: theme.successBg, color: theme.success, padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>Active</span>
                          {activeBreak && <span style={{ background: theme.warningBg, color: theme.warning, padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>On Break</span>}
                          {isTraveling && <span style={{ background: theme.travelBg, color: theme.travel, padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>🚗 Traveling</span>}
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: travel > 0 ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
                        <div style={{ background: theme.cardAlt, padding: '10px', borderRadius: '8px', textAlign: 'center' }}><p style={{ color: theme.textMuted, fontSize: '11px' }}>Worked</p><p style={{ color: theme.text, fontWeight: '600' }}>{fmtDur(h*60)}</p></div>
                        <div style={{ background: theme.cardAlt, padding: '10px', borderRadius: '8px', textAlign: 'center' }}><p style={{ color: theme.success, fontSize: '11px' }}>Paid</p><p style={{ color: theme.success, fontWeight: '600' }}>{b.paid}m</p></div>
                        <div style={{ background: theme.cardAlt, padding: '10px', borderRadius: '8px', textAlign: 'center' }}><p style={{ color: theme.warning, fontSize: '11px' }}>Unpaid</p><p style={{ color: theme.warning, fontWeight: '600' }}>{b.unpaid}m</p></div>
                        {travel > 0 && <div style={{ background: theme.travelBg, padding: '10px', borderRadius: '8px', textAlign: 'center' }}><p style={{ color: theme.travel, fontSize: '11px' }}>🚗 Travel</p><p style={{ color: theme.travel, fontWeight: '600' }}>{travel}m</p></div>}
                      </div>
                      {sh.locationHistory?.length > 0 && (
                        <div>
                          <LocationMap locations={sh.locationHistory} height="150px" />
                          <button onClick={() => setMapModal({ locations: sh.locationHistory, title: empName, clockInLocation: sh.clockInLocation })} style={{ marginTop: '8px', padding: '8px', borderRadius: '6px', border: `1px solid ${theme.cardBorder}`, background: theme.cardAlt, color: theme.text, cursor: 'pointer', fontSize: '12px', width: '100%' }}>View Full Map ({sh.locationHistory.length} points)</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* My Timesheet */}
        {view === 'mysheet' && (
          <div>
            <h1 style={{ color: theme.text, marginBottom: '24px', fontSize: isMobile ? '22px' : '28px' }}>My Timesheet</h1>
            
            {/* Clock Card */}
            <div style={styles.card}>
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <span style={{ 
                  display: 'inline-block',
                  padding: '6px 16px', 
                  borderRadius: '20px', 
                  fontSize: '14px',
                  fontWeight: 'bold',
                  background: myShift ? (onBreak ? theme.warningBg : theme.successBg) : theme.cardAlt,
                  color: myShift ? (onBreak ? theme.warning : theme.success) : theme.textMuted
                }}>
                  {myShift ? (onBreak ? '☕ On Break' : '🟢 Clocked In') : '⚪ Clocked Out'}
                </span>
              </div>
              
              {myShift ? (
                <>
                  <p style={{ textAlign: 'center', color: theme.textMuted, marginBottom: '8px' }}>
                    Started: {fmtTime(myShift.clockIn)}
                  </p>
                  <p style={{ textAlign: 'center', color: theme.text, fontSize: '32px', fontWeight: '700', marginBottom: '20px' }}>
                    {fmtDur(getHours(myShift.clockIn) * 60)}
                  </p>
                  
                  {/* Break controls */}
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                    {!onBreak ? (
                      <button onClick={myStartBreak} style={{ ...styles.btn, flex: 1, background: theme.warning }}>☕ Start Break</button>
                    ) : (
                      <button onClick={myEndBreak} style={{ ...styles.btn, flex: 1, background: theme.success }}>✓ End Break</button>
                    )}
                    <button onClick={myClockOut} style={{ ...styles.btnDanger, flex: 1 }}>🔴 Clock Out</button>
                  </div>
                  
                  {/* Quick add breaks */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <span style={{ color: theme.textMuted, fontSize: '13px', width: '100%' }}>Quick add:</span>
                    {[10, 15, 20, 30].map(m => (
                      <button key={m} onClick={() => myAddBreak(m)} style={{ padding: '8px 12px', borderRadius: '6px', background: theme.cardAlt, color: theme.text, border: `1px solid ${theme.cardBorder}`, cursor: 'pointer', fontSize: '13px' }}>+{m}m</button>
                    ))}
                  </div>
                  
                  {/* Notes */}
                  <div>
                    <label style={{ color: theme.textMuted, fontSize: '13px', display: 'block', marginBottom: '6px' }}>{companySettings.field1Label}</label>
                    <textarea 
                      value={myField1} 
                      onChange={e => setMyField1(e.target.value)} 
                      onBlur={saveMyField1}
                      placeholder={`Enter ${companySettings.field1Label.toLowerCase()}...`}
                      style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }} 
                    />
                  </div>
                </>
              ) : (
                <button onClick={myClockIn} style={{ ...styles.btn, width: '100%', padding: '16px', fontSize: '16px' }}>🟢 Clock In</button>
              )}
            </div>
            
            {/* Recent Shifts */}
            {myShiftHistory.length > 0 && (
              <div>
                <h3 style={{ color: theme.text, marginBottom: '16px' }}>Recent Shifts</h3>
                {myShiftHistory.slice(0, 5).map(sh => {
                  const h = getHours(sh.clockIn, sh.clockOut);
                  const b = calcBreaks(sh.breaks || [], h, companySettings.paidRestMinutes);
                  return (
                    <div key={sh.id} style={{ ...styles.card, padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div>
                          <p style={{ color: theme.text, fontWeight: '600' }}>{fmtDate(sh.clockIn)}</p>
                          <p style={{ color: theme.textMuted, fontSize: '13px' }}>{fmtTime(sh.clockIn)} - {fmtTime(sh.clockOut)}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ color: theme.text, fontWeight: '600' }}>{fmtDur((h*60)-b.unpaid)}</p>
                          <p style={{ color: theme.textMuted, fontSize: '12px' }}>{b.paid}m paid, {b.unpaid}m unpaid</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Employees */}
        {view === 'employees' && (
          <div>
            <h1 style={{ color: theme.text, marginBottom: '24px', fontSize: isMobile ? '22px' : '28px' }}>Employees</h1>
            
            {/* Invite Form */}
            <div style={styles.card}>
              <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Invite New Employee</h3>
              <form onSubmit={inviteEmployee}>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <input placeholder="Email" type="email" value={newEmpEmail} onChange={e => setNewEmpEmail(e.target.value)} required style={{ ...styles.input, flex: '2', minWidth: '200px' }} />
                  <input placeholder="Name (optional)" value={newEmpName} onChange={e => setNewEmpName(e.target.value)} style={{ ...styles.input, flex: '1', minWidth: '150px' }} />
                  <button type="submit" style={styles.btn}>Create Invite</button>
                </div>
              </form>
            </div>
            
            {/* Pending Invites */}
            {invites.filter(i => i.status === 'pending').length > 0 && (
              <div style={styles.card}>
                <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Pending Invites</h3>
                {invites.filter(i => i.status === 'pending').map(inv => (
                  <div key={inv.id} style={{ background: theme.cardAlt, padding: '16px', borderRadius: '8px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                      <div>
                        <p style={{ color: theme.text, fontWeight: '600' }}>{inv.name || inv.email}</p>
                        <p style={{ color: theme.textMuted, fontSize: '13px', wordBreak: 'break-all' }}>{inv.email}</p>
                        {inv.emailSent && (
                          <p style={{ color: theme.success, fontSize: '12px', marginTop: '4px' }}>✓ Email sent</p>
                        )}
                      </div>
                      <button 
                        onClick={() => cancelInvite(inv.id)} 
                        style={{ padding: '6px 10px', borderRadius: '6px', border: `1px solid ${theme.danger}`, background: 'transparent', color: theme.danger, cursor: 'pointer', fontSize: '12px' }}
                      >
                        Cancel
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button 
                        onClick={() => sendInviteEmail(inv)} 
                        disabled={sendingEmail === inv.id}
                        style={{ 
                          padding: '10px 16px', 
                          borderRadius: '8px', 
                          border: 'none', 
                          background: theme.primary, 
                          color: 'white', 
                          cursor: sendingEmail === inv.id ? 'not-allowed' : 'pointer', 
                          fontSize: '13px',
                          fontWeight: '600',
                          opacity: sendingEmail === inv.id ? 0.7 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        {sendingEmail === inv.id ? '⏳ Sending...' : '📧 Send Email'}
                      </button>
                      <button 
                        onClick={() => copyInviteLink(inv)} 
                        style={{ 
                          padding: '10px 16px', 
                          borderRadius: '8px', 
                          border: `1px solid ${theme.cardBorder}`, 
                          background: theme.card, 
                          color: theme.text, 
                          cursor: 'pointer', 
                          fontSize: '13px',
                          fontWeight: '600',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        📋 Copy Link
                      </button>
                    </div>
                  </div>
                ))}
                <p style={{ color: theme.textMuted, fontSize: '12px', marginTop: '8px' }}>
                  Employees click the link to set up their account in the mobile app.
                </p>
              </div>
            )}
            
            {/* Employee List */}
            {employees.map(emp => (
              <div key={emp.id} style={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                  <div>
                    <p style={{ color: theme.text, fontWeight: '600', marginBottom: '4px' }}>{emp.name || emp.email}</p>
                    <p style={{ color: theme.textMuted, fontSize: '14px', wordBreak: 'break-all' }}>{emp.email}</p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {emp.role === 'manager' && (
                      <span style={{ background: theme.primary, color: 'white', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600' }}>Manager</span>
                    )}
                    {emp.id !== user?.uid && (
                      <button 
                        onClick={() => setRemoveConfirm(emp.id)} 
                        style={{ 
                          padding: '6px 10px', 
                          borderRadius: '6px', 
                          border: `1px solid ${theme.danger}`, 
                          background: 'transparent', 
                          color: theme.danger, 
                          cursor: 'pointer', 
                          fontSize: '11px',
                          fontWeight: '600'
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.cardAlt, padding: '12px', borderRadius: '8px' }}>
                    <span style={{ color: theme.textMuted, fontSize: '14px' }}>GPS Tracking</span>
                    <button onClick={() => updateSettings(emp.id, { gpsTracking: !emp.settings?.gpsTracking })} style={{ width: '50px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer', background: emp.settings?.gpsTracking ? theme.success : '#cbd5e1', position: 'relative' }}><span style={{ position: 'absolute', top: '3px', width: '20px', height: '20px', borderRadius: '50%', background: 'white', left: emp.settings?.gpsTracking ? '27px' : '3px', transition: 'left 0.2s' }} /></button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.cardAlt, padding: '12px', borderRadius: '8px' }}>
                    <span style={{ color: theme.textMuted, fontSize: '14px' }}>GPS Interval</span>
                    <select value={emp.settings?.gpsInterval || 10} onChange={e => updateSettings(emp.id, { gpsInterval: parseInt(e.target.value) })} style={{ padding: '6px', borderRadius: '6px', background: theme.input, color: theme.text, border: `1px solid ${theme.inputBorder}` }}><option value={5}>5 min</option><option value={10}>10 min</option><option value={15}>15 min</option></select>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.cardAlt, padding: '12px', borderRadius: '8px' }}>
                    <span style={{ color: theme.textMuted, fontSize: '14px' }}>Require Notes</span>
                    <button onClick={() => updateSettings(emp.id, { requireNotes: !emp.settings?.requireNotes })} style={{ width: '50px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer', background: emp.settings?.requireNotes ? theme.success : '#cbd5e1', position: 'relative' }}><span style={{ position: 'absolute', top: '3px', width: '20px', height: '20px', borderRadius: '50%', background: 'white', left: emp.settings?.requireNotes ? '27px' : '3px', transition: 'left 0.2s' }} /></button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: theme.cardAlt, padding: '12px', borderRadius: '8px' }}>
                    <span style={{ color: theme.textMuted, fontSize: '14px' }}>Chat Access</span>
                    <button onClick={() => updateSettings(emp.id, { chatEnabled: emp.settings?.chatEnabled === false })} style={{ width: '50px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer', background: emp.settings?.chatEnabled !== false ? theme.success : '#cbd5e1', position: 'relative' }}><span style={{ position: 'absolute', top: '3px', width: '20px', height: '20px', borderRadius: '50%', background: 'white', left: emp.settings?.chatEnabled !== false ? '27px' : '3px', transition: 'left 0.2s' }} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Timesheets */}
        {view === 'timesheets' && (
          <div>
            <h1 style={{ color: theme.text, marginBottom: '24px', fontSize: isMobile ? '22px' : '28px' }}>Timesheets</h1>
            {allShifts.slice(0, 50).map(sh => {
              const h = getHours(sh.clockIn, sh.clockOut); const b = calcBreaks(sh.breaks || [], h, companySettings.paidRestMinutes); const travel = calcTravel(sh.travelSegments || []); const worked = (h * 60) - b.unpaid; const isOpen = selectedShift === sh.id;
              const empName = getEmployeeName(sh.userId, sh.userEmail);
              const f1 = getJobLogField(sh.jobLog, 'field1');
              const f2 = getJobLogField(sh.jobLog, 'field2');
              const f3 = getJobLogField(sh.jobLog, 'field3');
              const hasJobLog = f1 || f2 || f3;
              return (
                <div key={sh.id} style={{ ...styles.card, cursor: 'pointer' }} onClick={() => setSelectedShift(isOpen ? null : sh.id)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div><p style={{ color: theme.text, fontWeight: '600', wordBreak: 'break-all' }}>{empName}</p><p style={{ color: theme.textMuted, fontSize: '14px' }}>{fmtDate(sh.clockIn)} • {fmtTime(sh.clockIn)} - {sh.clockOut ? fmtTime(sh.clockOut) : 'Active'}</p></div>
                    <div style={{ textAlign: 'right' }}><p style={{ color: theme.text, fontWeight: '700' }}>{fmtDur(worked)}</p><p style={{ color: theme.textMuted, fontSize: '12px' }}>worked</p></div>
                  </div>
                  {travel > 0 && <p style={{ color: theme.travel, fontSize: '13px', marginTop: '4px' }}>🚗 {travel}m travel</p>}
                  {isOpen && (
                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${theme.cardBorder}` }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'grid', gridTemplateColumns: travel > 0 ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: '12px', marginBottom: '12px' }}>
                        <div style={{ background: theme.cardAlt, padding: '12px', borderRadius: '8px' }}><p style={{ color: theme.textMuted, fontSize: '12px' }}>Total</p><p style={{ color: theme.text, fontWeight: '600' }}>{fmtDur(h*60)}</p></div>
                        <div style={{ background: theme.cardAlt, padding: '12px', borderRadius: '8px' }}><p style={{ color: theme.success, fontSize: '12px' }}>Paid</p><p style={{ color: theme.success, fontWeight: '600' }}>{b.paid}m</p></div>
                        <div style={{ background: theme.cardAlt, padding: '12px', borderRadius: '8px' }}><p style={{ color: theme.warning, fontSize: '12px' }}>Unpaid</p><p style={{ color: theme.warning, fontWeight: '600' }}>{b.unpaid}m</p></div>
                        {travel > 0 && <div style={{ background: theme.travelBg, padding: '12px', borderRadius: '8px' }}><p style={{ color: theme.travel, fontSize: '12px' }}>🚗 Travel</p><p style={{ color: theme.travel, fontWeight: '600' }}>{travel}m</p></div>}
                      </div>
                      
                      {/* Travel segments detail */}
                      {(sh.travelSegments || []).length > 0 && (
                        <div style={{ background: theme.cardAlt, padding: '12px', borderRadius: '8px', marginBottom: '12px' }}>
                          <p style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '8px' }}>🚗 Travel Segments</p>
                          {sh.travelSegments!.map((t, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0' }}>
                              <span style={{ color: theme.textMuted }}>{fmtTime(t.startTime)} → {t.endTime ? fmtTime(t.endTime) : 'ongoing'}</span>
                              <span style={{ color: theme.travel, fontWeight: '600' }}>{t.durationMinutes ? `${t.durationMinutes}m` : '...'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Job Log Fields - show all 3 */}
                      {hasJobLog && (
                        <div style={{ background: theme.cardAlt, padding: '12px', borderRadius: '8px', marginBottom: '12px' }}>
                          {f1 && (
                            <div style={{ marginBottom: f2 || f3 ? '12px' : 0 }}>
                              <p style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '4px' }}>📝 {companySettings.field1Label}</p>
                              <p style={{ color: theme.text, fontSize: '14px', whiteSpace: 'pre-wrap' }}>{f1}</p>
                            </div>
                          )}
                          {f2 && (
                            <div style={{ marginBottom: f3 ? '12px' : 0 }}>
                              <p style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '4px' }}>📦 {companySettings.field2Label}</p>
                              <p style={{ color: theme.text, fontSize: '14px', whiteSpace: 'pre-wrap' }}>{f2}</p>
                            </div>
                          )}
                          {f3 && (
                            <div>
                              <p style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '4px' }}>📋 {companySettings.field3Label}</p>
                              <p style={{ color: theme.text, fontSize: '14px', whiteSpace: 'pre-wrap' }}>{f3}</p>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {sh.locationHistory?.length > 0 && (
                        <div>
                          <LocationMap locations={sh.locationHistory} />
                          <button onClick={() => setMapModal({ locations: sh.locationHistory, title: `${empName} - ${fmtDateShort(sh.clockIn)}`, clockInLocation: sh.clockInLocation, clockOutLocation: sh.clockOutLocation })} style={{ marginTop: '8px', padding: '10px', borderRadius: '8px', border: `1px solid ${theme.cardBorder}`, background: theme.cardAlt, color: theme.text, cursor: 'pointer', fontSize: '13px' }}>View Full Map ({sh.locationHistory.length} points)</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Reports */}
        {view === 'reports' && (
          <div>
            <h1 style={{ color: theme.text, marginBottom: '24px', fontSize: isMobile ? '22px' : '28px' }}>Reports</h1>
            <div style={styles.card}>
              <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Generate Report</h3>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'end' }}>
                <div style={{ flex: '1', minWidth: '140px' }}><label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Start</label><input type="date" value={reportStart} onChange={e => setReportStart(e.target.value)} style={styles.input} /></div>
                <div style={{ flex: '1', minWidth: '140px' }}><label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>End</label><input type="date" value={reportEnd} onChange={e => setReportEnd(e.target.value)} style={styles.input} /></div>
                <div style={{ flex: '1', minWidth: '180px' }}><label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Employee</label><select value={reportEmp} onChange={e => setReportEmp(e.target.value)} style={styles.input}><option value="all">All</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name || e.email}</option>)}</select></div>
                <button onClick={genReport} style={styles.btn}>Generate</button>
              </div>
            </div>
            {reportData.length > 0 && (
              <div style={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                  <h3 style={{ color: theme.text, margin: 0 }}>{reportData.length} shifts</h3>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={exportCSV} style={{ ...styles.btn, background: theme.success }}>📄 CSV</button>
                    <button onClick={exportPDF} style={styles.btnDanger}>📑 PDF</button>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                    <thead><tr style={{ borderBottom: `2px solid ${theme.cardBorder}` }}><th style={{ padding: '12px 8px', textAlign: 'left', color: theme.textMuted, fontSize: '13px' }}>Date</th><th style={{ padding: '12px 8px', textAlign: 'left', color: theme.textMuted, fontSize: '13px' }}>Employee</th><th style={{ padding: '12px 8px', textAlign: 'left', color: theme.textMuted, fontSize: '13px' }}>In</th><th style={{ padding: '12px 8px', textAlign: 'left', color: theme.textMuted, fontSize: '13px' }}>Out</th><th style={{ padding: '12px 8px', textAlign: 'left', color: theme.textMuted, fontSize: '13px' }}>Worked</th><th style={{ padding: '12px 8px', textAlign: 'left', color: theme.success, fontSize: '13px' }}>Paid</th><th style={{ padding: '12px 8px', textAlign: 'left', color: theme.warning, fontSize: '13px' }}>Unpaid</th><th style={{ padding: '12px 8px', textAlign: 'left', color: theme.travel, fontSize: '13px' }}>🚗 Travel</th></tr></thead>
                    <tbody>{reportData.map(sh => { const h = getHours(sh.clockIn, sh.clockOut); const b = calcBreaks(sh.breaks||[], h, companySettings.paidRestMinutes); const travel = calcTravel(sh.travelSegments || []); const empName = getEmployeeName(sh.userId, sh.userEmail); return <tr key={sh.id} style={{ borderBottom: `1px solid ${theme.cardBorder}` }}><td style={{ padding: '12px 8px', color: theme.text, fontSize: '13px' }}>{fmtDateShort(sh.clockIn)}</td><td style={{ padding: '12px 8px', color: theme.text, fontSize: '13px' }}>{empName}</td><td style={{ padding: '12px 8px', color: theme.textMuted, fontSize: '13px' }}>{fmtTime(sh.clockIn)}</td><td style={{ padding: '12px 8px', color: theme.textMuted, fontSize: '13px' }}>{sh.clockOut ? fmtTime(sh.clockOut) : '-'}</td><td style={{ padding: '12px 8px', color: theme.text, fontWeight: '600', fontSize: '13px' }}>{fmtDur((h*60)-b.unpaid)}</td><td style={{ padding: '12px 8px', color: theme.success, fontSize: '13px' }}>{b.paid}m</td><td style={{ padding: '12px 8px', color: theme.warning, fontSize: '13px' }}>{b.unpaid}m</td><td style={{ padding: '12px 8px', color: theme.travel, fontSize: '13px' }}>{travel}m</td></tr>; })}</tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Chat */}
        {view === 'chat' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: isMobile ? 'calc(100vh - 120px)' : 'calc(100vh - 80px)' }}>
            <h1 style={{ color: theme.text, marginBottom: '16px', fontSize: isMobile ? '22px' : '28px' }}>Chat</h1>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <button onClick={() => setChatTab('team')} style={{ ...styles.btn, flex: 1, background: chatTab === 'team' ? theme.primary : theme.cardAlt, color: chatTab === 'team' ? 'white' : theme.text }}>Team Chat</button>
              <button onClick={() => setChatTab('dm')} style={{ ...styles.btn, flex: 1, background: chatTab === 'dm' ? theme.primary : theme.cardAlt, color: chatTab === 'dm' ? 'white' : theme.text }}>Direct Messages</button>
            </div>
            <div style={{ flex: 1, background: theme.card, borderRadius: '12px', padding: '16px', overflowY: 'auto', marginBottom: '16px', border: `1px solid ${theme.cardBorder}` }}>
              {messages.filter(m => m.type === chatTab || (chatTab === 'dm' && m.type === 'dm')).length === 0 ? (
                <p style={{ color: theme.textMuted, textAlign: 'center', marginTop: '40px' }}>No messages yet</p>
              ) : messages.filter(m => m.type === chatTab || (chatTab === 'dm' && m.type === 'dm')).map(m => {
                const senderName = m.senderId === 'employer' ? companySettings.managerDisplayName : getEmployeeName(m.senderId, m.senderEmail);
                return (
                  <div key={m.id} style={{ display: 'flex', justifyContent: m.senderId === 'employer' ? 'flex-end' : 'flex-start', marginBottom: '12px' }}>
                    <div style={{ maxWidth: '75%', padding: '10px 14px', borderRadius: '12px', background: m.senderId === 'employer' ? theme.primary : theme.cardAlt }}>
                      {m.senderId !== 'employer' && <p style={{ color: theme.textMuted, fontSize: '11px', marginBottom: '4px' }}>{senderName}</p>}
                      <p style={{ color: m.senderId === 'employer' ? 'white' : theme.text, fontSize: '14px' }}>{m.text}</p>
                      <p style={{ color: m.senderId === 'employer' ? 'rgba(255,255,255,0.6)' : theme.textLight, fontSize: '10px', marginTop: '4px' }}>{fmtTime(m.timestamp)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input placeholder="Message..." value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyPress={e => e.key === 'Enter' && sendMsg()} style={{ ...styles.input, flex: 1, borderRadius: '24px' }} />
              <button onClick={sendMsg} style={{ ...styles.btn, borderRadius: '24px' }}>Send</button>
            </div>
          </div>
        )}

        {/* Settings */}
        {view === 'settings' && (
          <div>
            <h1 style={{ color: theme.text, marginBottom: '24px', fontSize: isMobile ? '22px' : '28px' }}>Settings</h1>
            
            {/* Company Settings - NEW */}
            <div style={styles.card}>
              <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>🏢 Company Settings</h3>
              <p style={{ color: theme.textMuted, marginBottom: '16px', fontSize: '14px' }}>Customize field labels and break policies for your employees.</p>
              
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Field 1 Label (default: Notes)</label>
                  <input 
                    value={editingCompanySettings.field1Label} 
                    onChange={e => setEditingCompanySettings({ ...editingCompanySettings, field1Label: e.target.value })} 
                    placeholder="Notes"
                    style={styles.input} 
                  />
                </div>
                <div>
                  <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Field 2 Label (default: Materials)</label>
                  <input 
                    value={editingCompanySettings.field2Label} 
                    onChange={e => setEditingCompanySettings({ ...editingCompanySettings, field2Label: e.target.value })} 
                    placeholder="Materials"
                    style={styles.input} 
                  />
                </div>
                <div>
                  <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Field 3 Label (default: Other)</label>
                  <input 
                    value={editingCompanySettings.field3Label} 
                    onChange={e => setEditingCompanySettings({ ...editingCompanySettings, field3Label: e.target.value })} 
                    placeholder="Other"
                    style={styles.input} 
                  />
                </div>
                <div>
                  <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Manager Display Name</label>
                  <input 
                    value={editingCompanySettings.managerDisplayName} 
                    onChange={e => setEditingCompanySettings({ ...editingCompanySettings, managerDisplayName: e.target.value })} 
                    placeholder="Manager"
                    style={styles.input} 
                  />
                </div>
              </div>

              {/* Paid Rest Break Duration */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Paid Rest Break Duration</label>
                <select 
                  value={editingCompanySettings.paidRestMinutes || 10} 
                  onChange={e => setEditingCompanySettings({ ...editingCompanySettings, paidRestMinutes: parseInt(e.target.value) })} 
                  style={{ ...styles.input, cursor: 'pointer', maxWidth: isMobile ? '100%' : '300px' }}
                >
                  <option value={10}>10 minutes (NZ law minimum)</option>
                  <option value={15}>15 minutes</option>
                  <option value={20}>20 minutes</option>
                  <option value={25}>25 minutes</option>
                  <option value={30}>30 minutes</option>
                </select>
                <p style={{ color: theme.textMuted, fontSize: '11px', marginTop: '4px' }}>
                  Sets duration per paid rest break. NZ law requires minimum 10 minutes. Employees see "Enhanced" if above 10.
                </p>
              </div>
              
              <button 
                onClick={saveCompanySettings} 
                disabled={savingCompanySettings}
                style={{ ...styles.btn, opacity: savingCompanySettings ? 0.7 : 1 }}
              >
                {savingCompanySettings ? 'Saving...' : 'Save Company Settings'}
              </button>
            </div>
            
            {/* Delete Old Data */}
            <div style={styles.card}>
              <h3 style={{ color: theme.danger, marginBottom: '16px', fontSize: '16px' }}>⚠️ Delete Old Data</h3>
              <p style={{ color: theme.textMuted, marginBottom: '16px', fontSize: '14px' }}>Permanently delete completed shifts. Cannot be undone.</p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <div style={{ flex: '1', minWidth: '140px' }}><label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Start</label><input type="date" value={cleanupStart} onChange={e => setCleanupStart(e.target.value)} style={styles.input} /></div>
                <div style={{ flex: '1', minWidth: '140px' }}><label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>End</label><input type="date" value={cleanupEnd} onChange={e => setCleanupEnd(e.target.value)} style={styles.input} /></div>
              </div>
              {cleanupStart && cleanupEnd && (
                <div style={{ background: theme.dangerBg, padding: '16px', borderRadius: '8px', marginBottom: '16px', border: `1px solid ${theme.danger}` }}>
                  <p style={{ color: theme.danger, marginBottom: '12px' }}>Will delete {allShifts.filter(s => { if (!s.clockIn?.toDate) return false; const d = s.clockIn.toDate(); const st = new Date(cleanupStart); const en = new Date(cleanupEnd); en.setHours(23,59,59); return d >= st && d <= en && s.status === 'completed'; }).length} shifts</p>
                  <label style={{ color: theme.danger, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}><input type="checkbox" checked={cleanupConfirm} onChange={e => setCleanupConfirm(e.target.checked)} /> I understand this cannot be undone</label>
                </div>
              )}
              <button onClick={cleanup} disabled={!cleanupConfirm} style={{ ...styles.btnDanger, opacity: cleanupConfirm ? 1 : 0.5, cursor: cleanupConfirm ? 'pointer' : 'not-allowed' }}>Delete Data</button>
            </div>
            <div style={{ ...styles.card, marginTop: '24px' }}>
              <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Database Stats</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <div style={{ background: theme.cardAlt, padding: '16px', borderRadius: '8px', textAlign: 'center' }}><p style={{ color: theme.text, fontSize: '24px', fontWeight: '700' }}>{allShifts.length}</p><p style={{ color: theme.textMuted, fontSize: '13px' }}>Shifts</p></div>
                <div style={{ background: theme.cardAlt, padding: '16px', borderRadius: '8px', textAlign: 'center' }}><p style={{ color: theme.text, fontSize: '24px', fontWeight: '700' }}>{employees.length}</p><p style={{ color: theme.textMuted, fontSize: '13px' }}>Employees</p></div>
                <div style={{ background: theme.cardAlt, padding: '16px', borderRadius: '8px', textAlign: 'center' }}><p style={{ color: theme.text, fontSize: '24px', fontWeight: '700' }}>{messages.length}</p><p style={{ color: theme.textMuted, fontSize: '13px' }}>Messages</p></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}