// Trackable NZ - Utility Functions

import { Break, TravelSegment, EmployeeSettings } from './types';

// Default employee settings
export const defaultSettings: EmployeeSettings = {
  gpsTracking: true,
  gpsInterval: 10,
  requireNotes: false,
  chatEnabled: true
};

/**
 * Calculate break entitlements based on NZ Employment Relations Act 2000 Section 69ZD
 * @param hoursWorked - Hours worked in the shift
 * @param paidRestMinutes - Minutes per paid rest break (default 10, can be increased by employer)
 */
export function getBreakEntitlements(hoursWorked: number, paidRestMinutes: number = 10) {
  let paidBreaks = 0, unpaidBreaks = 0;
  
  if (hoursWorked >= 16) {
    // Cycle resets every 8 hours
    const cycles = Math.floor(hoursWorked / 8);
    const remainder = hoursWorked % 8;
    // Each 8h cycle: 2 paid rest + 1 unpaid meal
    paidBreaks = cycles * 2;
    unpaidBreaks = cycles;
    // Add entitlements for remaining hours
    if (remainder >= 6) { paidBreaks += 2; unpaidBreaks += 1; }
    else if (remainder >= 4) { paidBreaks += 1; unpaidBreaks += 1; }
    else if (remainder >= 2) { paidBreaks += 1; }
  }
  else if (hoursWorked >= 14) { paidBreaks = 4; unpaidBreaks = 2; }
  else if (hoursWorked >= 12) { paidBreaks = 3; unpaidBreaks = 2; }
  else if (hoursWorked >= 10) { paidBreaks = 3; unpaidBreaks = 1; }
  else if (hoursWorked >= 6) { paidBreaks = 2; unpaidBreaks = 1; }
  else if (hoursWorked >= 4) { paidBreaks = 1; unpaidBreaks = 1; }
  else if (hoursWorked >= 2) { paidBreaks = 1; unpaidBreaks = 0; }
  
  return { 
    paidBreaks,
    unpaidBreaks,
    paidMinutes: paidBreaks * paidRestMinutes, 
    unpaidMinutes: unpaidBreaks * 30,
    paidRestMinutes // Include the per-break duration for display
  };
}

/**
 * Calculate paid vs unpaid breaks based on entitlements
 * @param breaks - Array of breaks taken
 * @param hours - Hours worked in the shift
 * @param paidRestMinutes - Minutes per paid rest break (default 10)
 */
export function calcBreaks(breaks: Break[], hours: number, paidRestMinutes: number = 10) {
  const total = breaks.reduce((s, b) => s + (b.durationMinutes || 0), 0);
  const ent = getBreakEntitlements(hours, paidRestMinutes);
  const paid = Math.min(total, ent.paidMinutes);
  return { paid, unpaid: Math.max(0, total - paid), total };
}

/**
 * Calculate total travel time in minutes
 */
export function calcTravel(travelSegments: TravelSegment[]): number {
  return travelSegments.reduce((s, t) => s + (t.durationMinutes || 0), 0);
}

/**
 * Format duration in minutes to human readable string
 */
export function fmtDur(m: number): string {
  const h = Math.floor(m / 60);
  const mins = Math.round(m % 60);
  if (h === 0) return `${mins}m`;
  if (mins === 0) return `${h}h`;
  return `${h}h ${mins}m`;
}

/**
 * Format Firestore Timestamp to time string
 */
export function fmtTime(t?: any): string {
  if (!t?.toDate) return '--:--';
  return t.toDate().toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', hour12: true });
}

/**
 * Format Firestore Timestamp to date string
 */
export function fmtDate(t: any): string {
  if (!t?.toDate) return '--';
  return t.toDate().toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * Calculate hours between two timestamps
 */
export function getHours(start: any, end?: any): number {
  if (!start?.toDate) return 0;
  const e = end?.toDate ? end.toDate() : new Date();
  return (e.getTime() - start.toDate().getTime()) / 3600000;
}

/**
 * Format time for job update messages
 */
export function fmtTimeShort(date: Date): string {
  return date.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit', hour12: true });
}
