// Trackable NZ - Demo Data for App Store Review
// This provides sample data so Apple reviewers can explore the app without signing up

import { Timestamp } from 'firebase/firestore';
import { Employee, Shift, ChatMessage, Expense, EmployeeSettings, CompanyLabels, Location } from './types';

// Demo company ID - used throughout demo mode
export const DEMO_COMPANY_ID = 'demo-company-nz';

// Demo user (the reviewer will be logged in as this person)
export const DEMO_USER_ID = 'demo-user-sarah';
export const DEMO_USER_EMAIL = 'sarah@demo.trackable.co.nz';
export const DEMO_USER_NAME = 'Sarah Mitchell';

// Default settings for demo
const demoSettings: EmployeeSettings = {
  gpsTracking: true,
  gpsInterval: 5,
  requireNotes: false,
  chatEnabled: true,
  photoVerification: false,
  field1Enabled: true,
  field2Enabled: true,
  field3Enabled: false,
  autoTravel: false,
  companyLabels: {
    field1Label: 'Job Notes',
    field2Label: 'Materials Used',
    field3Label: 'Other',
    managerDisplayName: 'Site Manager',
    paidRestMinutes: 15,
    payWeekEndDay: 0
  }
};

// Helper to create timestamps relative to now
const hoursAgo = (hours: number): Timestamp => {
  return Timestamp.fromDate(new Date(Date.now() - hours * 60 * 60 * 1000));
};

const daysAgo = (days: number, hour: number = 8): Timestamp => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return Timestamp.fromDate(date);
};

// Auckland coordinates for realistic GPS data
const aucklandLocations = {
  cbd: { latitude: -36.8485, longitude: 174.7633 },
  newmarket: { latitude: -36.8694, longitude: 174.7789 },
  ponsonby: { latitude: -36.8575, longitude: 174.7456 },
  mtEden: { latitude: -36.8772, longitude: 174.7645 },
  parnell: { latitude: -36.8556, longitude: 174.7822 },
  greenlane: { latitude: -36.8906, longitude: 174.8031 },
  ellerslie: { latitude: -36.8983, longitude: 174.8167 },
};

// Generate GPS trail between two points
const generateGpsTrail = (
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number },
  startTime: number,
  points: number = 5
): Location[] => {
  const trail: Location[] = [];
  for (let i = 0; i <= points; i++) {
    const ratio = i / points;
    trail.push({
      latitude: start.latitude + (end.latitude - start.latitude) * ratio + (Math.random() - 0.5) * 0.001,
      longitude: start.longitude + (end.longitude - start.longitude) * ratio + (Math.random() - 0.5) * 0.001,
      accuracy: 10 + Math.random() * 20,
      timestamp: startTime + (i * 30 * 60 * 1000), // 30 min intervals
      source: i === 0 ? 'clockIn' : i === points ? 'clockOut' : 'tracking'
    });
  }
  return trail;
};

// Demo Employees
export const demoEmployees: Employee[] = [
  {
    id: DEMO_USER_ID,
    companyId: DEMO_COMPANY_ID,
    email: DEMO_USER_EMAIL,
    name: DEMO_USER_NAME,
    role: 'employee',
    settings: demoSettings,
    createdAt: daysAgo(90)
  },
  {
    id: 'demo-user-mike',
    companyId: DEMO_COMPANY_ID,
    email: 'mike@demo.trackable.co.nz',
    name: 'Mike Thompson',
    role: 'employee',
    settings: demoSettings,
    createdAt: daysAgo(60)
  },
  {
    id: 'demo-user-james',
    companyId: DEMO_COMPANY_ID,
    email: 'james@demo.trackable.co.nz',
    name: 'James Wilson',
    role: 'employee',
    settings: demoSettings,
    createdAt: daysAgo(45)
  },
  {
    id: 'demo-user-emma',
    companyId: DEMO_COMPANY_ID,
    email: 'emma@demo.trackable.co.nz',
    name: 'Emma Roberts',
    role: 'employee',
    settings: demoSettings,
    createdAt: daysAgo(30)
  },
  {
    id: 'demo-manager',
    companyId: DEMO_COMPANY_ID,
    email: 'manager@demo.trackable.co.nz',
    name: 'David Chen',
    role: 'manager',
    settings: demoSettings,
    createdAt: daysAgo(120)
  }
];

