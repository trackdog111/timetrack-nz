import { useState, useEffect } from 'react';
import { Shift, Theme, CompanySettings, Location, Expense } from '../shared/types';
import { getHours, calcBreaks, calcTravel, fmtDur, fmtTime, fmtDate, fmtDateShort, fmtWeekEnding, getJobLogField, weekDayNames, getBreakEntitlements } from '../shared/utils';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface GroupedWeek {
  weekEnd: Date;
  shifts: Shift[];
  totalMinutes: number;
  finalized: boolean;
}

interface GroupedEmployee {
  name: string;
  email: string;
  exists: boolean;
  weeks: Record<string, GroupedWeek>;
}

interface TimesheetsViewProps {
  theme: Theme;
  isMobile: boolean;
  companySettings: CompanySettings;
  companyId: string;
  timesheetFilterStart: string;
  setTimesheetFilterStart: (v: string) => void;
  timesheetFilterEnd: string;
  setTimesheetFilterEnd: (v: string) => void;
  setThisWeek: () => void;
  setLastWeek: () => void;
  setThisMonth: () => void;
  setLastMonth: () => void;
  clearTimesheetFilter: () => void;
  getGroupedTimesheets: () => Record<string, GroupedEmployee>;
  expandedEmployees: Set<string>;
  toggleEmployee: (empId: string) => void;
  expandedWeeks: Set<string>;
  toggleWeek: (weekKey: string) => void;
  finalizingWeek: string | null;
  finalizeWeek: (empEmail: string, weekKey: string, shifts: Shift[]) => void;
  timesheetEditingShiftId: string | null;
  setTimesheetEditingShiftId: (id: string | null) => void;
  timesheetEditMode: 'breaks' | 'travel' | null;
  setTimesheetEditMode: (mode: 'breaks' | 'travel' | null) => void;
  timesheetDeleteConfirmId: string | null;
  setTimesheetDeleteConfirmId: (id: string | null) => void;
  deletingTimesheetShift: boolean;
  addingBreakToShift: boolean;
  addingTravelToShift: boolean;
  handleTimesheetAddBreak: (shiftId: string, minutes: number) => void;
  handleTimesheetAddTravel: (shiftId: string, minutes: number) => void;
  handleTimesheetDeleteShift: (shiftId: string) => void;
  closeTimesheetEditPanel: () => void;
  setEditShiftModal: (shift: Shift | null) => void;
  setMapModal: (modal: { locations: Location[], title: string, clockInLocation?: Location, clockOutLocation?: Location } | null) => void;
  expenses: Expense[];
}

