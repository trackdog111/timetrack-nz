// TimeTrack NZ - Utility Functions

import { Break, TravelSegment, EmployeeSettings } from './types';

// Default employee settings
export const defaultSettings: EmployeeSettings = {
  gpsTracking: true,
  gpsInterval: 10,
  requireNotes: false,
  chatEnabled: true
};

/**
 * Calculate break entitlements based on NZ Employment Relations Act 2000
 */
export function getBreakEntitlements(hoursWorked: number) {
  let paid = 0, unpaid = 0;
  if (hoursWorked >= 14) { paid = 5; unpaid = 2; }
  else if (hoursWorked >= 12) { paid = 4; unpaid = 2; }
  else if (hoursWorked >= 10) { paid = 3; unpaid = 1; }
  else if (hoursWorked >= 6) { paid = 2; unpaid = 1; }
  else if (hoursWorked >= 4) { paid = 1; unpaid = 1; }
  else if (hoursWorked >= 2) { paid = 1; unpaid = 0; }
  return { paidMinutes: paid * 10, unpaidMinutes: unpaid * 30 };
}

/**
 * Calculate paid vs unpaid breaks based on entitlements
 */
export function calcBreaks(breaks: Break[], hours: number) {
  const total = breaks.reduce((s, b) => s + (b.durationMinutes || 0), 0);
  const ent = getBreakEntitlements(hours);
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