// Demo Shifts - mix of completed and one active
export const demoShifts: Shift[] = [
  // Today - Active shift for demo user
  {
    id: 'demo-shift-active',
    companyId: DEMO_COMPANY_ID,
    userId: DEMO_USER_ID,
    userEmail: DEMO_USER_EMAIL,
    clockIn: hoursAgo(2),
    clockInLocation: {
      ...aucklandLocations.newmarket,
      accuracy: 12,
      timestamp: Date.now() - 2 * 60 * 60 * 1000,
      source: 'clockIn'
    },
    locationHistory: generateGpsTrail(
      aucklandLocations.newmarket,
      aucklandLocations.parnell,
      Date.now() - 2 * 60 * 60 * 1000,
      4
    ),
    breaks: [],
    travelSegments: [],
    jobLog: {
      field1: 'Installing kitchen cabinets - Level 3',
      field2: 'Cabinet hardware, screws, brackets',
      field3: ''
    },
    status: 'active'
  },
  // Yesterday - Completed shift
  {
    id: 'demo-shift-1',
    companyId: DEMO_COMPANY_ID,
    userId: DEMO_USER_ID,
    userEmail: DEMO_USER_EMAIL,
    clockIn: daysAgo(1, 7),
    clockOut: daysAgo(1, 15),
    clockInLocation: {
      ...aucklandLocations.cbd,
      accuracy: 15,
      timestamp: daysAgo(1, 7).toMillis(),
      source: 'clockIn'
    },
    clockOutLocation: {
      ...aucklandLocations.cbd,
      accuracy: 10,
      timestamp: daysAgo(1, 15).toMillis(),
      source: 'clockOut'
    },
    locationHistory: generateGpsTrail(
      aucklandLocations.cbd,
      aucklandLocations.ponsonby,
      daysAgo(1, 7).toMillis(),
      8
    ),
    breaks: [
      {
        startTime: daysAgo(1, 10),
        endTime: daysAgo(1, 10.25),
        durationMinutes: 15
      },
      {
        startTime: daysAgo(1, 12),
        endTime: daysAgo(1, 12.5),
        durationMinutes: 30
      }
    ],
    travelSegments: [],
    jobLog: {
      field1: 'Completed bathroom renovation - final inspection passed',
      field2: 'Tiles, grout, silicone, tapware',
      field3: ''
    },
    status: 'completed',
    finalized: true,
    finalizedAt: daysAgo(1, 16),
    finalizedBy: 'demo-manager',
    finalizedByEmail: 'manager@demo.trackable.co.nz'
  },
  // 2 days ago
  {
    id: 'demo-shift-2',
    companyId: DEMO_COMPANY_ID,
    userId: DEMO_USER_ID,
    userEmail: DEMO_USER_EMAIL,
    clockIn: daysAgo(2, 6),
    clockOut: daysAgo(2, 14),
    clockInLocation: {
      ...aucklandLocations.greenlane,
      accuracy: 8,
      timestamp: daysAgo(2, 6).toMillis(),
      source: 'clockIn'
    },
    clockOutLocation: {
      ...aucklandLocations.greenlane,
      accuracy: 12,
      timestamp: daysAgo(2, 14).toMillis(),
      source: 'clockOut'
    },
    locationHistory: generateGpsTrail(
      aucklandLocations.greenlane,
      aucklandLocations.ellerslie,
      daysAgo(2, 6).toMillis(),
      6
    ),
    breaks: [
      {
        startTime: daysAgo(2, 9),
        endTime: daysAgo(2, 9.25),
        durationMinutes: 15
      }
    ],
    travelSegments: [
      {
        startTime: daysAgo(2, 11),
        endTime: daysAgo(2, 11.5),
        durationMinutes: 30
      }
    ],
    jobLog: {
      field1: 'Scaffolding setup for exterior paint job',
      field2: 'Scaffold frames x12, planks x8, safety mesh',
      field3: ''
    },
    status: 'completed'
  },
  // 3 days ago
  {
    id: 'demo-shift-3',
    companyId: DEMO_COMPANY_ID,
    userId: DEMO_USER_ID,
    userEmail: DEMO_USER_EMAIL,
    clockIn: daysAgo(3, 8),
    clockOut: daysAgo(3, 17),
    clockInLocation: {
      ...aucklandLocations.mtEden,
      accuracy: 10,
      timestamp: daysAgo(3, 8).toMillis(),
      source: 'clockIn'
    },
    clockOutLocation: {
      ...aucklandLocations.mtEden,
      accuracy: 15,
      timestamp: daysAgo(3, 17).toMillis(),
      source: 'clockOut'
    },
    locationHistory: generateGpsTrail(
      aucklandLocations.mtEden,
      aucklandLocations.newmarket,
      daysAgo(3, 8).toMillis(),
      10
    ),
    breaks: [
      {
        startTime: daysAgo(3, 10),
        endTime: daysAgo(3, 10.25),
        durationMinutes: 15
      },
      {
        startTime: daysAgo(3, 13),
        endTime: daysAgo(3, 13.5),
        durationMinutes: 30
      }
    ],
    travelSegments: [],
    jobLog: {
      field1: 'Residential deck construction - day 2 of 3',
      field2: 'Kwila decking boards, joist hangers, coach bolts',
      field3: ''
    },
    status: 'completed',
    finalized: true,
    finalizedAt: daysAgo(2, 9),
    finalizedBy: 'demo-manager',
    finalizedByEmail: 'manager@demo.trackable.co.nz'
  },
  // 5 days ago
  {
    id: 'demo-shift-4',
    companyId: DEMO_COMPANY_ID,
    userId: DEMO_USER_ID,
    userEmail: DEMO_USER_EMAIL,
    clockIn: daysAgo(5, 7),
    clockOut: daysAgo(5, 16),
    clockInLocation: {
      ...aucklandLocations.ponsonby,
      accuracy: 18,
      timestamp: daysAgo(5, 7).toMillis(),
      source: 'clockIn'
    },
    clockOutLocation: {
      ...aucklandLocations.ponsonby,
      accuracy: 14,
      timestamp: daysAgo(5, 16).toMillis(),
      source: 'clockOut'
    },
    locationHistory: generateGpsTrail(
      aucklandLocations.ponsonby,
      aucklandLocations.cbd,
      daysAgo(5, 7).toMillis(),
      8
    ),
    breaks: [
      {
        startTime: daysAgo(5, 12),
        endTime: daysAgo(5, 12.5),
        durationMinutes: 30
      }
    ],
    travelSegments: [],
    jobLog: {
      field1: 'Commercial fit-out - electrical rough-in coordination',
      field2: 'Cable ties, conduit, junction boxes',
      field3: ''
    },
    status: 'completed'
  }
];

