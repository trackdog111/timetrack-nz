import { Timestamp } from 'firebase/firestore';
import { Break, TravelSegment, JobLog, EmployeeSettings, CompanySettings } from './types';

export const defaultSettings: EmployeeSettings = {
  gpsTracking: true,
  gpsInterval: 10,
  requireNotes: false,
  chatEnabled: true,
  autoTravel: false,
  autoTravelInterval: 2,
  detectionDistance: 200
};

export const defaultCompanySettings: CompanySettings = {
  field1Label: 'Notes',
  field2Label: 'Materials',
  field3Label: 'Other',
  managerDisplayName: 'Manager',
  paidRestMinutes: 10,
  payWeekEndDay: 0,
  photoVerification: false
};

export const weekDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Calculate break entitlements based on NZ Employment Relations Act 2000 Section 69ZD
 */
export function getBreakEntitlements(hoursWorked: number, paidRestMinutes: number = 10) {
  let paid = 0, unpaid = 0;
  
  if (hoursWorked >= 16) {
    // Cycle resets every 8 hours
    const cycles = Math.floor(hoursWorked / 8);
    const remainder = hoursWorked % 8;
    // Each 8h cycle: 2 paid rest + 1 unpaid meal
    paid = cycles * 2;
    unpaid = cycles;
    // Add entitlements for remaining hours
    if (remainder >= 6) { paid += 2; unpaid += 1; }
    else if (remainder >= 4) { paid += 1; unpaid += 1; }
    else if (remainder >= 2) { paid += 1; }
  }
  else if (hoursWorked >= 14) { paid = 4; unpaid = 2; }
  else if (hoursWorked >= 12) { paid = 3; unpaid = 2; }
  else if (hoursWorked >= 10) { paid = 3; unpaid = 1; }
  else if (hoursWorked >= 6) { paid = 2; unpaid = 1; }
  else if (hoursWorked >= 4) { paid = 1; unpaid = 1; }
  else if (hoursWorked >= 2) { paid = 1; unpaid = 0; }
  
  return { paidMinutes: paid * paidRestMinutes, unpaidMinutes: unpaid * 30 };
}

export function calcBreaks(breaks: Break[], hours: number, paidRestMinutes: number = 10) {
  const total = breaks.reduce((s, b) => s + (b.durationMinutes || 0), 0);
  const ent = getBreakEntitlements(hours, paidRestMinutes);
  const paid = Math.min(total, ent.paidMinutes);
  return { paid, unpaid: Math.max(0, total - paid), total };
}

export function calcTravel(travelSegments: TravelSegment[]): number {
  return (travelSegments || []).reduce((s, t) => s + (t.durationMinutes || 0), 0);
}

export function fmtDur(m: number): string {
  const h = Math.floor(m / 60);
  const mins = Math.round(m % 60);
  if (h === 0) return `${mins}m`;
  if (mins === 0) return `${h}h`;
  return `${h}h ${mins}m`;
}

export function fmtTime(t?: Timestamp): string {
  if (!t?.toDate) return '--:--';
  return t.toDate().toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function fmtDate(t: Timestamp): string {
  if (!t?.toDate) return '--';
  return t.toDate().toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateShort(t: Timestamp): string {
  if (!t?.toDate) return '--';
  return t.toDate().toLocaleDateString('en-NZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtWeekEnding(date: Date): string {
  return date.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function getHours(start: Timestamp, end?: Timestamp): number {
  if (!start?.toDate) return 0;
  const e = end?.toDate ? end.toDate() : new Date();
  return (e.getTime() - start.toDate().getTime()) / 3600000;
}

export function getWeekEndingDate(shiftDate: Date, payWeekEndDay: number): Date {
  const date = new Date(shiftDate);
  const currentDay = date.getDay();
  let daysUntilEnd = payWeekEndDay - currentDay;
  if (daysUntilEnd < 0) daysUntilEnd += 7;
  date.setDate(date.getDate() + daysUntilEnd);
  date.setHours(23, 59, 59, 999);
  return date;
}

export function getWeekEndingKey(shiftDate: Date, payWeekEndDay: number): string {
  const weekEnd = getWeekEndingDate(shiftDate, payWeekEndDay);
  return weekEnd.toISOString().split('T')[0];
}

export function getJobLogField(jobLog: JobLog | undefined, field: 'field1' | 'field2' | 'field3'): string {
  if (!jobLog) return '';
  if (field === 'field1') return jobLog.field1 || jobLog.notes || '';
  return jobLog[field] || '';
}

export function getTimeComponents(date: Date): { hour: string, minute: string, ampm: 'AM' | 'PM' } {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm: 'AM' | 'PM' = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return { hour: hours.toString(), minute: minutes.toString().padStart(2, '0'), ampm };
}

export function roundTime(date: Date, roundTo: 15 | 30, direction: 'down' | 'up'): Date {
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

export function buildDateFromTime(baseDate: Date, hour: string, minute: string, ampm: 'AM' | 'PM'): Date {
  const result = new Date(baseDate);
  let h = parseInt(hour);
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  result.setHours(h, parseInt(minute), 0, 0);
  return result;
}
