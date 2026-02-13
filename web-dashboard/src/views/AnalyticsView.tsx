import React, { useState, useMemo, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../shared/firebase';
import { Shift, Theme, Employee, CompanySettings, Expense, Worksite, EmployeeCosting } from '../shared/types';
import { getHours, calcBreaks, calcTravel, fmtDur, fmtTime, fmtDateShort } from '../shared/utils';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { WorksiteDetailModal } from './WorksiteDetailModal';

// ==================== TYPES ====================

export interface WorksiteCost {
  id: string;
  worksiteId: string;
  date: Timestamp;
  category: string;
  reference: string;
  description: string;
  amount: number;
  createdAt: Timestamp;
  createdBy: string;
  createdByEmail: string;
}

interface AnalyticsViewProps {
  theme: Theme;
  isMobile: boolean;
  employees: Employee[];
  companySettings: CompanySettings;
  allShifts: Shift[];
  worksites: Worksite[];
  companyId: string;
  userId: string;
  userEmail: string;
  // Existing reports props
  reportStart: string;
  setReportStart: (v: string) => void;
  reportEnd: string;
  setReportEnd: (v: string) => void;
  reportEmp: string;
  setReportEmp: (v: string) => void;
  reportData: Shift[];
  genReport: () => void;
  exportCSV: () => void;
  exportPDF: () => void;
  getEmployeeName: (userId?: string, userEmail?: string) => string;
  expenses?: Expense[];
  exportExpensesCSV?: () => void;
}

// ==================== COLOUR PALETTE ====================

const CHART_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#e11d48', '#a855f7', '#0ea5e9', '#eab308'
];

// ==================== HELPERS ====================

function getEmployeeCostPerHour(emp: Employee): { base: number; onCosts: number; total: number } {
  const c = emp.costing;
  if (!c || !c.hourlyRate) return { base: 0, onCosts: 0, total: 0 };

  const base = c.hourlyRate;

  if (c.workerType === 'contractor_gst' || c.workerType === 'contractor_no_gst') {
    // GST excluded — pass-through to IRD, not a real cost
    return { base, onCosts: 0, total: base };
  }

  // PAYE — calculate on-costs
  let onCostPct = 0;

  // KiwiSaver
  if (c.kiwiSaverOption === 'custom' && c.kiwiSaverCustom) {
    onCostPct += c.kiwiSaverCustom;
  } else if (c.kiwiSaverOption && c.kiwiSaverOption !== 'none') {
    onCostPct += parseFloat(c.kiwiSaverOption);
  }

  // Holiday pay
  if (c.holidayPayOption === 'custom' && c.holidayPayCustom) {
    onCostPct += c.holidayPayCustom;
  } else if (c.holidayPayOption === '8') {
    onCostPct += 8;
  }

  // ACC levy (stored as %)
  if (c.accLevy) {
    onCostPct += c.accLevy;
  }

  const onCosts = base * (onCostPct / 100);
  return { base, onCosts, total: base + onCosts };
}

function getShiftWorkedHours(shift: Shift, paidRestMinutes: number): number {
  const h = getHours(shift.clockIn, shift.clockOut);
  const b = calcBreaks(shift.breaks || [], h, paidRestMinutes);
  return Math.max(0, (h * 60 - b.unpaid) / 60);
}

function getShiftBreakMinutes(shift: Shift, paidRestMinutes: number): { paid: number; unpaid: number } {
  const h = getHours(shift.clockIn, shift.clockOut);
  return calcBreaks(shift.breaks || [], h, paidRestMinutes);
}

function getShiftTravelMinutes(shift: Shift): number {
  return calcTravel(shift.travelSegments || []);
}

// ==================== COMPONENT ====================

