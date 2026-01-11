// Trackable NZ - Type Definitions
// UPDATED: Added Expense types and updated ViewType to include 'expenses'

export interface Location {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  source?: 'tracking' | 'clockIn' | 'clockOut' | 'travelStart' | 'travelEnd' | 'breakStart' | 'breakEnd';
}

export interface Break {
  startTime: any; // Firestore Timestamp
  endTime?: any;
  durationMinutes?: number;
  manualEntry?: boolean;
}

export interface TravelSegment {
  startTime: any;
  endTime?: any;
  durationMinutes?: number;
  startLocation?: Location;
  endLocation?: Location;
}

export interface JobLog {
  field1: string;  // Default label: "Notes"
  field2: string;  // Default label: "Materials"
  field3: string;  // Default label: "Other"
}

export interface Shift {
  id: string;
  companyId: string;  // NEW: Required for multi-tenant
  userId: string;
  userEmail?: string;
  clockIn: any;
  clockOut?: any;
  clockInLocation?: Location;
  clockOutLocation?: Location;
  clockInPhotoUrl?: string;  // Photo verification at clock-in
  locationHistory: Location[];
  breaks: Break[];
  travelSegments?: TravelSegment[];
  jobLog: JobLog;
  status: 'active' | 'completed';
  manualEntry?: boolean;
  // Edit tracking
  editedAt?: any;
  editedBy?: string;
  editedByEmail?: string;
  // Finalization
  finalized?: boolean;
  finalizedAt?: any;
  finalizedBy?: string;
  finalizedByEmail?: string;
}

export interface CompanyLabels {
  field1Label: string;
  field2Label: string;
  field3Label: string;
  managerDisplayName: string;
  paidRestMinutes: number; // Minutes per paid rest break (default: 10, can be 10/15/20/25/30)
  payWeekEndDay: number;   // Day of week pay period ends (0=Sunday, 1=Monday, etc.)
}

export const defaultLabels: CompanyLabels = {
  field1Label: 'Notes',
  field2Label: 'Materials',
  field3Label: 'Other',
  managerDisplayName: 'Manager',
  paidRestMinutes: 10,
  payWeekEndDay: 0 // Sunday
};

export interface EmployeeSettings {
  gpsTracking: boolean;
  gpsInterval: number;
  requireNotes: boolean;
  chatEnabled: boolean;
  photoVerification?: boolean;
  companyLabels?: CompanyLabels;
  // Auto-travel detection settings
  autoTravel?: boolean;
  autoTravelInterval?: number; // 1, 2, or 5 minutes
  detectionDistance?: number;  // 100, 200, or 500 meters
  // Field toggles
  field1Enabled?: boolean;  // defaults to true
  field2Enabled?: boolean;  // defaults to false
  field3Enabled?: boolean;  // defaults to false
}

// NEW: Employee interface with companyId
export interface Employee {
  id: string;
  companyId: string;  // NEW: Required for multi-tenant
  email: string;
  name: string;
  role: 'manager' | 'employee';
  settings: EmployeeSettings;
  createdAt: any;
}

export interface ChatMessage {
  id: string;
  companyId: string;  // NEW: Required for multi-tenant
  type: 'team' | 'dm';
  senderId: string;
  senderEmail: string;
  text: string;
  timestamp: any;
  participants?: string[];
}

export interface Invite {
  id: string;
  companyId: string;  // NEW: Required for multi-tenant
  email: string;
  name: string;
  status: 'pending' | 'accepted' | 'cancelled';
  createdAt: any;
}

// ==================== EXPENSE TYPES ====================

export interface Expense {
  id: string;
  companyId: string;
  odId: string;         // User ID (matches odId in shifts)
  odName: string;       // Employee name for display
  odEmail: string;      // Employee email
  amount: number;       // Dollar amount
  category: ExpenseCategory;
  photoUrl?: string;    // Firebase Storage URL (optional)
  note?: string;        // Optional description
  date: any;            // Firestore Timestamp - expense date
  status: 'pending' | 'approved';
  createdAt: any;       // Firestore Timestamp
  approvedAt?: any;     // Firestore Timestamp
  approvedBy?: string;  // Manager email who approved
}

export type ExpenseCategory = 
  | 'Mileage'
  | 'Parking'
  | 'Fuel'
  | 'Meals'
  | 'Accommodation'
  | 'Tools'
  | 'Materials'
  | 'PPE/Safety Gear'
  | 'Phone/Data'
  | 'Other';

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Mileage',
  'Parking',
  'Fuel',
  'Meals',
  'Accommodation',
  'Tools',
  'Materials',
  'PPE/Safety Gear',
  'Phone/Data',
  'Other'
];

// ==================== VIEW TYPES ====================

export type ViewType = 'clock' | 'joblog' | 'chat' | 'history' | 'expenses';  // UPDATED: Added 'expenses'
export type ChatTabType = 'team' | 'employer';
export type AuthMode = 'signin' | 'invite';
export type InviteStep = 'email' | 'password';
