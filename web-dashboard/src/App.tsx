import { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User, createUserWithEmailAndPassword, deleteUser, sendPasswordResetEmail } from 'firebase/auth';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, setDoc, query, where, orderBy, onSnapshot, Timestamp, writeBatch, arrayUnion } from 'firebase/firestore';
import { auth, db, MOBILE_APP_URL } from './shared/firebase';
import { Location, Break, TravelSegment, Shift, Employee, EmployeeSettings, ChatMessage, CompanySettings, Invite, Theme, Company, Expense } from './shared/types';
import { lightTheme, darkTheme } from './shared/theme';
import { defaultSettings, defaultCompanySettings, getHours, calcBreaks, calcTravel, fmtDur, fmtTime, fmtDate, fmtDateShort, getWeekEndingDate, getWeekEndingKey } from './shared/utils';
import { MapModal, LocationMap } from './components/MapModal';
import { EditShiftModal } from './components/EditShiftModal';

// Lazy load views for code splitting
const LiveView = lazy(() => import('./views/LiveView').then(m => ({ default: m.LiveView })));
const MyTimesheetView = lazy(() => import('./views/MyTimesheetView').then(m => ({ default: m.MyTimesheetView })));
const EmployeesView = lazy(() => import('./views/EmployeesView').then(m => ({ default: m.EmployeesView })));
const TimesheetsView = lazy(() => import('./views/TimesheetsView').then(m => ({ default: m.TimesheetsView })));
const ReportsView = lazy(() => import('./views/ReportsView').then(m => ({ default: m.ReportsView })));
const ChatView = lazy(() => import('./views/ChatView').then(m => ({ default: m.ChatView })));
const SettingsView = lazy(() => import('./views/SettingsView').then(m => ({ default: m.SettingsView })));
const ExpensesView = lazy(() => import('./views/ExpensesView').then(m => ({ default: m.ExpensesView })));

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [dark, setDark] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [signupName, setSignupName] = useState('');
  const [companyName, setCompanyName] = useState('');  // NEW: For signup
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [view, setView] = useState('live');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [activeShifts, setActiveShifts] = useState<Shift[]>([]);
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [approvingExpense, setApprovingExpense] = useState<string | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<string | null>(null);
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
  const [clockingIn, setClockingIn] = useState(false);
  const [clockingOut, setClockingOut] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  const [breakStart, setBreakStart] = useState<Date | null>(null);
  const [myField1, setMyField1] = useState('');
  const [myField2, setMyField2] = useState('');
  const [myField3, setMyField3] = useState('');
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings>(defaultCompanySettings);
  const [myCurrentLocation, setMyCurrentLocation] = useState<Location | null>(null);
  const [myTraveling, setMyTraveling] = useState(false);
  const [myTravelStart, setMyTravelStart] = useState<Date | null>(null);
  const gpsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [showAddManualShift, setShowAddManualShift] = useState(false);
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [manualStartHour, setManualStartHour] = useState('7');
  const [manualStartMinute, setManualStartMinute] = useState('00');
  const [manualStartAmPm, setManualStartAmPm] = useState<'AM' | 'PM'>('AM');
  const [manualEndHour, setManualEndHour] = useState('5');
  const [manualEndMinute, setManualEndMinute] = useState('00');
  const [manualEndAmPm, setManualEndAmPm] = useState<'AM' | 'PM'>('PM');
  const [manualBreaks, setManualBreaks] = useState<number[]>([]);
  const [manualTravel, setManualTravel] = useState<number[]>([]);
  const [manualNotes, setManualNotes] = useState('');
  const [addingManualShift, setAddingManualShift] = useState(false);
  const [expandedMyShifts, setExpandedMyShifts] = useState<Set<string>>(new Set());
  const [editingMyShift, setEditingMyShift] = useState<string | null>(null);
  const [myEditMode, setMyEditMode] = useState<'breaks' | 'travel' | 'times' | null>(null);
  const [addTravelStartHour, setAddTravelStartHour] = useState('7');
  const [addTravelStartMinute, setAddTravelStartMinute] = useState('00');
  const [addTravelStartAmPm, setAddTravelStartAmPm] = useState<'AM' | 'PM'>('AM');
  const [addTravelEndHour, setAddTravelEndHour] = useState('8');
  const [addTravelEndMinute, setAddTravelEndMinute] = useState('00');
  const [addTravelEndAmPm, setAddTravelEndAmPm] = useState<'AM' | 'PM'>('AM');
  const [addingTravelToShift, setAddingTravelToShift] = useState(false);
  const [addingBreakToShift, setAddingBreakToShift] = useState(false);
  const [editingCompanySettings, setEditingCompanySettings] = useState<CompanySettings>(defaultCompanySettings);
  const [savingCompanySettings, setSavingCompanySettings] = useState(false);
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [timesheetFilterStart, setTimesheetFilterStart] = useState('');
  const [timesheetFilterEnd, setTimesheetFilterEnd] = useState('');
  const [finalizingWeek, setFinalizingWeek] = useState<string | null>(null);
  const [timesheetEditingShiftId, setTimesheetEditingShiftId] = useState<string | null>(null);
  const [timesheetEditMode, setTimesheetEditMode] = useState<'breaks' | 'travel' | null>(null);
  const [timesheetDeleteConfirmId, setTimesheetDeleteConfirmId] = useState<string | null>(null);
  const [deletingTimesheetShift, setDeletingTimesheetShift] = useState(false);

  // NEW: Multi-tenant state
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loadingCompany, setLoadingCompany] = useState(false);

  const theme = dark ? darkTheme : lightTheme;
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => { const handleResize = () => setIsMobile(window.innerWidth < 768); window.addEventListener('resize', handleResize); return () => window.removeEventListener('resize', handleResize); }, []);
  
  // Auth state listener
  useEffect(() => { return onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); }); }, []);

  // NEW: Load companyId - check both companies (owner) and employees
  useEffect(() => {
    if (!user) {
      console.log('[DEBUG] No user, setting companyId to null');
      setCompanyId(null);
      return;
    }
    console.log('[DEBUG] User logged in:', user.uid, user.email);
    setLoadingCompany(true);
    const loadCompanyId = async () => {
      try {
        // First: check if user owns a company
        console.log('[DEBUG] Querying companies where ownerId ==', user.uid);
        const companiesQuery = query(collection(db, 'companies'), where('ownerId', '==', user.uid));
        const companiesSnap = await getDocs(companiesQuery);
        console.log('[DEBUG] Companies query result:', companiesSnap.size, 'docs found');
        if (!companiesSnap.empty) {
          const foundCompanyId = companiesSnap.docs[0].id;
          console.log('[DEBUG] Found company as owner:', foundCompanyId);
          setCompanyId(foundCompanyId);
          setLoadingCompany(false);
          return;
        }
        
        // Fallback: check employees collection
        console.log('[DEBUG] No company owned, checking employees collection for', user.uid);
        const empDoc = await getDoc(doc(db, 'employees', user.uid));
        if (empDoc.exists()) {
          const empCompanyId = empDoc.data().companyId || null;
          console.log('[DEBUG] Found employee doc with companyId:', empCompanyId);
          setCompanyId(empCompanyId);
        } else {
          console.log('[DEBUG] No employee doc found, setting companyId to null');
          setCompanyId(null);
        }
      } catch (err) {
        console.error('[DEBUG] Error loading company:', err);
        setCompanyId(null);
      } finally {
        setLoadingCompany(false);
      }
    };
    loadCompanyId();
  }, [user]);

  // UPDATED: All Firestore listeners now filter by companyId
  useEffect(() => { 
    if (!user || !companyId) return; 
    return onSnapshot(
      query(collection(db, 'employees'), where('companyId', '==', companyId)), 
      (snap) => { setEmployees(snap.docs.map(d => ({ id: d.id, ...d.data() } as Employee))); }
    ); 
  }, [user, companyId]);

  useEffect(() => { 
    if (!user || !companyId) return; 
    return onSnapshot(
      query(collection(db, 'invites'), where('companyId', '==', companyId)), 
      (snap) => { setInvites(snap.docs.map(d => ({ id: d.id, ...d.data() } as Invite))); }
    ); 
  }, [user, companyId]);

  useEffect(() => { 
    if (!user || !companyId) {
      console.log('[DEBUG] Active shifts listener - skipping. user:', !!user, 'companyId:', companyId);
      return; 
    }
    console.log('[DEBUG] Setting up active shifts listener for companyId:', companyId);
    return onSnapshot(
      query(collection(db, 'shifts'), where('companyId', '==', companyId), where('status', '==', 'active')), 
      (snap) => { 
        console.log('[DEBUG] Active shifts snapshot:', snap.size, 'shifts found');
        setActiveShifts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Shift))); 
      }
    ); 
  }, [user, companyId]);

  useEffect(() => { 
    if (!user || !companyId) return; 
    return onSnapshot(
      query(collection(db, 'shifts'), where('companyId', '==', companyId), orderBy('clockIn', 'desc')), 
      (snap) => { setAllShifts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Shift))); }
    ); 
  }, [user, companyId]);

  useEffect(() => { 
    if (!user || !companyId) return; 
    return onSnapshot(
      query(collection(db, 'messages'), where('companyId', '==', companyId), orderBy('timestamp', 'desc')), 
      (snap) => { setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as ChatMessage)).reverse()); }
    ); 
  }, [user, companyId]);

  // NEW: Expenses listener
  useEffect(() => { 
    if (!user || !companyId) return; 
    return onSnapshot(
      query(collection(db, 'expenses'), where('companyId', '==', companyId), orderBy('createdAt', 'desc')), 
      (snap) => { setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense))); }
    ); 
  }, [user, companyId]);

  // UPDATED: Company settings now stored in companies/{companyId}
  useEffect(() => { 
    if (!user || !companyId) return; 
    return onSnapshot(doc(db, 'companies', companyId), (snap) => { 
      if (snap.exists()) { 
        const data = snap.data();
        const settings = data.settings as CompanySettings || defaultCompanySettings;
        setCompanySettings({ ...defaultCompanySettings, ...settings }); 
        setEditingCompanySettings({ ...defaultCompanySettings, ...settings }); 
      } 
    }); 
  }, [user, companyId]);

  useEffect(() => { if (!user) return; const myActive = activeShifts.find(s => s.userId === user.uid); setMyShift(myActive || null); if (myActive) { const ab = myActive.breaks?.find(b => !b.endTime && !b.manualEntry); setOnBreak(!!ab); setBreakStart(ab ? ab.startTime.toDate() : null); setMyField1(myActive.jobLog?.field1 || ''); setMyField2(myActive.jobLog?.field2 || ''); setMyField3(myActive.jobLog?.field3 || ''); } else { setOnBreak(false); setBreakStart(null); } }, [user, activeShifts]);
  useEffect(() => { if (!user) return; const hist = allShifts.filter(s => s.userId === user.uid && s.status === 'completed').slice(0, 20); setMyShiftHistory(hist); }, [user, allShifts]);
  useEffect(() => { if (myShift) { const activeTravel = myShift.travelSegments?.find(t => !t.endTime); setMyTraveling(!!activeTravel); setMyTravelStart(activeTravel ? activeTravel.startTime.toDate() : null); } else { setMyTraveling(false); setMyTravelStart(null); } }, [myShift]);

  // GPS tracking
  useEffect(() => {
    if (!user || !myShift) { if (gpsIntervalRef.current) { clearInterval(gpsIntervalRef.current); gpsIntervalRef.current = null; } return; }
    const trackLocation = async () => { const location = await getMyCurrentLocation(); if (location && myShift) { try { await updateDoc(doc(db, 'shifts', myShift.id), { locationHistory: arrayUnion(location) }); } catch (err) { console.error('Error updating location:', err); } } };
    trackLocation();
    gpsIntervalRef.current = setInterval(trackLocation, 10 * 60 * 1000);
    return () => { if (gpsIntervalRef.current) { clearInterval(gpsIntervalRef.current); gpsIntervalRef.current = null; } };
  }, [user, myShift?.id]);

  const getMyCurrentLocation = (): Promise<Location | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        (position) => { const loc: Location = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: Date.now() }; setMyCurrentLocation(loc); resolve(loc); },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  const getEmployeeInfo = (userId?: string, userEmail?: string): { name: string, email: string, exists: boolean } => {
    if (userId) { const emp = employees.find(e => e.id === userId); if (emp) return { name: emp.name || emp.email.split('@')[0], email: emp.email, exists: true }; }
    if (userEmail) { const emp = employees.find(e => e.email === userEmail); if (emp) return { name: emp.name || emp.email.split('@')[0], email: emp.email, exists: true }; return { name: userEmail.split('@')[0], email: userEmail, exists: false }; }
    return { name: 'Unknown', email: '', exists: false };
  };
  const getEmployeeName = (userId?: string, userEmail?: string): string => getEmployeeInfo(userId, userEmail).name;

  const handleLogin = async (e: React.FormEvent) => { e.preventDefault(); try { await signInWithEmailAndPassword(auth, email, password); } catch (err: any) { setError(err.message); } };
  
  // UPDATED: Signup now creates a company first, then employee with companyId
  const handleSignUp = async (e: React.FormEvent) => { 
    e.preventDefault(); 
    if (!companyName.trim()) {
      setError('Please enter your company/business name');
      return;
    }
    try { 
      const cred = await createUserWithEmailAndPassword(auth, email, password); 
      
      // Create company document first
      const companyRef = await addDoc(collection(db, 'companies'), {
        name: companyName.trim(),
        ownerId: cred.user.uid,
        ownerEmail: email,
        createdAt: Timestamp.now(),
        plan: 'free',
        settings: defaultCompanySettings
      });
      
      // Create employee with companyId
      await setDoc(doc(db, 'employees', cred.user.uid), { 
        companyId: companyRef.id,  // NEW: Link to company
        email, 
        name: signupName, 
        role: 'manager', 
        settings: defaultSettings, 
        createdAt: Timestamp.now() 
      }); 

      // Set local state
      setCompanyId(companyRef.id);
    } catch (err: any) { setError(err.message); } 
  };

  const handleResetPassword = async (e: React.FormEvent) => { e.preventDefault(); try { await sendPasswordResetEmail(auth, email); setSuccess('Password reset email sent!'); setAuthMode('signin'); } catch (err: any) { setError(err.message); } };
  const navigateTo = (v: string) => { setView(v); setSidebarOpen(false); };

  const updateSettings = async (empId: string, updates: Partial<EmployeeSettings>) => { const ref = doc(db, 'employees', empId); const snap = await getDoc(ref); await updateDoc(ref, { settings: { ...(snap.data()?.settings || defaultSettings), ...updates } }); setSuccess('Updated!'); setTimeout(() => setSuccess(''), 2000); };
  
  // UPDATED: Save to companies/{companyId} instead of company/settings
  const saveCompanySettings = async () => { 
    if (!companyId) return;
    setSavingCompanySettings(true); 
    try { 
      await updateDoc(doc(db, 'companies', companyId), { settings: editingCompanySettings }); 
      setSuccess('Saved!'); 
      setTimeout(() => setSuccess(''), 2000); 
    } catch (err: any) { setError(err.message); } 
    finally { setSavingCompanySettings(false); } 
  };

  // UPDATED: Include companyId in invite
  const inviteEmployee = async (e: React.FormEvent) => { 
    e.preventDefault(); 
    if (!newEmpEmail || !companyId) return; 
    await addDoc(collection(db, 'invites'), { 
      companyId,  // NEW
      email: newEmpEmail.toLowerCase(), 
      name: newEmpName, 
      status: 'pending', 
      createdAt: Timestamp.now() 
    }); 
    setNewEmpEmail(''); 
    setNewEmpName(''); 
    setSuccess('Invite created!'); 
  };

  const cancelInvite = async (id: string) => { await deleteDoc(doc(db, 'invites', id)); };
  const sendInviteEmail = async (inv: Invite) => { setSendingEmail(inv.id); try { const res = await fetch(`${MOBILE_APP_URL}/api/send-invite`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: inv.email, inviteId: inv.id, name: inv.name }) }); if (res.ok) { await updateDoc(doc(db, 'invites', inv.id), { emailSent: true }); setSuccess('Email sent!'); } else { setError('Failed to send'); } } catch (err) { setError('Failed to send'); } setSendingEmail(null); };
  const copyInviteLink = (inv: Invite) => { navigator.clipboard.writeText(`${MOBILE_APP_URL}/join?invite=${inv.id}`); setSuccess('Link copied!'); };
  const removeEmployee = async (empId: string) => { if (removeDeleteShifts) { const batch = writeBatch(db); allShifts.filter(s => s.userId === empId).forEach(s => batch.delete(doc(db, 'shifts', s.id))); await batch.commit(); } const emp = employees.find(e => e.id === empId); if (emp) { try { await deleteUser(auth.currentUser!); } catch {} } await deleteDoc(doc(db, 'employees', empId)); setRemoveConfirm(null); setRemoveDeleteShifts(false); };

  const finalizeWeek = async (empEmail: string, weekKey: string, shifts: Shift[]) => { if (!user) return; setFinalizingWeek(`${empEmail}-${weekKey}`); try { const batch = writeBatch(db); shifts.forEach(shift => { batch.update(doc(db, 'shifts', shift.id), { finalized: true, finalizedAt: Timestamp.now(), finalizedBy: user.uid, finalizedByEmail: user.email }); }); await batch.commit(); setSuccess('Week finalized ✓'); setTimeout(() => setSuccess(''), 2000); } catch (err: any) { setError(err.message || 'Failed to finalize'); } setFinalizingWeek(null); };

  const handleTimesheetAddBreak = async (shiftId: string, minutes: number) => { setAddingBreakToShift(true); try { const shiftRef = doc(db, 'shifts', shiftId); const now = Timestamp.now(); await updateDoc(shiftRef, { breaks: arrayUnion({ startTime: now, endTime: now, durationMinutes: minutes, manualEntry: true }), editedAt: now, editedBy: user?.uid, editedByEmail: user?.email }); setSuccess(`${minutes}m break added`); setTimeout(() => setSuccess(''), 2000); } catch (err: any) { setError(err.message || 'Failed to add break'); } setAddingBreakToShift(false); };
  const handleTimesheetAddTravel = async (shiftId: string, minutes: number) => { setAddingTravelToShift(true); try { const shiftRef = doc(db, 'shifts', shiftId); const now = Timestamp.now(); await updateDoc(shiftRef, { travelSegments: arrayUnion({ startTime: now, endTime: now, durationMinutes: minutes }), editedAt: now, editedBy: user?.uid, editedByEmail: user?.email }); setSuccess(`${minutes}m travel added`); setTimeout(() => setSuccess(''), 2000); } catch (err: any) { setError(err.message || 'Failed to add travel'); } setAddingTravelToShift(false); };
  const handleTimesheetDeleteShift = async (shiftId: string) => { setDeletingTimesheetShift(true); try { await deleteDoc(doc(db, 'shifts', shiftId)); setSuccess('Shift deleted'); setTimeout(() => setSuccess(''), 2000); setTimesheetDeleteConfirmId(null); } catch (err: any) { setError(err.message || 'Failed to delete shift'); } setDeletingTimesheetShift(false); };
  const closeTimesheetEditPanel = () => { setTimesheetEditingShiftId(null); setTimesheetEditMode(null); };

  const genReport = () => { if (!reportStart || !reportEnd) { setError('Select dates'); return; } const s = new Date(reportStart); s.setHours(0,0,0,0); const e = new Date(reportEnd); e.setHours(23,59,59,999); let data = allShifts.filter(sh => { if (!sh.clockIn?.toDate) return false; const d = sh.clockIn.toDate(); return d >= s && d <= e && sh.status === 'completed'; }); if (reportEmp !== 'all') data = data.filter(sh => sh.userId === reportEmp); setReportData(data); };
  const exportCSV = () => { if (!reportData.length) return; const rows = [['Date','Employee','In','Out','Worked','Paid','Unpaid','Travel']]; reportData.forEach(sh => { const h = getHours(sh.clockIn, sh.clockOut); const b = calcBreaks(sh.breaks || [], h, companySettings.paidRestMinutes); const t = calcTravel(sh.travelSegments || []); rows.push([fmtDateShort(sh.clockIn), getEmployeeName(sh.userId, sh.userEmail), fmtTime(sh.clockIn), sh.clockOut ? fmtTime(sh.clockOut) : '-', fmtDur((h*60)-b.unpaid), b.paid+'m', b.unpaid+'m', t+'m']); }); const csv = rows.map(r => r.join(',')).join('\n'); const blob = new Blob([csv], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `timetrack-${reportStart}-${reportEnd}.csv`; a.click(); };
  const exportPDF = () => { if (!reportData.length) return; let total = 0, tPaid = 0, tUnpaid = 0; const rows = reportData.map(sh => { const h = getHours(sh.clockIn, sh.clockOut); const b = calcBreaks(sh.breaks || [], h, companySettings.paidRestMinutes); const worked = (h*60) - b.unpaid; total += worked; tPaid += b.paid; tUnpaid += b.unpaid; return `<tr><td>${fmtDateShort(sh.clockIn)}</td><td>${getEmployeeName(sh.userId, sh.userEmail)}</td><td>${fmtTime(sh.clockIn)}</td><td>${sh.clockOut ? fmtTime(sh.clockOut) : '-'}</td><td>${fmtDur(worked)}</td><td>${b.paid}m</td><td>${b.unpaid}m</td></tr>`; }).join(''); const html = `<!DOCTYPE html><html><head><style>body{font-family:Arial;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px}th{background:#1e40af;color:white}</style></head><body><h1>TimeTrack Report</h1><p>${reportStart} to ${reportEnd}</p><table><tr><th>Date</th><th>Employee</th><th>In</th><th>Out</th><th>Worked</th><th>Paid</th><th>Unpaid</th></tr>${rows}</table><h3>Total: ${fmtDur(total)}, ${tPaid}m paid, ${tUnpaid}m unpaid</h3></body></html>`; const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); w.print(); } };

  // NEW: Expense functions
  const approveExpense = async (expenseId: string) => {
    if (!user) return;
    setApprovingExpense(expenseId);
    try {
      await updateDoc(doc(db, 'expenses', expenseId), {
        status: 'approved',
        approvedAt: Timestamp.now(),
        approvedBy: user.email
      });
      setSuccess('Expense approved!');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to approve expense');
    }
    setApprovingExpense(null);
  };

  const deleteExpense = async (expenseId: string) => {
    setDeletingExpense(expenseId);
    try {
      await deleteDoc(doc(db, 'expenses', expenseId));
      setSuccess('Expense deleted');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete expense');
    }
    setDeletingExpense(null);
  };

  const exportExpensesCSV = () => {
    const approvedExpenses = expenses.filter(exp => {
      if (exp.status !== 'approved') return false;
      if (!reportStart || !reportEnd) return true;
      const s = new Date(reportStart); s.setHours(0,0,0,0);
      const e = new Date(reportEnd); e.setHours(23,59,59,999);
      const expDate: Date = exp.date?.toDate ? exp.date.toDate() : new Date(exp.date as any);
      return expDate >= s && expDate <= e;
    });
    
    if (!approvedExpenses.length) { 
      setError('No approved expenses in date range'); 
      return; 
    }
    
    const rows = [['Date', 'Employee', 'Category', 'Amount', 'Note', 'Approved By']];
    approvedExpenses.forEach(exp => {
      const expDate: Date = exp.date?.toDate ? exp.date.toDate() : new Date(exp.date as any);
      rows.push([
        expDate.toLocaleDateString('en-NZ'),
        getEmployeeName(exp.odId, exp.odEmail),
        exp.category,
        exp.amount.toFixed(2),
        exp.note || '',
        exp.approvedBy || ''
      ]);
    });
    
    const csv = rows.map(r => r.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `expenses-${reportStart || 'all'}-${reportEnd || 'all'}.csv`;
    a.click();
  };

  // UPDATED: Include companyId in messages
  const sendMsg = async () => { 
    if (!newMsg.trim() || !companyId) return; 
    await addDoc(collection(db, 'messages'), { 
      companyId,  // NEW
      type: chatTab, 
      senderId: 'employer', 
      senderEmail: 'Employer', 
      text: newMsg.trim(), 
      timestamp: Timestamp.now(), 
      participants: [] 
    }); 
    setNewMsg(''); 
  };

  const cleanup = async () => { if (!cleanupStart || !cleanupEnd || !cleanupConfirm) { setError('Select dates and confirm'); return; } const s = new Date(cleanupStart); const e = new Date(cleanupEnd); e.setHours(23,59,59); const toDelete = allShifts.filter(sh => { if (!sh.clockIn?.toDate) return false; const d = sh.clockIn.toDate(); return d >= s && d <= e && sh.status === 'completed'; }); const batch = writeBatch(db); toDelete.forEach(sh => batch.delete(doc(db, 'shifts', sh.id))); await batch.commit(); setSuccess(`Deleted ${toDelete.length} shifts`); setCleanupConfirm(false); setCleanupStart(''); setCleanupEnd(''); };

  // UPDATED: Include companyId in clock in
  const myClockIn = async () => { 
    if (!user || !companyId || clockingIn) return; 
    setClockingIn(true); 
    try { 
      const location = await getMyCurrentLocation(); 
      await addDoc(collection(db, 'shifts'), { 
        companyId,  // NEW
        userId: user.uid, 
        userEmail: user.email, 
        clockIn: Timestamp.now(), 
        clockInLocation: location, 
        locationHistory: [], 
        breaks: [], 
        travelSegments: [], 
        jobLog: { field1: '', field2: '', field3: '' }, 
        status: 'active' 
      }); 
      setSuccess('Clocked in!'); 
    } catch (err: any) { setError(err.message || 'Failed to clock in'); } 
    finally { setClockingIn(false); } 
  };

  const myClockOut = async () => { if (!myShift || clockingOut) return; setClockingOut(true); try { const location = await getMyCurrentLocation(); let ub = [...(myShift.breaks || [])]; const ai = ub.findIndex(b => !b.endTime && !b.manualEntry); if (ai !== -1 && breakStart) { ub[ai] = { ...ub[ai], endTime: Timestamp.now(), durationMinutes: Math.round((Date.now() - breakStart.getTime()) / 60000) }; } let ut = [...(myShift.travelSegments || [])]; const ti = ut.findIndex(t => !t.endTime); if (ti !== -1 && myTravelStart) { ut[ti] = { ...ut[ti], endTime: Timestamp.now(), ...(location ? { endLocation: location } : {}), durationMinutes: Math.round((Date.now() - myTravelStart.getTime()) / 60000) }; } await updateDoc(doc(db, 'shifts', myShift.id), { clockOut: Timestamp.now(), clockOutLocation: location, breaks: ub, travelSegments: ut, 'jobLog.field1': myField1, 'jobLog.field2': myField2, 'jobLog.field3': myField3, status: 'completed' }); setSuccess('Clocked out!'); } catch (err: any) { setError(err.message || 'Failed to clock out'); } finally { setClockingOut(false); } };
  const myStartBreak = async () => { if (!myShift) return; const location = await getMyCurrentLocation(); const updateData: any = { breaks: [...(myShift.breaks || []), { startTime: Timestamp.now(), manualEntry: false }] }; if (location) updateData.locationHistory = arrayUnion(location); await updateDoc(doc(db, 'shifts', myShift.id), updateData); setOnBreak(true); setBreakStart(new Date()); };
  const myEndBreak = async () => { if (!myShift || !breakStart) return; const location = await getMyCurrentLocation(); const ub = myShift.breaks.map((b, i) => i === myShift.breaks.length - 1 && !b.endTime && !b.manualEntry ? { ...b, endTime: Timestamp.now(), durationMinutes: Math.round((Date.now() - breakStart.getTime()) / 60000) } : b); const updateData: any = { breaks: ub }; if (location) updateData.locationHistory = arrayUnion(location); await updateDoc(doc(db, 'shifts', myShift.id), updateData); setOnBreak(false); setBreakStart(null); };
  const myAddBreak = async (m: number) => { if (!myShift) return; const now = Timestamp.now(); await updateDoc(doc(db, 'shifts', myShift.id), { breaks: [...(myShift.breaks || []), { startTime: now, endTime: now, durationMinutes: m, manualEntry: true }] }); };
  const saveMyField1 = async () => { if (!myShift) return; await updateDoc(doc(db, 'shifts', myShift.id), { 'jobLog.field1': myField1 }); };
  const saveMyField2 = async () => { if (!myShift) return; await updateDoc(doc(db, 'shifts', myShift.id), { 'jobLog.field2': myField2 }); };
  const saveMyField3 = async () => { if (!myShift) return; await updateDoc(doc(db, 'shifts', myShift.id), { 'jobLog.field3': myField3 }); };
  const myStartTravel = async () => { if (!myShift) return; const location = await getMyCurrentLocation(); const updateData: any = { travelSegments: [...(myShift.travelSegments || []), { startTime: Timestamp.now(), ...(location ? { startLocation: location } : {}) }] }; if (location) updateData.locationHistory = arrayUnion(location); await updateDoc(doc(db, 'shifts', myShift.id), updateData); setMyTraveling(true); setMyTravelStart(new Date()); };
  const myEndTravel = async () => { if (!myShift || !myTravelStart) return; const location = await getMyCurrentLocation(); const durationMinutes = Math.round((Date.now() - myTravelStart.getTime()) / 60000); const updatedTravel = (myShift.travelSegments || []).map((t, i, arr) => i === arr.length - 1 && !t.endTime ? { ...t, endTime: Timestamp.now(), ...(location ? { endLocation: location } : {}), durationMinutes } : t); const updateData: any = { travelSegments: updatedTravel }; if (location) updateData.locationHistory = arrayUnion(location); await updateDoc(doc(db, 'shifts', myShift.id), updateData); setMyTraveling(false); setMyTravelStart(null); };

  // UPDATED: Include companyId in manual shift
  const myAddManualShift = async () => { 
    if (!user || !companyId) return; 
    setAddingManualShift(true); 
    try { 
      let sHour = parseInt(manualStartHour); 
      if (manualStartAmPm === 'PM' && sHour !== 12) sHour += 12; 
      if (manualStartAmPm === 'AM' && sHour === 12) sHour = 0; 
      let eHour = parseInt(manualEndHour); 
      if (manualEndAmPm === 'PM' && eHour !== 12) eHour += 12; 
      if (manualEndAmPm === 'AM' && eHour === 12) eHour = 0; 
      const clockIn = new Date(manualDate); 
      clockIn.setHours(sHour, parseInt(manualStartMinute), 0, 0); 
      const clockOut = new Date(manualDate); 
      clockOut.setHours(eHour, parseInt(manualEndMinute), 0, 0); 
      if (clockOut <= clockIn) clockOut.setDate(clockOut.getDate() + 1); 
      const shiftBreaks = manualBreaks.map(mins => { const now = Timestamp.fromDate(clockIn); return { startTime: now, endTime: now, durationMinutes: mins, manualEntry: true }; }); 
      const shiftTravel = manualTravel.map(mins => { const now = Timestamp.fromDate(clockIn); return { startTime: now, endTime: now, durationMinutes: mins }; }); 
      await addDoc(collection(db, 'shifts'), { 
        companyId,  // NEW
        userId: user.uid, 
        userEmail: user.email, 
        clockIn: Timestamp.fromDate(clockIn), 
        clockOut: Timestamp.fromDate(clockOut), 
        breaks: shiftBreaks, 
        travelSegments: shiftTravel, 
        jobLog: { field1: manualNotes, field2: '', field3: '' }, 
        status: 'completed', 
        manualEntry: true, 
        locationHistory: [] 
      }); 
      setShowAddManualShift(false); 
      setManualBreaks([]); 
      setManualTravel([]); 
      setManualNotes(''); 
      setSuccess('Shift added!'); 
    } catch (err: any) { setError(err.message); } 
    setAddingManualShift(false); 
  };

  const myAddBreakToShift = async (shiftId: string, minutes: number) => { setAddingBreakToShift(true); try { const shiftRef = doc(db, 'shifts', shiftId); const shiftSnap = await getDoc(shiftRef); if (shiftSnap.exists()) { const now = Timestamp.now(); await updateDoc(shiftRef, { breaks: [...(shiftSnap.data().breaks || []), { startTime: now, endTime: now, durationMinutes: minutes, manualEntry: true }], editedAt: now, editedBy: user?.uid, editedByEmail: user?.email }); setSuccess(`${minutes}m break added ✓`); setTimeout(() => setSuccess(''), 2000); } } catch (err: any) { setError(err.message); } setAddingBreakToShift(false); };
  const myAddTravelToShift = async (shiftId: string, shiftDate: Date) => { setAddingTravelToShift(true); try { let sHour = parseInt(addTravelStartHour); if (addTravelStartAmPm === 'PM' && sHour !== 12) sHour += 12; if (addTravelStartAmPm === 'AM' && sHour === 12) sHour = 0; let eHour = parseInt(addTravelEndHour); if (addTravelEndAmPm === 'PM' && eHour !== 12) eHour += 12; if (addTravelEndAmPm === 'AM' && eHour === 12) eHour = 0; const travelStart = new Date(shiftDate); travelStart.setHours(sHour, parseInt(addTravelStartMinute), 0, 0); const travelEnd = new Date(shiftDate); travelEnd.setHours(eHour, parseInt(addTravelEndMinute), 0, 0); if (travelEnd <= travelStart) travelEnd.setDate(travelEnd.getDate() + 1); const durationMinutes = Math.round((travelEnd.getTime() - travelStart.getTime()) / 60000); if (durationMinutes <= 0 || durationMinutes > 480) { setError('Invalid travel duration'); setAddingTravelToShift(false); return; } const shiftRef = doc(db, 'shifts', shiftId); const shiftSnap = await getDoc(shiftRef); if (shiftSnap.exists()) { await updateDoc(shiftRef, { travelSegments: [...(shiftSnap.data().travelSegments || []), { startTime: Timestamp.fromDate(travelStart), endTime: Timestamp.fromDate(travelEnd), durationMinutes }], editedAt: Timestamp.now(), editedBy: user?.uid, editedByEmail: user?.email }); } setSuccess('Travel added ✓'); setTimeout(() => setSuccess(''), 2000); setMyEditMode(null); setEditingMyShift(null); } catch (err: any) { setError(err.message); } setAddingTravelToShift(false); };
  const myDeleteBreakFromShift = async (shiftId: string, breakIndex: number) => { try { const shiftRef = doc(db, 'shifts', shiftId); const shiftSnap = await getDoc(shiftRef); if (shiftSnap.exists()) { const updatedBreaks = (shiftSnap.data().breaks || []).filter((_: any, i: number) => i !== breakIndex); await updateDoc(shiftRef, { breaks: updatedBreaks, editedAt: Timestamp.now(), editedBy: user?.uid, editedByEmail: user?.email }); setSuccess('Break removed'); setTimeout(() => setSuccess(''), 2000); } } catch (err: any) { setError(err.message); } };
  const myDeleteTravelFromShift = async (shiftId: string, travelIndex: number) => { try { const shiftRef = doc(db, 'shifts', shiftId); const shiftSnap = await getDoc(shiftRef); if (shiftSnap.exists()) { const updatedTravel = (shiftSnap.data().travelSegments || []).filter((_: any, i: number) => i !== travelIndex); await updateDoc(shiftRef, { travelSegments: updatedTravel, editedAt: Timestamp.now(), editedBy: user?.uid, editedByEmail: user?.email }); setSuccess('Travel removed'); setTimeout(() => setSuccess(''), 2000); } } catch (err: any) { setError(err.message); } };
  const myDeleteShift = async (shiftId: string) => { try { await deleteDoc(doc(db, 'shifts', shiftId)); setSuccess('Shift deleted'); setTimeout(() => setSuccess(''), 2000); } catch (err: any) { setError(err.message); } };
  const toggleMyShift = (id: string) => { const n = new Set(expandedMyShifts); n.has(id) ? n.delete(id) : n.add(id); setExpandedMyShifts(n); };
  const closeMyEditPanel = () => { setEditingMyShift(null); setMyEditMode(null); };

  const toggleEmployee = (id: string) => { const n = new Set(expandedEmployees); n.has(id) ? n.delete(id) : n.add(id); setExpandedEmployees(n); };
  const toggleWeek = (k: string) => { const n = new Set(expandedWeeks); n.has(k) ? n.delete(k) : n.add(k); setExpandedWeeks(n); };

  const setThisWeek = () => { const now = new Date(); const day = now.getDay(); const diff = now.getDate() - day + (day === 0 ? -6 : 1); const monday = new Date(now.setDate(diff)); monday.setHours(0,0,0,0); const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); setTimesheetFilterStart(monday.toISOString().split('T')[0]); setTimesheetFilterEnd(sunday.toISOString().split('T')[0]); };
  const setLastWeek = () => { const now = new Date(); const day = now.getDay(); const diff = now.getDate() - day + (day === 0 ? -6 : 1) - 7; const monday = new Date(now.setDate(diff)); monday.setHours(0,0,0,0); const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); setTimesheetFilterStart(monday.toISOString().split('T')[0]); setTimesheetFilterEnd(sunday.toISOString().split('T')[0]); };
  const setThisMonth = () => { const now = new Date(); const first = new Date(now.getFullYear(), now.getMonth(), 1); const last = new Date(now.getFullYear(), now.getMonth() + 1, 0); setTimesheetFilterStart(first.toISOString().split('T')[0]); setTimesheetFilterEnd(last.toISOString().split('T')[0]); };
  const setLastMonth = () => { const now = new Date(); const first = new Date(now.getFullYear(), now.getMonth() - 1, 1); const last = new Date(now.getFullYear(), now.getMonth(), 0); setTimesheetFilterStart(first.toISOString().split('T')[0]); setTimesheetFilterEnd(last.toISOString().split('T')[0]); };
  const clearTimesheetFilter = () => { setTimesheetFilterStart(''); setTimesheetFilterEnd(''); };

  const getGroupedTimesheets = () => {
    const completedShifts = allShifts.filter(s => s.status === 'completed');
    let filteredShifts = completedShifts;
    if (timesheetFilterStart || timesheetFilterEnd) {
      filteredShifts = completedShifts.filter(s => { if (!s.clockIn?.toDate) return false; const d = s.clockIn.toDate(); if (timesheetFilterStart) { const st = new Date(timesheetFilterStart); st.setHours(0,0,0,0); if (d < st) return false; } if (timesheetFilterEnd) { const en = new Date(timesheetFilterEnd); en.setHours(23,59,59,999); if (d > en) return false; } return true; });
    }
    const grouped: Record<string, { name: string; email: string; exists: boolean; weeks: Record<string, { weekEnd: Date; shifts: Shift[]; totalMinutes: number; finalized: boolean }> }> = {};
    filteredShifts.forEach(shift => {
      const { name, email, exists } = getEmployeeInfo(shift.userId, shift.userEmail);
      if (!grouped[email]) grouped[email] = { name, email, exists, weeks: {} };
      const shiftDate = shift.clockIn?.toDate?.() || new Date();
      const weekKey = getWeekEndingKey(shiftDate, companySettings.payWeekEndDay);
      if (!grouped[email].weeks[weekKey]) grouped[email].weeks[weekKey] = { weekEnd: getWeekEndingDate(shiftDate, companySettings.payWeekEndDay), shifts: [], totalMinutes: 0, finalized: true };
      const h = getHours(shift.clockIn, shift.clockOut);
      const b = calcBreaks(shift.breaks || [], h, companySettings.paidRestMinutes);
      grouped[email].weeks[weekKey].shifts.push(shift);
      grouped[email].weeks[weekKey].totalMinutes += (h * 60) - b.unpaid;
      if (!shift.finalized) grouped[email].weeks[weekKey].finalized = false;
    });
    Object.values(grouped).forEach(emp => { const sorted: typeof emp.weeks = {}; Object.keys(emp.weeks).sort((a, b) => b.localeCompare(a)).forEach(k => { sorted[k] = emp.weeks[k]; }); emp.weeks = sorted; });
    return grouped;
  };

  const styles = {
    input: { padding: '12px', borderRadius: '8px', border: `1px solid ${theme.inputBorder}`, background: theme.input, color: theme.text, fontSize: '14px', width: '100%', boxSizing: 'border-box' as const },
    btn: { padding: '12px 20px', borderRadius: '8px', background: theme.primary, color: 'white', border: 'none', cursor: 'pointer', fontWeight: '600' as const, fontSize: '14px' },
    btnDanger: { padding: '12px 20px', borderRadius: '8px', background: theme.danger, color: 'white', border: 'none', cursor: 'pointer', fontWeight: '600' as const },
    card: { background: theme.card, padding: '20px', borderRadius: '12px', marginBottom: '16px', border: `1px solid ${theme.cardBorder}` },
  };

  // UPDATED: Show loading while getting companyId
  if (loading || loadingCompany) return <main style={{ minHeight: '100vh', background: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: theme.text }}>Loading...</p></main>;

  // UPDATED: Login screen with company name field for signup
  if (!user) return (
    <main style={{ minHeight: '100vh', background: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ ...styles.card, width: '100%', maxWidth: '400px' }}>
        <h1 style={{ color: theme.text, textAlign: 'center', marginBottom: '8px' }}>Trackable NZ</h1>
        <p style={{ color: theme.textMuted, textAlign: 'center', marginBottom: '24px' }}>Manager Dashboard</p>
        {authMode !== 'reset' && (<div style={{ display: 'flex', marginBottom: '24px', background: theme.cardAlt, borderRadius: '8px', padding: '4px' }}><button onClick={() => { setAuthMode('signin'); setError(''); }} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: '600', background: authMode === 'signin' ? theme.primary : 'transparent', color: authMode === 'signin' ? 'white' : theme.text }}>Sign In</button><button onClick={() => { setAuthMode('signup'); setError(''); }} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: '600', background: authMode === 'signup' ? theme.primary : 'transparent', color: authMode === 'signup' ? 'white' : theme.text }}>Sign Up</button></div>)}
        {error && <p style={{ color: theme.danger, marginBottom: '16px', fontSize: '14px' }}>{error}</p>}
        {success && <p style={{ color: theme.success, marginBottom: '16px', fontSize: '14px' }}>{success}</p>}
        <form onSubmit={authMode === 'signin' ? handleLogin : authMode === 'signup' ? handleSignUp : handleResetPassword}>
          {authMode === 'signup' && <input placeholder="Company / Business Name" value={companyName} onChange={e => setCompanyName(e.target.value)} style={{ ...styles.input, marginBottom: '12px' }} />}
          {authMode === 'signup' && <input placeholder="Your Name" value={signupName} onChange={e => setSignupName(e.target.value)} style={{ ...styles.input, marginBottom: '12px' }} />}
          <input placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} style={{ ...styles.input, marginBottom: '12px' }} />
          {authMode !== 'reset' && <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ ...styles.input, marginBottom: '16px' }} />}
          <button type="submit" style={{ ...styles.btn, width: '100%' }}>{authMode === 'signin' ? 'Sign In' : authMode === 'signup' ? 'Create Account' : 'Send Reset Email'}</button>
        </form>
        {authMode === 'signin' && <button onClick={() => setAuthMode('reset')} style={{ background: 'none', border: 'none', color: theme.primary, cursor: 'pointer', fontSize: '14px', marginTop: '16px', display: 'block', width: '100%', textAlign: 'center' }}>Forgot password?</button>}
        {authMode === 'reset' && <button onClick={() => setAuthMode('signin')} style={{ background: 'none', border: 'none', color: theme.primary, cursor: 'pointer', fontSize: '14px', marginTop: '16px', display: 'block', width: '100%', textAlign: 'center' }}>← Back</button>}
      </div>
    </main>
  );

  // NEW: Show error if user has no company (edge case - shouldn't happen)
  if (!companyId) return (
    <main style={{ minHeight: '100vh', background: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ ...styles.card, width: '100%', maxWidth: '400px', textAlign: 'center' }}>
        <h2 style={{ color: theme.danger, marginBottom: '16px' }}>Account Error</h2>
        <p style={{ color: theme.text, marginBottom: '24px' }}>Your account is not linked to a company. Please contact support or sign up again.</p>
        <button onClick={() => signOut(auth)} style={{ ...styles.btn }}>Sign Out</button>
      </div>
    </main>
  );

  const navItems = [{ id: 'live', label: '🟢 Live View' }, { id: 'mysheet', label: '⏱️ My Timesheet' }, { id: 'employees', label: '👥 Employees' }, { id: 'timesheets', label: '📋 Timesheets' }, { id: 'expenses', label: '🧾 Expenses' }, { id: 'reports', label: '📊 Reports' }, { id: 'chat', label: '💬 Chat' }, { id: 'settings', label: '⚙️ Settings' }];

  return (
    <main style={{ minHeight: '100vh', background: theme.bg }}>
      {isMobile && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, minHeight: '56px', background: theme.sidebar, borderBottom: `1px solid ${theme.sidebarBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', paddingTop: 'max(44px, env(safe-area-inset-top))', zIndex: 100 }}><button onClick={() => setSidebarOpen(true)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: theme.text }}>☰</button><span style={{ fontWeight: '700', color: theme.text }}>Trackable NZ</span><button onClick={() => setDark(!dark)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer' }}>{dark ? '☀️' : '🌙'}</button></div>}
      {isMobile && sidebarOpen && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }} onClick={() => setSidebarOpen(false)} />}
      <div style={{ position: 'fixed', top: 0, left: isMobile ? (sidebarOpen ? 0 : -280) : 0, width: '260px', height: '100vh', background: theme.sidebar, borderRight: `1px solid ${theme.sidebarBorder}`, padding: '20px', zIndex: 300, transition: 'left 0.3s', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}><h2 style={{ color: theme.text, fontSize: '18px', margin: 0 }}>Trackable NZ</h2>{isMobile && <button onClick={() => setSidebarOpen(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: theme.textMuted }}>×</button>}</div>
        {navItems.map(item => <button key={item.id} onClick={() => navigateTo(item.id)} style={{ display: 'block', width: '100%', padding: '12px 16px', marginBottom: '4px', borderRadius: '8px', border: 'none', cursor: 'pointer', textAlign: 'left', fontWeight: '500', fontSize: '14px', background: view === item.id ? theme.primary : 'transparent', color: view === item.id ? 'white' : theme.textMuted }}>{item.label}</button>)}
        <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: `1px solid ${theme.sidebarBorder}` }}>
          {!isMobile && <button onClick={() => setDark(!dark)} style={{ display: 'block', width: '100%', padding: '12px 16px', marginBottom: '8px', borderRadius: '8px', border: 'none', cursor: 'pointer', textAlign: 'left', background: 'transparent', color: theme.textMuted }}>{dark ? '☀️ Light Mode' : '🌙 Dark Mode'}</button>}
          <button onClick={() => signOut(auth)} style={{ display: 'block', width: '100%', padding: '12px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', textAlign: 'left', background: 'transparent', color: theme.danger }}>🚪 Sign Out</button>
        </div>
      </div>

      <div style={{ marginLeft: isMobile ? 0 : '260px', padding: isMobile ? '96px 16px max(80px, env(safe-area-inset-bottom))' : '24px 32px' }}>
        {error && <div style={{ background: theme.dangerBg, color: theme.danger, padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}><span>{error}</span><button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.danger }}>×</button></div>}
        {success && <div style={{ background: theme.successBg, color: theme.success, padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}><span>{success}</span><button onClick={() => setSuccess('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.success }}>×</button></div>}
        {mapModal && <MapModal locations={mapModal.locations} onClose={() => setMapModal(null)} title={mapModal.title} theme={theme} clockInLocation={mapModal.clockInLocation} clockOutLocation={mapModal.clockOutLocation} />}
        {editShiftModal && user && <EditShiftModal shift={editShiftModal} onClose={() => setEditShiftModal(null)} onSave={() => setSuccess('Shift updated!')} theme={theme} user={user} companySettings={companySettings} />}
        {removeConfirm && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }} onClick={() => setRemoveConfirm(null)}><div style={{ background: theme.card, borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '400px' }} onClick={e => e.stopPropagation()}><h3 style={{ color: theme.text, marginBottom: '16px' }}>Remove Employee?</h3><label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: theme.text, marginBottom: '20px', cursor: 'pointer' }}><input type="checkbox" checked={removeDeleteShifts} onChange={e => setRemoveDeleteShifts(e.target.checked)} />Also delete their shifts</label><div style={{ display: 'flex', gap: '12px' }}><button onClick={() => setRemoveConfirm(null)} style={{ ...styles.btn, flex: 1, background: theme.cardAlt, color: theme.text }}>Cancel</button><button onClick={() => removeEmployee(removeConfirm)} style={{ ...styles.btnDanger, flex: 1 }}>Remove</button></div></div></div>}

        <Suspense fallback={<div style={{ color: theme.text, textAlign: 'center', padding: '40px' }}>Loading...</div>}>
          {view === 'live' && <LiveView theme={theme} isMobile={isMobile} activeShifts={activeShifts} companySettings={companySettings} getEmployeeName={getEmployeeName} setMapModal={setMapModal} />}
          {view === 'mysheet' && <MyTimesheetView theme={theme} isMobile={isMobile} user={user ? { uid: user.uid } : null} myShift={myShift} myShiftHistory={myShiftHistory} onBreak={onBreak} breakStart={breakStart} myTraveling={myTraveling} myTravelStart={myTravelStart} myField1={myField1} setMyField1={setMyField1} saveMyField1={saveMyField1} myField2={myField2} setMyField2={setMyField2} saveMyField2={saveMyField2} myField3={myField3} setMyField3={setMyField3} saveMyField3={saveMyField3} myCurrentLocation={myCurrentLocation} companySettings={companySettings} employees={employees} myClockIn={myClockIn} myClockOut={myClockOut} clockingIn={clockingIn} clockingOut={clockingOut} myStartBreak={myStartBreak} myEndBreak={myEndBreak} myStartTravel={myStartTravel} myEndTravel={myEndTravel} myAddBreak={myAddBreak} showAddManualShift={showAddManualShift} setShowAddManualShift={setShowAddManualShift} manualDate={manualDate} setManualDate={setManualDate} manualStartHour={manualStartHour} setManualStartHour={setManualStartHour} manualStartMinute={manualStartMinute} setManualStartMinute={setManualStartMinute} manualStartAmPm={manualStartAmPm} setManualStartAmPm={setManualStartAmPm} manualEndHour={manualEndHour} setManualEndHour={setManualEndHour} manualEndMinute={manualEndMinute} setManualEndMinute={setManualEndMinute} manualEndAmPm={manualEndAmPm} setManualEndAmPm={setManualEndAmPm} manualBreaks={manualBreaks} setManualBreaks={setManualBreaks} manualTravel={manualTravel} setManualTravel={setManualTravel} manualNotes={manualNotes} setManualNotes={setManualNotes} addingManualShift={addingManualShift} myAddManualShift={myAddManualShift} expandedMyShifts={expandedMyShifts} toggleMyShift={toggleMyShift} editingMyShift={editingMyShift} setEditingMyShift={setEditingMyShift} myEditMode={myEditMode} setMyEditMode={setMyEditMode} addTravelStartHour={addTravelStartHour} setAddTravelStartHour={setAddTravelStartHour} addTravelStartMinute={addTravelStartMinute} setAddTravelStartMinute={setAddTravelStartMinute} addTravelStartAmPm={addTravelStartAmPm} setAddTravelStartAmPm={setAddTravelStartAmPm} addTravelEndHour={addTravelEndHour} setAddTravelEndHour={setAddTravelEndHour} addTravelEndMinute={addTravelEndMinute} setAddTravelEndMinute={setAddTravelEndMinute} addTravelEndAmPm={addTravelEndAmPm} setAddTravelEndAmPm={setAddTravelEndAmPm} addingTravelToShift={addingTravelToShift} addingBreakToShift={addingBreakToShift} myAddBreakToShift={myAddBreakToShift} myAddTravelToShift={myAddTravelToShift} myDeleteBreakFromShift={myDeleteBreakFromShift} myDeleteTravelFromShift={myDeleteTravelFromShift} myDeleteShift={myDeleteShift} closeMyEditPanel={closeMyEditPanel} updateSettings={updateSettings} setMapModal={setMapModal} />}
          {view === 'employees' && <EmployeesView theme={theme} isMobile={isMobile} user={user ? { uid: user.uid } : null} employees={employees} invites={invites} newEmpEmail={newEmpEmail} setNewEmpEmail={setNewEmpEmail} newEmpName={newEmpName} setNewEmpName={setNewEmpName} inviteEmployee={inviteEmployee} cancelInvite={cancelInvite} sendInviteEmail={sendInviteEmail} copyInviteLink={copyInviteLink} sendingEmail={sendingEmail} updateSettings={updateSettings} setRemoveConfirm={setRemoveConfirm} />}
          {view === 'timesheets' && <TimesheetsView theme={theme} isMobile={isMobile} companySettings={companySettings} timesheetFilterStart={timesheetFilterStart} setTimesheetFilterStart={setTimesheetFilterStart} timesheetFilterEnd={timesheetFilterEnd} setTimesheetFilterEnd={setTimesheetFilterEnd} setThisWeek={setThisWeek} setLastWeek={setLastWeek} setThisMonth={setThisMonth} setLastMonth={setLastMonth} clearTimesheetFilter={clearTimesheetFilter} getGroupedTimesheets={getGroupedTimesheets} expandedEmployees={expandedEmployees} toggleEmployee={toggleEmployee} expandedWeeks={expandedWeeks} toggleWeek={toggleWeek} finalizingWeek={finalizingWeek} finalizeWeek={finalizeWeek} timesheetEditingShiftId={timesheetEditingShiftId} setTimesheetEditingShiftId={setTimesheetEditingShiftId} timesheetEditMode={timesheetEditMode} setTimesheetEditMode={setTimesheetEditMode} timesheetDeleteConfirmId={timesheetDeleteConfirmId} setTimesheetDeleteConfirmId={setTimesheetDeleteConfirmId} deletingTimesheetShift={deletingTimesheetShift} addingBreakToShift={addingBreakToShift} addingTravelToShift={addingTravelToShift} handleTimesheetAddBreak={handleTimesheetAddBreak} handleTimesheetAddTravel={handleTimesheetAddTravel} handleTimesheetDeleteShift={handleTimesheetDeleteShift} closeTimesheetEditPanel={closeTimesheetEditPanel} setEditShiftModal={setEditShiftModal} setMapModal={setMapModal} />}
          {view === 'expenses' && <ExpensesView theme={theme} isMobile={isMobile} expenses={expenses} employees={employees} getEmployeeName={getEmployeeName} approveExpense={approveExpense} deleteExpense={deleteExpense} approvingExpense={approvingExpense} deletingExpense={deletingExpense} />}
          {view === 'reports' && <ReportsView theme={theme} isMobile={isMobile} employees={employees} companySettings={companySettings} reportStart={reportStart} setReportStart={setReportStart} reportEnd={reportEnd} setReportEnd={setReportEnd} reportEmp={reportEmp} setReportEmp={setReportEmp} reportData={reportData} genReport={genReport} exportCSV={exportCSV} exportPDF={exportPDF} getEmployeeName={getEmployeeName} expenses={expenses} exportExpensesCSV={exportExpensesCSV} />}
          {view === 'chat' && <ChatView theme={theme} isMobile={isMobile} messages={messages} chatTab={chatTab} setChatTab={setChatTab} newMsg={newMsg} setNewMsg={setNewMsg} sendMsg={sendMsg} getEmployeeName={getEmployeeName} />}
          {view === 'settings' && <SettingsView theme={theme} isMobile={isMobile} allShifts={allShifts} employees={employees} messages={messages} editingCompanySettings={editingCompanySettings} setEditingCompanySettings={setEditingCompanySettings} saveCompanySettings={saveCompanySettings} savingCompanySettings={savingCompanySettings} cleanupStart={cleanupStart} setCleanupStart={setCleanupStart} cleanupEnd={cleanupEnd} setCleanupEnd={setCleanupEnd} cleanupConfirm={cleanupConfirm} setCleanupConfirm={setCleanupConfirm} cleanup={cleanup} />}
        </Suspense>
      </div>
    </main>
  );
}