// Trackable NZ - Type Definitions
// UPDATED: Added Worksite types, added worksiteId to Shift, added Expense types

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

// ==================== WORKSITE TYPES ====================

export interface Worksite {
  id: string;
  companyId: string;
  name: string;
  address?: string;
  status: 'active' | 'archived';
  createdAt: any;
  updatedAt: any;
}

// ==================== SHIFT ====================

export interface Shift {
  id: string;
  companyId: string;
  userId: string;
  userEmail?: string;
  clockIn: any;
  clockOut?: any;
  clockInLocation?: Location;
  clockOutLocation?: Location;
  clockInPhotoUrl?: string;
  locationHistory: Location[];
  breaks: Break[];
  travelSegments?: TravelSegment[];
  jobLog: JobLog;
  status: 'active' | 'completed';
  manualEntry?: boolean;
  worksiteId?: string;       // NEW: Optional worksite reference
  worksiteName?: string;     // NEW: Denormalized name for display
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
  paidRestMinutes: number;
  payWeekEndDay: number;
}

export const defaultLabels: CompanyLabels = {
  field1Label: 'Notes',
  field2Label: 'Materials',
  field3Label: 'Other',
  managerDisplayName: 'Manager',
  paidRestMinutes: 10,
  payWeekEndDay: 0
};

export interface EmployeeSettings {
  gpsTracking: boolean;
  gpsInterval: number;
  requireNotes: boolean;
  chatEnabled: boolean;
  photoVerification?: boolean;
  requireWorksite?: boolean;
  companyLabels?: CompanyLabels;
  autoTravel?: boolean;
  autoTravelInterval?: number;
  detectionDistance?: number;
  field1Enabled?: boolean;
  field2Enabled?: boolean;
  field3Enabled?: boolean;
}

export interface Employee {
  id: string;
  companyId: string;
  email: string;
  name: string;
  role: 'manager' | 'employee';
  settings: EmployeeSettings;
  createdAt: any;
}

export interface ChatMessage {
  id: string;
  companyId: string;
  type: 'team' | 'dm';
  senderId: string;
  senderEmail: string;
  text: string;
  timestamp: any;
  participants?: string[];
}

export interface Invite {
  id: string;
  companyId: string;
  email: string;
  name: string;
  status: 'pending' | 'accepted' | 'cancelled';
  createdAt: any;
}

// ==================== EXPENSE TYPES ====================

export interface Expense {
  id: string;
  companyId: string;
  odId: string;
  odName: string;
  odEmail: string;
  amount: number;
  category: ExpenseCategory;
  photoUrl?: string;
  note?: string;
  date: any;
  status: 'pending' | 'approved';
  createdAt: any;
  approvedAt?: any;
  approvedBy?: string;
}

export type ExpenseCategory = 
  | 'Fuel'
  | 'Mileage'
  | 'Materials'
  | 'Equipment'
  | 'Phone'
  | 'Accommodation'
  | 'Meals'
  | 'Parking'
  | 'Other';

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Fuel',
  'Mileage',
  'Materials',
  'Equipment',
  'Phone',
  'Accommodation',
  'Meals',
  'Parking',
  'Other'
];

// ==================== VIEW TYPES ====================

export type ViewType = 'clock' | 'joblog' | 'chat' | 'history' | 'expenses';
export type ChatTabType = 'team' | 'employer';
export type AuthMode = 'signin' | 'invite';
export type InviteStep = 'email' | 'password';
