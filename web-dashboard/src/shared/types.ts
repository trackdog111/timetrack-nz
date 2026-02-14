import { Timestamp } from 'firebase/firestore';

// NEW: Company interface for multi-tenant support
export interface Company {
  id: string;
  name: string;
  ownerId: string;
  ownerEmail: string;
  createdAt: Timestamp;
  plan?: 'free' | 'pro';
}

export interface Location {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  source?: 'travelStart' | 'travelEnd' | 'breakStart' | 'breakEnd';
}

export interface Break {
  startTime: Timestamp;
  endTime?: Timestamp;
  durationMinutes?: number;
  manualEntry?: boolean;
}

export interface TravelSegment {
  startTime: Timestamp;
  endTime?: Timestamp;
  durationMinutes?: number;
  startLocation?: Location;
  endLocation?: Location;
}

export interface JobLog {
  field1?: string;
  field2?: string;
  field3?: string;
  notes?: string;
}

// ==================== WORKSITE TYPES ====================

export interface Worksite {
  id: string;
  companyId: string;
  name: string;
  address?: string;
  contractValue?: number;
  status: 'active' | 'archived';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ==================== SHIFT ====================

export interface Shift {
  id: string;
  companyId: string;
  userId: string;
  userEmail: string;
  clockIn: Timestamp;
  clockOut?: Timestamp;
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
  editedAt?: Timestamp;
  editedBy?: string;
  editedByEmail?: string;
  finalized?: boolean;
  finalizedAt?: Timestamp;
  finalizedBy?: string;
  finalizedByEmail?: string;
}

// ==================== EMPLOYEE COSTING ====================

export interface EmployeeCosting {
  workerType?: 'paye' | 'contractor_gst' | 'contractor_no_gst';
  hourlyRate?: number;
  kiwiSaverOption?: 'none' | '3' | '3.5' | '4' | 'custom' | null;
  kiwiSaverCustom?: number | null;
  holidayPayOption?: '8' | 'custom' | null;
  holidayPayCustom?: number | null;
  accLevy?: number | null;
}

// ==================== EMPLOYEE ====================

export interface EmployeeSettings {
  gpsTracking: boolean;
  gpsInterval: number;
  requireNotes: boolean;
  chatEnabled: boolean;
  autoTravel?: boolean;
  autoTravelInterval?: number;
  detectionDistance?: number;
}

export interface Employee {
  id: string;
  companyId: string;
  email: string;
  name: string;
  role: 'manager' | 'employee';
  settings: EmployeeSettings;
  costing?: EmployeeCosting;
  createdAt: Timestamp;
}

export interface ChatMessage {
  id: string;
  companyId: string;
  type: string;
  senderId: string;
  senderEmail: string;
  text: string;
  timestamp: Timestamp;
  participants?: string[];
}

export interface CompanySettings {
  field1Label: string;
  field2Label: string;
  field3Label: string;
  field1Enabled?: boolean;
  field2Enabled?: boolean;
  field3Enabled?: boolean;
  managerDisplayName: string;
  paidRestMinutes: number;
  payWeekEndDay: number;
  photoVerification: boolean;
  requireWorksite?: boolean;
}

export interface Invite {
  id: string;
  companyId: string;
  email: string;
  name: string;
  status: 'pending' | 'accepted' | 'cancelled';
  createdAt: Timestamp;
  createdBy?: string;
  emailSent?: boolean;
  emailSentAt?: Timestamp;
}

export interface Theme {
  bg: string;
  card: string;
  cardAlt: string;
  sidebar: string;
  sidebarBorder: string;
  cardBorder: string;
  text: string;
  textMuted: string;
  textLight: string;
  primary: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  danger: string;
  dangerBg: string;
  travel: string;
  travelBg: string;
  input: string;
  inputBorder: string;
}

export interface MapModalProps {
  locations: Location[];
  onClose: () => void;
  title: string;
  theme: Theme;
  clockInLocation?: Location;
  clockOutLocation?: Location;
}

// NEW: Expense types for reimbursement claims
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
  date: Timestamp;
  status: 'pending' | 'approved';
  createdAt: Timestamp;
  approvedAt?: Timestamp;
  approvedBy?: string;
  worksiteId?: string;
  worksiteName?: string;
}

// ==================== WORKSITE COST ====================

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
