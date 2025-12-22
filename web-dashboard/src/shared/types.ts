import { Timestamp } from 'firebase/firestore';

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

export interface Shift {
  id: string;
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
  editedAt?: Timestamp;
  editedBy?: string;
  editedByEmail?: string;
  finalized?: boolean;
  finalizedAt?: Timestamp;
  finalizedBy?: string;
  finalizedByEmail?: string;
}

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
  email: string;
  name: string;
  role: string;
  settings: EmployeeSettings;
  createdAt: Timestamp;
}

export interface ChatMessage {
  id: string;
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
}

export interface Invite {
  id: string;
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