// Demo Chat Messages
export const demoChatMessages: ChatMessage[] = [
  {
    id: 'demo-chat-1',
    companyId: DEMO_COMPANY_ID,
    type: 'team',
    senderId: 'demo-manager',
    senderEmail: 'manager@demo.trackable.co.nz',
    text: 'Good morning team! Remember we have the safety briefing at 7am tomorrow.',
    timestamp: hoursAgo(4)
  },
  {
    id: 'demo-chat-2',
    companyId: DEMO_COMPANY_ID,
    type: 'team',
    senderId: 'demo-user-mike',
    senderEmail: 'mike@demo.trackable.co.nz',
    text: 'Got it, thanks David!',
    timestamp: hoursAgo(3.5)
  },
  {
    id: 'demo-chat-3',
    companyId: DEMO_COMPANY_ID,
    type: 'team',
    senderId: DEMO_USER_ID,
    senderEmail: DEMO_USER_EMAIL,
    text: 'Will be there. Also, I finished the cabinet install at Newmarket - ready for inspection.',
    timestamp: hoursAgo(2)
  },
  {
    id: 'demo-chat-4',
    companyId: DEMO_COMPANY_ID,
    type: 'team',
    senderId: 'demo-manager',
    senderEmail: 'manager@demo.trackable.co.nz',
    text: 'Excellent work Sarah! I\'ll schedule the inspection for tomorrow arvo.',
    timestamp: hoursAgo(1.5)
  }
];

// Demo Expenses
export const demoExpenses: Expense[] = [
  {
    id: 'demo-expense-1',
    companyId: DEMO_COMPANY_ID,
    odId: DEMO_USER_ID,
    odName: DEMO_USER_NAME,
    odEmail: DEMO_USER_EMAIL,
    amount: 85.50,
    category: 'Materials',
    note: 'Extra screws and brackets from Bunnings',
    date: daysAgo(1, 12),
    status: 'approved',
    createdAt: daysAgo(1, 15),
    approvedAt: daysAgo(1, 17),
    approvedBy: 'manager@demo.trackable.co.nz'
  },
  {
    id: 'demo-expense-2',
    companyId: DEMO_COMPANY_ID,
    odId: DEMO_USER_ID,
    odName: DEMO_USER_NAME,
    odEmail: DEMO_USER_EMAIL,
    amount: 62.00,
    category: 'Fuel',
    note: 'Site travel - Greenlane to Ellerslie return',
    date: daysAgo(2, 14),
    status: 'approved',
    createdAt: daysAgo(2, 14),
    approvedAt: daysAgo(2, 16),
    approvedBy: 'manager@demo.trackable.co.nz'
  },
  {
    id: 'demo-expense-3',
    companyId: DEMO_COMPANY_ID,
    odId: DEMO_USER_ID,
    odName: DEMO_USER_NAME,
    odEmail: DEMO_USER_EMAIL,
    amount: 24.50,
    category: 'Parking',
    note: 'CBD parking - Wilson carpark',
    date: daysAgo(1, 8),
    status: 'pending',
    createdAt: daysAgo(1, 16)
  }
];

// Company labels for demo
export const demoCompanyLabels: CompanyLabels = {
  field1Label: 'Job Notes',
  field2Label: 'Materials Used',
  field3Label: 'Other',
  managerDisplayName: 'Site Manager',
  paidRestMinutes: 15,
  payWeekEndDay: 0
};