export function AnalyticsView({
  theme, isMobile, employees, companySettings, allShifts, worksites,
  companyId, userId, userEmail,
  reportStart, setReportStart, reportEnd, setReportEnd,
  reportEmp, setReportEmp, reportData, genReport, exportCSV, exportPDF,
  getEmployeeName, expenses = [], exportExpensesCSV
}: AnalyticsViewProps) {

  // ==================== STATE ====================

  const [tab, setTab] = useState<'analytics' | 'reports'>('analytics');
  const [period, setPeriod] = useState<'7d' | '14d' | '6w' | 'custom'>('14d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Worksite costs state
  const [worksiteCosts, setWorksiteCosts] = useState<WorksiteCost[]>([]);
  const [expandedWorksite, setExpandedWorksite] = useState<string | null>(null);

  // Add cost form
  const [costWorksiteId, setCostWorksiteId] = useState('');
  const [costDate, setCostDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [costCategory, setCostCategory] = useState('');
  const [costReference, setCostReference] = useState('');
  const [costDescription, setCostDescription] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [addingCost, setAddingCost] = useState(false);
  const [showAddCost, setShowAddCost] = useState(false);
  const [deletingCostId, setDeletingCostId] = useState<string | null>(null);
  const [detailWorksiteId, setDetailWorksiteId] = useState<string | null>(null);

  // Contract value editing
  const [editingContract, setEditingContract] = useState<string | null>(null);
  const [contractValueInput, setContractValueInput] = useState('');
  const [savingContract, setSavingContract] = useState(false);

  // Saved subcontractors & suppliers
  const [savedSubcontractors, setSavedSubcontractors] = useState<string[]>([]);
  const [savedSuppliers, setSavedSuppliers] = useState<string[]>([]);
  const [showManage, setShowManage] = useState(false);
  const [newSubcontractorInput, setNewSubcontractorInput] = useState('');
  const [newSupplierInput, setNewSupplierInput] = useState('');

  // ==================== STYLES ====================

  const styles = {
    card: { background: theme.card, borderRadius: '12px', padding: isMobile ? '16px' : '20px', marginBottom: '16px', border: `1px solid ${theme.cardBorder}` } as React.CSSProperties,
    input: { padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.inputBorder}`, background: theme.input, color: theme.text, fontSize: '14px', width: '100%', boxSizing: 'border-box' as const },
    btn: { padding: '10px 20px', borderRadius: '8px', border: 'none', background: theme.primary, color: 'white', cursor: 'pointer', fontWeight: '600' as const, fontSize: '14px' },
    btnSm: { padding: '6px 14px', borderRadius: '6px', border: 'none', background: theme.primary, color: 'white', cursor: 'pointer', fontWeight: '500' as const, fontSize: '13px' },
    btnDanger: { padding: '6px 14px', borderRadius: '6px', border: 'none', background: theme.danger, color: 'white', cursor: 'pointer', fontWeight: '500' as const, fontSize: '13px' },
    btnOutline: { padding: '6px 14px', borderRadius: '6px', border: `1px solid ${theme.cardBorder}`, background: 'transparent', color: theme.textMuted, cursor: 'pointer', fontWeight: '500' as const, fontSize: '13px' },
    statCard: { background: theme.card, borderRadius: '12px', padding: '16px 20px', border: `1px solid ${theme.cardBorder}`, flex: '1', minWidth: isMobile ? '140px' : '160px' } as React.CSSProperties,
  };

  // ==================== DATE RANGE ====================

  const dateRange = useMemo(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    let start = new Date();

    if (period === '7d') {
      start.setDate(start.getDate() - 6);
    } else if (period === '14d') {
      start.setDate(start.getDate() - 13);
    } else if (period === '6w') {
      start.setDate(start.getDate() - 41);
    } else if (period === 'custom' && customStart && customEnd) {
      start = new Date(customStart);
      const cEnd = new Date(customEnd);
      cEnd.setHours(23, 59, 59, 999);
      return { start, end: cEnd };
    }
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }, [period, customStart, customEnd]);

  // ==================== FILTERED SHIFTS ====================

  const filteredShifts = useMemo(() => {
    return allShifts.filter(sh => {
      if (sh.status !== 'completed' || !sh.clockIn?.toDate || !sh.clockOut?.toDate) return false;
      const d = sh.clockIn.toDate();
      return d >= dateRange.start && d <= dateRange.end;
    });
  }, [allShifts, dateRange]);

  // ==================== LOAD WORKSITE COSTS ====================

  useEffect(() => {
    if (!companyId) return;
    // Listen to all costs across all worksites for this company
    // We store companyId on cost docs for easier querying
    const activeWorksiteIds = worksites.map(w => w.id);
    if (activeWorksiteIds.length === 0) {
      setWorksiteCosts([]);
      return;
    }

    // Listen to costs subcollections — we'll query per worksite
    const unsubscribes: (() => void)[] = [];

    const allCosts: Map<string, WorksiteCost[]> = new Map();

    worksites.forEach(ws => {
      const unsub = onSnapshot(
        query(collection(db, 'worksites', ws.id, 'costs'), orderBy('date', 'desc')),
        (snap) => {
          const costs = snap.docs.map(d => ({ id: d.id, worksiteId: ws.id, ...d.data() } as WorksiteCost));
          allCosts.set(ws.id, costs);
          // Flatten all costs
          const flat: WorksiteCost[] = [];
          allCosts.forEach(arr => flat.push(...arr));
          setWorksiteCosts(flat);
        }
      );
      unsubscribes.push(unsub);
    });

    return () => unsubscribes.forEach(u => u());
  }, [companyId, worksites]);

  // ==================== SAVED CATEGORIES (from company doc) ====================

  useEffect(() => {
    if (!companyId) return;
    return onSnapshot(doc(db, 'companies', companyId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setSavedSubcontractors(data.costSubcontractors || []);
        setSavedSuppliers(data.costSuppliers || []);
      }
    });
  }, [companyId]);

  // ==================== UNIQUE CATEGORIES (saved + from history) ====================

  const existingCategories = useMemo(() => {
    const cats = new Set<string>([...savedSubcontractors, ...savedSuppliers]);
    worksiteCosts.forEach(c => { if (c.category) cats.add(c.category); });
    return Array.from(cats).sort();
  }, [worksiteCosts, savedSubcontractors, savedSuppliers]);

  // ==================== COMPUTED ANALYTICS ====================

  const analytics = useMemo(() => {
    const empMap = new Map(employees.map(e => [e.id, e]));
    let totalHours = 0;
    let totalLabourCost = 0;
    let totalBreakPaid = 0;
    let totalBreakUnpaid = 0;
    let totalTravel = 0;
    const daysWorked = new Set<string>();

    // Per employee
    const byEmployee: Map<string, { hours: number; cost: number; shifts: number; emp: Employee }> = new Map();

    // Per worksite
    const byWorksite: Map<string, { hours: number; cost: number; shifts: number; name: string }> = new Map();

    // Per worker type
    const byWorkerType: Map<string, { hours: number; cost: number; count: number }> = new Map();

    // Weekly
    const byWeek: Map<string, { hours: number; cost: number; label: string }> = new Map();

    filteredShifts.forEach(sh => {
      const emp = empMap.get(sh.userId);
      const workedHours = getShiftWorkedHours(sh, companySettings.paidRestMinutes);
      const brk = getShiftBreakMinutes(sh, companySettings.paidRestMinutes);
      const travel = getShiftTravelMinutes(sh);
      const costInfo = emp ? getEmployeeCostPerHour(emp) : { base: 0, onCosts: 0, total: 0 };
      const shiftCost = costInfo.total * workedHours;

      totalHours += workedHours;
      totalLabourCost += shiftCost;
      totalBreakPaid += brk.paid;
      totalBreakUnpaid += brk.unpaid;
      totalTravel += travel;

      const dayKey = sh.clockIn.toDate().toISOString().split('T')[0];
      daysWorked.add(dayKey);

      // By employee
      const empKey = sh.userId;
      const empData = byEmployee.get(empKey) || { hours: 0, cost: 0, shifts: 0, emp: emp! };
      empData.hours += workedHours;
      empData.cost += shiftCost;
      empData.shifts += 1;
      if (emp) byEmployee.set(empKey, empData);

      // By worksite
      const wsKey = sh.worksiteId || 'unassigned';
      const wsName = sh.worksiteName || 'Unassigned';
      const wsData = byWorksite.get(wsKey) || { hours: 0, cost: 0, shifts: 0, name: wsName };
      wsData.hours += workedHours;
      wsData.cost += shiftCost;
      wsData.shifts += 1;
      byWorksite.set(wsKey, wsData);

      // By worker type
      const wt = emp?.costing?.workerType || 'unset';
      const wtLabel = wt === 'paye' ? 'PAYE' : wt === 'contractor_gst' ? 'Contractor (GST)' : wt === 'contractor_no_gst' ? 'Contractor' : 'Not Set';
      const wtData = byWorkerType.get(wtLabel) || { hours: 0, cost: 0, count: 0 };
      wtData.hours += workedHours;
      wtData.cost += shiftCost;
      wtData.count += 1;
      byWorkerType.set(wtLabel, wtData);

      // By week (Monday-start)
      const clockInDate = sh.clockIn.toDate();
      const day = clockInDate.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const monday = new Date(clockInDate);
      monday.setDate(monday.getDate() + mondayOffset);
      const weekKey = monday.toISOString().split('T')[0];
      const weekEnd = new Date(monday);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const label = `${monday.getDate()}/${monday.getMonth() + 1} - ${weekEnd.getDate()}/${weekEnd.getMonth() + 1}`;
      const weekData = byWeek.get(weekKey) || { hours: 0, cost: 0, label };
      weekData.hours += workedHours;
      weekData.cost += shiftCost;
      byWeek.set(weekKey, weekData);
    });

    const numDays = Math.max(1, daysWorked.size);
    const avgHoursPerDay = totalHours / numDays;

    return {
      totalHours, totalLabourCost, avgHoursPerDay, totalBreakPaid, totalBreakUnpaid, totalTravel,
      numDays, numShifts: filteredShifts.length,
      byEmployee: Array.from(byEmployee.entries()).map(([id, d]) => ({ id, ...d })).sort((a, b) => b.hours - a.hours),
      byWorksite: Array.from(byWorksite.entries()).map(([id, d]) => ({ id, ...d })).sort((a, b) => b.hours - a.hours),
      byWorkerType: Array.from(byWorkerType.entries()).map(([label, d]) => ({ label, ...d })).sort((a, b) => b.cost - a.cost),
      byWeek: Array.from(byWeek.entries()).map(([key, d]) => ({ key, ...d })).sort((a, b) => a.key.localeCompare(b.key)),
    };
  }, [filteredShifts, employees, companySettings]);

  // ==================== WORKSITE PROJECT COSTING ====================

  const worksiteProjectCosts = useMemo(() => {
    return analytics.byWorksite.map(ws => {
      const worksite = worksites.find(w => w.id === ws.id);
      const manualCosts = worksiteCosts.filter(c => c.worksiteId === ws.id);
      const manualTotal = manualCosts.reduce((sum, c) => sum + c.amount, 0);
      const contractValue = (worksite as any)?.contractValue || 0;
      const totalCost = ws.cost + manualTotal;
      const margin = contractValue - totalCost;

      // Group manual costs by category
      const byCategory: Map<string, number> = new Map();
      manualCosts.forEach(c => {
        byCategory.set(c.category, (byCategory.get(c.category) || 0) + c.amount);
      });

      return {
        ...ws,
        worksite,
        manualCosts,
        manualTotal,
        contractValue,
        totalCost,
        margin,
        costByCategory: Array.from(byCategory.entries()).map(([cat, amt]) => ({ category: cat, amount: amt })),
      };
    });
  }, [analytics.byWorksite, worksites, worksiteCosts]);

  // ==================== ACTIONS ====================

  const addCost = async () => {
    if (!costWorksiteId || !costAmount || !costCategory) return;
    setAddingCost(true);
    try {
      await addDoc(collection(db, 'worksites', costWorksiteId, 'costs'), {
        date: Timestamp.fromDate(new Date(costDate)),
        category: costCategory.trim(),
        reference: costReference.trim(),
        description: costDescription.trim(),
        amount: parseFloat(costAmount),
        createdAt: Timestamp.now(),
        createdBy: userId,
        createdByEmail: userEmail,
      });
      // Reset form
      setCostCategory('');
      setCostReference('');
      setCostDescription('');
      setCostAmount('');
      setShowAddCost(false);
    } catch (err) {
      console.error('Failed to add cost:', err);
    }
    setAddingCost(false);
  };

  const deleteCost = async (worksiteId: string, costId: string) => {
    setDeletingCostId(costId);
    try {
      await deleteDoc(doc(db, 'worksites', worksiteId, 'costs', costId));
    } catch (err) {
      console.error('Failed to delete cost:', err);
    }
    setDeletingCostId(null);
  };

  const saveContractValue = async (worksiteId: string) => {
    setSavingContract(true);
    try {
      await updateDoc(doc(db, 'worksites', worksiteId), {
        contractValue: parseFloat(contractValueInput) || 0,
      });
      setEditingContract(null);
    } catch (err) {
      console.error('Failed to save contract value:', err);
    }
    setSavingContract(false);
  };

  const addSavedSubcontractor = async () => {
    const val = newSubcontractorInput.trim();
    if (!val || !companyId || savedSubcontractors.includes(val)) return;
    try {
      const updated = [...savedSubcontractors, val].sort();
      await updateDoc(doc(db, 'companies', companyId), { costSubcontractors: updated });
      setNewSubcontractorInput('');
    } catch (err) {
      console.error('Failed to save subcontractor:', err);
    }
  };

  const deleteSavedSubcontractor = async (val: string) => {
    if (!companyId) return;
    try {
      const updated = savedSubcontractors.filter(c => c !== val);
      await updateDoc(doc(db, 'companies', companyId), { costSubcontractors: updated });
    } catch (err) {
      console.error('Failed to delete subcontractor:', err);
    }
  };

  const addSavedSupplier = async () => {
    const sup = newSupplierInput.trim();
    if (!sup || !companyId || savedSuppliers.includes(sup)) return;
    try {
      const updated = [...savedSuppliers, sup].sort();
      await updateDoc(doc(db, 'companies', companyId), { costSuppliers: updated });
      setNewSupplierInput('');
    } catch (err) {
      console.error('Failed to save supplier:', err);
    }
  };

  const deleteSavedSupplier = async (sup: string) => {
    if (!companyId) return;
    try {
      const updated = savedSuppliers.filter(s => s !== sup);
      await updateDoc(doc(db, 'companies', companyId), { costSuppliers: updated });
    } catch (err) {
      console.error('Failed to delete supplier:', err);
    }
  };

  // ==================== EXPORT ANALYTICS CSV ====================

  const exportAnalyticsCSV = () => {
    const rows: string[][] = [];

    // Summary
    rows.push(['ANALYTICS SUMMARY']);
    rows.push(['Period', `${dateRange.start.toLocaleDateString('en-NZ')} - ${dateRange.end.toLocaleDateString('en-NZ')}`]);
    rows.push(['Total Hours', analytics.totalHours.toFixed(1)]);
    rows.push(['Total Labour Cost', analytics.totalLabourCost.toFixed(2)]);
    rows.push(['Avg Hours/Day', analytics.avgHoursPerDay.toFixed(1)]);
    rows.push([]);

    // By Employee
    rows.push(['EMPLOYEE BREAKDOWN']);
    rows.push(['Employee', 'Hours', 'Labour Cost', 'Hourly Rate', 'Worker Type', 'Shifts']);
    analytics.byEmployee.forEach(e => {
      const rate = e.emp?.costing?.hourlyRate || 0;
      const type = e.emp?.costing?.workerType || 'Not set';
      rows.push([e.emp?.name || e.emp?.email || 'Unknown', e.hours.toFixed(1), e.cost.toFixed(2), rate.toString(), type, e.shifts.toString()]);
    });
    rows.push([]);

    // By Worksite (with project costing)
    rows.push(['WORKSITE PROJECT COSTING']);
    rows.push(['Worksite', 'Labour Hours', 'Labour Cost', 'Manual Costs', 'Total Cost', 'Contract Value', 'Margin', 'Shifts']);
    worksiteProjectCosts.forEach(ws => {
      rows.push([ws.name, ws.hours.toFixed(1), ws.cost.toFixed(2), ws.manualTotal.toFixed(2), ws.totalCost.toFixed(2), ws.contractValue ? ws.contractValue.toFixed(2) : '', ws.contractValue ? ws.margin.toFixed(2) : '', ws.shifts.toString()]);
    });
    rows.push([]);

    // Manual cost details
    rows.push(['MANUAL COST ENTRIES']);
    rows.push(['Worksite', 'Date', 'Category', 'Reference', 'Description', 'Amount (excl GST)']);
    worksiteCosts.forEach(c => {
      const ws = worksites.find(w => w.id === c.worksiteId);
      const d: Date = c.date?.toDate ? c.date.toDate() : new Date(c.date as any);
      rows.push([ws?.name || 'Unknown', d.toLocaleDateString('en-NZ'), c.category, c.reference, c.description, c.amount.toFixed(2)]);
    });

    const csv = rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `analytics-${dateRange.start.toISOString().split('T')[0]}-${dateRange.end.toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // ==================== RECHARTS TOOLTIP STYLE ====================

  const tooltipStyle = {
    contentStyle: { background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: '8px', color: theme.text, fontSize: '13px' },
    labelStyle: { color: theme.textMuted },
  };

  // ==================== REPORTS TAB (existing) ====================

  const renderReportsTab = () => {
    const approvedExpensesInRange = expenses.filter(exp => {
      if (exp.status !== 'approved') return false;
      if (!reportStart || !reportEnd) return false;
      const s = new Date(reportStart); s.setHours(0, 0, 0, 0);
      const e = new Date(reportEnd); e.setHours(23, 59, 59, 999);
      const expDate: Date = exp.date?.toDate ? exp.date.toDate() : new Date(exp.date as any);
      return expDate >= s && expDate <= e;
    });
    const totalExpenses = approvedExpensesInRange.reduce((sum, e) => sum + e.amount, 0);

    return (
      <div>
        <div style={styles.card}>
          <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Generate Report</h3>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'end' }}>
            <div style={{ flex: '1', minWidth: '140px' }}>
              <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Start</label>
              <input type="date" value={reportStart} onChange={e => setReportStart(e.target.value)} style={styles.input} />
            </div>
            <div style={{ flex: '1', minWidth: '140px' }}>
              <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>End</label>
              <input type="date" value={reportEnd} onChange={e => setReportEnd(e.target.value)} style={styles.input} />
            </div>
            <div style={{ flex: '1', minWidth: '180px' }}>
              <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Employee</label>
              <select value={reportEmp} onChange={e => setReportEmp(e.target.value)} style={styles.input}>
                <option value="all">All</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name || e.email}</option>)}
              </select>
            </div>
            <button onClick={genReport} style={styles.btn}>Generate</button>
          </div>
        </div>

        {reportData.length > 0 && (
          <div style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <h3 style={{ color: theme.text, margin: 0 }}>{reportData.length} shifts</h3>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={exportCSV} style={{ ...styles.btn, background: theme.success }}>📄 Timesheet CSV</button>
                <button onClick={exportPDF} style={{ ...styles.btn, background: theme.danger }}>📑 PDF</button>
                {exportExpensesCSV && approvedExpensesInRange.length > 0 && (
                  <button onClick={exportExpensesCSV} style={{ ...styles.btn, background: theme.warning }}>🧾 Expenses CSV</button>
                )}
              </div>
            </div>
            {approvedExpensesInRange.length > 0 && (
              <div style={{ background: theme.warningBg, borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ color: theme.warning, fontWeight: '600', fontSize: '14px' }}>🧾 {approvedExpensesInRange.length} approved expense{approvedExpensesInRange.length !== 1 ? 's' : ''} in this period</span>
                <span style={{ color: theme.warning, fontWeight: '700', fontSize: '16px' }}>${totalExpenses.toFixed(2)}</span>
              </div>
            )}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${theme.cardBorder}` }}>
                    {['Date', 'Employee', 'In', 'Out', 'Worked', 'Paid', 'Unpaid'].map(h => (
                      <th key={h} style={{ padding: '12px 8px', textAlign: 'left', color: h === 'Paid' ? theme.success : h === 'Unpaid' ? theme.warning : theme.textMuted, fontSize: '13px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportData.map(sh => {
                    const h = getHours(sh.clockIn, sh.clockOut);
                    const b = calcBreaks(sh.breaks || [], h, companySettings.paidRestMinutes);
                    return (
                      <tr key={sh.id} style={{ borderBottom: `1px solid ${theme.cardBorder}` }}>
                        <td style={{ padding: '12px 8px', color: theme.text, fontSize: '13px' }}>{fmtDateShort(sh.clockIn)}</td>
                        <td style={{ padding: '12px 8px', color: theme.text, fontSize: '13px' }}>{getEmployeeName(sh.userId, sh.userEmail)}</td>
                        <td style={{ padding: '12px 8px', color: theme.textMuted, fontSize: '13px' }}>{fmtTime(sh.clockIn)}</td>
                        <td style={{ padding: '12px 8px', color: theme.textMuted, fontSize: '13px' }}>{sh.clockOut ? fmtTime(sh.clockOut) : '-'}</td>
                        <td style={{ padding: '12px 8px', color: theme.text, fontWeight: '600', fontSize: '13px' }}>{fmtDur((h * 60) - b.unpaid)}</td>
                        <td style={{ padding: '12px 8px', color: theme.success, fontSize: '13px' }}>{b.paid}m</td>
                        <td style={{ padding: '12px 8px', color: theme.warning, fontSize: '13px' }}>{b.unpaid}m</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ==================== RENDER ====================

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ color: theme.text, margin: 0, fontSize: isMobile ? '22px' : '28px' }}>📊 Analytics & Reports</h1>
        {tab === 'analytics' && (
          <button onClick={exportAnalyticsCSV} style={{ ...styles.btnSm, background: theme.success }}>📥 Export CSV</button>
        )}
      </div>

      {/* Tab Switcher */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: theme.cardAlt, borderRadius: '10px', padding: '4px', width: 'fit-content' }}>
        {(['analytics', 'reports'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              fontWeight: '600', fontSize: '14px',
              background: tab === t ? theme.primary : 'transparent',
              color: tab === t ? 'white' : theme.textMuted,
            }}
          >
            {t === 'analytics' ? '📈 Analytics' : '📋 Reports'}
          </button>
        ))}
      </div>

      {tab === 'reports' ? renderReportsTab() : (
        <div>
          {/* Period Filter */}
          <div style={styles.card}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ color: theme.textMuted, fontSize: '13px', fontWeight: '500', marginRight: '4px' }}>Period:</span>
              {(['7d', '14d', '6w', 'custom'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  style={{
                    padding: '6px 14px', borderRadius: '6px', border: `1px solid ${period === p ? theme.primary : theme.cardBorder}`,
                    background: period === p ? theme.primary : 'transparent',
                    color: period === p ? 'white' : theme.textMuted,
                    cursor: 'pointer', fontSize: '13px', fontWeight: '500',
                  }}
                >
                  {p === '7d' ? '7 Days' : p === '14d' ? '14 Days' : p === '6w' ? '6 Weeks' : 'Custom'}
                </button>
              ))}
              {period === 'custom' && (
                <>
                  <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ ...styles.input, width: 'auto', maxWidth: '160px' }} />
                  <span style={{ color: theme.textMuted }}>to</span>
                  <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ ...styles.input, width: 'auto', maxWidth: '160px' }} />
                </>
              )}
            </div>
            <div style={{ color: theme.textMuted, fontSize: '12px', marginTop: '8px' }}>
              {dateRange.start.toLocaleDateString('en-NZ')} — {dateRange.end.toLocaleDateString('en-NZ')} · {analytics.numShifts} shifts · {analytics.numDays} days
            </div>
          </div>

          {/* Top Stats */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {[
              { label: 'Total Hours', value: analytics.totalHours.toFixed(1), sub: `${analytics.numShifts} shifts`, color: theme.primary },
              { label: 'Labour Cost', value: `$${analytics.totalLabourCost.toFixed(0)}`, sub: `$${(analytics.totalHours > 0 ? analytics.totalLabourCost / analytics.totalHours : 0).toFixed(0)}/hr avg`, color: theme.success },
              { label: 'Avg Hours/Day', value: analytics.avgHoursPerDay.toFixed(1), sub: `${analytics.numDays} working days`, color: theme.travel },
              { label: 'Break Time', value: `${analytics.totalBreakPaid + analytics.totalBreakUnpaid}m`, sub: `${analytics.totalBreakPaid}m paid · ${analytics.totalBreakUnpaid}m unpaid`, color: theme.warning },
              { label: 'Travel Time', value: `${analytics.totalTravel}m`, sub: `${(analytics.totalTravel / 60).toFixed(1)} hours`, color: '#8b5cf6' },
            ].map(stat => (
              <div key={stat.label} style={styles.statCard}>
                <div style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '4px' }}>{stat.label}</div>
                <div style={{ color: stat.color, fontSize: '24px', fontWeight: '700' }}>{stat.value}</div>
                <div style={{ color: theme.textMuted, fontSize: '11px', marginTop: '2px' }}>{stat.sub}</div>
              </div>
            ))}
          </div>

          {/* Weekly Trend Chart */}
          {analytics.byWeek.length > 0 && (
            <div style={styles.card}>
              <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Weekly Hours Trend</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={analytics.byWeek}>
                  <XAxis dataKey="label" tick={{ fill: theme.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: theme.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(value: any) => [`${Number(value).toFixed(1)} hrs`, 'Hours']}
                  />
                  <Bar dataKey="hours" fill={theme.primary} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Hours by Worksite — Pie + Cost by Worker Type */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '0' }}>
            {/* Worksite Donut */}
            {analytics.byWorksite.length > 0 && (
              <div style={{ ...styles.card, flex: '1', minWidth: isMobile ? '100%' : '320px' }}>
                <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Hours by Worksite</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={analytics.byWorksite.map(ws => ({ name: ws.name, value: Math.round(ws.hours * 10) / 10 }))}
                      cx="50%" cy="50%"
                      innerRadius={50} outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {analytics.byWorksite.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipStyle} formatter={(value: any) => [`${value} hrs`, '']} />
                    <Legend
                      wrapperStyle={{ fontSize: '12px', color: theme.textMuted }}
                      formatter={(value) => <span style={{ color: theme.text, fontSize: '12px' }}>{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Worker Type Breakdown */}
            {analytics.byWorkerType.length > 0 && (
              <div style={{ ...styles.card, flex: '1', minWidth: isMobile ? '100%' : '280px' }}>
                <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Cost by Worker Type</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {analytics.byWorkerType.map((wt, i) => {
                    const pct = analytics.totalLabourCost > 0 ? (wt.cost / analytics.totalLabourCost) * 100 : 0;
                    return (
                      <div key={wt.label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ color: theme.text, fontSize: '13px', fontWeight: '500' }}>{wt.label}</span>
                          <span style={{ color: theme.textMuted, fontSize: '13px' }}>${wt.cost.toFixed(0)} · {wt.hours.toFixed(1)}h</span>
                        </div>
                        <div style={{ height: '8px', borderRadius: '4px', background: theme.cardAlt, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length], borderRadius: '4px', transition: 'width 0.3s' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Hours by Employee */}
          {analytics.byEmployee.length > 0 && (
            <div style={styles.card}>
              <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Hours by Employee</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {analytics.byEmployee.map((emp, i) => {
                  const pct = analytics.totalHours > 0 ? (emp.hours / analytics.totalHours) * 100 : 0;
                  const costInfo = getEmployeeCostPerHour(emp.emp);
                  const typeLabel = emp.emp?.costing?.workerType === 'paye' ? 'PAYE' :
                    emp.emp?.costing?.workerType === 'contractor_gst' ? 'GST' :
                    emp.emp?.costing?.workerType === 'contractor_no_gst' ? 'Contractor' : '';
                  return (
                    <div key={emp.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', flexWrap: 'wrap', gap: '4px' }}>
                        <span style={{ color: theme.text, fontSize: '13px', fontWeight: '500' }}>
                          {emp.emp?.name || emp.emp?.email || 'Unknown'}
                          {typeLabel && <span style={{ color: theme.textMuted, fontWeight: '400', marginLeft: '6px', fontSize: '11px' }}>{typeLabel}</span>}
                        </span>
                        <span style={{ color: theme.textMuted, fontSize: '13px' }}>
                          {emp.hours.toFixed(1)}h · ${emp.cost.toFixed(0)} · ${costInfo.total.toFixed(0)}/hr
                        </span>
                      </div>
                      <div style={{ height: '8px', borderRadius: '4px', background: theme.cardAlt, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length], borderRadius: '4px', transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ==================== PROJECT COSTING BY WORKSITE ==================== */}
          <div style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <h3 style={{ color: theme.text, margin: 0, fontSize: '16px' }}>🏗️ Project Costing by Worksite</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { setShowManage(!showManage); setShowAddCost(false); }} style={styles.btnOutline}>
                  {showManage ? '✕ Close' : '⚙ Manage'}
                </button>
                <button onClick={() => { setShowAddCost(!showAddCost); setShowManage(false); }} style={styles.btnSm}>
                  {showAddCost ? '✕ Close' : '+ Add Cost'}
                </button>
              </div>
            </div>

            {/* Add Cost Form */}
            {showAddCost && (
              <div style={{ background: theme.cardAlt, borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1', minWidth: '160px' }}>
                    <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Worksite *</label>
                    <select value={costWorksiteId} onChange={e => setCostWorksiteId(e.target.value)} style={styles.input}>
                      <option value="">Select worksite</option>
                      {worksites.filter(w => w.status === 'active').map(w => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ minWidth: '140px' }}>
                    <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Date</label>
                    <input type="date" value={costDate} onChange={e => setCostDate(e.target.value)} style={styles.input} />
                  </div>
                  <div style={{ flex: '1', minWidth: '160px' }}>
                    <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Subcontractor / Supplier *</label>
                    <select
                      value={costCategory}
                      onChange={e => setCostCategory(e.target.value)}
                      style={styles.input}
                    >
                      <option value="">Select</option>
                      {savedSubcontractors.length > 0 && <optgroup label="Subcontractors">
                        {savedSubcontractors.map(c => <option key={`sub-${c}`} value={c}>{c}</option>)}
                      </optgroup>}
                      {savedSuppliers.length > 0 && <optgroup label="Suppliers">
                        {savedSuppliers.map(s => <option key={`sup-${s}`} value={s}>{s}</option>)}
                      </optgroup>}
                    </select>
                  </div>
                  <div style={{ minWidth: '120px' }}>
                    <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Amount (excl GST) *</label>
                    <input type="number" value={costAmount} onChange={e => setCostAmount(e.target.value)} placeholder="0.00" step="0.01" style={styles.input} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
                  <div style={{ flex: '1', minWidth: '140px' }}>
                    <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Reference / Invoice #</label>
                    <input value={costReference} onChange={e => setCostReference(e.target.value)} placeholder="e.g. INV-00123" style={styles.input} />
                  </div>
                  <div style={{ flex: '2', minWidth: '200px' }}>
                    <label style={{ color: theme.textMuted, fontSize: '12px', display: 'block', marginBottom: '4px' }}>Description</label>
                    <input value={costDescription} onChange={e => setCostDescription(e.target.value)} placeholder="What is this cost for?" style={styles.input} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'end' }}>
                    <button
                      onClick={addCost}
                      disabled={addingCost || !costWorksiteId || !costAmount || !costCategory}
                      style={{ ...styles.btn, opacity: (addingCost || !costWorksiteId || !costAmount || !costCategory) ? 0.5 : 1 }}
                    >
                      {addingCost ? 'Adding...' : 'Add Cost'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Manage Subcontractors & Suppliers */}
            {showManage && (
              <div style={{ background: theme.cardAlt, borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: isMobile ? '16px' : '32px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1', minWidth: '240px' }}>
                    <div style={{ color: theme.text, fontWeight: '600', fontSize: '14px', marginBottom: '12px' }}>Subcontractors</div>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                      <input
                        value={newSubcontractorInput}
                        onChange={e => setNewSubcontractorInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addSavedSubcontractor(); }}
                        placeholder="e.g. Plumber, Electrician"
                        style={{ ...styles.input, flex: '1' }}
                      />
                      <button
                        onClick={addSavedSubcontractor}
                        disabled={!newSubcontractorInput.trim() || savedSubcontractors.includes(newSubcontractorInput.trim())}
                        style={{ ...styles.btnSm, opacity: (!newSubcontractorInput.trim() || savedSubcontractors.includes(newSubcontractorInput.trim())) ? 0.5 : 1 }}
                      >
                        Save
                      </button>
                    </div>
                    {savedSubcontractors.length === 0 ? (
                      <div style={{ color: theme.textMuted, fontSize: '13px', fontStyle: 'italic' }}>No subcontractors yet</div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {savedSubcontractors.map(val => (
                          <div key={val} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: '6px', padding: '6px 10px' }}>
                            <span style={{ color: theme.text, fontSize: '13px' }}>{val}</span>
                            <button onClick={() => deleteSavedSubcontractor(val)} style={{ background: 'none', border: 'none', color: theme.danger, cursor: 'pointer', fontSize: '14px', padding: '0 2px', lineHeight: '1' }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ flex: '1', minWidth: '240px' }}>
                    <div style={{ color: theme.text, fontWeight: '600', fontSize: '14px', marginBottom: '12px' }}>Suppliers</div>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                      <input
                        value={newSupplierInput}
                        onChange={e => setNewSupplierInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addSavedSupplier(); }}
                        placeholder="e.g. Placemakers, Akarana"
                        style={{ ...styles.input, flex: '1' }}
                      />
                      <button
                        onClick={addSavedSupplier}
                        disabled={!newSupplierInput.trim() || savedSuppliers.includes(newSupplierInput.trim())}
                        style={{ ...styles.btnSm, opacity: (!newSupplierInput.trim() || savedSuppliers.includes(newSupplierInput.trim())) ? 0.5 : 1 }}
                      >
                        Save
                      </button>
                    </div>
                    {savedSuppliers.length === 0 ? (
                      <div style={{ color: theme.textMuted, fontSize: '13px', fontStyle: 'italic' }}>No suppliers yet</div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {savedSuppliers.map(sup => (
                          <div key={sup} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: '6px', padding: '6px 10px' }}>
                            <span style={{ color: theme.text, fontSize: '13px' }}>{sup}</span>
                            <button onClick={() => deleteSavedSupplier(sup)} style={{ background: 'none', border: 'none', color: theme.danger, cursor: 'pointer', fontSize: '14px', padding: '0 2px', lineHeight: '1' }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Worksite Project Costing Table */}
            {worksiteProjectCosts.length === 0 ? (
              <div style={{ color: theme.textMuted, fontSize: '14px', textAlign: 'center', padding: '20px' }}>
                No worksite data in this period
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {worksiteProjectCosts.map((ws, idx) => {
                  const isExpanded = expandedWorksite === ws.id;
                  const marginPct = ws.contractValue ? (ws.margin / ws.contractValue) * 100 : null;
                  return (
                    <div key={ws.id} style={{ border: `1px solid ${theme.cardBorder}`, borderRadius: '10px', overflow: 'hidden' }}>
                      {/* Header row */}
                      <div
                        onClick={() => setExpandedWorksite(isExpanded ? null : ws.id)}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', cursor: 'pointer', flexWrap: 'wrap', gap: '8px', background: isExpanded ? theme.cardAlt : 'transparent' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                          <span onClick={(e) => { e.stopPropagation(); setDetailWorksiteId(ws.id); }} style={{ color: theme.primary, fontWeight: '600', fontSize: '14px', cursor: 'pointer', textDecoration: 'underline' }}>{ws.name}</span>
                          <span style={{ color: theme.textMuted, fontSize: '12px' }}>{ws.shifts} shifts · {ws.hours.toFixed(1)}h</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '13px' }}>
                            <span style={{ color: theme.textMuted }}>Labour </span>
                            <span style={{ color: theme.text, fontWeight: '600' }}>${ws.cost.toFixed(0)}</span>
                          </span>
                          {ws.manualTotal > 0 && (
                            <span style={{ fontSize: '13px' }}>
                              <span style={{ color: theme.textMuted }}>Other </span>
                              <span style={{ color: theme.text, fontWeight: '600' }}>${ws.manualTotal.toFixed(0)}</span>
                            </span>
                          )}
                          <span style={{ fontSize: '14px', fontWeight: '700', color: theme.primary }}>
                            Total ${ws.totalCost.toFixed(0)}
                          </span>
                          {ws.contractValue > 0 && (
                            <span style={{
                              fontSize: '13px', fontWeight: '700',
                              color: ws.margin >= 0 ? theme.success : theme.danger,
                              background: ws.margin >= 0 ? theme.successBg : theme.dangerBg,
                              padding: '2px 8px', borderRadius: '4px',
                            }}>
                              {ws.margin >= 0 ? '+' : ''}${ws.margin.toFixed(0)} ({marginPct?.toFixed(0)}%)
                            </span>
                          )}
                          <span style={{ color: theme.textMuted, fontSize: '16px' }}>{isExpanded ? '▾' : '▸'}</span>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${theme.cardBorder}` }}>
                          {/* Contract Value */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 0', borderBottom: `1px solid ${theme.cardBorder}`, flexWrap: 'wrap' }}>
                            <span style={{ color: theme.textMuted, fontSize: '13px', fontWeight: '500' }}>Contract/Quote Value (excl GST):</span>
                            {editingContract === ws.id ? (
                              <>
                                <input
                                  type="number" step="0.01"
                                  value={contractValueInput}
                                  onChange={e => setContractValueInput(e.target.value)}
                                  style={{ ...styles.input, width: '140px' }}
                                  autoFocus
                                />
                                <button onClick={() => saveContractValue(ws.id)} disabled={savingContract} style={styles.btnSm}>
                                  {savingContract ? '...' : 'Save'}
                                </button>
                                <button onClick={() => setEditingContract(null)} style={styles.btnOutline}>Cancel</button>
                              </>
                            ) : (
                              <>
                                <span style={{ color: ws.contractValue ? theme.text : theme.textMuted, fontWeight: '600', fontSize: '14px' }}>
                                  {ws.contractValue ? `$${ws.contractValue.toFixed(2)}` : 'Not set'}
                                </span>
                                <button
                                  onClick={() => { setEditingContract(ws.id); setContractValueInput(ws.contractValue?.toString() || ''); }}
                                  style={styles.btnOutline}
                                >
                                  {ws.contractValue ? 'Edit' : 'Set Value'}
                                </button>
                              </>
                            )}
                          </div>

                          {/* Cost summary */}
                          <div style={{ padding: '12px 0', display: 'flex', gap: '20px', flexWrap: 'wrap', borderBottom: `1px solid ${theme.cardBorder}` }}>
                            <div>
                              <div style={{ color: theme.textMuted, fontSize: '11px' }}>Labour Cost</div>
                              <div style={{ color: theme.text, fontWeight: '600', fontSize: '16px' }}>${ws.cost.toFixed(2)}</div>
                            </div>
                            <div>
                              <div style={{ color: theme.textMuted, fontSize: '11px' }}>Other Costs</div>
                              <div style={{ color: theme.text, fontWeight: '600', fontSize: '16px' }}>${ws.manualTotal.toFixed(2)}</div>
                            </div>
                            <div>
                              <div style={{ color: theme.textMuted, fontSize: '11px' }}>Total Cost</div>
                              <div style={{ color: theme.primary, fontWeight: '700', fontSize: '16px' }}>${ws.totalCost.toFixed(2)}</div>
                            </div>
                            {ws.contractValue > 0 && (
                              <div>
                                <div style={{ color: theme.textMuted, fontSize: '11px' }}>Margin</div>
                                <div style={{ color: ws.margin >= 0 ? theme.success : theme.danger, fontWeight: '700', fontSize: '16px' }}>
                                  {ws.margin >= 0 ? '+' : ''}${ws.margin.toFixed(2)}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Cost by category */}
                          {ws.costByCategory.length > 0 && (
                            <div style={{ padding: '12px 0', borderBottom: `1px solid ${theme.cardBorder}` }}>
                              <div style={{ color: theme.textMuted, fontSize: '12px', fontWeight: '500', marginBottom: '8px' }}>Cost Breakdown by Category</div>
                              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                {ws.costByCategory.map(cc => (
                                  <div key={cc.category} style={{ background: theme.cardAlt, padding: '6px 12px', borderRadius: '6px' }}>
                                    <span style={{ color: theme.text, fontSize: '13px', fontWeight: '500' }}>{cc.category}</span>
                                    <span style={{ color: theme.textMuted, fontSize: '13px', marginLeft: '6px' }}>${cc.amount.toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Manual cost entries */}
                          <div style={{ paddingTop: '12px' }}>
                            <div style={{ color: theme.textMuted, fontSize: '12px', fontWeight: '500', marginBottom: '8px' }}>Cost Entries</div>
                            {ws.manualCosts.length === 0 ? (
                              <div style={{ color: theme.textMuted, fontSize: '13px', fontStyle: 'italic' }}>No manual costs added yet</div>
                            ) : (
                              <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
                                  <thead>
                                    <tr style={{ borderBottom: `1px solid ${theme.cardBorder}` }}>
                                      {['Date', 'Category', 'Reference', 'Description', 'Amount', ''].map(h => (
                                        <th key={h} style={{ padding: '8px 6px', textAlign: 'left', color: theme.textMuted, fontSize: '11px', fontWeight: '500' }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {ws.manualCosts.map(cost => {
                                      const d: Date = cost.date?.toDate ? cost.date.toDate() : new Date(cost.date as any);
                                      return (
                                        <tr key={cost.id} style={{ borderBottom: `1px solid ${theme.cardBorder}` }}>
                                          <td style={{ padding: '8px 6px', color: theme.text, fontSize: '13px' }}>{d.toLocaleDateString('en-NZ')}</td>
                                          <td style={{ padding: '8px 6px', color: theme.text, fontSize: '13px' }}>{cost.category}</td>
                                          <td style={{ padding: '8px 6px', color: theme.textMuted, fontSize: '13px' }}>{cost.reference || '-'}</td>
                                          <td style={{ padding: '8px 6px', color: theme.textMuted, fontSize: '13px' }}>{cost.description || '-'}</td>
                                          <td style={{ padding: '8px 6px', color: theme.text, fontWeight: '600', fontSize: '13px' }}>${cost.amount.toFixed(2)}</td>
                                          <td style={{ padding: '8px 6px' }}>
                                            <button
                                              onClick={(e) => { e.stopPropagation(); deleteCost(ws.id, cost.id); }}
                                              disabled={deletingCostId === cost.id}
                                              style={{ ...styles.btnDanger, fontSize: '11px', padding: '3px 8px', opacity: deletingCostId === cost.id ? 0.5 : 1 }}
                                            >
                                              {deletingCostId === cost.id ? '...' : '✕'}
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Worksite Breakdown Table */}
          {analytics.byWorksite.length > 0 && (
            <div style={styles.card}>
              <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Worksite Summary</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${theme.cardBorder}` }}>
                      {['Worksite', 'Shifts', 'Hours', 'Avg/Shift', 'Labour Cost', '% of Total'].map(h => (
                        <th key={h} style={{ padding: '10px 8px', textAlign: 'left', color: theme.textMuted, fontSize: '12px', fontWeight: '500' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.byWorksite.map(ws => {
                      const pct = analytics.totalHours > 0 ? (ws.hours / analytics.totalHours) * 100 : 0;
                      const avgPerShift = ws.shifts > 0 ? ws.hours / ws.shifts : 0;
                      return (
                        <tr key={ws.id} style={{ borderBottom: `1px solid ${theme.cardBorder}` }}>
                          <td style={{ padding: '10px 8px', color: theme.text, fontSize: '13px', fontWeight: '500' }}>{ws.name}</td>
                          <td style={{ padding: '10px 8px', color: theme.textMuted, fontSize: '13px' }}>{ws.shifts}</td>
                          <td style={{ padding: '10px 8px', color: theme.text, fontWeight: '600', fontSize: '13px' }}>{ws.hours.toFixed(1)}</td>
                          <td style={{ padding: '10px 8px', color: theme.textMuted, fontSize: '13px' }}>{avgPerShift.toFixed(1)}h</td>
                          <td style={{ padding: '10px 8px', color: theme.success, fontWeight: '600', fontSize: '13px' }}>${ws.cost.toFixed(0)}</td>
                          <td style={{ padding: '10px 8px', color: theme.textMuted, fontSize: '13px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div style={{ width: '60px', height: '6px', borderRadius: '3px', background: theme.cardAlt, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: theme.primary, borderRadius: '3px' }} />
                              </div>
                              {pct.toFixed(0)}%
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {detailWorksiteId && (() => {
        const ws = worksiteProjectCosts.find(w => w.id === detailWorksiteId);
        if (!ws) return null;
        return (
          <WorksiteDetailModal
            theme={theme}
            isMobile={isMobile}
            worksite={ws.worksite || ({} as any)}
            worksiteId={ws.id}
            worksiteName={ws.name}
            allShifts={allShifts}
            employees={employees}
            worksiteCosts={worksiteCosts}
            companySettings={companySettings}
            subcontractors={savedSubcontractors}
            suppliers={savedSuppliers}
            onClose={() => setDetailWorksiteId(null)}
            onDeleteCost={deleteCost}
            deletingCostId={deletingCostId}
          />
        );
      })()}
        </div>
      )}
    </div>
  );
}
