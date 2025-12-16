import { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, User, createUserWithEmailAndPassword, deleteUser } from 'firebase/auth';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc, query, where, orderBy, onSnapshot, Timestamp, writeBatch } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBcyz4DyzExGFRmjQ41W3SvQ3xgvYszzUE",
  authDomain: "timetrack-nz.firebaseapp.com",
  projectId: "timetrack-nz",
  storageBucket: "timetrack-nz.firebasestorage.app",
  messagingSenderId: "600938431502",
  appId: "1:600938431502:web:b661556289a2634c8d285f"
};

// API URL - UPDATE THIS after deploying timetrack-api to Vercel
const API_URL = 'https://timetrack-dashboard-v2.vercel.app';
const MOBILE_APP_URL = 'https://timetrack-mobile-v2.vercel.app';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

interface Location { latitude: number; longitude: number; accuracy: number; timestamp: number; }
interface Break { startTime: Timestamp; endTime?: Timestamp; durationMinutes?: number; manualEntry?: boolean; }
interface TravelSegment { startTime: Timestamp; endTime?: Timestamp; durationMinutes?: number; startLocation?: Location; endLocation?: Location; }
interface JobLog { notes: string; }
interface Shift { id: string; userId: string; userEmail: string; clockIn: Timestamp; clockOut?: Timestamp; clockInLocation?: Location; clockOutLocation?: Location; locationHistory: Location[]; breaks: Break[]; travelSegments?: TravelSegment[]; jobLog: JobLog; status: 'active' | 'completed'; manualEntry?: boolean; }
interface EmployeeSettings { gpsTracking: boolean; gpsInterval: number; requireNotes: boolean; chatEnabled: boolean; }
interface Employee { id: string; email: string; name: string; role: string; settings: EmployeeSettings; createdAt: Timestamp; }
interface ChatMessage { id: string; type: string; senderId: string; senderEmail: string; text: string; timestamp: Timestamp; participants?: string[]; }

const defaultSettings: EmployeeSettings = { gpsTracking: true, gpsInterval: 10, requireNotes: false, chatEnabled: true };

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