export function TimesheetsView({
  theme,
  isMobile,
  companySettings,
  companyId,
  timesheetFilterStart,
  setTimesheetFilterStart,
  timesheetFilterEnd,
  setTimesheetFilterEnd,
  setThisWeek,
  setLastWeek,
  setThisMonth,
  setLastMonth,
  clearTimesheetFilter,
  getGroupedTimesheets,
  expandedEmployees,
  toggleEmployee,
  expandedWeeks,
  toggleWeek,
  finalizingWeek,
  finalizeWeek,
  timesheetEditingShiftId,
  setTimesheetEditingShiftId,
  timesheetEditMode,
  setTimesheetEditMode,
  timesheetDeleteConfirmId,
  setTimesheetDeleteConfirmId,
  deletingTimesheetShift,
  addingBreakToShift,
  addingTravelToShift,
  handleTimesheetAddBreak,
  handleTimesheetAddTravel,
  handleTimesheetDeleteShift,
  closeTimesheetEditPanel,
  setEditShiftModal,
  setMapModal,
  expenses
}: TimesheetsViewProps) {
  const styles = {
    card: { background: theme.card, borderRadius: '12px', padding: '20px', marginBottom: '16px', border: `1px solid ${theme.cardBorder}` },
    input: { padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.inputBorder}`, background: theme.input, color: theme.text, fontSize: '14px', width: '100%', boxSizing: 'border-box' as const }
  };

  // Xero state
  const [xeroConnected, setXeroConnected] = useState(false);
  const [xeroExporting, setXeroExporting] = useState<string | null>(null);
  const [xeroExported, setXeroExported] = useState<Set<string>>(new Set());

  const functions = getFunctions(undefined, 'australia-southeast1');

  // Check Xero connection status
  useEffect(() => {
    async function checkXeroStatus() {
      if (!companyId) return;
      try {
        const xeroGetStatus = httpsCallable<{ companyId: string }, { connected: boolean }>(functions, 'xeroGetStatus');
        const result = await xeroGetStatus({ companyId });
        setXeroConnected(result.data.connected);
      } catch (err) {
        console.error('Error checking Xero status:', err);
      }
    }
    checkXeroStatus();
  }, [companyId]);

  // Export to Xero
  const handleXeroExport = async (empId: string, empEmail: string, weekKey: string, weekEnd: Date, shifts: Shift[], totalMinutes: number) => {
    const exportKey = `${empEmail}-${weekKey}`;
    setXeroExporting(exportKey);
    try {
      const weekStartDate = new Date(weekEnd);
      weekStartDate.setDate(weekStartDate.getDate() - 6);
      
      const xeroExportTimesheet = httpsCallable<any, { success: boolean }>(functions, 'xeroExportTimesheet');
      await xeroExportTimesheet({
        companyId,
        employeeEmail: empEmail,
        weekStart: weekStartDate.toISOString().split('T')[0],
        shifts,
        totalHours: totalMinutes / 60
      });
      setXeroExported(prev => new Set(prev).add(exportKey));
    } catch (err) {
      console.error('Xero export error:', err);
      alert('Failed to export to Xero. Check console for details.');
    } finally {
      setXeroExporting(null);
    }
  };

  // Export finalized week as PDF
  const exportWeekPDF = (empName: string, empEmail: string, weekEnd: Date, shifts: Shift[]) => {
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    const weekEndStr = weekEnd.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
    const fileNameDate = weekEnd.toISOString().split('T')[0];

    let totalMinutes = 0, totalPaid = 0, totalUnpaid = 0, totalTravel = 0;
    const csvRows: string[][] = [];
    const shiftRows = shifts.map(sh => {
      const h = getHours(sh.clockIn, sh.clockOut);
      const b = calcBreaks(sh.breaks || [], h, companySettings.paidRestMinutes);
      const t = calcTravel(sh.travelSegments || []);
      const ent = getBreakEntitlements(h, companySettings.paidRestMinutes);
      const untakenPaid = Math.max(0, ent.paidMinutes - b.paid);
      const worked = (h * 60) - b.unpaid + untakenPaid;
      totalMinutes += worked;
      totalPaid += b.paid;
      totalUnpaid += b.unpaid;
      totalTravel += t;
      const field1 = sh.jobLog?.field1 || '';
      const field2 = sh.jobLog?.field2 || '';
      const field3 = sh.jobLog?.field3 || '';
      csvRows.push([fmtDateShort(sh.clockIn), fmtTime(sh.clockIn), sh.clockOut ? fmtTime(sh.clockOut) : '', b.paid.toString(), b.unpaid.toString(), t.toString(), fmtDur(worked), field1, field2, field3]);
      return '<tr><td>' + fmtDateShort(sh.clockIn) + '</td><td>' + fmtTime(sh.clockIn) + '</td><td>' + (sh.clockOut ? fmtTime(sh.clockOut) : '-') + '</td><td>' + b.paid + 'm</td><td>' + b.unpaid + 'm</td><td>' + (t > 0 ? t + 'm' : '-') + '</td><td><strong>' + fmtDur(worked) + '</strong></td><td class="shift-notes">' + (field1 || '-') + '</td><td class="shift-notes">' + (field2 || '-') + '</td><td class="shift-notes">' + (field3 || '-') + '</td></tr>';
    }).join('');

    const weekExpenses = expenses.filter(exp => {
      if (exp.status !== 'approved') return false;
      if (exp.odEmail !== empEmail && exp.odId !== empEmail) return false;
      const expDate: Date = exp.date?.toDate ? exp.date.toDate() : new Date(exp.date as any);
      return expDate >= weekStart && expDate <= weekEnd;
    });
    const totalExpenses = weekExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);

    const expenseRows = weekExpenses.map(exp => {
      const expDate: Date = exp.date?.toDate ? exp.date.toDate() : new Date(exp.date as any);
      const photoCell = exp.photoUrl ? '<img src="' + exp.photoUrl + '" class="receipt-thumbnail" alt="Receipt">' : '<div class="no-receipt">No photo</div>';
      return '<tr><td>' + photoCell + '</td><td>' + expDate.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' }) + '</td><td><span class="expense-category">' + exp.category + '</span></td><td>' + (exp.note || '-') + '</td><td class="expense-amount">$' + exp.amount.toFixed(2) + '</td></tr>';
    }).join('');

    const field1Label = companySettings.field1Label || 'Site';
    const field2Label = companySettings.field2Label || 'Job Code';
    const field3Label = companySettings.field3Label || 'Notes';

    const expensesSection = weekExpenses.length > 0 ? '<div class="section"><div class="section-title">Expense Claims</div><table class="expenses-table"><thead><tr><th>Receipt</th><th>Date</th><th>Category</th><th>Description</th><th>Amount</th></tr></thead><tbody>' + expenseRows + '<tr class="totals-row"><td></td><td colspan="3"><strong>TOTAL</strong></td><td><span class="grand-total">$' + totalExpenses.toFixed(2) + '</span></td></tr></tbody></table></div>' : '';

    const expensesMeta = totalExpenses > 0 ? '<div class="report-meta-item"><div class="label">Expenses</div><div class="value">$' + totalExpenses.toFixed(2) + '</div></div>' : '';

    // Build CSV data
    const csvHeader = ['Date', 'In', 'Out', 'Paid Break', 'Unpaid Break', 'Travel', 'Total', field1Label, field2Label, field3Label];
    const csvContent = [csvHeader, ...csvRows].map(row => row.map(cell => '"' + (cell || '').replace(/"/g, '""') + '"').join(',')).join('\n');
    const csvDataUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
    const csvFileName = empName.replace(/[^a-zA-Z0-9]/g, '-') + '-' + fileNameDate + '.csv';

    const html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Trackable NZ - Weekly Timesheet</title><style>* { box-sizing: border-box; margin: 0; padding: 0; } body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; background: #f5f5f5; padding: 20px; color: #333; } .report-container { max-width: 1000px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden; } .report-header { background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: white; padding: 24px 32px; } .report-header h1 { font-size: 24px; margin-bottom: 4px; } .report-header .subtitle { opacity: 0.9; font-size: 14px; } .report-meta { display: flex; justify-content: space-between; padding: 16px 32px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; font-size: 14px; flex-wrap: wrap; gap: 16px; } .report-meta-item { text-align: center; } .report-meta-item .label { color: #6b7280; margin-bottom: 4px; } .report-meta-item .value { font-weight: 600; font-size: 18px; color: #111; } .section { padding: 24px 32px; border-bottom: 1px solid #e5e7eb; } .section:last-child { border-bottom: none; } .section-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #374151; } .shifts-table { width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; overflow: hidden; } .shifts-table th { text-align: left; padding: 10px 8px; background: #f9fafb; font-weight: 600; font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; } .shifts-table td { padding: 10px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; } .shifts-table .total-row { background: #f0fdf4; font-weight: 600; } .shift-notes { max-width: 120px; font-size: 11px; color: #374151; } .expenses-table { width: 100%; border-collapse: collapse; } .expenses-table th { text-align: left; padding: 12px 16px; background: #f9fafb; font-weight: 600; font-size: 13px; color: #6b7280; text-transform: uppercase; } .expenses-table td { padding: 12px 16px; border-bottom: 1px solid #e5e7eb; vertical-align: middle; } .expense-category { display: inline-block; padding: 2px 8px; background: #e5e7eb; border-radius: 4px; font-size: 12px; color: #374151; } .expense-amount { font-weight: 600; color: #111; } .receipt-thumbnail { width: 60px; height: 60px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e7eb; } .no-receipt { width: 60px; height: 60px; background: #f3f4f6; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 11px; } .grand-total { font-size: 20px; color: #16a34a; } .totals-row { background: #f0fdf4; } .totals-row td { font-weight: 600; } .actions { padding: 24px 32px; background: #f9fafb; display: flex; gap: 12px; justify-content: flex-end; } .btn { padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; text-decoration: none; display: inline-block; } .btn-primary { background: #22c55e; color: white; } .btn-secondary { background: white; color: #374151; border: 1px solid #d1d5db; } @media print { body { background: white; padding: 0; } .report-container { box-shadow: none; } .receipt-thumbnail { width: 50px; height: 50px; } .actions { display: none; } }</style></head><body><div class="report-container"><div class="report-header"><h1>Weekly Timesheet</h1><div class="subtitle">' + empName + ' - Week Ending ' + weekEndStr + '</div></div><div class="report-meta"><div class="report-meta-item"><div class="label">Employee</div><div class="value">' + empName + '</div></div><div class="report-meta-item"><div class="label">Total Hours</div><div class="value">' + fmtDur(totalMinutes) + '</div></div><div class="report-meta-item"><div class="label">Shifts</div><div class="value">' + shifts.length + '</div></div>' + expensesMeta + '</div><div class="section"><div class="section-title">Shifts</div><table class="shifts-table"><thead><tr><th>Date</th><th>In</th><th>Out</th><th>Paid</th><th>Unpaid</th><th>Travel</th><th>Total</th><th>' + field1Label + '</th><th>' + field2Label + '</th><th>' + field3Label + '</th></tr></thead><tbody>' + shiftRows + '<tr class="total-row"><td><strong>TOTAL</strong></td><td></td><td></td><td>' + totalPaid + 'm</td><td>' + totalUnpaid + 'm</td><td>' + totalTravel + 'm</td><td><strong>' + fmtDur(totalMinutes) + '</strong></td><td></td><td></td><td></td></tr></tbody></table></div>' + expensesSection + '<div class="actions"><button class="btn btn-secondary" onclick="window.print()">Print / Save PDF</button><a class="btn btn-primary" href="' + csvDataUri + '" download="' + csvFileName + '">Download CSV</a></div></div></body></html>';

    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  const grouped = getGroupedTimesheets();
  const empIds = Object.keys(grouped).sort((a, b) => grouped[a].name.localeCompare(grouped[b].name));

  // Get all unique finalized weeks across all employees
  const getAllFinalizedWeeks = () => {
    const weeks: Record<string, { weekEnd: Date; employees: { name: string; email: string; shifts: Shift[] }[] }> = {};
    Object.values(grouped).forEach(emp => {
      Object.entries(emp.weeks).forEach(([weekKey, weekData]) => {
        if (weekData.finalized) {
          if (!weeks[weekKey]) {
            weeks[weekKey] = { weekEnd: weekData.weekEnd, employees: [] };
          }
          weeks[weekKey].employees.push({ name: emp.name, email: emp.email, shifts: weekData.shifts });
        }
      });
    });
    return weeks;
  };

  const finalizedWeeks = getAllFinalizedWeeks();
  const weekKeys = Object.keys(finalizedWeeks).sort((a, b) => b.localeCompare(a));

  // Export all employees for a week
  const exportAllWeekPDF = (weekKey: string) => {
    const weekData = finalizedWeeks[weekKey];
    if (!weekData) return;

    const weekEnd = weekData.weekEnd;
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    const weekEndStr = weekEnd.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
    const fileNameDate = weekEnd.toISOString().split('T')[0];

    const field1Label = companySettings.field1Label || 'Site';
    const field2Label = companySettings.field2Label || 'Job Code';
    const field3Label = companySettings.field3Label || 'Notes';

    let grandTotalMinutes = 0;
    let grandTotalExpenses = 0;
    const allCsvRows: string[][] = [];
    
    // Build employee sections
    const employeeSections = weekData.employees.map(emp => {
      let totalMinutes = 0, totalPaid = 0, totalUnpaid = 0, totalTravel = 0;
      
      const shiftRows = emp.shifts.map(sh => {
        const h = getHours(sh.clockIn, sh.clockOut);
        const b = calcBreaks(sh.breaks || [], h, companySettings.paidRestMinutes);
        const t = calcTravel(sh.travelSegments || []);
        const ent = getBreakEntitlements(h, companySettings.paidRestMinutes);
        const untakenPaid = Math.max(0, ent.paidMinutes - b.paid);
        const worked = (h * 60) - b.unpaid + untakenPaid;
        totalMinutes += worked;
        totalPaid += b.paid;
        totalUnpaid += b.unpaid;
        totalTravel += t;
        const field1 = sh.jobLog?.field1 || '';
        const field2 = sh.jobLog?.field2 || '';
        const field3 = sh.jobLog?.field3 || '';
        allCsvRows.push([emp.name, fmtDateShort(sh.clockIn), fmtTime(sh.clockIn), sh.clockOut ? fmtTime(sh.clockOut) : '', b.paid.toString(), b.unpaid.toString(), t.toString(), fmtDur(worked), field1, field2, field3]);
        return '<tr><td>' + fmtDateShort(sh.clockIn) + '</td><td>' + fmtTime(sh.clockIn) + '</td><td>' + (sh.clockOut ? fmtTime(sh.clockOut) : '-') + '</td><td>' + b.paid + 'm</td><td>' + b.unpaid + 'm</td><td>' + (t > 0 ? t + 'm' : '-') + '</td><td><strong>' + fmtDur(worked) + '</strong></td><td class="shift-notes">' + (field1 || '-') + '</td><td class="shift-notes">' + (field2 || '-') + '</td><td class="shift-notes">' + (field3 || '-') + '</td></tr>';
      }).join('');

      grandTotalMinutes += totalMinutes;

      // Get expenses for this employee
      const empExpenses = expenses.filter(exp => {
        if (exp.status !== 'approved') return false;
        if (exp.odEmail !== emp.email && exp.odId !== emp.email) return false;
        const expDate: Date = exp.date?.toDate ? exp.date.toDate() : new Date(exp.date as any);
        return expDate >= weekStart && expDate <= weekEnd;
      });
      const empTotalExpenses = empExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
      grandTotalExpenses += empTotalExpenses;

      const expenseRows = empExpenses.map(exp => {
        const expDate: Date = exp.date?.toDate ? exp.date.toDate() : new Date(exp.date as any);
        const photoCell = exp.photoUrl ? '<img src="' + exp.photoUrl + '" class="receipt-thumbnail" alt="Receipt">' : '<div class="no-receipt">No photo</div>';
        return '<tr><td>' + photoCell + '</td><td>' + expDate.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' }) + '</td><td><span class="expense-category">' + exp.category + '</span></td><td>' + (exp.note || '-') + '</td><td class="expense-amount">$' + exp.amount.toFixed(2) + '</td></tr>';
      }).join('');

      const expensesTable = empExpenses.length > 0 ? '<div class="expenses-section"><div class="expenses-title">Expenses</div><table class="expenses-table"><thead><tr><th>Receipt</th><th>Date</th><th>Category</th><th>Note</th><th>Amount</th></tr></thead><tbody>' + expenseRows + '<tr class="totals-row"><td></td><td colspan="3"><strong>Total</strong></td><td>$' + empTotalExpenses.toFixed(2) + '</td></tr></tbody></table></div>' : '';

      return '<div class="employee-section"><div class="employee-header">' + emp.name + '</div><table class="shifts-table"><thead><tr><th>Date</th><th>In</th><th>Out</th><th>Paid</th><th>Unpaid</th><th>Travel</th><th>Total</th><th>' + field1Label + '</th><th>' + field2Label + '</th><th>' + field3Label + '</th></tr></thead><tbody>' + shiftRows + '<tr class="total-row"><td><strong>TOTAL</strong></td><td></td><td></td><td>' + totalPaid + 'm</td><td>' + totalUnpaid + 'm</td><td>' + totalTravel + 'm</td><td><strong>' + fmtDur(totalMinutes) + '</strong></td><td></td><td></td><td></td></tr></tbody></table>' + expensesTable + '</div>';
    }).join('');

    // Build CSV
    const csvHeader = ['Employee', 'Date', 'In', 'Out', 'Paid Break', 'Unpaid Break', 'Travel', 'Total', field1Label, field2Label, field3Label];
    const csvContent = [csvHeader, ...allCsvRows].map(row => row.map(cell => '"' + (cell || '').replace(/"/g, '""') + '"').join(',')).join('\n');
    const csvDataUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
    const csvFileName = 'all-timesheets-' + fileNameDate + '.csv';

    const expensesMeta = grandTotalExpenses > 0 ? '<div class="report-meta-item"><div class="label">Total Expenses</div><div class="value">$' + grandTotalExpenses.toFixed(2) + '</div></div>' : '';

    const html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Trackable NZ - All Timesheets</title><style>* { box-sizing: border-box; margin: 0; padding: 0; } body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; background: #f5f5f5; padding: 20px; color: #333; } .report-container { max-width: 1000px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden; } .report-header { background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: white; padding: 24px 32px; } .report-header h1 { font-size: 24px; margin-bottom: 4px; } .report-header .subtitle { opacity: 0.9; font-size: 14px; } .report-meta { display: flex; justify-content: space-between; padding: 16px 32px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; font-size: 14px; flex-wrap: wrap; gap: 16px; } .report-meta-item { text-align: center; } .report-meta-item .label { color: #6b7280; margin-bottom: 4px; } .report-meta-item .value { font-weight: 600; font-size: 18px; color: #111; } .employee-section { padding: 24px 32px; border-bottom: 1px solid #e5e7eb; } .employee-header { font-size: 18px; font-weight: 700; color: #22c55e; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #22c55e; } .shifts-table { width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; margin-bottom: 16px; } .shifts-table th { text-align: left; padding: 10px 8px; background: #f9fafb; font-weight: 600; font-size: 10px; color: #6b7280; text-transform: uppercase; } .shifts-table td { padding: 10px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; } .shifts-table .total-row { background: #f0fdf4; font-weight: 600; } .shift-notes { max-width: 120px; font-size: 11px; color: #374151; } .expenses-section { margin-top: 16px; } .expenses-title { font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 8px; } .expenses-table { width: 100%; border-collapse: collapse; } .expenses-table th { text-align: left; padding: 8px; background: #f9fafb; font-size: 11px; color: #6b7280; text-transform: uppercase; } .expenses-table td { padding: 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; vertical-align: middle; } .expense-category { display: inline-block; padding: 2px 6px; background: #e5e7eb; border-radius: 4px; font-size: 11px; } .expense-amount { font-weight: 600; } .receipt-thumbnail { width: 40px; height: 40px; object-fit: cover; border-radius: 4px; } .no-receipt { width: 40px; height: 40px; background: #f3f4f6; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 9px; } .totals-row { background: #f0fdf4; font-weight: 600; } .grand-total { font-size: 20px; color: #16a34a; } .actions { padding: 24px 32px; background: #f9fafb; display: flex; gap: 12px; justify-content: flex-end; } .btn { padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; text-decoration: none; display: inline-block; } .btn-primary { background: #22c55e; color: white; } .btn-secondary { background: white; color: #374151; border: 1px solid #d1d5db; } @media print { body { background: white; padding: 0; } .report-container { box-shadow: none; } .actions { display: none; } .employee-section { page-break-inside: avoid; } }</style></head><body><div class="report-container"><div class="report-header"><h1>Weekly Timesheets - All Employees</h1><div class="subtitle">Week Ending ' + weekEndStr + '</div></div><div class="report-meta"><div class="report-meta-item"><div class="label">Employees</div><div class="value">' + weekData.employees.length + '</div></div><div class="report-meta-item"><div class="label">Total Hours</div><div class="value">' + fmtDur(grandTotalMinutes) + '</div></div>' + expensesMeta + '</div>' + employeeSections + '<div class="actions"><button class="btn btn-secondary" onclick="window.print()">Print / Save PDF</button><a class="btn btn-primary" href="' + csvDataUri + '" download="' + csvFileName + '">Download CSV</a></div></div></body></html>';

    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div>
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
      
      {/* Export All Section */}
      {weekKeys.length > 0 && (
        <div style={{ ...styles.card, marginBottom: '16px', background: theme.cardAlt }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: theme.text, fontWeight: '600', fontSize: '14px' }}>Export All Employees:</span>
            {weekKeys.map(weekKey => {
              const weekData = finalizedWeeks[weekKey];
              const weekEndStr = weekData.weekEnd.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
              return (
                <button 
                  key={weekKey}
                  onClick={() => exportAllWeekPDF(weekKey)}
                  style={{ padding: '8px 16px', borderRadius: '6px', background: '#2563eb', color: 'white', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}
                >
                  Week {weekEndStr} ({weekData.employees.length})
                </button>
              );
            })}
          </div>
        </div>
      )}
      
      {empIds.length === 0 ? (
        <div style={styles.card}><p style={{ color: theme.textMuted, textAlign: 'center' }}>No completed shifts</p></div>
      ) : (
        empIds.map(empId => {
          const { name, email, exists, weeks } = grouped[empId];
          const isExpanded = expandedEmployees.has(empId);
          const shiftCount = Object.values(weeks).reduce((sum, w) => sum + w.shifts.length, 0);
          
          return (
            <div key={empId} style={{ ...styles.card, padding: 0, overflow: 'hidden', marginBottom: '12px' }}>
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <p style={{ color: theme.primary, fontWeight: '700', fontSize: '16px', margin: 0 }}>{fmtDur(totalMinutes)}</p>
                            {finalized && (
                              <>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); exportWeekPDF(name, email, weekEnd, shifts); }}
                                  style={{ padding: '6px 12px', borderRadius: '6px', background: '#2563eb', color: 'white', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
                                >
                                  Export
                                </button>
                                {xeroConnected && !xeroExported.has(`${email}-${weekKey}`) && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleXeroExport(empId, email, weekKey, weekEnd, shifts, totalMinutes); }}
                                    disabled={xeroExporting === `${email}-${weekKey}`}
                                    style={{ padding: '6px 12px', borderRadius: '6px', background: '#13B5EA', color: 'white', border: 'none', cursor: xeroExporting === `${email}-${weekKey}` ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: '600', opacity: xeroExporting === `${email}-${weekKey}` ? 0.7 : 1 }}
                                  >
                                    {xeroExporting === `${email}-${weekKey}` ? '...' : 'Xero'}
                                  </button>
                                )}
                                {xeroExported.has(`${email}-${weekKey}`) && (
                                  <span style={{ padding: '6px 10px', borderRadius: '6px', background: '#dcfce7', color: '#166534', fontSize: '11px', fontWeight: '600' }}>✓ Xero</span>
                                )}
                              </>
                            )}
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
                          <div style={{ background: theme.cardAlt }}>
                            {shifts.sort((a, b) => (b.clockIn?.toDate?.()?.getTime() || 0) - (a.clockIn?.toDate?.()?.getTime() || 0)).map(sh => {
                              const shiftHours = getHours(sh.clockIn, sh.clockOut);
                              const breakAllocation = calcBreaks(sh.breaks || [], shiftHours, companySettings.paidRestMinutes);
                              const travelMinutes = calcTravel(sh.travelSegments || []);
                              const entitlement = getBreakEntitlements(shiftHours, companySettings.paidRestMinutes);
                              const untakenPaidBreaks = Math.max(0, entitlement.paidMinutes - breakAllocation.paid);
                              const workingMinutes = (shiftHours * 60) - breakAllocation.unpaid + untakenPaidBreaks;
                              const f1 = getJobLogField(sh.jobLog, 'field1');
                              const isTimesheetEditing = timesheetEditingShiftId === sh.id;
                              const locationCount = (sh.locationHistory?.length || 0) + (sh.clockInLocation ? 1 : 0) + (sh.clockOutLocation ? 1 : 0);
                              
                              return (
                                <div key={sh.id} style={{ background: theme.card, padding: '14px 16px', marginLeft: '24px', borderBottom: `1px solid ${theme.cardBorder}` }}>
                                  {/* Shift Header */}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                                    <div>
                                      <p style={{ color: theme.text, fontWeight: '600', fontSize: '14px', margin: 0 }}>
                                        {fmtDate(sh.clockIn)}
                                        {sh.manualEntry && <span style={{ marginLeft: '8px', fontSize: '10px', background: theme.cardAlt, color: theme.textMuted, padding: '2px 6px', borderRadius: '4px' }}>Manual</span>}
                                        {sh.editedAt && <span style={{ marginLeft: '8px', fontSize: '10px', background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: '4px' }}>Edited</span>}
                                        {sh.finalized && <span style={{ marginLeft: '8px', fontSize: '10px', background: theme.successBg, color: theme.success, padding: '2px 6px', borderRadius: '4px' }}>✓</span>}
                                      </p>
                                      <p style={{ color: theme.textMuted, fontSize: '13px', margin: '2px 0 0 0' }}>
                                        {fmtTime(sh.clockIn)} - {sh.clockOut ? fmtTime(sh.clockOut) : 'Active'}
                                      </p>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                      <p style={{ color: theme.text, fontWeight: '700', fontSize: '16px', margin: 0 }}>{fmtDur(workingMinutes)}</p>
                                      <p style={{ color: theme.textLight, fontSize: '11px', margin: '2px 0 0 0' }}>worked</p>
                                    </div>
                                  </div>

                                  {/* Summary Box */}
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

                                  {/* Notes */}
                                  {f1 && <p style={{ color: theme.textMuted, fontSize: '12px', marginTop: '8px', margin: '8px 0 0 0' }}>📝 {f1}</p>}

                                  {/* Clock-in Photo */}
                                  {sh.clockInPhotoUrl && (
                                    <div style={{ marginTop: '8px' }}>
                                      <img src={sh.clockInPhotoUrl} alt="Clock in" style={{ width: '50px', height: '50px', borderRadius: '50%', objectFit: 'cover', border: `2px solid ${theme.success}` }} />
                                    </div>
                                  )}

                                  {/* Map Button */}
                                  {locationCount > 0 && (
                                    <button onClick={() => setMapModal({ locations: sh.locationHistory || [], title: `${name} - ${fmtDateShort(sh.clockIn)}`, clockInLocation: sh.clockInLocation, clockOutLocation: sh.clockOutLocation })} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', padding: '8px 12px', background: theme.cardAlt, border: `1px solid ${theme.primary}`, borderRadius: '8px', color: theme.primary, fontSize: '12px', fontWeight: '500', cursor: 'pointer', width: '100%', justifyContent: 'center' }}>
                                      📍 View {locationCount} location point{locationCount !== 1 ? 's' : ''} on map
                                    </button>
                                  )}

                                  {/* Action Buttons */}
                                  {!isTimesheetEditing && timesheetDeleteConfirmId !== sh.id && (
                                    <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                                      <button onClick={() => setEditShiftModal(sh)} style={{ flex: 1, minWidth: '80px', padding: '8px', borderRadius: '8px', background: 'transparent', color: theme.primary, border: `1px dashed ${theme.primary}`, cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>Edit Shift</button>
                                      <button onClick={() => { setTimesheetEditingShiftId(sh.id); setTimesheetEditMode('breaks'); }} style={{ flex: 1, minWidth: '80px', padding: '8px', borderRadius: '8px', background: 'transparent', color: '#f59e0b', border: '1px dashed #fcd34d', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>+ Break</button>
                                      <button onClick={() => { setTimesheetEditingShiftId(sh.id); setTimesheetEditMode('travel'); }} style={{ flex: 1, minWidth: '80px', padding: '8px', borderRadius: '8px', background: 'transparent', color: '#2563eb', border: '1px dashed #bfdbfe', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>+ Travel</button>
                                      <button onClick={() => setTimesheetDeleteConfirmId(sh.id)} style={{ padding: '8px 12px', borderRadius: '8px', background: 'transparent', color: '#dc2626', border: '1px dashed #fca5a5', cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>Delete</button>
                                    </div>
                                  )}

                                  {/* Delete Confirmation */}
                                  {timesheetDeleteConfirmId === sh.id && (
                                    <div style={{ marginTop: '10px', background: '#fee2e2', borderRadius: '8px', padding: '12px' }}>
                                      <p style={{ color: '#991b1b', fontSize: '13px', fontWeight: '600', margin: '0 0 10px 0' }}>Delete this shift?</p>
                                      <p style={{ color: '#b91c1c', fontSize: '12px', margin: '0 0 12px 0' }}>This cannot be undone.</p>
                                      <div style={{ display: 'flex', gap: '8px' }}>
                                        <button onClick={() => handleTimesheetDeleteShift(sh.id)} disabled={deletingTimesheetShift} style={{ flex: 1, padding: '10px', borderRadius: '6px', background: '#dc2626', color: 'white', border: 'none', cursor: deletingTimesheetShift ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '13px', opacity: deletingTimesheetShift ? 0.7 : 1 }}>{deletingTimesheetShift ? 'Deleting...' : 'Yes, Delete'}</button>
                                        <button onClick={() => setTimesheetDeleteConfirmId(null)} style={{ padding: '10px 16px', borderRadius: '6px', background: 'white', color: '#64748b', border: '1px solid #e2e8f0', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}>Cancel</button>
                                      </div>
                                    </div>
                                  )}

                                  {/* Add Break Panel */}
                                  {isTimesheetEditing && timesheetEditMode === 'breaks' && (
                                    <div style={{ marginTop: '10px', background: '#fefce8', borderRadius: '8px', padding: '12px' }}>
                                      <p style={{ color: '#854d0e', fontSize: '12px', fontWeight: '600', marginBottom: '10px', margin: '0 0 10px 0' }}>Add Break</p>
                                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                        {[10, 15, 20, 30, 45, 60].map(mins => (
                                          <button key={mins} onClick={() => handleTimesheetAddBreak(sh.id, mins)} disabled={addingBreakToShift} style={{ padding: '8px 14px', borderRadius: '6px', background: '#fef08a', color: '#854d0e', border: '1px solid #fde047', cursor: addingBreakToShift ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '13px', opacity: addingBreakToShift ? 0.7 : 1 }}>+{mins}m</button>
                                        ))}
                                      </div>
                                      <button onClick={closeTimesheetEditPanel} style={{ width: '100%', padding: '8px', borderRadius: '6px', background: 'white', color: '#64748b', border: '1px solid #fde047', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}>Done</button>
                                    </div>
                                  )}

                                  {/* Add Travel Panel */}
                                  {isTimesheetEditing && timesheetEditMode === 'travel' && (
                                    <div style={{ marginTop: '10px', background: '#eff6ff', borderRadius: '8px', padding: '12px' }}>
                                      <p style={{ color: '#1e40af', fontSize: '12px', fontWeight: '600', marginBottom: '10px', margin: '0 0 10px 0' }}>Add Travel Time</p>
                                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                        {[10, 15, 20, 30, 45, 60].map(mins => (
                                          <button key={mins} onClick={() => handleTimesheetAddTravel(sh.id, mins)} disabled={addingTravelToShift} style={{ padding: '8px 14px', borderRadius: '6px', background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe', cursor: addingTravelToShift ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '13px', opacity: addingTravelToShift ? 0.7 : 1 }}>+{mins}m</button>
                                        ))}
                                      </div>
                                      <button onClick={closeTimesheetEditPanel} style={{ width: '100%', padding: '8px', borderRadius: '6px', background: 'white', color: '#64748b', border: '1px solid #bfdbfe', cursor: 'pointer', fontWeight: '500', fontSize: '13px' }}>Done</button>
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
        })
      )}
    </div>
  );
}