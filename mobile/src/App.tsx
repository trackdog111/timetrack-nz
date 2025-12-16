import { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  User 
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  Timestamp,
  arrayUnion
} from 'firebase/firestore';

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBcyz4DyzExGFRmjQ41W3SvQ3xgvYszzUE",
  authDomain: "timetrack-nz.firebaseapp.com",
  projectId: "timetrack-nz",
  storageBucket: "timetrack-nz.firebasestorage.app",
  messagingSenderId: "600938431502",
  appId: "1:600938431502:web:b661556289a2634c8d285f"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Types
interface Location {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

interface Break {
  startTime: Timestamp;
  endTime?: Timestamp;
  durationMinutes?: number;
  manualEntry?: boolean;
}

interface TravelSegment {
  startTime: Timestamp;
  endTime?: Timestamp;
  durationMinutes?: number;
  startLocation?: Location;
  endLocation?: Location;
}

interface JobLog {
  notes: string;
}

interface Shift {
  id: string;
  userId: string;
  clockIn: Timestamp;
  clockOut?: Timestamp;
  clockInLocation?: Location;
  clockOutLocation?: Location;
  locationHistory: Location[];
  breaks: Break[];
  travelSegments?: TravelSegment[];
  jobLog: JobLog;
  status: 'active' | 'completed';
  manualEntry?: boolean;
}

interface EmployeeSettings {
  gpsTracking: boolean;
  gpsInterval: number;
  requireNotes: boolean;
  chatEnabled: boolean;
}

interface ChatMessage {
  id: string;
  type: 'team' | 'dm';
  senderId: string;
  senderEmail: string;
  text: string;
  timestamp: Timestamp;
  participants?: string[];
}

interface Invite {
  id: string;
  email: string;
  name: string;
  status: 'pending' | 'accepted' | 'cancelled';
  createdAt: Timestamp;
}

// Theme definitions
const lightTheme = {
  bg: '#f8fafc',
  card: '#ffffff',
  cardAlt: '#f1f5f9',
  cardBorder: '#e2e8f0',
  text: '#1e293b',
  textMuted: '#64748b',
  textLight: '#94a3b8',
  primary: '#2563eb',
  primaryHover: '#1d4ed8',
  success: '#16a34a',
  successBg: '#dcfce7',
  successText: '#15803d',
  warning: '#f59e0b',
  warningBg: '#fef3c7',
  warningText: '#b45309',
  danger: '#dc2626',
  dangerBg: '#fee2e2',
  input: '#ffffff',
  inputBorder: '#d1d5db',
  nav: '#ffffff',
  navBorder: '#e2e8f0',
};

const darkTheme = {
  bg: '#0f172a',
  card: '#1e293b',
  cardAlt: '#334155',
  cardBorder: '#334155',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  textLight: '#64748b',
  primary: '#3b82f6',
  primaryHover: '#2563eb',
  success: '#22c55e',
  successBg: '#22c55e22',
  successText: '#4ade80',
  warning: '#f59e0b',
  warningBg: '#f59e0b22',
  warningText: '#fbbf24',
  danger: '#ef4444',
  dangerBg: '#ef444422',
  input: '#1e293b',
  inputBorder: '#334155',
  nav: '#1e293b',
  navBorder: '#334155',
};

const defaultSettings: EmployeeSettings = {
  gpsTracking: true,
  gpsInterval: 10,
  requireNotes: false,
  chatEnabled: true
};

function getBreakEntitlements(hoursWorked: number) {
  let paid = 0, unpaid = 0;
  if (hoursWorked >= 14) { paid = 5; unpaid = 2; }
  else if (hoursWorked >= 12) { paid = 4; unpaid = 2; }
  else if (hoursWorked >= 10) { paid = 3; unpaid = 1; }
  else if (hoursWorked >= 6) { paid = 2; unpaid = 1; }
  else if (hoursWorked >= 4) { paid = 1; unpaid = 1; }
  else if (hoursWorked >= 2) { paid = 1; unpaid = 0; }
  return { paidMinutes: paid * 10, unpaidMinutes: unpaid * 30 };
}

function calcBreaks(breaks: Break[], hours: number) {
  const total = breaks.reduce((s, b) => s + (b.durationMinutes || 0), 0);
  const ent = getBreakEntitlements(hours);
  const paid = Math.min(total, ent.paidMinutes);
  return { paid, unpaid: Math.max(0, total - paid), total };
}

function calcTravel(travelSegments: TravelSegment[]): number {
  return travelSegments.reduce((s, t) => s + (t.durationMinutes || 0), 0);
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
  return t.toDate().toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' });
}

function getHours(start: Timestamp, end?: Timestamp): number {
  if (!start?.toDate) return 0;
  const e = end?.toDate ? end.toDate() : new Date();
  return (e.getTime() - start.toDate().getTime()) / 3600000;
}

function BreakRulesInfo({ isOpen, onToggle, theme }: { isOpen: boolean; onToggle: () => void; theme: typeof lightTheme }) {
  return (
    <div style={{ background: theme.card, borderRadius: '16px', overflow: 'hidden', border: `1px solid ${theme.cardBorder}` }}>
      <button onClick={onToggle} style={{ width: '100%', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>ℹ️</span>
          <span style={{ color: theme.text, fontWeight: '600' }}>NZ Break Rules</span>
        </div>
        <span style={{ color: theme.textMuted, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
      </button>
      {isOpen && (
        <div style={{ padding: '0 16px 16px' }}>
          <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '12px' }}>Under the Employment Relations Act 2000, you're entitled to rest and meal breaks based on your shift length:</p>
          <div style={{ background: theme.cardAlt, borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: theme.card }}><th style={{ padding: '10px', textAlign: 'left', color: theme.textMuted, fontWeight: '500' }}>Hours</th><th style={{ padding: '10px', textAlign: 'left', color: theme.success, fontWeight: '500' }}>Paid Rest</th><th style={{ padding: '10px', textAlign: 'left', color: theme.warning, fontWeight: '500' }}>Unpaid Meal</th></tr></thead>
              <tbody>
                {[['2-4h', '1 × 10min', '—'],['4-6h', '1 × 10min', '1 × 30min'],['6-10h', '2 × 10min', '1 × 30min'],['10-12h', '3 × 10min', '1 × 30min'],['12-14h', '4 × 10min', '2 × 30min'],['14h+', '5 × 10min', '2 × 30min']].map(([hours, paid, unpaid], i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${theme.cardBorder}` }}><td style={{ padding: '10px', color: theme.text }}>{hours}</td><td style={{ padding: '10px', color: theme.success }}>{paid}</td><td style={{ padding: '10px', color: theme.textLight }}>{unpaid}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '12px', fontSize: '12px', color: theme.textMuted }}>
            <p style={{ marginBottom: '4px' }}><span style={{ color: theme.success }}>● Paid rest breaks</span> — you stay on the clock</p>
            <p style={{ marginBottom: '8px' }}><span style={{ color: theme.warning }}>● Unpaid meal breaks</span> — deducted from worked hours</p>
            <p style={{ paddingTop: '8px', borderTop: `1px solid ${theme.cardBorder}` }}>This app auto-calculates: your first breaks count as paid (up to your entitlement), any extra break time is unpaid.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dark, setDark] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'invite'>('signin');
  const [inviteStep, setInviteStep] = useState<'email' | 'password'>('email');
  const [foundInvite, setFoundInvite] = useState<Invite | null>(null);
  const [checkingInvite, setCheckingInvite] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [shiftHistory, setShiftHistory] = useState<Shift[]>([]);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [onBreak, setOnBreak] = useState(false);
  const [currentBreakStart, setCurrentBreakStart] = useState<Date | null>(null);
  const [traveling, setTraveling] = useState(false);
  const [currentTravelStart, setCurrentTravelStart] = useState<Date | null>(null);
  const [view, setView] = useState<'clock' | 'joblog' | 'chat' | 'history'>('clock');
  const [manualMinutes, setManualMinutes] = useState<string>('');
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showBreakRules, setShowBreakRules] = useState(false);
  const [settings, setSettings] = useState<EmployeeSettings>(defaultSettings);
  const [jobNotes, setJobNotes] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatTab, setChatTab] = useState<'team' | 'employer'>('team');
  
  // Toast notification state
  const [toast, setToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [sendingReset, setSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  
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
  
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [addTravelStartHour, setAddTravelStartHour] = useState('9');
  const [addTravelStartMinute, setAddTravelStartMinute] = useState('00');
  const [addTravelStartAmPm, setAddTravelStartAmPm] = useState<'AM' | 'PM'>('AM');
  const [addTravelEndHour, setAddTravelEndHour] = useState('9');
  const [addTravelEndMinute, setAddTravelEndMinute] = useState('30');
  const [addTravelEndAmPm, setAddTravelEndAmPm] = useState<'AM' | 'PM'>('AM');
  const [addingTravelToShift, setAddingTravelToShift] = useState(false);
  const [addingShift, setAddingShift] = useState(false);
  
  const gpsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const theme = dark ? darkTheme : lightTheme;

  // Show toast notification
  const showToast = (message: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(message);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 2000);
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const isInvite = urlParams.get('invite');
    const inviteEmail = urlParams.get('email');
    if (isInvite === 'true' && inviteEmail) {
      setEmail(decodeURIComponent(inviteEmail));
      setAuthMode('invite');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => { setUser(user); setLoading(false); });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const loadSettings = async () => {
      try {
        const docRef = doc(db, 'employees', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().settings) {
          setSettings({ ...defaultSettings, ...docSnap.data().settings });
        } else {
          await setDoc(docRef, { email: user.email, name: user.email?.split('@')[0] || 'Employee', role: 'employee', settings: defaultSettings, createdAt: Timestamp.now() }, { merge: true });
        }
      } catch (err) { console.error('Error loading settings:', err); }
    };
    loadSettings();
  }, [user]);

  const getCurrentLocation = (): Promise<Location | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc: Location = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: Date.now() };
          setCurrentLocation(loc);
          resolve(loc);
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  useEffect(() => { getCurrentLocation(); }, []);

  useEffect(() => {
    if (!user || !currentShift || !settings.gpsTracking) {
      if (gpsIntervalRef.current) { clearInterval(gpsIntervalRef.current); gpsIntervalRef.current = null; }
      return;
    }
    const trackLocation = async () => {
      const location = await getCurrentLocation();
      if (location && currentShift) {
        try { await updateDoc(doc(db, 'shifts', currentShift.id), { locationHistory: arrayUnion(location) }); } catch (err) { console.error('Error updating location:', err); }
      }
    };
    trackLocation();
    gpsIntervalRef.current = setInterval(trackLocation, settings.gpsInterval * 60 * 1000);
    return () => { if (gpsIntervalRef.current) { clearInterval(gpsIntervalRef.current); gpsIntervalRef.current = null; } };
  }, [user, currentShift?.id, settings.gpsTracking, settings.gpsInterval]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'shifts'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const activeShift = snapshot.docs.find(d => d.data().status === 'active');
      if (activeShift) {
        const shift = { id: activeShift.id, ...activeShift.data() } as Shift;
        setCurrentShift(shift);
        setJobNotes(shift.jobLog?.notes || '');
        const activeBreak = shift.breaks?.find(b => !b.endTime && !b.manualEntry);
        setOnBreak(!!activeBreak);
        setCurrentBreakStart(activeBreak ? activeBreak.startTime.toDate() : null);
        const activeTravel = shift.travelSegments?.find(t => !t.endTime);
        setTraveling(!!activeTravel);
        setCurrentTravelStart(activeTravel ? activeTravel.startTime.toDate() : null);
      } else {
        setCurrentShift(null); setOnBreak(false); setCurrentBreakStart(null); setTraveling(false); setCurrentTravelStart(null); setJobNotes('');
      }
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'shifts'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const shifts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Shift).filter(s => s.status === 'completed').sort((a, b) => (b.clockIn?.toDate?.()?.getTime() || 0) - (a.clockIn?.toDate?.()?.getTime() || 0)).slice(0, 10);
      setShiftHistory(shifts);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user || !settings.chatEnabled) return;
    const q = query(collection(db, 'messages'), orderBy('timestamp', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => { setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as ChatMessage).reverse()); });
    return () => unsubscribe();
  }, [user, settings.chatEnabled]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    try { await signInWithEmailAndPassword(auth, email, password); } catch (err: any) { setError(err.message || 'Login failed'); }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setSendingReset(true);
    try { await sendPasswordResetEmail(auth, forgotEmail); setResetSent(true); } catch (err: any) {
      if (err.code === 'auth/user-not-found') setError('No account found with this email');
      else if (err.code === 'auth/invalid-email') setError('Please enter a valid email address');
      else setError(err.message || 'Failed to send reset email');
    }
    setSendingReset(false);
  };

  const handleCheckInvite = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setCheckingInvite(true);
    try {
      const q = query(collection(db, 'invites'), where('email', '==', email.toLowerCase()), where('status', '==', 'pending'));
      const snapshot = await getDocs(q);
      if (snapshot.empty) { setError('No pending invite found for this email. Ask your employer to send you an invite.'); setCheckingInvite(false); return; }
      setFoundInvite({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Invite);
      setInviteStep('password');
    } catch (err: any) { setError(err.message || 'Failed to check invite'); }
    setCheckingInvite(false);
  };

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (!foundInvite) { setError('No invite found'); return; }
    setCreatingAccount(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'employees', cred.user.uid), { email: email.toLowerCase(), name: foundInvite.name || email.split('@')[0], role: 'employee', settings: defaultSettings, createdAt: Timestamp.now() });
      await updateDoc(doc(db, 'invites', foundInvite.id), { status: 'accepted', acceptedAt: Timestamp.now(), userId: cred.user.uid });
    } catch (err: any) { setError(err.message || 'Failed to create account'); setCreatingAccount(false); }
  };

  const handleClockIn = async () => {
    if (!user) return;
    try {
      const location = await getCurrentLocation();
      await addDoc(collection(db, 'shifts'), { userId: user.uid, userEmail: user.email, clockIn: Timestamp.now(), clockInLocation: location, locationHistory: location ? [location] : [], breaks: [], travelSegments: [], jobLog: { notes: '' }, status: 'active' });
    } catch (err: any) { setError(err.message); }
  };

  const handleClockOut = async () => {
    if (!currentShift) return;
    if (settings.requireNotes && !jobNotes.trim()) { setError('Please add job notes before clocking out'); setView('joblog'); return; }
    try {
      const location = await getCurrentLocation();
      let updatedBreaks = [...(currentShift.breaks || [])];
      let updatedTravel = [...(currentShift.travelSegments || [])];
      const activeBreakIndex = updatedBreaks.findIndex(b => !b.endTime && !b.manualEntry);
      if (activeBreakIndex !== -1) {
        const durationMinutes = Math.round((new Date().getTime() - updatedBreaks[activeBreakIndex].startTime.toDate().getTime()) / 60000);
        updatedBreaks[activeBreakIndex] = { ...updatedBreaks[activeBreakIndex], endTime: Timestamp.now(), durationMinutes };
      }
      const activeTravelIndex = updatedTravel.findIndex(t => !t.endTime);
      if (activeTravelIndex !== -1) {
        const durationMinutes = Math.round((new Date().getTime() - updatedTravel[activeTravelIndex].startTime.toDate().getTime()) / 60000);
        updatedTravel[activeTravelIndex] = { ...updatedTravel[activeTravelIndex], endTime: Timestamp.now(), endLocation: location || undefined, durationMinutes };
      }
      await updateDoc(doc(db, 'shifts', currentShift.id), { clockOut: Timestamp.now(), clockOutLocation: location, breaks: updatedBreaks, travelSegments: updatedTravel, 'jobLog.notes': jobNotes, status: 'completed' });
      setOnBreak(false); setCurrentBreakStart(null); setTraveling(false); setCurrentTravelStart(null);
    } catch (err: any) { setError(err.message); }
  };

  const handleStartBreak = async () => {
    if (!currentShift) return;
    try {
      await updateDoc(doc(db, 'shifts', currentShift.id), { breaks: [...(currentShift.breaks || []), { startTime: Timestamp.now(), manualEntry: false }] });
      setOnBreak(true); setCurrentBreakStart(new Date());
    } catch (err: any) { setError(err.message); }
  };

  const handleEndBreak = async () => {
    if (!currentShift || !currentBreakStart) return;
    try {
      const durationMinutes = Math.round((new Date().getTime() - currentBreakStart.getTime()) / 60000);
      const updatedBreaks = currentShift.breaks.map((b, i) => i === currentShift.breaks.length - 1 && !b.endTime && !b.manualEntry ? { ...b, endTime: Timestamp.now(), durationMinutes } : b);
      await updateDoc(doc(db, 'shifts', currentShift.id), { breaks: updatedBreaks });
      setOnBreak(false); setCurrentBreakStart(null);
    } catch (err: any) { setError(err.message); }
  };

  const handleStartTravel = async () => {
    if (!currentShift) return;
    try {
      const location = await getCurrentLocation();
      await updateDoc(doc(db, 'shifts', currentShift.id), { travelSegments: [...(currentShift.travelSegments || []), { startTime: Timestamp.now(), startLocation: location || undefined }] });
      setTraveling(true); setCurrentTravelStart(new Date());
    } catch (err: any) { setError(err.message); }
  };

  const handleEndTravel = async () => {
    if (!currentShift || !currentTravelStart) return;
    try {
      const location = await getCurrentLocation();
      const durationMinutes = Math.round((new Date().getTime() - currentTravelStart.getTime()) / 60000);
      const updatedTravel = (currentShift.travelSegments || []).map((t, i) => i === (currentShift.travelSegments || []).length - 1 && !t.endTime ? { ...t, endTime: Timestamp.now(), endLocation: location || undefined, durationMinutes } : t);
      await updateDoc(doc(db, 'shifts', currentShift.id), { travelSegments: updatedTravel });
      setTraveling(false); setCurrentTravelStart(null);
    } catch (err: any) { setError(err.message); }
  };

  const handleAddTravelToShift = async (shiftId: string, shiftDate: Date) => {
    setAddingTravelToShift(true); setError('');
    try {
      let startHour = parseInt(addTravelStartHour); if (addTravelStartAmPm === 'PM' && startHour !== 12) startHour += 12; if (addTravelStartAmPm === 'AM' && startHour === 12) startHour = 0;
      let endHour = parseInt(addTravelEndHour); if (addTravelEndAmPm === 'PM' && endHour !== 12) endHour += 12; if (addTravelEndAmPm === 'AM' && endHour === 12) endHour = 0;
      const travelStart = new Date(shiftDate); travelStart.setHours(startHour, parseInt(addTravelStartMinute), 0, 0);
      const travelEnd = new Date(shiftDate); travelEnd.setHours(endHour, parseInt(addTravelEndMinute), 0, 0);
      if (travelEnd <= travelStart) travelEnd.setDate(travelEnd.getDate() + 1);
      const durationMinutes = Math.round((travelEnd.getTime() - travelStart.getTime()) / 60000);
      if (durationMinutes <= 0 || durationMinutes > 480) { setError('Invalid travel duration'); setAddingTravelToShift(false); return; }
      const shiftRef = doc(db, 'shifts', shiftId);
      const shiftSnap = await getDoc(shiftRef);
      if (shiftSnap.exists()) {
        await updateDoc(shiftRef, { travelSegments: [...(shiftSnap.data().travelSegments || []), { startTime: Timestamp.fromDate(travelStart), endTime: Timestamp.fromDate(travelEnd), durationMinutes }] });
      }
      setEditingShiftId(null); setAddTravelStartHour('9'); setAddTravelStartMinute('00'); setAddTravelStartAmPm('AM'); setAddTravelEndHour('9'); setAddTravelEndMinute('30'); setAddTravelEndAmPm('AM');
    } catch (err: any) { setError(err.message || 'Failed to add travel'); }
    setAddingTravelToShift(false);
  };

  const handleAddPresetBreak = async (minutes: number) => {
    if (!currentShift) return;
    try {
      const now = Timestamp.now();
      await updateDoc(doc(db, 'shifts', currentShift.id), { breaks: [...(currentShift.breaks || []), { startTime: now, endTime: now, durationMinutes: minutes, manualEntry: true }] });
      showToast(`${minutes}m break added ✓`);
    } catch (err: any) { setError(err.message); }
  };

  const handleAddManualBreak = async () => {
    const minutes = parseInt(manualMinutes);
    if (!currentShift || isNaN(minutes) || minutes <= 0) return;
    try {
      const now = Timestamp.now();
      await updateDoc(doc(db, 'shifts', currentShift.id), { breaks: [...(currentShift.breaks || []), { startTime: now, endTime: now, durationMinutes: minutes, manualEntry: true }] });
      showToast(`${minutes}m break added ✓`);
      setManualMinutes(''); setShowManualEntry(false);
    } catch (err: any) { setError(err.message); }
  };

  const handleDeleteBreak = async (breakIndex: number) => {
    if (!currentShift) return;
    try {
      const updatedBreaks = currentShift.breaks.filter((_, i) => i !== breakIndex);
      await updateDoc(doc(db, 'shifts', currentShift.id), { breaks: updatedBreaks });
      showToast('Break removed');
    } catch (err: any) { setError(err.message); }
  };

  const handleAddManualShift = async () => {
    if (!user) return;
    setAddingShift(true); setError('');
    try {
      const [year, month, day] = manualDate.split('-').map(Number);
      let startHour = parseInt(manualStartHour); if (manualStartAmPm === 'PM' && startHour !== 12) startHour += 12; if (manualStartAmPm === 'AM' && startHour === 12) startHour = 0;
      let endHour = parseInt(manualEndHour); if (manualEndAmPm === 'PM' && endHour !== 12) endHour += 12; if (manualEndAmPm === 'AM' && endHour === 12) endHour = 0;
      const clockInDate = new Date(year, month - 1, day, startHour, parseInt(manualStartMinute), 0);
      const clockOutDate = new Date(year, month - 1, day, endHour, parseInt(manualEndMinute), 0);
      if (clockOutDate <= clockInDate) clockOutDate.setDate(clockOutDate.getDate() + 1);
      if (clockInDate > new Date()) { setError('Cannot add shifts in the future'); setAddingShift(false); return; }
      const breaks: Break[] = manualBreaks.map(mins => ({ startTime: Timestamp.fromDate(clockInDate), endTime: Timestamp.fromDate(clockInDate), durationMinutes: mins, manualEntry: true }));
      const travelSegments: TravelSegment[] = manualTravel.map(mins => ({ startTime: Timestamp.fromDate(clockInDate), endTime: Timestamp.fromDate(clockInDate), durationMinutes: mins }));
      await addDoc(collection(db, 'shifts'), { userId: user.uid, userEmail: user.email, clockIn: Timestamp.fromDate(clockInDate), clockOut: Timestamp.fromDate(clockOutDate), clockInLocation: null, clockOutLocation: null, locationHistory: [], breaks, travelSegments, jobLog: { notes: manualNotes }, status: 'completed', manualEntry: true });
      setShowAddShift(false); setManualDate(new Date().toISOString().split('T')[0]); setManualStartHour('7'); setManualStartMinute('00'); setManualStartAmPm('AM'); setManualEndHour('5'); setManualEndMinute('00'); setManualEndAmPm('PM'); setManualBreaks([]); setManualCustomBreak(''); setShowManualCustomBreak(false); setManualTravel([]); setManualCustomTravel(''); setShowManualCustomTravel(false); setManualNotes('');
    } catch (err: any) { setError(err.message || 'Failed to add shift'); }
    setAddingShift(false);
  };

  const handleSaveNotes = async () => {
    if (!currentShift) return;
    try { await updateDoc(doc(db, 'shifts', currentShift.id), { 'jobLog.notes': jobNotes }); } catch (err: any) { setError(err.message); }
  };

  const handleSendMessage = async () => {
    if (!user || !newMessage.trim()) return;
    try {
      await addDoc(collection(db, 'messages'), { type: chatTab === 'employer' ? 'dm' : 'team', senderId: user.uid, senderEmail: user.email, text: newMessage.trim(), timestamp: Timestamp.now(), participants: chatTab === 'employer' ? [user.uid, 'employer'] : [] });
      setNewMessage('');
    } catch (err: any) { setError(err.message); }
  };

  const styles = {
    input: { padding: '12px 16px', borderRadius: '12px', border: `1px solid ${theme.inputBorder}`, background: theme.input, color: theme.text, fontSize: '16px', width: '100%', boxSizing: 'border-box' as const },
    btn: { padding: '14px 24px', borderRadius: '12px', background: theme.primary, color: 'white', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '16px' },
    card: { background: theme.card, padding: '20px', borderRadius: '16px', marginBottom: '16px', border: `1px solid ${theme.cardBorder}` },
    select: { padding: '12px', borderRadius: '10px', border: `1px solid ${theme.inputBorder}`, background: theme.input, color: theme.text, fontSize: '16px', cursor: 'pointer', appearance: 'none' as const, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: '36px' },
  };

  if (loading) return <div style={{ minHeight: '100vh', background: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ color: theme.text, fontSize: '18px' }}>Loading...</div></div>;

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: theme.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
        <div style={{ width: '100%', maxWidth: '360px' }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}><h1 style={{ color: theme.text, fontSize: '28px', marginBottom: '8px' }}>TimeTrack NZ</h1><p style={{ color: theme.textMuted }}>Employee Time Clock</p></div>
          <div style={styles.card}>
            {showForgotPassword ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}><button onClick={() => { setShowForgotPassword(false); setResetSent(false); setForgotEmail(''); setError(''); }} style={{ background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '20px', marginRight: '12px' }}>←</button><h2 style={{ color: theme.text, fontSize: '18px', fontWeight: '600', margin: 0 }}>Reset Password</h2></div>
                {resetSent ? (<div><div style={{ background: theme.successBg, padding: '16px', borderRadius: '12px', marginBottom: '16px' }}><p style={{ color: theme.successText, fontSize: '14px', margin: 0 }}>✓ Password reset email sent to <strong>{forgotEmail}</strong></p></div><p style={{ color: theme.textMuted, fontSize: '14px', marginBottom: '16px' }}>Check your inbox (and spam folder) for a link to reset your password.</p><button onClick={() => { setShowForgotPassword(false); setResetSent(false); setForgotEmail(''); }} style={{ ...styles.btn, width: '100%' }}>Back to Sign In</button></div>) : (
                  <form onSubmit={handleForgotPassword}><p style={{ color: theme.textMuted, fontSize: '14px', marginBottom: '16px' }}>Enter your email address and we'll send you a link to reset your password.</p><div style={{ marginBottom: '16px' }}><input type="email" placeholder="Your email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} style={styles.input} required /></div>{error && <p style={{ color: theme.danger, fontSize: '14px', marginBottom: '16px' }}>{error}</p>}<button type="submit" disabled={sendingReset} style={{ ...styles.btn, width: '100%', opacity: sendingReset ? 0.7 : 1 }}>{sendingReset ? 'Sending...' : 'Send Reset Link'}</button></form>
                )}
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', marginBottom: '24px', background: theme.cardAlt, borderRadius: '10px', padding: '4px' }}><button onClick={() => { setAuthMode('signin'); setError(''); setInviteStep('email'); setFoundInvite(null); }} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '14px', background: authMode === 'signin' ? theme.primary : 'transparent', color: authMode === 'signin' ? 'white' : theme.textMuted }}>Sign In</button><button onClick={() => { setAuthMode('invite'); setError(''); }} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '14px', background: authMode === 'invite' ? theme.primary : 'transparent', color: authMode === 'invite' ? 'white' : theme.textMuted }}>Accept Invite</button></div>
                {authMode === 'signin' ? (
                  <form onSubmit={handleLogin}><div style={{ marginBottom: '16px' }}><input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={styles.input} /></div><div style={{ marginBottom: '8px' }}><input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={styles.input} /></div><div style={{ marginBottom: '16px', textAlign: 'right' }}><button type="button" onClick={() => { setShowForgotPassword(true); setForgotEmail(email); setError(''); }} style={{ background: 'none', border: 'none', color: theme.primary, cursor: 'pointer', fontSize: '14px', padding: 0 }}>Forgot Password?</button></div>{error && <p style={{ color: theme.danger, fontSize: '14px', marginBottom: '16px' }}>{error}</p>}<button type="submit" style={{ ...styles.btn, width: '100%' }}>Sign In</button></form>
                ) : inviteStep === 'email' ? (
                  <form onSubmit={handleCheckInvite}><p style={{ color: theme.textMuted, fontSize: '14px', marginBottom: '16px' }}>Enter the email your employer used to invite you:</p><div style={{ marginBottom: '16px' }}><input type="email" placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} style={styles.input} required /></div>{error && <p style={{ color: theme.danger, fontSize: '14px', marginBottom: '16px' }}>{error}</p>}<button type="submit" disabled={checkingInvite} style={{ ...styles.btn, width: '100%', opacity: checkingInvite ? 0.7 : 1 }}>{checkingInvite ? 'Checking...' : 'Check Invite'}</button></form>
                ) : (
                  <form onSubmit={handleAcceptInvite}><div style={{ background: theme.successBg, padding: '12px', borderRadius: '10px', marginBottom: '16px' }}><p style={{ color: theme.successText, fontSize: '14px', margin: 0 }}>✓ Invite found for <strong>{foundInvite?.name || email}</strong></p></div><p style={{ color: theme.textMuted, fontSize: '14px', marginBottom: '16px' }}>Create a password for your account:</p><div style={{ marginBottom: '16px' }}><input type="password" placeholder="Create password (min 6 characters)" value={password} onChange={(e) => setPassword(e.target.value)} style={styles.input} required minLength={6} /></div><div style={{ marginBottom: '16px' }}><input type="password" placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={styles.input} required /></div>{error && <p style={{ color: theme.danger, fontSize: '14px', marginBottom: '16px' }}>{error}</p>}<button type="submit" disabled={creatingAccount} style={{ ...styles.btn, width: '100%', background: theme.success, opacity: creatingAccount ? 0.7 : 1 }}>{creatingAccount ? 'Creating Account...' : 'Create Account'}</button><button type="button" onClick={() => { setInviteStep('email'); setFoundInvite(null); setPassword(''); setConfirmPassword(''); setError(''); }} style={{ width: '100%', marginTop: '12px', padding: '10px', background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '14px' }}>← Back</button></form>
                )}
              </>
            )}
          </div>
          {authMode === 'invite' && inviteStep === 'email' && !showForgotPassword && <p style={{ color: theme.textMuted, fontSize: '13px', textAlign: 'center', marginTop: '16px' }}>Don't have an invite? Ask your employer to add you from the dashboard.</p>}
          <div style={{ textAlign: 'center', marginTop: '24px' }}><button onClick={() => setDark(!dark)} style={{ background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '14px' }}>{dark ? '☀️ Light Mode' : '🌙 Dark Mode'}</button></div>
        </div>
      </div>
    );
  }

  const renderClockView = () => {
    const shiftHours = currentShift ? getHours(currentShift.clockIn, currentShift.clockOut) : 0;
    const breakAllocation = currentShift ? calcBreaks(currentShift.breaks || [], shiftHours) : null;
    const entitlements = getBreakEntitlements(shiftHours);
    const totalBreakMinutes = currentShift ? (currentShift.breaks || []).reduce((sum, b) => sum + (b.durationMinutes || 0), 0) : 0;

    return (
      <div style={{ padding: '16px' }}>
        {currentShift && settings.gpsTracking && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: theme.success, background: theme.successBg, padding: '10px 14px', borderRadius: '10px', marginBottom: '16px' }}><span>📍</span><span>Location tracking active (every {settings.gpsInterval} mins)</span></div>}

        <div style={styles.card}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'inline-block', padding: '8px 20px', borderRadius: '24px', fontSize: '14px', fontWeight: '600', marginBottom: '16px', background: currentShift ? (traveling ? '#dbeafe' : onBreak ? theme.warningBg : theme.successBg) : theme.cardAlt, color: currentShift ? (traveling ? '#1d4ed8' : onBreak ? theme.warningText : theme.successText) : theme.textMuted }}>{currentShift ? (traveling ? '🚗 Traveling' : onBreak ? '☕ On Break' : '✓ Clocked In') : 'Not Clocked In'}</div>
            {currentShift && <div><p style={{ color: theme.textMuted, fontSize: '14px', marginBottom: '8px' }}>Started at {fmtTime(currentShift.clockIn)}</p><p style={{ color: theme.text, fontSize: '48px', fontWeight: '700', margin: '8px 0' }}>{fmtDur(shiftHours * 60)}</p>{onBreak && currentBreakStart && <p style={{ color: theme.warning, fontSize: '14px' }}>Break started {currentBreakStart.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' })}</p>}{traveling && currentTravelStart && <p style={{ color: '#1d4ed8', fontSize: '14px' }}>Travel started {currentTravelStart.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' })}</p>}</div>}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
          {!currentShift ? <button onClick={handleClockIn} style={{ ...styles.btn, background: theme.success, padding: '18px', fontSize: '18px' }}>Clock In</button> : traveling ? <><button onClick={handleEndTravel} style={{ ...styles.btn, background: '#2563eb', padding: '16px' }}>🏢 Stop Travel</button><button onClick={handleClockOut} style={{ ...styles.btn, background: theme.danger, padding: '16px' }}>Clock Out</button></> : <>{!onBreak ? <button onClick={handleStartBreak} style={{ ...styles.btn, background: theme.warning, padding: '16px' }}>Start Break</button> : <button onClick={handleEndBreak} style={{ ...styles.btn, padding: '16px' }}>End Break</button>}{!onBreak && <button onClick={handleStartTravel} style={{ ...styles.btn, background: '#2563eb', padding: '16px' }}>🚗 Start Travel</button>}<button onClick={handleClockOut} style={{ ...styles.btn, background: theme.danger, padding: '16px' }}>Clock Out</button></>}
        </div>

        {!currentShift && (
          <div style={styles.card}>
            <button onClick={() => setShowAddShift(!showAddShift)} style={{ width: '100%', padding: '14px', borderRadius: '12px', background: showAddShift ? theme.cardAlt : 'transparent', color: theme.text, border: `1px dashed ${theme.cardBorder}`, cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><span>{showAddShift ? '✕' : '+'}</span><span>{showAddShift ? 'Cancel' : 'Add Past Shift'}</span></button>
            {showAddShift && (
              <div style={{ marginTop: '16px' }}>
                <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '16px' }}>Forgot to clock in? Add a shift manually:</p>
                <div style={{ marginBottom: '16px' }}><label style={{ display: 'block', color: theme.textMuted, fontSize: '13px', marginBottom: '6px' }}>Date</label><input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} max={new Date().toISOString().split('T')[0]} style={styles.input} /></div>
                <div style={{ marginBottom: '16px' }}><label style={{ display: 'block', color: theme.textMuted, fontSize: '13px', marginBottom: '6px' }}>Start Time</label><div style={{ display: 'flex', gap: '8px' }}><select value={manualStartHour} onChange={(e) => setManualStartHour(e.target.value)} style={{ ...styles.select, flex: 1 }}>{[12,1,2,3,4,5,6,7,8,9,10,11].map(h => <option key={h} value={h}>{h}</option>)}</select><select value={manualStartMinute} onChange={(e) => setManualStartMinute(e.target.value)} style={{ ...styles.select, flex: 1 }}>{['00','15','30','45'].map(m => <option key={m} value={m}>{m}</option>)}</select><select value={manualStartAmPm} onChange={(e) => setManualStartAmPm(e.target.value as 'AM'|'PM')} style={{ ...styles.select, flex: 1 }}><option value="AM">AM</option><option value="PM">PM</option></select></div></div>
                <div style={{ marginBottom: '16px' }}><label style={{ display: 'block', color: theme.textMuted, fontSize: '13px', marginBottom: '6px' }}>End Time</label><div style={{ display: 'flex', gap: '8px' }}><select value={manualEndHour} onChange={(e) => setManualEndHour(e.target.value)} style={{ ...styles.select, flex: 1 }}>{[12,1,2,3,4,5,6,7,8,9,10,11].map(h => <option key={h} value={h}>{h}</option>)}</select><select value={manualEndMinute} onChange={(e) => setManualEndMinute(e.target.value)} style={{ ...styles.select, flex: 1 }}>{['00','15','30','45'].map(m => <option key={m} value={m}>{m}</option>)}</select><select value={manualEndAmPm} onChange={(e) => setManualEndAmPm(e.target.value as 'AM'|'PM')} style={{ ...styles.select, flex: 1 }}><option value="AM">AM</option><option value="PM">PM</option></select></div></div>
                <div style={{ marginBottom: '16px' }}><label style={{ display: 'block', color: theme.textMuted, fontSize: '13px', marginBottom: '6px' }}>Breaks</label><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>{[10,15,20,30].map(mins => <button key={mins} type="button" onClick={() => setManualBreaks([...manualBreaks, mins])} style={{ padding: '12px', borderRadius: '10px', background: theme.cardAlt, color: theme.text, border: `1px solid ${theme.cardBorder}`, cursor: 'pointer', fontWeight: '600' }}>+{mins}m</button>)}</div>{!showManualCustomBreak ? <button type="button" onClick={() => setShowManualCustomBreak(true)} style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'transparent', color: theme.textMuted, border: `1px dashed ${theme.cardBorder}`, cursor: 'pointer' }}>+ Custom minutes</button> : <div style={{ display: 'flex', gap: '8px' }}><input type="number" placeholder="Minutes" value={manualCustomBreak} onChange={(e) => setManualCustomBreak(e.target.value)} style={{ ...styles.input, flex: 1 }} min="1" max="120" /><button type="button" onClick={() => { const mins = parseInt(manualCustomBreak); if (!isNaN(mins) && mins > 0) { setManualBreaks([...manualBreaks, mins]); setManualCustomBreak(''); setShowManualCustomBreak(false); }}} style={{ ...styles.btn, padding: '12px 20px' }}>Add</button><button type="button" onClick={() => { setShowManualCustomBreak(false); setManualCustomBreak(''); }} style={{ padding: '12px', borderRadius: '10px', background: theme.cardAlt, color: theme.textMuted, border: 'none', cursor: 'pointer' }}>✕</button></div>}{manualBreaks.length > 0 && <div style={{ marginTop: '12px', background: theme.cardAlt, borderRadius: '10px', padding: '12px' }}>{manualBreaks.map((mins, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < manualBreaks.length - 1 ? `1px solid ${theme.cardBorder}` : 'none' }}><span style={{ color: theme.text, fontSize: '14px' }}>Break {i + 1}</span><div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><span style={{ color: theme.text, fontWeight: '600' }}>{mins}m</span><button type="button" onClick={() => setManualBreaks(manualBreaks.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: theme.danger, cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}>✕</button></div></div>)}<div style={{ borderTop: `1px solid ${theme.cardBorder}`, paddingTop: '8px', marginTop: '8px', display: 'flex', justifyContent: 'space-between' }}><span style={{ color: theme.textMuted, fontSize: '13px' }}>Total break time:</span><span style={{ color: theme.text, fontWeight: '600', fontSize: '13px' }}>{manualBreaks.reduce((a, b) => a + b, 0)}m</span></div></div>}</div>
                <div style={{ marginBottom: '16px' }}><label style={{ display: 'block', color: theme.textMuted, fontSize: '13px', marginBottom: '6px' }}>Notes (optional)</label><textarea value={manualNotes} onChange={(e) => setManualNotes(e.target.value)} placeholder="What did you work on?" rows={2} style={{ ...styles.input, resize: 'vertical', fontFamily: 'inherit' }} /></div>
                <div style={{ marginBottom: '16px' }}><label style={{ display: 'block', color: theme.textMuted, fontSize: '13px', marginBottom: '6px' }}>Travel</label><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>{[10,15,20,30].map(mins => <button key={mins} type="button" onClick={() => setManualTravel([...manualTravel, mins])} style={{ padding: '12px', borderRadius: '10px', background: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe', cursor: 'pointer', fontWeight: '600' }}>+{mins}m</button>)}</div>{!showManualCustomTravel ? <button type="button" onClick={() => setShowManualCustomTravel(true)} style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'transparent', color: theme.textMuted, border: `1px dashed ${theme.cardBorder}`, cursor: 'pointer' }}>+ Custom travel minutes</button> : <div style={{ display: 'flex', gap: '8px' }}><input type="number" placeholder="Minutes" value={manualCustomTravel} onChange={(e) => setManualCustomTravel(e.target.value)} style={{ ...styles.input, flex: 1 }} min="1" max="180" /><button type="button" onClick={() => { const mins = parseInt(manualCustomTravel); if (!isNaN(mins) && mins > 0) { setManualTravel([...manualTravel, mins]); setManualCustomTravel(''); setShowManualCustomTravel(false); }}} style={{ ...styles.btn, padding: '12px 20px', background: '#2563eb' }}>Add</button><button type="button" onClick={() => { setShowManualCustomTravel(false); setManualCustomTravel(''); }} style={{ padding: '12px', borderRadius: '10px', background: theme.cardAlt, color: theme.textMuted, border: 'none', cursor: 'pointer' }}>✕</button></div>}{manualTravel.length > 0 && <div style={{ marginTop: '12px', background: '#dbeafe', borderRadius: '10px', padding: '12px' }}>{manualTravel.map((mins, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < manualTravel.length - 1 ? '1px solid #bfdbfe' : 'none' }}><span style={{ color: '#1d4ed8', fontSize: '14px' }}>🚗 Travel {i + 1}</span><div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><span style={{ color: '#1d4ed8', fontWeight: '600' }}>{mins}m</span><button type="button" onClick={() => setManualTravel(manualTravel.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: theme.danger, cursor: 'pointer', fontSize: '16px', padding: '0 4px' }}>✕</button></div></div>)}<div style={{ borderTop: '1px solid #bfdbfe', paddingTop: '8px', marginTop: '8px', display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#1d4ed8', fontSize: '13px' }}>Total travel time:</span><span style={{ color: '#1d4ed8', fontWeight: '600', fontSize: '13px' }}>{manualTravel.reduce((a, b) => a + b, 0)}m</span></div></div>}</div>
                <div style={{ background: theme.cardAlt, borderRadius: '10px', padding: '12px', marginBottom: '16px' }}><p style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '4px' }}>Preview:</p><p style={{ color: theme.text, fontSize: '14px', fontWeight: '600' }}>{manualStartHour}:{manualStartMinute} {manualStartAmPm} → {manualEndHour}:{manualEndMinute} {manualEndAmPm}</p>{(manualBreaks.length > 0 || manualTravel.length > 0) && <p style={{ color: theme.textMuted, fontSize: '13px', marginTop: '4px' }}>{manualBreaks.length > 0 && <span style={{ color: theme.warning }}>{manualBreaks.reduce((a, b) => a + b, 0)}m breaks</span>}{manualBreaks.length > 0 && manualTravel.length > 0 && ' · '}{manualTravel.length > 0 && <span style={{ color: '#2563eb' }}>{manualTravel.reduce((a, b) => a + b, 0)}m travel</span>}</p>}</div>
                <button onClick={handleAddManualShift} disabled={addingShift} style={{ ...styles.btn, width: '100%', background: theme.success, opacity: addingShift ? 0.7 : 1 }}>{addingShift ? 'Adding...' : 'Add Shift'}</button>
              </div>
            )}
          </div>
        )}

        {currentShift && !onBreak && !traveling && (
          <div style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3 style={{ color: theme.text, fontWeight: '600', margin: 0 }}>Quick Add Break</h3>
              {totalBreakMinutes > 0 && <span style={{ background: theme.warningBg, color: theme.warningText, padding: '4px 10px', borderRadius: '12px', fontSize: '13px', fontWeight: '600' }}>Total: {fmtDur(totalBreakMinutes)}</span>}
            </div>
            <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '12px' }}>Forgot to start timer? Add break time:</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>{[10,15,20,30].map(mins => <button key={mins} onClick={() => handleAddPresetBreak(mins)} style={{ padding: '12px', borderRadius: '10px', background: theme.cardAlt, color: theme.text, border: `1px solid ${theme.cardBorder}`, cursor: 'pointer', fontWeight: '600' }}>{mins}m</button>)}</div>
            {!showManualEntry ? <button onClick={() => setShowManualEntry(true)} style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'transparent', color: theme.textMuted, border: `1px dashed ${theme.cardBorder}`, cursor: 'pointer' }}>+ Custom minutes</button> : <div style={{ display: 'flex', gap: '8px' }}><input type="number" placeholder="Minutes" value={manualMinutes} onChange={(e) => setManualMinutes(e.target.value)} style={{ ...styles.input, flex: 1 }} min="1" max="120" /><button onClick={handleAddManualBreak} style={{ ...styles.btn, padding: '12px 20px' }}>Add</button><button onClick={() => { setShowManualEntry(false); setManualMinutes(''); }} style={{ padding: '12px', borderRadius: '10px', background: theme.cardAlt, color: theme.textMuted, border: 'none', cursor: 'pointer' }}>✕</button></div>}
          </div>
        )}

        {currentShift && breakAllocation && (
          <div style={styles.card}>
            <h3 style={{ color: theme.text, fontWeight: '600', marginBottom: '12px' }}>Break & Travel Summary</h3>
            <div style={{ background: theme.cardAlt, borderRadius: '10px', padding: '12px', marginBottom: '12px' }}><p style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '4px' }}>Your entitlement for {fmtDur(shiftHours * 60)} shift:</p><p style={{ color: theme.text, fontSize: '14px' }}>{entitlements.paidMinutes / 10}× paid rest ({entitlements.paidMinutes}m) + {entitlements.unpaidMinutes / 30}× unpaid meal ({entitlements.unpaidMinutes}m)</p></div>
            {(currentShift.breaks || []).length === 0 && (currentShift.travelSegments || []).length === 0 && <p style={{ color: theme.textLight, fontSize: '14px', marginBottom: '12px' }}>No breaks or travel recorded yet</p>}
            {((currentShift.breaks || []).length > 0 || (currentShift.travelSegments || []).length > 0) && (
              <>
                {(currentShift.breaks || []).length > 0 && <><p style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '8px', fontWeight: '600' }}>BREAKS</p>{currentShift.breaks.map((b, i) => <div key={`break-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${theme.cardBorder}` }}><span style={{ color: theme.textMuted, fontSize: '14px' }}>{b.manualEntry ? `Break ${i + 1}: (added)` : `Break ${i + 1}: ${fmtTime(b.startTime)} - ${b.endTime ? fmtTime(b.endTime) : 'ongoing'}`}</span><div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><span style={{ color: theme.text, fontWeight: '600' }}>{b.durationMinutes ? `${b.durationMinutes}m` : '...'}</span>{b.durationMinutes && <button onClick={() => handleDeleteBreak(i)} style={{ background: 'none', border: 'none', color: theme.danger, cursor: 'pointer', fontSize: '16px', padding: '0 4px', opacity: 0.7 }} title="Remove break">✕</button>}</div></div>)}</>}
                {(currentShift.travelSegments || []).length > 0 && <><p style={{ color: theme.textMuted, fontSize: '12px', marginTop: '16px', marginBottom: '8px', fontWeight: '600' }}>TRAVEL</p>{currentShift.travelSegments!.map((t, i) => <div key={`travel-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${theme.cardBorder}` }}><span style={{ color: theme.textMuted, fontSize: '14px' }}>🚗 Travel {i + 1}: {fmtTime(t.startTime)} - {t.endTime ? fmtTime(t.endTime) : 'ongoing'}</span><span style={{ color: '#2563eb', fontWeight: '600' }}>{t.durationMinutes ? `${t.durationMinutes}m` : '...'}</span></div>)}</>}
                <div style={{ borderTop: `1px solid ${theme.cardBorder}`, paddingTop: '12px', marginTop: '12px' }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}><span style={{ color: theme.success }}>Paid breaks:</span><span style={{ color: theme.success, fontWeight: '600' }}>{breakAllocation.paid}m</span></div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}><span style={{ color: theme.warning }}>Unpaid breaks:</span><span style={{ color: theme.warning, fontWeight: '600' }}>{breakAllocation.unpaid}m</span></div>{calcTravel(currentShift.travelSegments || []) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}><span style={{ color: '#2563eb' }}>Travel time:</span><span style={{ color: '#2563eb', fontWeight: '600' }}>{calcTravel(currentShift.travelSegments || [])}m</span></div>}</div>
              </>
            )}
            {!traveling && !onBreak && <>{editingShiftId !== currentShift.id ? <button onClick={() => setEditingShiftId(currentShift.id)} style={{ marginTop: '12px', width: '100%', padding: '10px', borderRadius: '10px', background: 'transparent', color: '#2563eb', border: '1px dashed #bfdbfe', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>+ Add Travel (with times)</button> : <div style={{ marginTop: '12px', background: '#dbeafe', borderRadius: '10px', padding: '12px' }}><p style={{ color: '#1d4ed8', fontSize: '13px', fontWeight: '600', marginBottom: '12px' }}>Add Travel Time</p><div style={{ marginBottom: '12px' }}><label style={{ display: 'block', color: '#1d4ed8', fontSize: '12px', marginBottom: '4px' }}>Start</label><div style={{ display: 'flex', gap: '6px' }}><select value={addTravelStartHour} onChange={(e) => setAddTravelStartHour(e.target.value)} style={{ ...styles.select, flex: 1, padding: '8px', fontSize: '14px' }}>{[12,1,2,3,4,5,6,7,8,9,10,11].map(h => <option key={h} value={h}>{h}</option>)}</select><select value={addTravelStartMinute} onChange={(e) => setAddTravelStartMinute(e.target.value)} style={{ ...styles.select, flex: 1, padding: '8px', fontSize: '14px' }}>{['00','15','30','45'].map(m => <option key={m} value={m}>{m}</option>)}</select><select value={addTravelStartAmPm} onChange={(e) => setAddTravelStartAmPm(e.target.value as 'AM'|'PM')} style={{ ...styles.select, flex: 1, padding: '8px', fontSize: '14px' }}><option value="AM">AM</option><option value="PM">PM</option></select></div></div><div style={{ marginBottom: '12px' }}><label style={{ display: 'block', color: '#1d4ed8', fontSize: '12px', marginBottom: '4px' }}>End</label><div style={{ display: 'flex', gap: '6px' }}><select value={addTravelEndHour} onChange={(e) => setAddTravelEndHour(e.target.value)} style={{ ...styles.select, flex: 1, padding: '8px', fontSize: '14px' }}>{[12,1,2,3,4,5,6,7,8,9,10,11].map(h => <option key={h} value={h}>{h}</option>)}</select><select value={addTravelEndMinute} onChange={(e) => setAddTravelEndMinute(e.target.value)} style={{ ...styles.select, flex: 1, padding: '8px', fontSize: '14px' }}>{['00','15','30','45'].map(m => <option key={m} value={m}>{m}</option>)}</select><select value={addTravelEndAmPm} onChange={(e) => setAddTravelEndAmPm(e.target.value as 'AM'|'PM')} style={{ ...styles.select, flex: 1, padding: '8px', fontSize: '14px' }}><option value="AM">AM</option><option value="PM">PM</option></select></div></div><div style={{ display: 'flex', gap: '8px' }}><button onClick={() => handleAddTravelToShift(currentShift.id, currentShift.clockIn.toDate())} disabled={addingTravelToShift} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: '#2563eb', color: 'white', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '14px', opacity: addingTravelToShift ? 0.7 : 1 }}>{addingTravelToShift ? 'Adding...' : 'Add Travel'}</button><button onClick={() => setEditingShiftId(null)} style={{ padding: '10px 16px', borderRadius: '8px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', cursor: 'pointer', fontWeight: '500', fontSize: '14px' }}>Cancel</button></div></div>}</>}
          </div>
        )}

        <BreakRulesInfo isOpen={showBreakRules} onToggle={() => setShowBreakRules(!showBreakRules)} theme={theme} />
        {currentLocation && <div style={{ ...styles.card, marginTop: '16px' }}><h3 style={{ color: theme.text, fontWeight: '600', marginBottom: '8px' }}>Current Location</h3><p style={{ color: theme.textMuted, fontSize: '14px' }}>{currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)}</p><p style={{ color: theme.textLight, fontSize: '12px' }}>Accuracy: ±{Math.round(currentLocation.accuracy)}m</p></div>}
      </div>
    );
  };

  const renderJobLogView = () => {
    if (!currentShift) return <div style={{ padding: '16px' }}><div style={{ ...styles.card, textAlign: 'center' }}><p style={{ color: theme.textMuted }}>Clock in to add job notes</p></div></div>;
    return <div style={{ padding: '16px' }}><h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>Job Log</h2><div style={styles.card}><h3 style={{ color: theme.text, fontWeight: '600', marginBottom: '12px' }}>Today's Notes{settings.requireNotes && <span style={{ color: theme.danger, marginLeft: '4px' }}>*</span>}</h3><textarea placeholder="Describe what you did today..." value={jobNotes} onChange={(e) => setJobNotes(e.target.value)} onBlur={handleSaveNotes} rows={6} style={{ ...styles.input, resize: 'vertical', fontFamily: 'inherit' }} /><p style={{ color: theme.textLight, fontSize: '12px', marginTop: '8px' }}>Auto-saves when you tap away</p>{settings.requireNotes && <p style={{ color: theme.warning, fontSize: '12px', marginTop: '8px' }}>* Notes required before clocking out</p>}</div><div style={styles.card}><h3 style={{ color: theme.text, fontWeight: '600', marginBottom: '12px' }}>💡 Tips</h3><ul style={{ color: theme.textMuted, fontSize: '14px', paddingLeft: '20px', margin: 0 }}><li style={{ marginBottom: '4px' }}>Describe tasks completed</li><li style={{ marginBottom: '4px' }}>Note any issues or blockers</li><li style={{ marginBottom: '4px' }}>List materials used</li><li>Mention next steps if applicable</li></ul></div></div>;
  };

  const renderChatView = () => {
    if (!settings.chatEnabled) return <div style={{ padding: '16px' }}><div style={{ ...styles.card, textAlign: 'center' }}><p style={{ color: theme.textMuted }}>Chat is disabled for your account</p></div></div>;
    const filteredMessages = messages.filter(m => chatTab === 'team' ? m.type === 'team' : (m.type === 'dm' && m.participants?.includes(user?.uid || '')));
    return <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)' }}><div style={{ display: 'flex', margin: '16px', background: theme.card, borderRadius: '12px', padding: '4px', border: `1px solid ${theme.cardBorder}` }}><button onClick={() => setChatTab('team')} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: chatTab === 'team' ? theme.primary : 'transparent', color: chatTab === 'team' ? 'white' : theme.textMuted, fontWeight: '600', cursor: 'pointer' }}>Team Chat</button><button onClick={() => setChatTab('employer')} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', background: chatTab === 'employer' ? theme.primary : 'transparent', color: chatTab === 'employer' ? 'white' : theme.textMuted, fontWeight: '600', cursor: 'pointer' }}>Employer DM</button></div><div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>{filteredMessages.length === 0 ? <div style={{ textAlign: 'center', color: theme.textLight, marginTop: '40px' }}>No messages yet. Start the conversation!</div> : filteredMessages.map(msg => <div key={msg.id} style={{ display: 'flex', justifyContent: msg.senderId === user?.uid ? 'flex-end' : 'flex-start', marginBottom: '12px' }}><div style={{ maxWidth: '75%', borderRadius: '16px', padding: '10px 14px', background: msg.senderId === user?.uid ? theme.primary : theme.card, border: msg.senderId === user?.uid ? 'none' : `1px solid ${theme.cardBorder}` }}>{msg.senderId !== user?.uid && <p style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>{msg.senderEmail}</p>}<p style={{ fontSize: '14px', color: msg.senderId === user?.uid ? 'white' : theme.text }}>{msg.text}</p><p style={{ fontSize: '10px', color: msg.senderId === user?.uid ? 'rgba(255,255,255,0.6)' : theme.textLight, marginTop: '4px' }}>{fmtTime(msg.timestamp)}</p></div></div>)}</div><div style={{ padding: '16px', background: theme.nav, borderTop: `1px solid ${theme.navBorder}` }}><div style={{ display: 'flex', gap: '8px' }}><input type="text" placeholder="Type a message..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()} style={{ ...styles.input, flex: 1, borderRadius: '24px' }} /><button onClick={handleSendMessage} style={{ ...styles.btn, borderRadius: '24px', padding: '12px 20px' }}>Send</button></div></div></div>;
  };

  const renderHistoryView = () => (
    <div style={{ padding: '16px' }}>
      <h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>Shift History</h2>
      {shiftHistory.length === 0 ? <div style={{ ...styles.card, textAlign: 'center' }}><p style={{ color: theme.textMuted }}>No completed shifts yet</p></div> : shiftHistory.map(shift => {
        const shiftHours = getHours(shift.clockIn, shift.clockOut);
        const breakAllocation = calcBreaks(shift.breaks || [], shiftHours);
        const travelMinutes = calcTravel(shift.travelSegments || []);
        const workingMinutes = (shiftHours * 60) - breakAllocation.unpaid;
        return (
          <div key={shift.id} style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}><div><p style={{ color: theme.text, fontWeight: '600' }}>{fmtDate(shift.clockIn)}{shift.manualEntry && <span style={{ marginLeft: '8px', fontSize: '11px', background: theme.cardAlt, color: theme.textMuted, padding: '2px 8px', borderRadius: '4px' }}>Manual</span>}</p><p style={{ color: theme.textMuted, fontSize: '14px' }}>{fmtTime(shift.clockIn)} - {fmtTime(shift.clockOut)}</p></div><div style={{ textAlign: 'right' }}><p style={{ color: theme.text, fontWeight: '700', fontSize: '18px' }}>{fmtDur(workingMinutes)}</p><p style={{ color: theme.textLight, fontSize: '12px' }}>worked</p></div></div>
            <div style={{ background: theme.cardAlt, borderRadius: '10px', padding: '10px 12px', marginTop: '8px' }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}><span style={{ color: theme.textMuted }}>Total shift:</span><span style={{ color: theme.text }}>{fmtDur(shiftHours * 60)}</span></div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}><span style={{ color: theme.success }}>Paid breaks:</span><span style={{ color: theme.success }}>{breakAllocation.paid}m</span></div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}><span style={{ color: theme.warning }}>Unpaid breaks:</span><span style={{ color: theme.warning }}>{breakAllocation.unpaid}m</span></div>{travelMinutes > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}><span style={{ color: '#2563eb' }}>Travel time:</span><span style={{ color: '#2563eb' }}>{travelMinutes}m</span></div>}</div>
            {shift.jobLog?.notes && <p style={{ color: theme.textMuted, fontSize: '13px', marginTop: '8px' }}>📝 {shift.jobLog.notes}</p>}
            {shift.locationHistory?.length > 0 && <p style={{ color: theme.textLight, fontSize: '12px', marginTop: '8px' }}>📍 {shift.locationHistory.length} location points recorded</p>}
            {editingShiftId !== shift.id ? <button onClick={() => setEditingShiftId(shift.id)} style={{ marginTop: '12px', width: '100%', padding: '10px', borderRadius: '10px', background: 'transparent', color: '#2563eb', border: '1px dashed #bfdbfe', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>+ Add Travel</button> : <div style={{ marginTop: '12px', background: '#dbeafe', borderRadius: '10px', padding: '12px' }}><p style={{ color: '#1d4ed8', fontSize: '13px', fontWeight: '600', marginBottom: '12px' }}>Add Travel Time</p><div style={{ marginBottom: '12px' }}><label style={{ display: 'block', color: '#1d4ed8', fontSize: '12px', marginBottom: '4px' }}>Start</label><div style={{ display: 'flex', gap: '6px' }}><select value={addTravelStartHour} onChange={(e) => setAddTravelStartHour(e.target.value)} style={{ ...styles.select, flex: 1, padding: '8px', fontSize: '14px' }}>{[12,1,2,3,4,5,6,7,8,9,10,11].map(h => <option key={h} value={h}>{h}</option>)}</select><select value={addTravelStartMinute} onChange={(e) => setAddTravelStartMinute(e.target.value)} style={{ ...styles.select, flex: 1, padding: '8px', fontSize: '14px' }}>{['00','15','30','45'].map(m => <option key={m} value={m}>{m}</option>)}</select><select value={addTravelStartAmPm} onChange={(e) => setAddTravelStartAmPm(e.target.value as 'AM'|'PM')} style={{ ...styles.select, flex: 1, padding: '8px', fontSize: '14px' }}><option value="AM">AM</option><option value="PM">PM</option></select></div></div><div style={{ marginBottom: '12px' }}><label style={{ display: 'block', color: '#1d4ed8', fontSize: '12px', marginBottom: '4px' }}>End</label><div style={{ display: 'flex', gap: '6px' }}><select value={addTravelEndHour} onChange={(e) => setAddTravelEndHour(e.target.value)} style={{ ...styles.select, flex: 1, padding: '8px', fontSize: '14px' }}>{[12,1,2,3,4,5,6,7,8,9,10,11].map(h => <option key={h} value={h}>{h}</option>)}</select><select value={addTravelEndMinute} onChange={(e) => setAddTravelEndMinute(e.target.value)} style={{ ...styles.select, flex: 1, padding: '8px', fontSize: '14px' }}>{['00','15','30','45'].map(m => <option key={m} value={m}>{m}</option>)}</select><select value={addTravelEndAmPm} onChange={(e) => setAddTravelEndAmPm(e.target.value as 'AM'|'PM')} style={{ ...styles.select, flex: 1, padding: '8px', fontSize: '14px' }}><option value="AM">AM</option><option value="PM">PM</option></select></div></div><div style={{ display: 'flex', gap: '8px' }}><button onClick={() => handleAddTravelToShift(shift.id, shift.clockIn.toDate())} disabled={addingTravelToShift} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: '#2563eb', color: 'white', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '14px', opacity: addingTravelToShift ? 0.7 : 1 }}>{addingTravelToShift ? 'Adding...' : 'Add Travel'}</button><button onClick={() => setEditingShiftId(null)} style={{ padding: '10px 16px', borderRadius: '8px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', cursor: 'pointer', fontWeight: '500', fontSize: '14px' }}>Cancel</button></div></div>}
          </div>
        );
      })}
      <div style={{ marginTop: '16px' }}><BreakRulesInfo isOpen={showBreakRules} onToggle={() => setShowBreakRules(!showBreakRules)} theme={theme} /></div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: theme.bg, paddingBottom: '80px' }}>
      {toast && <div style={{ position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)', background: theme.success, color: 'white', padding: '12px 24px', borderRadius: '12px', fontWeight: '600', fontSize: '14px', zIndex: 1000, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>{toast}</div>}
      <div style={{ background: theme.nav, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.navBorder}` }}><h1 style={{ color: theme.text, fontSize: '18px', fontWeight: '600', margin: 0 }}>TimeTrack NZ</h1><div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><button onClick={() => setDark(!dark)} style={{ background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer', fontSize: '18px', padding: '4px' }}>{dark ? '☀️' : '🌙'}</button><button onClick={() => signOut(auth)} style={{ color: theme.textMuted, fontSize: '14px', background: 'none', border: 'none', cursor: 'pointer' }}>Sign Out</button></div></div>
      {error && <div style={{ margin: '16px', padding: '12px 16px', background: theme.dangerBg, border: `1px solid ${theme.danger}`, borderRadius: '12px' }}><p style={{ color: theme.danger, fontSize: '14px', margin: 0 }}>{error}</p><button onClick={() => setError('')} style={{ color: theme.danger, fontSize: '12px', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', marginTop: '4px' }}>Dismiss</button></div>}
      {view === 'clock' && renderClockView()}
      {view === 'joblog' && renderJobLogView()}
      {view === 'chat' && renderChatView()}
      {view === 'history' && renderHistoryView()}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: theme.nav, borderTop: `1px solid ${theme.navBorder}`, paddingBottom: 'env(safe-area-inset-bottom)' }}><div style={{ display: 'flex' }}>{[{ id: 'clock', label: 'Clock', icon: '⏱️' }, { id: 'joblog', label: 'Notes', icon: '📝' }, ...(settings.chatEnabled ? [{ id: 'chat', label: 'Chat', icon: '💬' }] : []), { id: 'history', label: 'History', icon: '📋' }].map(item => <button key={item.id} onClick={() => setView(item.id as any)} style={{ flex: 1, padding: '12px 0', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}><span style={{ fontSize: '20px' }}>{item.icon}</span><span style={{ fontSize: '11px', color: view === item.id ? theme.primary : theme.textMuted, fontWeight: view === item.id ? '600' : '400' }}>{item.label}</span></button>)}</div></div>
    </div>
  );
}