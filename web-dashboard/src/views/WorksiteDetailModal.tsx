// WorksiteDetailModal.tsx — Per-worksite detail popup for Analytics page
// Opens when clicking a worksite name in Project Costing section
// Shows: Overview, Trades (subcontractors/suppliers), Team, Costs tabs
// Uses same theme/styles as AnalyticsView

import React, { useState, useMemo } from 'react';
import { Theme, Shift, Employee, Worksite } from '../shared/types';
import { getHours, calcBreaks, calcTravel, fmtDur } from '../shared/utils';
import { WorksiteCost } from './AnalyticsView';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';

// ==================== PROPS ====================

interface WorksiteDetailModalProps {
  theme: Theme;
  isMobile: boolean;
  worksite: Worksite;
  worksiteId: string;
  worksiteName: string;
  allShifts: Shift[];
  employees: Employee[];
  worksiteCosts: WorksiteCost[];
  companySettings: { paidRestMinutes: number };
  subcontractors: string[];
  suppliers: string[];
  onClose: () => void;
  onDeleteCost: (worksiteId: string, costId: string) => void;
  deletingCostId: string | null;
}

// ==================== COLOURS ====================

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
    return { base, onCosts: 0, total: base };
  }
  let onCostPct = 0;
  if (c.kiwiSaverOption === 'custom' && c.kiwiSaverCustom) onCostPct += c.kiwiSaverCustom;
  else if (c.kiwiSaverOption && c.kiwiSaverOption !== 'none') onCostPct += parseFloat(c.kiwiSaverOption);
  if (c.holidayPayOption === 'custom' && c.holidayPayCustom) onCostPct += c.holidayPayCustom;
  else if (c.holidayPayOption === '8') onCostPct += 8;
  if (c.accLevy) onCostPct += c.accLevy;
  const onCosts = base * (onCostPct / 100);
  return { base, onCosts, total: base + onCosts };
}

function getShiftWorkedHours(shift: Shift, paidRestMinutes: number): number {
  const h = getHours(shift.clockIn, shift.clockOut);
  const b = calcBreaks(shift.breaks || [], h, paidRestMinutes);
  return Math.max(0, (h * 60 - b.unpaid) / 60);
}

// ==================== COMPONENT ====================