// Map Modal Component
function MapModal({ locations, onClose, title, theme }: { locations: Location[], onClose: () => void, title: string, theme: any }) {
  if (!locations || locations.length === 0) return null;
  const lats = locations.map(l => l.latitude);
  const lngs = locations.map(l => l.longitude);
  const minLat = Math.min(...lats) - 0.002;
  const maxLat = Math.max(...lats) + 0.002;
  const minLng = Math.min(...lngs) - 0.002;
  const maxLng = Math.max(...lngs) + 0.002;
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${minLng},${minLat},${maxLng},${maxLat}&layer=mapnik&marker=${locations[locations.length-1].latitude},${locations[locations.length-1].longitude}`;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }} onClick={onClose}>
      <div style={{ background: theme.card, borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '800px', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ color: theme.text, margin: 0, fontSize: '18px' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: theme.textMuted }}>×</button>
        </div>
        <div style={{ height: '300px', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
          <iframe src={mapUrl} style={{ width: '100%', height: '100%', border: 'none' }} title="Location Map" />
        </div>
        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
          <h4 style={{ color: theme.text, marginBottom: '8px' }}>Location History ({locations.length} points)</h4>
          {locations.map((loc, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: i % 2 === 0 ? theme.cardAlt : 'transparent', borderRadius: '4px', fontSize: '12px', flexWrap: 'wrap', gap: '4px' }}>
              <span style={{ color: theme.textMuted }}>{new Date(loc.timestamp).toLocaleString('en-NZ')}</span>
              <span style={{ color: theme.text }}>{loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Location Map Component
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
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
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
  const [mapModal, setMapModal] = useState<{ locations: Location[], title: string } | null>(null);
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
  const [myNotes, setMyNotes] = useState('');
  
  // Email sending state
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

  const theme = dark ? darkTheme : lightTheme;

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

  // My active shift (simplified - filter client-side)
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'shifts'), where('userId', '==', user.uid));
    return onSnapshot(q, (snap) => {
      const activeDoc = snap.docs.find(d => d.data().status === 'active');
      if (activeDoc) {
        const shift = { id: activeDoc.id, ...activeDoc.data() } as Shift;
        setMyShift(shift);
        setMyNotes(shift.jobLog?.notes || '');
        const activeBreak = shift.breaks?.find(b => !b.endTime && !b.manualEntry);
        if (activeBreak) { setOnBreak(true); setBreakStart(activeBreak.startTime.toDate()); }
        else { setOnBreak(false); setBreakStart(null); }
      } else { setMyShift(null); setOnBreak(false); setBreakStart(null); setMyNotes(''); }
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
    const rows = [['Date','Employee','In','Out','Worked','Paid','Unpaid','Travel','Notes']];
    reportData.forEach(sh => { const h = getHours(sh.clockIn, sh.clockOut); const b = calcBreaks(sh.breaks || [], h); const travel = calcTravel(sh.travelSegments || []); rows.push([fmtDateShort(sh.clockIn), sh.userEmail, fmtTime(sh.clockIn), sh.clockOut ? fmtTime(sh.clockOut) : 'Active', fmtDur((h*60)-b.unpaid), b.paid+'m', b.unpaid+'m', travel+'m', `"${(sh.jobLog?.notes||'').replace(/"/g,'""')}"`]); });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `timetrack-${reportStart}-${reportEnd}.csv`; a.click();
  };

  const exportPDF = () => {
    if (!reportData.length) { setError('No data'); return; }
    let total = 0, tPaid = 0, tUnpaid = 0, tTravel = 0;
    const rows = reportData.map(sh => { const h = getHours(sh.clockIn, sh.clockOut); const b = calcBreaks(sh.breaks || [], h); const travel = calcTravel(sh.travelSegments || []); const worked = (h*60) - b.unpaid; total += worked; tPaid += b.paid; tUnpaid += b.unpaid; tTravel += travel; return `<tr><td>${fmtDateShort(sh.clockIn)}</td><td>${sh.userEmail}</td><td>${fmtTime(sh.clockIn)}</td><td>${sh.clockOut ? fmtTime(sh.clockOut) : 'Active'}</td><td>${fmtDur(worked)}</td><td>${b.paid}m</td><td>${b.unpaid}m</td><td>${travel}m</td></tr>${sh.jobLog?.notes ? `<tr><td colspan="8" style="background:#f5f5f5;font-size:12px;">📝 ${sh.jobLog.notes}</td></tr>` : ''}`; }).join('');
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
  const myClockIn = async () => { if (!user) return; await addDoc(collection(db, 'shifts'), { userId: user.uid, userEmail: user.email, clockIn: Timestamp.now(), clockInLocation: null, locationHistory: [], breaks: [], travelSegments: [], jobLog: { notes: '' }, status: 'active' }); setSuccess('Clocked in!'); };
  
  const myClockOut = async () => {
    if (!myShift) return;
    let updatedBreaks = [...(myShift.breaks || [])];
    const activeBreakIndex = updatedBreaks.findIndex(b => !b.endTime && !b.manualEntry);
    if (activeBreakIndex !== -1 && breakStart) { const durationMinutes = Math.round((new Date().getTime() - breakStart.getTime()) / 60000); updatedBreaks[activeBreakIndex] = { ...updatedBreaks[activeBreakIndex], endTime: Timestamp.now(), durationMinutes }; }
    await updateDoc(doc(db, 'shifts', myShift.id), { clockOut: Timestamp.now(), breaks: updatedBreaks, 'jobLog.notes': myNotes, status: 'completed' });
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
  
  const saveMyNotes = async () => { if (!myShift) return; await updateDoc(doc(db, 'shifts', myShift.id), { 'jobLog.notes': myNotes }); };

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
        <div style={{ display: 'flex', marginBottom: '24px', background: theme.cardAlt, borderRadius: '8px', padding: '4px' }}>
          <button 
            onClick={() => { setAuthMode('signin'); setError(''); }} 
            style={{ 
              flex: 1, 
              padding: '10px', 
              borderRadius: '6px', 
              border: 'none', 
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '14px',
              background: authMode === 'signin' ? theme.primary : 'transparent',
              color: authMode === 'signin' ? 'white' : theme.textMuted
            }}
          >
            Sign In
          </button>
          <button 
            onClick={() => { setAuthMode('signup'); setError(''); }} 
            style={{ 
              flex: 1, 
              padding: '10px', 
              borderRadius: '6px', 
              border: 'none', 
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '14px',
              background: authMode === 'signup' ? theme.primary : 'transparent',
              color: authMode === 'signup' ? 'white' : theme.textMuted
            }}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={authMode === 'signin' ? handleLogin : handleSignUp}>
          {authMode === 'signup' && (
            <input 
              type="text" 
              placeholder="Your Name (optional)" 
              value={signupName} 
              onChange={e => setSignupName(e.target.value)} 
              style={{ ...styles.input, marginBottom: '12px' }} 
            />
          )}
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={{ ...styles.input, marginBottom: '12px' }} required />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} style={{ ...styles.input, marginBottom: '12px' }} required />
          {error && <p style={{ color: theme.danger, marginBottom: '12px', fontSize: '14px' }}>{error}</p>}
          {success && <p style={{ color: theme.success, marginBottom: '12px', fontSize: '14px' }}>{success}</p>}
          <button type="submit" style={{ ...styles.btn, width: '100%' }}>
            {authMode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
        
        {authMode === 'signup' && (
          <p style={{ color: theme.textMuted, fontSize: '13px', textAlign: 'center', marginTop: '16px' }}>
            By signing up, you'll create a manager account and can add employees.
          </p>
        )}
        
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <button onClick={() => setDark(!dark)} style={{ background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer' }}>{dark ? '☀️ Light Mode' : '🌙 Dark Mode'}</button>
        </div>
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
    <div style={{ display: 'flex', minHeight: '100vh', background: theme.bg }}>
      {mapModal && <MapModal locations={mapModal.locations} title={mapModal.title} onClose={() => setMapModal(null)} theme={theme} />}
      
      {/* Remove Employee Confirmation Modal */}
      {removeConfirm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }} onClick={() => { setRemoveConfirm(null); setRemoveDeleteShifts(false); }}>
          <div style={{ background: theme.card, borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: theme.danger, margin: '0 0 16px', fontSize: '18px' }}>⚠️ Remove Employee</h2>
            <p style={{ color: theme.text, marginBottom: '16px' }}>
              Are you sure you want to remove <strong>{employees.find(e => e.id === removeConfirm)?.name || employees.find(e => e.id === removeConfirm)?.email}</strong>?
            </p>
            <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '16px' }}>
              This will remove their account. They won't be able to clock in anymore.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: theme.text, cursor: 'pointer', marginBottom: '20px' }}>
              <input 
                type="checkbox" 
                checked={removeDeleteShifts} 
                onChange={e => setRemoveDeleteShifts(e.target.checked)} 
              />
              Also delete all their shift history
            </label>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => { setRemoveConfirm(null); setRemoveDeleteShifts(false); }} style={{ flex: 1, padding: '12px', borderRadius: '8px', border: `1px solid ${theme.cardBorder}`, background: 'transparent', color: theme.text, cursor: 'pointer', fontWeight: '600' }}>Cancel</button>
              <button onClick={() => removeEmployee(removeConfirm)} style={{ ...styles.btnDanger, flex: 1 }}>Remove</button>
            </div>
          </div>
        </div>
      )}
      
      {/* Mobile Header */}
      {isMobile && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, background: theme.sidebar, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${theme.sidebarBorder}`, zIndex: 100 }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: theme.text }}>☰</button>
          <h1 style={{ color: theme.text, fontSize: '16px', margin: 0 }}>TimeTrack NZ</h1>
          <button onClick={() => setDark(!dark)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>{dark ? '☀️' : '🌙'}</button>
        </div>
      )}

      {/* Sidebar / Mobile Menu */}
      {(sidebarOpen || !isMobile) && (
        <>
          {isMobile && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 199 }} onClick={() => setSidebarOpen(false)} />}
          <div style={{ 
            width: isMobile ? '280px' : '220px', 
            background: theme.sidebar, 
            padding: '20px', 
            borderRight: `1px solid ${theme.sidebarBorder}`,
            position: isMobile ? 'fixed' : 'relative',
            top: 0, left: 0, bottom: 0,
            zIndex: isMobile ? 200 : 1,
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ color: theme.text, margin: 0, fontSize: '18px' }}>TimeTrack NZ</h2>
              {isMobile && <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: theme.textMuted }}>×</button>}
            </div>
            
            {navItems.map(item => (
              <button key={item.id} onClick={() => navigateTo(item.id)} style={{ display: 'block', width: '100%', padding: '14px 12px', marginBottom: '6px', borderRadius: '8px', border: 'none', background: view === item.id ? theme.primary : 'transparent', color: view === item.id ? 'white' : theme.textMuted, textAlign: 'left', cursor: 'pointer', fontWeight: view === item.id ? '600' : '400', fontSize: '14px' }}>{item.label}</button>
            ))}
            
            {!isMobile && (
              <div style={{ marginTop: '24px', padding: '12px', background: theme.cardAlt, borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: theme.textMuted, fontSize: '14px' }}>{dark ? '🌙 Dark' : '☀️ Light'}</span>
                  <button onClick={() => setDark(!dark)} style={{ width: '50px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer', background: dark ? theme.primary : '#cbd5e1', position: 'relative' }}>
                    <span style={{ position: 'absolute', top: '3px', width: '20px', height: '20px', borderRadius: '50%', background: 'white', left: dark ? '27px' : '3px', transition: 'left 0.2s' }} />
                  </button>
                </div>
              </div>
            )}
            
            <button onClick={() => signOut(auth)} style={{ marginTop: '16px', padding: '12px', width: '100%', borderRadius: '8px', border: `1px solid ${theme.cardBorder}`, background: 'transparent', color: theme.textMuted, cursor: 'pointer', fontSize: '14px' }}>Sign Out</button>
          </div>
        </>
      )}

      {/* Main Content */}
      <div style={{ flex: 1, padding: isMobile ? '70px 16px 16px' : '24px', overflowY: 'auto', minHeight: '100vh' }}>
        {error && <div style={{ background: theme.dangerBg, color: theme.danger, padding: '12px', borderRadius: '8px', marginBottom: '16px', border: `1px solid ${theme.danger}` }}>{error} <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', color: theme.danger, cursor: 'pointer', fontWeight: 'bold' }}>×</button></div>}
        {success && <div style={{ background: theme.successBg, color: theme.success, padding: '12px', borderRadius: '8px', marginBottom: '16px', border: `1px solid ${theme.success}` }}>{success}</div>}

        {/* Live View */}
        {view === 'live' && (
          <div>
            <h1 style={{ color: theme.text, marginBottom: '24px', fontSize: isMobile ? '22px' : '28px' }}>Live View</h1>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {activeShifts.length === 0 ? (
                <div style={styles.card}><p style={{ color: theme.textMuted }}>No employees clocked in</p></div>
              ) : activeShifts.map(sh => {
                const isTraveling = hasActiveTravel(sh);
                const isOnBreak = (sh.breaks || []).some(b => !b.endTime && !b.manualEntry);
                const travelTime = calcTravel(sh.travelSegments || []);
                
                return (
                  <div key={sh.id} style={{ ...styles.card, cursor: 'pointer' }} onClick={() => sh.locationHistory?.length > 0 && setMapModal({ locations: sh.locationHistory, title: `${employees.find(e => e.id === sh.userId)?.name || sh.userEmail} - Location` })}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                      <div>
                        <p style={{ color: theme.text, fontWeight: '600', fontSize: '16px', wordBreak: 'break-all' }}>{employees.find(e => e.id === sh.userId)?.name || sh.userEmail}</p>
                        <p style={{ color: theme.textMuted, fontSize: '14px' }}>In: {fmtTime(sh.clockIn)}</p>
                      </div>
                      <span style={{ 
                        background: isTraveling ? theme.travelBg : isOnBreak ? theme.warningBg : theme.successBg, 
                        color: isTraveling ? theme.travel : isOnBreak ? theme.warning : theme.success, 
                        padding: '4px 12px', 
                        borderRadius: '20px', 
                        fontSize: '12px', 
                        fontWeight: '600', 
                        flexShrink: 0 
                      }}>
                        {isTraveling ? '🚗 Traveling' : isOnBreak ? '☕ Break' : 'Active'}
                      </span>
                    </div>
                    <p style={{ color: theme.text, fontSize: '28px', fontWeight: '700', margin: '12px 0' }}>{fmtDur(getHours(sh.clockIn) * 60)}</p>
                    
                    {/* Travel time display */}
                    {travelTime > 0 && (
                      <p style={{ color: theme.travel, fontSize: '14px', marginBottom: '8px' }}>🚗 {travelTime}m travel time</p>
                    )}
                    
                    {sh.locationHistory?.length > 0 && (
                      <>
                        <LocationMap locations={sh.locationHistory} height="150px" />
                        <button onClick={(e) => { e.stopPropagation(); setMapModal({ locations: sh.locationHistory, title: `${employees.find(emp => emp.id === sh.userId)?.name || sh.userEmail} - Location` }); }} style={{ marginTop: '8px', padding: '10px', borderRadius: '8px', border: `1px solid ${theme.cardBorder}`, background: theme.cardAlt, color: theme.text, cursor: 'pointer', width: '100%', fontSize: '13px' }}>📍 View Full Map ({sh.locationHistory.length} points)</button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: '32px', display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '12px' }}>
              <div style={{ ...styles.card, textAlign: 'center' }}><p style={{ color: theme.success, fontSize: isMobile ? '24px' : '32px', fontWeight: '700' }}>{activeShifts.length}</p><p style={{ color: theme.textMuted, fontSize: '13px' }}>Clocked In</p></div>
              <div style={{ ...styles.card, textAlign: 'center' }}><p style={{ color: theme.primary, fontSize: isMobile ? '24px' : '32px', fontWeight: '700' }}>{employees.length}</p><p style={{ color: theme.textMuted, fontSize: '13px' }}>Employees</p></div>
              <div style={{ ...styles.card, textAlign: 'center' }}><p style={{ color: theme.warning, fontSize: isMobile ? '24px' : '32px', fontWeight: '700' }}>{allShifts.filter(s => s.clockIn?.toDate?.()?.toDateString?.() === new Date().toDateString()).length}</p><p style={{ color: theme.textMuted, fontSize: '13px' }}>Today</p></div>
              <div style={{ ...styles.card, textAlign: 'center' }}><p style={{ color: '#8b5cf6', fontSize: isMobile ? '24px' : '32px', fontWeight: '700' }}>{messages.length}</p><p style={{ color: theme.textMuted, fontSize: '13px' }}>Messages</p></div>
            </div>
          </div>
        )}

        {/* My Timesheet */}
        {view === 'mysheet' && (
          <div>
            <h1 style={{ color: theme.text, marginBottom: '24px', fontSize: isMobile ? '22px' : '28px' }}>My Timesheet</h1>
            
            {/* Clock Card */}
            <div style={styles.card}>
              <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                <span style={{ display: 'inline-block', padding: '8px 20px', borderRadius: '24px', fontSize: '14px', fontWeight: '600', background: myShift ? (onBreak ? theme.warningBg : theme.successBg) : theme.cardAlt, color: myShift ? (onBreak ? theme.warning : theme.success) : theme.textMuted }}>
                  {myShift ? (onBreak ? '☕ On Break' : '✓ Clocked In') : 'Not Clocked In'}
                </span>
              </div>
              
              {myShift && (
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                  <p style={{ color: theme.textMuted, fontSize: '14px' }}>Started at {fmtTime(myShift.clockIn)}</p>
                  <p style={{ color: theme.text, fontSize: isMobile ? '40px' : '48px', fontWeight: '700', margin: '8px 0' }}>{fmtDur(getHours(myShift.clockIn) * 60)}</p>
                  {onBreak && breakStart && <p style={{ color: theme.warning, fontSize: '14px' }}>Break started {breakStart.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' })}</p>}
                  {calcTravel(myShift.travelSegments || []) > 0 && <p style={{ color: theme.travel, fontSize: '14px' }}>🚗 {calcTravel(myShift.travelSegments || [])}m travel</p>}
                </div>
              )}
              
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                {!myShift ? (
                  <button onClick={myClockIn} style={{ ...styles.btn, background: theme.success, padding: '16px 48px', fontSize: '16px' }}>Clock In</button>
                ) : (
                  <>
                    {!onBreak ? <button onClick={myStartBreak} style={{ ...styles.btn, background: theme.warning, padding: '14px 28px' }}>Start Break</button> : <button onClick={myEndBreak} style={{ ...styles.btn, padding: '14px 28px' }}>End Break</button>}
                    <button onClick={myClockOut} style={{ ...styles.btnDanger, padding: '14px 28px' }}>Clock Out</button>
                  </>
                )}
              </div>
            </div>
            
            {/* Quick Add Breaks */}
            {myShift && !onBreak && (
              <div style={styles.card}>
                <h3 style={{ color: theme.text, marginBottom: '12px', fontSize: '16px' }}>Quick Add Break</h3>
                <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '12px' }}>Forgot to start timer? Add break time:</p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[10, 15, 20, 30].map(mins => (
                    <button key={mins} onClick={() => myAddBreak(mins)} style={{ padding: '12px 20px', borderRadius: '8px', border: `1px solid ${theme.cardBorder}`, background: theme.cardAlt, color: theme.text, cursor: 'pointer', fontWeight: '600' }}>{mins}m</button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Break Summary */}
            {myShift && (myShift.breaks?.length > 0 || calcTravel(myShift.travelSegments || []) > 0) && (
              <div style={styles.card}>
                <h3 style={{ color: theme.text, marginBottom: '12px', fontSize: '16px' }}>Today's Breaks & Travel</h3>
                {myShift.breaks?.length > 0 && myShift.breaks.map((b, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${theme.cardBorder}` }}>
                    <span style={{ color: theme.textMuted, fontSize: '14px' }}>{b.manualEntry ? `Break ${i + 1} (added)` : `Break ${i + 1}: ${fmtTime(b.startTime)} - ${b.endTime ? fmtTime(b.endTime) : 'ongoing'}`}</span>
                    <span style={{ color: theme.text, fontWeight: '600' }}>{b.durationMinutes ? `${b.durationMinutes}m` : '...'}</span>
                  </div>
                ))}
                {(myShift.travelSegments || []).length > 0 && (
                  <>
                    <p style={{ color: theme.textMuted, fontSize: '12px', marginTop: '12px', marginBottom: '8px', fontWeight: '600' }}>TRAVEL</p>
                    {myShift.travelSegments!.map((t, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${theme.cardBorder}` }}>
                        <span style={{ color: theme.textMuted, fontSize: '14px' }}>🚗 Travel {i + 1}: {fmtTime(t.startTime)} - {t.endTime ? fmtTime(t.endTime) : 'ongoing'}</span>
                        <span style={{ color: theme.travel, fontWeight: '600' }}>{t.durationMinutes ? `${t.durationMinutes}m` : '...'}</span>
                      </div>
                    ))}
                  </>
                )}
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${theme.cardBorder}` }}>
                  {(() => { const h = getHours(myShift.clockIn); const b = calcBreaks(myShift.breaks || [], h); const travel = calcTravel(myShift.travelSegments || []); return (<><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}><span style={{ color: theme.success }}>Paid breaks:</span><span style={{ color: theme.success, fontWeight: '600' }}>{b.paid}m</span></div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}><span style={{ color: theme.warning }}>Unpaid breaks:</span><span style={{ color: theme.warning, fontWeight: '600' }}>{b.unpaid}m</span></div>{travel > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}><span style={{ color: theme.travel }}>Travel:</span><span style={{ color: theme.travel, fontWeight: '600' }}>{travel}m</span></div>}</>); })()}
                </div>
              </div>
            )}
            
            {/* Notes */}
            {myShift && (
              <div style={styles.card}>
                <h3 style={{ color: theme.text, marginBottom: '12px', fontSize: '16px' }}>Notes</h3>
                <textarea placeholder="Add notes for today..." value={myNotes} onChange={e => setMyNotes(e.target.value)} onBlur={saveMyNotes} rows={4} style={{ ...styles.input, resize: 'vertical', fontFamily: 'inherit' }} />
                <p style={{ color: theme.textLight, fontSize: '12px', marginTop: '8px' }}>Auto-saves when you click/tap away</p>
              </div>
            )}
            
            {/* My History */}
            <h2 style={{ color: theme.text, margin: '32px 0 16px', fontSize: '18px' }}>My Shift History</h2>
            {myShiftHistory.length === 0 ? (
              <div style={styles.card}><p style={{ color: theme.textMuted }}>No completed shifts yet</p></div>
            ) : myShiftHistory.map(sh => {
              const h = getHours(sh.clockIn, sh.clockOut); const b = calcBreaks(sh.breaks || [], h); const travel = calcTravel(sh.travelSegments || []); const worked = (h * 60) - b.unpaid;
              return (
                <div key={sh.id} style={styles.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div><p style={{ color: theme.text, fontWeight: '600' }}>{fmtDate(sh.clockIn)}</p><p style={{ color: theme.textMuted, fontSize: '14px' }}>{fmtTime(sh.clockIn)} - {fmtTime(sh.clockOut)}</p></div>
                    <div style={{ textAlign: 'right' }}><p style={{ color: theme.text, fontWeight: '700', fontSize: '18px' }}>{fmtDur(worked)}</p><p style={{ color: theme.textMuted, fontSize: '12px' }}>worked</p></div>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '13px', flexWrap: 'wrap' }}>
                    <span style={{ color: theme.success }}>Paid: {b.paid}m</span>
                    <span style={{ color: theme.warning }}>Unpaid: {b.unpaid}m</span>
                    {travel > 0 && <span style={{ color: theme.travel }}>🚗 Travel: {travel}m</span>}
                  </div>
                  {sh.jobLog?.notes && <p style={{ color: theme.textMuted, fontSize: '13px', marginTop: '8px', fontStyle: 'italic' }}>📝 {sh.jobLog.notes}</p>}
                </div>
              );
            })}
          </div>
        )}

        {/* Employees */}
        {view === 'employees' && (
          <div>
            <h1 style={{ color: theme.text, marginBottom: '24px', fontSize: isMobile ? '22px' : '28px' }}>Employees</h1>
            <div style={styles.card}>
              <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Invite Employee</h3>
              <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '12px' }}>Add an employee - then send them an email or copy the invite link.</p>
              <form onSubmit={inviteEmployee} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <input placeholder="Name" value={newEmpName} onChange={e => setNewEmpName(e.target.value)} style={{ ...styles.input, flex: '1', minWidth: '120px' }} />
                <input type="email" placeholder="Email" required value={newEmpEmail} onChange={e => setNewEmpEmail(e.target.value)} style={{ ...styles.input, flex: '1', minWidth: '180px' }} />
                <button type="submit" style={styles.btn}>Add Employee</button>
              </form>
            </div>
            
            {/* Pending Invites */}
            {invites.filter(i => i.status === 'pending').length > 0 && (
              <div style={styles.card}>
                <h3 style={{ color: theme.warning, marginBottom: '16px', fontSize: '16px' }}>⏳ Pending Invites</h3>
                {invites.filter(i => i.status === 'pending').map(inv => (
                  <div key={inv.id} style={{ padding: '16px', background: theme.cardAlt, borderRadius: '8px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <p style={{ color: theme.text, fontWeight: '600' }}>{inv.name || inv.email}</p>
                        <p style={{ color: theme.textMuted, fontSize: '13px' }}>{inv.email}</p>
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
              const h = getHours(sh.clockIn, sh.clockOut); const b = calcBreaks(sh.breaks || [], h); const travel = calcTravel(sh.travelSegments || []); const worked = (h * 60) - b.unpaid; const isOpen = selectedShift === sh.id;
              return (
                <div key={sh.id} style={{ ...styles.card, cursor: 'pointer' }} onClick={() => setSelectedShift(isOpen ? null : sh.id)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div><p style={{ color: theme.text, fontWeight: '600', wordBreak: 'break-all' }}>{sh.userEmail}</p><p style={{ color: theme.textMuted, fontSize: '14px' }}>{fmtDate(sh.clockIn)} • {fmtTime(sh.clockIn)} - {sh.clockOut ? fmtTime(sh.clockOut) : 'Active'}</p></div>
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
                      
                      {sh.jobLog?.notes && <div style={{ background: theme.cardAlt, padding: '12px', borderRadius: '8px', marginBottom: '12px' }}><p style={{ color: theme.textMuted, fontSize: '12px' }}>📝 Notes</p><p style={{ color: theme.text, fontSize: '14px', whiteSpace: 'pre-wrap' }}>{sh.jobLog.notes}</p></div>}
                      {sh.locationHistory?.length > 0 && (
                        <div>
                          <LocationMap locations={sh.locationHistory} />
                          <button onClick={() => setMapModal({ locations: sh.locationHistory, title: `${sh.userEmail} - ${fmtDateShort(sh.clockIn)}` })} style={{ marginTop: '8px', padding: '10px', borderRadius: '8px', border: `1px solid ${theme.cardBorder}`, background: theme.cardAlt, color: theme.text, cursor: 'pointer', fontSize: '13px' }}>View Full Map ({sh.locationHistory.length} points)</button>
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
                <div style={{ flex: '1', minWidth: '180px' }}><label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Employee</label><select value={reportEmp} onChange={e => setReportEmp(e.target.value)} style={styles.input}><option value="all">All</option>{employees.map(e => <option key={e.id} value={e.id}>{e.email}</option>)}</select></div>
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
                    <tbody>{reportData.map(sh => { const h = getHours(sh.clockIn, sh.clockOut); const b = calcBreaks(sh.breaks||[], h); const travel = calcTravel(sh.travelSegments || []); return <tr key={sh.id} style={{ borderBottom: `1px solid ${theme.cardBorder}` }}><td style={{ padding: '12px 8px', color: theme.text, fontSize: '13px' }}>{fmtDateShort(sh.clockIn)}</td><td style={{ padding: '12px 8px', color: theme.text, fontSize: '13px' }}>{sh.userEmail}</td><td style={{ padding: '12px 8px', color: theme.textMuted, fontSize: '13px' }}>{fmtTime(sh.clockIn)}</td><td style={{ padding: '12px 8px', color: theme.textMuted, fontSize: '13px' }}>{sh.clockOut ? fmtTime(sh.clockOut) : '-'}</td><td style={{ padding: '12px 8px', color: theme.text, fontWeight: '600', fontSize: '13px' }}>{fmtDur((h*60)-b.unpaid)}</td><td style={{ padding: '12px 8px', color: theme.success, fontSize: '13px' }}>{b.paid}m</td><td style={{ padding: '12px 8px', color: theme.warning, fontSize: '13px' }}>{b.unpaid}m</td><td style={{ padding: '12px 8px', color: theme.travel, fontSize: '13px' }}>{travel}m</td></tr>; })}</tbody>
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
              ) : messages.filter(m => m.type === chatTab || (chatTab === 'dm' && m.type === 'dm')).map(m => (
                <div key={m.id} style={{ display: 'flex', justifyContent: m.senderId === 'employer' ? 'flex-end' : 'flex-start', marginBottom: '12px' }}>
                  <div style={{ maxWidth: '75%', padding: '10px 14px', borderRadius: '12px', background: m.senderId === 'employer' ? theme.primary : theme.cardAlt }}>
                    {m.senderId !== 'employer' && <p style={{ color: theme.textMuted, fontSize: '11px', marginBottom: '4px' }}>{m.senderEmail}</p>}
                    <p style={{ color: m.senderId === 'employer' ? 'white' : theme.text, fontSize: '14px' }}>{m.text}</p>
                    <p style={{ color: m.senderId === 'employer' ? 'rgba(255,255,255,0.6)' : theme.textLight, fontSize: '10px', marginTop: '4px' }}>{fmtTime(m.timestamp)}</p>
                  </div>
                </div>
              ))}
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