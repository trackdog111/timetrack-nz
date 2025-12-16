// TimeTrack NZ - Type Definitions

export interface Location {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
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
  userId: string;
  userEmail?: string;
  clockIn: any;
  clockOut?: any;
  clockInLocation?: Location;
  clockOutLocation?: Location;
  locationHistory: Location[];
  breaks: Break[];
  travelSegments?: TravelSegment[];
  jobLog: JobLog;
  status: 'active' | 'completed';
  manualEntry?: boolean;
}

export interface CompanyLabels {
  field1Label: string;
  field2Label: string;
  field3Label: string;
  managerDisplayName: string;
  paidRestMinutes: number; // Minutes per paid rest break (default: 10, can be 10/15/20/25/30)
}

export const defaultLabels: CompanyLabels = {
  field1Label: 'Notes',
  field2Label: 'Materials',
  field3Label: 'Other',
  managerDisplayName: 'Manager',
  paidRestMinutes: 10
};

export interface EmployeeSettings {
  gpsTracking: boolean;
  gpsInterval: number;
  requireNotes: boolean;
  chatEnabled: boolean;
  companyLabels?: CompanyLabels;
}

export interface ChatMessage {
  id: string;
  type: 'team' | 'dm';
  senderId: string;
  senderEmail: string;
  text: string;
  timestamp: any;
  participants?: string[];
}

export interface Invite {
  id: string;
  email: string;
  name: string;
  status: 'pending' | 'accepted' | 'cancelled';
  createdAt: any;
}

export type ViewType = 'clock' | 'joblog' | 'chat' | 'history';
export type ChatTabType = 'team' | 'employer';
export type AuthMode = 'signin' | 'invite';
export type InviteStep = 'email' | 'password';