export function WorksiteDetailModal({
  theme, isMobile, worksite, worksiteId, worksiteName, allShifts, employees,
  worksiteCosts, companySettings, subcontractors, suppliers,
  onClose, onDeleteCost, deletingCostId
}: WorksiteDetailModalProps) {

  const [tab, setTab] = useState<'overview' | 'trades' | 'team' | 'costs'>('overview');
  const [period, setPeriod] = useState<number>(42); // days

  // ==================== STYLES (match AnalyticsView) ====================

  const styles = {
    card: { background: theme.card, borderRadius: '12px', padding: isMobile ? '16px' : '20px', marginBottom: '16px', border: `1px solid ${theme.cardBorder}` } as React.CSSProperties,
    statCard: { background: theme.card, borderRadius: '12px', padding: '16px 20px', border: `1px solid ${theme.cardBorder}`, flex: '1', minWidth: isMobile ? '120px' : '140px' } as React.CSSProperties,
    btnSm: { padding: '6px 14px', borderRadius: '6px', border: 'none', background: theme.primary, color: 'white', cursor: 'pointer', fontWeight: '500' as const, fontSize: '13px' },
    btnDanger: { padding: '6px 14px', borderRadius: '6px', border: 'none', background: theme.danger, color: 'white', cursor: 'pointer', fontWeight: '500' as const, fontSize: '13px' },
    btnOutline: { padding: '6px 14px', borderRadius: '6px', border: `1px solid ${theme.cardBorder}`, background: 'transparent', color: theme.textMuted, cursor: 'pointer', fontWeight: '500' as const, fontSize: '13px' },
  };

  const tooltipStyle = {
    contentStyle: { background: theme.card, border: `1px solid ${theme.cardBorder}`, borderRadius: '8px', color: theme.text, fontSize: '13px' },
    labelStyle: { color: theme.textMuted },
  };

  // ==================== FILTER SHIFTS FOR THIS WORKSITE ====================

  const cutoffDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - period);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [period]);

  const worksiteShifts = useMemo(() => {
    return allShifts.filter(sh => {
      if (sh.status !== 'completed' || !sh.clockIn?.toDate || !sh.clockOut?.toDate) return false;
      const d = sh.clockIn.toDate();
      if (d < cutoffDate) return false;
      // Match this worksite (or 'unassigned')
      if (worksiteId === 'unassigned') {
        return !sh.worksiteId;
      }
      return sh.worksiteId === worksiteId;
    });
  }, [allShifts, worksiteId, cutoffDate]);

  // Filter costs for this worksite
  const wsCosts = useMemo(() => {
    return worksiteCosts.filter(c => c.worksiteId === worksiteId);
  }, [worksiteCosts, worksiteId]);

  // ==================== COMPUTED DATA ====================

  const empMap = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);

  const stats = useMemo(() => {
    let totalHours = 0;
    let totalLabourCost = 0;
    let totalBreakPaid = 0;
    let totalBreakUnpaid = 0;
    let totalTravel = 0;
    const daysWorked = new Set<string>();

    worksiteShifts.forEach(sh => {
      const emp = empMap.get(sh.userId);
      const workedHours = getShiftWorkedHours(sh, companySettings.paidRestMinutes);
      const h = getHours(sh.clockIn, sh.clockOut);
      const brk = calcBreaks(sh.breaks || [], h, companySettings.paidRestMinutes);
      const travel = calcTravel(sh.travelSegments || []);
      const costInfo = emp ? getEmployeeCostPerHour(emp) : { total: 0 };
      const shiftCost = costInfo.total * workedHours;

      totalHours += workedHours;
      totalLabourCost += shiftCost;
      totalBreakPaid += brk.paid;
      totalBreakUnpaid += brk.unpaid;
      totalTravel += travel;
      daysWorked.add(sh.clockIn.toDate().toISOString().split('T')[0]);
    });

    const manualTotal = wsCosts.reduce((sum, c) => sum + c.amount, 0);
    const contractValue = (worksite as any)?.contractValue || 0;
    const totalCost = totalLabourCost + manualTotal;
    const margin = contractValue - totalCost;
    const marginPct = contractValue > 0 ? (margin / contractValue) * 100 : null;

    return {
      totalHours, totalLabourCost, totalBreakPaid, totalBreakUnpaid, totalTravel,
      numDays: daysWorked.size, numShifts: worksiteShifts.length,
      manualTotal, contractValue, totalCost, margin, marginPct,
      avgHoursPerDay: daysWorked.size > 0 ? totalHours / daysWorked.size : 0,
    };
  }, [worksiteShifts, wsCosts, empMap, companySettings, worksite]);

  // By employee
  const byEmployee = useMemo(() => {
    const emps: Map<string, { hours: number; cost: number; shifts: number; emp: Employee }> = new Map();
    worksiteShifts.forEach(sh => {
      const emp = empMap.get(sh.userId);
      if (!emp) return;
      const workedHours = getShiftWorkedHours(sh, companySettings.paidRestMinutes);
      const costInfo = getEmployeeCostPerHour(emp);
      const data = emps.get(emp.id) || { hours: 0, cost: 0, shifts: 0, emp };
      data.hours += workedHours;
      data.cost += costInfo.total * workedHours;
      data.shifts += 1;
      emps.set(emp.id, data);
    });
    return Array.from(emps.values()).sort((a, b) => b.hours - a.hours);
  }, [worksiteShifts, empMap, companySettings]);

  // By category (subcontractor/supplier from cost entries)
  const byCategory = useMemo(() => {
    const cats: Map<string, { amount: number; count: number; entries: WorksiteCost[] }> = new Map();
    wsCosts.forEach(c => {
      const key = c.category || 'Uncategorised';
      const data = cats.get(key) || { amount: 0, count: 0, entries: [] };
      data.amount += c.amount;
      data.count += 1;
      data.entries.push(c);
      cats.set(key, data);
    });
    return Array.from(cats.entries()).map(([category, data]) => ({
      category,
      ...data,
      isSubcontractor: subcontractors.includes(category),
      isSupplier: suppliers.includes(category),
    })).sort((a, b) => b.amount - a.amount);
  }, [wsCosts, subcontractors, suppliers]);

  // Weekly hours chart data
  const weeklyData = useMemo(() => {
    const weeks: Map<string, { hours: number; cost: number; label: string }> = new Map();
    worksiteShifts.forEach(sh => {
      const d = sh.clockIn.toDate();
      const day = d.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      const monday = new Date(d);
      monday.setDate(monday.getDate() + mondayOffset);
      const key = monday.toISOString().split('T')[0];
      const weekEnd = new Date(monday);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const label = `${monday.getDate()}/${monday.getMonth() + 1}`;
      const emp = empMap.get(sh.userId);
      const workedHours = getShiftWorkedHours(sh, companySettings.paidRestMinutes);
      const costInfo = emp ? getEmployeeCostPerHour(emp) : { total: 0 };
      const data = weeks.get(key) || { hours: 0, cost: 0, label };
      data.hours += workedHours;
      data.cost += costInfo.total * workedHours;
      weeks.set(key, data);
    });
    return Array.from(weeks.entries()).map(([key, d]) => ({ key, ...d })).sort((a, b) => a.key.localeCompare(b.key));
  }, [worksiteShifts, empMap, companySettings]);

  // Daily timeline
  const dailyTimeline = useMemo(() => {
    const days: Map<string, { date: string; shifts: { empName: string; hours: number; workerType: string }[] }> = new Map();
    worksiteShifts.forEach(sh => {
      const dateStr = sh.clockIn.toDate().toISOString().split('T')[0];
      const emp = empMap.get(sh.userId);
      const workedHours = getShiftWorkedHours(sh, companySettings.paidRestMinutes);
      const data = days.get(dateStr) || { date: dateStr, shifts: [] };
      data.shifts.push({
        empName: emp?.name || emp?.email?.split('@')[0] || 'Unknown',
        hours: workedHours,
        workerType: emp?.costing?.workerType || 'unset',
      });
      days.set(dateStr, data);
    });
    return Array.from(days.values()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  }, [worksiteShifts, empMap, companySettings]);

  const maxEmpHours = Math.max(...byEmployee.map(e => e.hours), 1);

  // ==================== RENDER ====================

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: isMobile ? '8px' : '24px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: theme.bg, borderRadius: '16px', width: '100%',
          maxWidth: '1100px', maxHeight: '90vh', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          border: `1px solid ${theme.cardBorder}`,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ==================== HEADER ==================== */}
        <div style={{
          padding: isMobile ? '16px' : '20px 24px',
          borderBottom: `1px solid ${theme.cardBorder}`,
          background: theme.card, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <h2 style={{ color: theme.text, margin: 0, fontSize: isMobile ? '18px' : '22px', fontWeight: '700' }}>
                  🏗️ {worksiteName}
                </h2>
                {worksite?.status && (
                  <span style={{
                    fontSize: '11px', padding: '2px 10px', borderRadius: '10px', fontWeight: '600',
                    background: worksite.status === 'active' ? theme.successBg : theme.cardAlt,
                    color: worksite.status === 'active' ? theme.success : theme.textMuted,
                  }}>
                    {worksite.status === 'active' ? 'Active' : 'Archived'}
                  </span>
                )}
              </div>
              {worksite?.address && (
                <p style={{ color: theme.textMuted, fontSize: '13px', margin: 0 }}>{worksite.address}</p>
              )}
            </div>
            <button onClick={onClose} style={{
              background: theme.cardAlt, border: `1px solid ${theme.cardBorder}`,
              borderRadius: '8px', padding: '8px 16px', cursor: 'pointer',
              color: theme.text, fontWeight: '600', fontSize: '14px',
            }}>
              ✕ Close
            </button>
          </div>

          {/* Period filter + Tabs */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '4px', background: theme.cardAlt, borderRadius: '8px', padding: '3px' }}>
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'trades', label: 'Trades' },
                { id: 'team', label: 'Team' },
                { id: 'costs', label: 'Costs' },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id as any)}
                  style={{
                    padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                    fontWeight: '600', fontSize: '13px',
                    background: tab === t.id ? theme.primary : 'transparent',
                    color: tab === t.id ? 'white' : theme.textMuted,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[{ d: 14, label: '14d' }, { d: 42, label: '6w' }, { d: 90, label: '3m' }].map(p => (
                <button
                  key={p.d}
                  onClick={() => setPeriod(p.d)}
                  style={{
                    padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '500', cursor: 'pointer',
                    border: `1px solid ${period === p.d ? theme.primary : theme.cardBorder}`,
                    background: period === p.d ? theme.primary : 'transparent',
                    color: period === p.d ? 'white' : theme.textMuted,
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ==================== SCROLLABLE CONTENT ==================== */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '24px' }}>

          {/* ==================== OVERVIEW TAB ==================== */}
          {tab === 'overview' && (
            <>
              {/* Contract banner */}
              {stats.contractValue > 0 && (
                <div style={{
                  ...styles.card,
                  background: stats.margin >= 0 ? theme.successBg : theme.dangerBg,
                  border: `1px solid ${stats.margin >= 0 ? theme.success : theme.danger}40`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  flexWrap: 'wrap', gap: '16px',
                }}>
                  <div>
                    <div style={{ color: theme.textMuted, fontSize: '12px' }}>Contract Value</div>
                    <div style={{ color: theme.text, fontSize: '22px', fontWeight: '700' }}>${stats.contractValue.toLocaleString()}</div>
                  </div>
                  <div>
                    <div style={{ color: theme.textMuted, fontSize: '12px' }}>Total Spend</div>
                    <div style={{ color: theme.text, fontSize: '22px', fontWeight: '700' }}>${stats.totalCost.toFixed(0)}</div>
                  </div>
                  <div>
                    <div style={{ color: theme.textMuted, fontSize: '12px' }}>Remaining</div>
                    <div style={{ color: stats.margin >= 0 ? theme.success : theme.danger, fontSize: '22px', fontWeight: '700' }}>
                      ${stats.margin.toFixed(0)}
                    </div>
                  </div>
                  {stats.marginPct !== null && (
                    <div>
                      <div style={{ color: theme.textMuted, fontSize: '12px' }}>Margin</div>
                      <div style={{ color: stats.margin >= 0 ? theme.success : theme.danger, fontSize: '28px', fontWeight: '800' }}>
                        {stats.marginPct.toFixed(0)}%
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Stat cards */}
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {[
                  { label: 'Total Hours', value: stats.totalHours.toFixed(1), sub: `${stats.numShifts} shifts`, color: theme.primary },
                  { label: 'Labour Cost', value: `$${stats.totalLabourCost.toFixed(0)}`, sub: `${stats.numDays} workdays`, color: theme.success },
                  { label: 'Other Costs', value: `$${stats.manualTotal.toFixed(0)}`, sub: `${wsCosts.length} entries`, color: theme.warning },
                  { label: 'Avg Hours/Day', value: stats.avgHoursPerDay.toFixed(1), sub: `${byEmployee.length} workers`, color: '#8b5cf6' },
                  { label: 'Break Time', value: `${stats.totalBreakPaid + stats.totalBreakUnpaid}m`, sub: `${stats.totalBreakPaid}m paid`, color: '#ef4444' },
                ].map(s => (
                  <div key={s.label} style={styles.statCard}>
                    <div style={{ color: theme.textMuted, fontSize: '12px', marginBottom: '4px' }}>{s.label}</div>
                    <div style={{ color: s.color, fontSize: '22px', fontWeight: '700' }}>{s.value}</div>
                    <div style={{ color: theme.textMuted, fontSize: '11px', marginTop: '2px' }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Weekly hours chart */}
              {weeklyData.length > 0 && (
                <div style={styles.card}>
                  <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Weekly Hours</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={weeklyData}>
                      <XAxis dataKey="label" tick={{ fill: theme.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: theme.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={35} />
                      <Tooltip {...tooltipStyle} formatter={(value: any) => [`${Number(value).toFixed(1)} hrs`, 'Hours']} />
                      <Bar dataKey="hours" fill={theme.primary} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Cost breakdown donut + employee list side by side */}
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {/* Cost split: Labour vs Other */}
                <div style={{ ...styles.card, flex: 1, minWidth: isMobile ? '100%' : '280px' }}>
                  <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Cost Split</h3>
                  {stats.totalCost > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Labour', value: Math.round(stats.totalLabourCost) },
                            ...(stats.manualTotal > 0 ? [{ name: 'Other', value: Math.round(stats.manualTotal) }] : []),
                          ]}
                          cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value"
                        >
                          <Cell fill={theme.success} />
                          {stats.manualTotal > 0 && <Cell fill={theme.warning} />}
                        </Pie>
                        <Tooltip {...tooltipStyle} formatter={(value: any) => [`$${value}`, '']} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ color: theme.textMuted, textAlign: 'center', padding: '40px 0', fontSize: '14px' }}>No cost data yet</div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: theme.success }} />
                      <span style={{ color: theme.textMuted, fontSize: '12px' }}>Labour ${stats.totalLabourCost.toFixed(0)}</span>
                    </div>
                    {stats.manualTotal > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: theme.warning }} />
                        <span style={{ color: theme.textMuted, fontSize: '12px' }}>Other ${stats.manualTotal.toFixed(0)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Hours by employee */}
                <div style={{ ...styles.card, flex: 1, minWidth: isMobile ? '100%' : '320px' }}>
                  <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Hours by Employee</h3>
                  {byEmployee.length === 0 ? (
                    <div style={{ color: theme.textMuted, textAlign: 'center', padding: '40px 0', fontSize: '14px' }}>No shifts in this period</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {byEmployee.map((emp, i) => {
                        const pct = maxEmpHours > 0 ? (emp.hours / maxEmpHours) * 100 : 0;
                        const typeLabel = emp.emp?.costing?.workerType === 'paye' ? 'PAYE' :
                          emp.emp?.costing?.workerType === 'contractor_gst' ? 'GST' :
                          emp.emp?.costing?.workerType === 'contractor_no_gst' ? 'Contractor' : '';
                        return (
                          <div key={emp.emp.id}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                              <span style={{ color: theme.text, fontSize: '13px', fontWeight: '500' }}>
                                {emp.emp.name || emp.emp.email?.split('@')[0]}
                                {typeLabel && <span style={{ color: theme.textMuted, fontWeight: '400', marginLeft: '6px', fontSize: '11px' }}>{typeLabel}</span>}
                              </span>
                              <span style={{ color: theme.textMuted, fontSize: '12px' }}>{emp.hours.toFixed(1)}h · ${emp.cost.toFixed(0)}</span>
                            </div>
                            <div style={{ height: '7px', borderRadius: '4px', background: theme.cardAlt, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length], borderRadius: '4px' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ==================== TRADES TAB ==================== */}
          {tab === 'trades' && (
            <>
              <div style={styles.card}>
                <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Cost by Subcontractor / Supplier</h3>
                {byCategory.length === 0 ? (
                  <div style={{ color: theme.textMuted, textAlign: 'center', padding: '30px 0', fontSize: '14px' }}>
                    No cost entries for this worksite yet. Use "+ Add Cost" on the Analytics page to add entries.
                  </div>
                ) : (
                  <>
                    {/* Category bars */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {byCategory.map((cat, i) => {
                        const maxAmt = Math.max(...byCategory.map(c => c.amount), 1);
                        const pct = (cat.amount / maxAmt) * 100;
                        return (
                          <div key={cat.category}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ color: theme.text, fontSize: '14px', fontWeight: '600' }}>{cat.category}</span>
                                <span style={{
                                  fontSize: '10px', padding: '2px 8px', borderRadius: '8px', fontWeight: '600',
                                  background: cat.isSubcontractor ? '#dbeafe' : cat.isSupplier ? '#fef3c7' : theme.cardAlt,
                                  color: cat.isSubcontractor ? '#2563eb' : cat.isSupplier ? '#d97706' : theme.textMuted,
                                }}>
                                  {cat.isSubcontractor ? 'Subcontractor' : cat.isSupplier ? 'Supplier' : 'Other'}
                                </span>
                                <span style={{ color: theme.textMuted, fontSize: '12px' }}>{cat.count} entr{cat.count === 1 ? 'y' : 'ies'}</span>
                              </div>
                              <span style={{ color: theme.text, fontSize: '15px', fontWeight: '700' }}>${cat.amount.toFixed(2)}</span>
                            </div>
                            <div style={{ height: '8px', borderRadius: '4px', background: theme.cardAlt, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length], borderRadius: '4px' }} />
                            </div>

                            {/* Individual entries under this category */}
                            <div style={{ marginTop: '8px', paddingLeft: '12px' }}>
                              {cat.entries.sort((a, b) => {
                                const da = a.date?.toDate ? a.date.toDate().getTime() : 0;
                                const db2 = b.date?.toDate ? b.date.toDate().getTime() : 0;
                                return db2 - da;
                              }).map(entry => {
                                const d: Date = entry.date?.toDate ? entry.date.toDate() : new Date(entry.date as any);
                                return (
                                  <div key={entry.id} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '6px 0', borderBottom: `1px solid ${theme.cardBorder}`,
                                  }}>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                                      <span style={{ color: theme.textMuted, fontSize: '12px', minWidth: '70px' }}>
                                        {d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}
                                      </span>
                                      {entry.reference && <span style={{ color: theme.textMuted, fontSize: '12px' }}>{entry.reference}</span>}
                                      {entry.description && <span style={{ color: theme.textMuted, fontSize: '12px' }}>{entry.description}</span>}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                      <span style={{ color: theme.text, fontWeight: '600', fontSize: '13px' }}>${entry.amount.toFixed(2)}</span>
                                      <button
                                        onClick={() => onDeleteCost(worksiteId, entry.id)}
                                        disabled={deletingCostId === entry.id}
                                        style={{ ...styles.btnDanger, fontSize: '11px', padding: '3px 8px', opacity: deletingCostId === entry.id ? 0.5 : 1 }}
                                      >
                                        {deletingCostId === entry.id ? '...' : '✕'}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Totals */}
                    <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: `2px solid ${theme.cardBorder}`, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: theme.text, fontSize: '14px', fontWeight: '700' }}>Total Other Costs</span>
                      <span style={{ color: theme.primary, fontSize: '16px', fontWeight: '700' }}>${stats.manualTotal.toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Labour cost by worker type for this worksite */}
              <div style={styles.card}>
                <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Labour Cost by Worker Type</h3>
                {byEmployee.length === 0 ? (
                  <div style={{ color: theme.textMuted, textAlign: 'center', padding: '20px 0', fontSize: '14px' }}>No shift data</div>
                ) : (() => {
                  const byType: Map<string, { hours: number; cost: number; emps: typeof byEmployee }> = new Map();
                  byEmployee.forEach(emp => {
                    const wt = emp.emp?.costing?.workerType || 'unset';
                    const label = wt === 'paye' ? 'PAYE' : wt === 'contractor_gst' ? 'Contractor (GST)' : wt === 'contractor_no_gst' ? 'Contractor' : 'Not Set';
                    const data = byType.get(label) || { hours: 0, cost: 0, emps: [] };
                    data.hours += emp.hours;
                    data.cost += emp.cost;
                    data.emps.push(emp);
                    byType.set(label, data);
                  });
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {Array.from(byType.entries()).sort(([, a], [, b]) => b.cost - a.cost).map(([label, data], i) => (
                        <div key={label}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ color: theme.text, fontSize: '14px', fontWeight: '600' }}>{label}</span>
                            <span style={{ color: theme.textMuted, fontSize: '13px' }}>${data.cost.toFixed(0)} · {data.hours.toFixed(1)}h</span>
                          </div>
                          <div style={{ height: '8px', borderRadius: '4px', background: theme.cardAlt, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${stats.totalLabourCost > 0 ? (data.cost / stats.totalLabourCost) * 100 : 0}%`, background: CHART_COLORS[i % CHART_COLORS.length], borderRadius: '4px' }} />
                          </div>
                          {/* Employees in this type */}
                          <div style={{ paddingLeft: '12px', marginTop: '6px' }}>
                            {data.emps.map(emp => (
                              <div key={emp.emp.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
                                <span style={{ color: theme.textMuted }}>{emp.emp.name || emp.emp.email?.split('@')[0]}</span>
                                <span style={{ color: theme.textMuted }}>{emp.hours.toFixed(1)}h · ${emp.cost.toFixed(0)} · ${emp.emp.costing?.hourlyRate || 0}/hr</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </>
          )}

          {/* ==================== TEAM TAB ==================== */}
          {tab === 'team' && (
            <div style={styles.card}>
              <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Team on this Worksite</h3>
              {byEmployee.length === 0 ? (
                <div style={{ color: theme.textMuted, textAlign: 'center', padding: '30px 0', fontSize: '14px' }}>No workers in this period</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
                  {byEmployee.map(emp => {
                    const costInfo = getEmployeeCostPerHour(emp.emp);
                    const wt = emp.emp.costing?.workerType;
                    const typeLabel = wt === 'paye' ? 'PAYE' : wt === 'contractor_gst' ? 'Contractor GST' : wt === 'contractor_no_gst' ? 'Contractor' : 'Not Set';
                    const typeColor = wt === 'paye' ? theme.success : wt?.includes('contractor') ? theme.warning : theme.textMuted;
                    return (
                      <div key={emp.emp.id} style={{
                        border: `1px solid ${theme.cardBorder}`, borderRadius: '10px',
                        padding: '16px', background: theme.cardAlt,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                          <div>
                            <div style={{ color: theme.text, fontSize: '15px', fontWeight: '600' }}>{emp.emp.name || emp.emp.email?.split('@')[0]}</div>
                            <div style={{ color: theme.textMuted, fontSize: '12px', marginTop: '2px' }}>{emp.emp.email}</div>
                          </div>
                          <span style={{
                            fontSize: '11px', padding: '3px 10px', borderRadius: '10px', fontWeight: '600',
                            background: wt === 'paye' ? theme.successBg : theme.warningBg || '#fef3c7',
                            color: typeColor,
                          }}>
                            {typeLabel}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ color: theme.textMuted, fontSize: '11px' }}>Hours</div>
                            <div style={{ color: theme.primary, fontSize: '18px', fontWeight: '700' }}>{emp.hours.toFixed(1)}</div>
                          </div>
                          <div>
                            <div style={{ color: theme.textMuted, fontSize: '11px' }}>Cost</div>
                            <div style={{ color: theme.text, fontSize: '18px', fontWeight: '700' }}>${emp.cost.toFixed(0)}</div>
                          </div>
                          <div>
                            <div style={{ color: theme.textMuted, fontSize: '11px' }}>Rate</div>
                            <div style={{ color: theme.textMuted, fontSize: '18px', fontWeight: '700' }}>${costInfo.total.toFixed(0)}/hr</div>
                          </div>
                          <div>
                            <div style={{ color: theme.textMuted, fontSize: '11px' }}>Shifts</div>
                            <div style={{ color: theme.textMuted, fontSize: '18px', fontWeight: '700' }}>{emp.shifts}</div>
                          </div>
                        </div>
                        {wt === 'paye' && costInfo.onCosts > 0 && (
                          <div style={{ marginTop: '10px', padding: '8px 12px', background: theme.card, borderRadius: '8px', fontSize: '12px', color: theme.textMuted }}>
                            On-costs: {(() => {
                              const c = emp.emp.costing;
                              const parts: string[] = [];
                              if (c?.kiwiSaverOption && c.kiwiSaverOption !== 'none') {
                                const pct = c.kiwiSaverOption === 'custom' ? c.kiwiSaverCustom : parseFloat(c.kiwiSaverOption);
                                parts.push(`KiwiSaver ${pct}%`);
                              }
                              if (c?.holidayPayOption) {
                                const pct = c.holidayPayOption === 'custom' ? c.holidayPayCustom : 8;
                                parts.push(`Holiday ${pct}%`);
                              }
                              if (c?.accLevy) parts.push(`ACC ${c.accLevy}%`);
                              return parts.join(' + ');
                            })()} = <span style={{ fontWeight: '600', color: theme.success }}>${costInfo.onCosts.toFixed(2)}/hr</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ==================== COSTS TAB ==================== */}
          {tab === 'costs' && (
            <>
              {/* Summary */}
              <div style={{ ...styles.card, display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: theme.textMuted, fontSize: '12px' }}>Labour Cost</div>
                  <div style={{ color: theme.success, fontSize: '22px', fontWeight: '700' }}>${stats.totalLabourCost.toFixed(2)}</div>
                </div>
                <div>
                  <div style={{ color: theme.textMuted, fontSize: '12px' }}>Other Costs</div>
                  <div style={{ color: theme.warning, fontSize: '22px', fontWeight: '700' }}>${stats.manualTotal.toFixed(2)}</div>
                </div>
                <div>
                  <div style={{ color: theme.textMuted, fontSize: '12px' }}>Total Cost</div>
                  <div style={{ color: theme.primary, fontSize: '22px', fontWeight: '700' }}>${stats.totalCost.toFixed(2)}</div>
                </div>
                {stats.contractValue > 0 && (
                  <div>
                    <div style={{ color: theme.textMuted, fontSize: '12px' }}>Margin</div>
                    <div style={{ color: stats.margin >= 0 ? theme.success : theme.danger, fontSize: '22px', fontWeight: '700' }}>
                      {stats.margin >= 0 ? '+' : ''}${stats.margin.toFixed(2)}
                    </div>
                  </div>
                )}
              </div>

              {/* All cost entries table */}
              <div style={styles.card}>
                <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>All Cost Entries</h3>
                {wsCosts.length === 0 ? (
                  <div style={{ color: theme.textMuted, textAlign: 'center', padding: '30px 0', fontSize: '14px' }}>
                    No cost entries yet. Use "+ Add Cost" on the Analytics page.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '550px' }}>
                      <thead>
                        <tr style={{ borderBottom: `2px solid ${theme.cardBorder}` }}>
                          {['Date', 'Category', 'Reference', 'Description', 'Amount', ''].map(h => (
                            <th key={h} style={{ padding: '10px 8px', textAlign: h === 'Amount' ? 'right' : 'left', color: theme.textMuted, fontSize: '12px', fontWeight: '500' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {wsCosts.sort((a, b) => {
                          const da = a.date?.toDate ? a.date.toDate().getTime() : 0;
                          const db2 = b.date?.toDate ? b.date.toDate().getTime() : 0;
                          return db2 - da;
                        }).map(cost => {
                          const d: Date = cost.date?.toDate ? cost.date.toDate() : new Date(cost.date as any);
                          return (
                            <tr key={cost.id} style={{ borderBottom: `1px solid ${theme.cardBorder}` }}>
                              <td style={{ padding: '10px 8px', color: theme.textMuted, fontSize: '13px' }}>
                                {d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </td>
                              <td style={{ padding: '10px 8px' }}>
                                <span style={{
                                  fontSize: '12px', padding: '2px 8px', borderRadius: '6px', fontWeight: '500',
                                  background: subcontractors.includes(cost.category) ? '#dbeafe' :
                                    suppliers.includes(cost.category) ? '#fef3c7' : theme.cardAlt,
                                  color: subcontractors.includes(cost.category) ? '#2563eb' :
                                    suppliers.includes(cost.category) ? '#d97706' : theme.text,
                                }}>
                                  {cost.category}
                                </span>
                              </td>
                              <td style={{ padding: '10px 8px', color: theme.textMuted, fontSize: '13px' }}>{cost.reference || '-'}</td>
                              <td style={{ padding: '10px 8px', color: theme.textMuted, fontSize: '13px' }}>{cost.description || '-'}</td>
                              <td style={{ padding: '10px 8px', color: theme.text, fontWeight: '600', fontSize: '13px', textAlign: 'right' }}>
                                ${cost.amount.toFixed(2)}
                              </td>
                              <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                                <button
                                  onClick={() => onDeleteCost(worksiteId, cost.id)}
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
                      <tfoot>
                        <tr style={{ borderTop: `2px solid ${theme.cardBorder}` }}>
                          <td colSpan={4} style={{ padding: '10px 8px', color: theme.text, fontWeight: '700', fontSize: '14px' }}>Total</td>
                          <td style={{ padding: '10px 8px', color: theme.primary, fontWeight: '700', fontSize: '15px', textAlign: 'right' }}>
                            ${stats.manualTotal.toFixed(2)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* Daily timeline */}
              {dailyTimeline.length > 0 && (
                <div style={styles.card}>
                  <h3 style={{ color: theme.text, marginBottom: '16px', fontSize: '16px' }}>Daily Activity</h3>
                  {dailyTimeline.map(day => {
                    const d = new Date(day.date);
                    const totalHrs = day.shifts.reduce((s, sh) => s + sh.hours, 0);
                    return (
                      <div key={day.date} style={{
                        display: 'flex', gap: '16px', padding: '10px 0',
                        borderBottom: `1px solid ${theme.cardBorder}`, alignItems: 'center',
                      }}>
                        <div style={{ width: '70px', flexShrink: 0 }}>
                          <div style={{ color: theme.text, fontSize: '13px', fontWeight: '600' }}>
                            {d.toLocaleDateString('en-NZ', { weekday: 'short' })}
                          </div>
                          <div style={{ color: theme.textMuted, fontSize: '12px' }}>
                            {d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}
                          </div>
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {day.shifts.map((sh, i) => (
                            <span key={i} style={{
                              fontSize: '12px', padding: '4px 10px', borderRadius: '6px',
                              background: theme.cardAlt, border: `1px solid ${theme.cardBorder}`,
                              color: theme.text,
                            }}>
                              {sh.empName} <span style={{ color: theme.textMuted }}>{sh.hours.toFixed(1)}h</span>
                            </span>
                          ))}
                        </div>
                        <div style={{ color: theme.primary, fontWeight: '700', fontSize: '14px', flexShrink: 0 }}>
                          {totalHrs.toFixed(1)}h
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
