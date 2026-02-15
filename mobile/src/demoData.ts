// Trackable NZ - Demo Data for App Store Review
// NO BACKGROUND TRACKING - only discrete location stamps for actions

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

const daysAgo = (days: number, hour: number = 8, minute: number = 0): Timestamp => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
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

// Demo Shifts - NO TRACKING, only discrete location stamps
export const demoShifts: Shift[] = [
  // Today - Active shift for demo user (no clock out yet)
  {
    id: 'demo-shift-active',
    companyId: DEMO_COMPANY_ID,
    userId: DEMO_USER_ID,
    userEmail: DEMO_USER_EMAIL,
    clockIn: hoursAgo(2),
    clockInLocation: {
      latitude: aucklandLocations.newmarket.latitude,
      longitude: aucklandLocations.newmarket.longitude,
      accuracy: 12,
      timestamp: Date.now() - 2 * 60 * 60 * 1000,
      source: 'clockIn'
    },
    locationHistory: [
      // Break start location
      {
        latitude: aucklandLocations.newmarket.latitude + 0.0003,
        longitude: aucklandLocations.newmarket.longitude + 0.0002,
        accuracy: 10,
        timestamp: Date.now() - 1 * 60 * 60 * 1000,
        source: 'breakStart'
      },
      // Break end location
      {
        latitude: aucklandLocations.newmarket.latitude + 0.0003,
        longitude: aucklandLocations.newmarket.longitude + 0.0002,
        accuracy: 10,
        timestamp: Date.now() - 0.75 * 60 * 60 * 1000,
        source: 'breakEnd'
      }
    ],
    breaks: [
      {
        startTime: hoursAgo(1),
        endTime: hoursAgo(0.75),
        durationMinutes: 15
      }
    ],
    travelSegments: [],
    worksiteId: 'demo-worksite-1',
    worksiteName: 'Newmarket Apartments',
    jobLog: {
      field1: 'Installing kitchen cabinets - Level 3',
      field2: 'Cabinet hardware, screws, brackets',
      field3: ''
    },
    status: 'active'
  },
  // Yesterday - Completed shift with breaks
  {
    id: 'demo-shift-1',
    companyId: DEMO_COMPANY_ID,
    userId: DEMO_USER_ID,
    userEmail: DEMO_USER_EMAIL,
    clockIn: daysAgo(1, 7, 0),
    clockOut: daysAgo(1, 15, 30),
    clockInLocation: {
      latitude: aucklandLocations.cbd.latitude,
      longitude: aucklandLocations.cbd.longitude,
      accuracy: 15,
      timestamp: daysAgo(1, 7, 0).toMillis(),
      source: 'clockIn'
    },
    clockOutLocation: {
      latitude: aucklandLocations.cbd.latitude + 0.0005,
      longitude: aucklandLocations.cbd.longitude + 0.0003,
      accuracy: 10,
      timestamp: daysAgo(1, 15, 30).toMillis(),
      source: 'clockOut'
    },
    locationHistory: [
      // First break (15 min)
      {
        latitude: aucklandLocations.cbd.latitude + 0.001,
        longitude: aucklandLocations.cbd.longitude + 0.0005,
        accuracy: 12,
        timestamp: daysAgo(1, 10, 0).toMillis(),
        source: 'breakStart'
      },
      {
        latitude: aucklandLocations.cbd.latitude + 0.001,
        longitude: aucklandLocations.cbd.longitude + 0.0005,
        accuracy: 12,
        timestamp: daysAgo(1, 10, 15).toMillis(),
        source: 'breakEnd'
      },
      // Lunch break (30 min)
      {
        latitude: aucklandLocations.cbd.latitude + 0.002,
        longitude: aucklandLocations.cbd.longitude - 0.001,
        accuracy: 10,
        timestamp: daysAgo(1, 12, 30).toMillis(),
        source: 'breakStart'
      },
      {
        latitude: aucklandLocations.cbd.latitude + 0.002,
        longitude: aucklandLocations.cbd.longitude - 0.001,
        accuracy: 10,
        timestamp: daysAgo(1, 13, 0).toMillis(),
        source: 'breakEnd'
      }
    ],
    breaks: [
      {
        startTime: daysAgo(1, 10, 0),
        endTime: daysAgo(1, 10, 15),
        durationMinutes: 15
      },
      {
        startTime: daysAgo(1, 12, 30),
        endTime: daysAgo(1, 13, 0),
        durationMinutes: 30
      }
    ],
    travelSegments: [],
    worksiteId: 'demo-worksite-2',
    worksiteName: 'CBD Office Tower',
    jobLog: {
      field1: 'Completed bathroom renovation - final inspection passed',
      field2: 'Tiles, grout, silicone, tapware',
      field3: ''
    },
    status: 'completed',
    finalized: true,
    finalizedAt: daysAgo(1, 16, 0),
    finalizedBy: 'demo-manager',
    finalizedByEmail: 'manager@demo.trackable.co.nz'
  },
  // 2 days ago - with travel
  {
    id: 'demo-shift-2',
    companyId: DEMO_COMPANY_ID,
    userId: DEMO_USER_ID,
    userEmail: DEMO_USER_EMAIL,
    clockIn: daysAgo(2, 6, 30),
    clockOut: daysAgo(2, 14, 0),
    clockInLocation: {
      latitude: aucklandLocations.greenlane.latitude,
      longitude: aucklandLocations.greenlane.longitude,
      accuracy: 8,
      timestamp: daysAgo(2, 6, 30).toMillis(),
      source: 'clockIn'
    },
    clockOutLocation: {
      latitude: aucklandLocations.ellerslie.latitude,
      longitude: aucklandLocations.ellerslie.longitude,
      accuracy: 12,
      timestamp: daysAgo(2, 14, 0).toMillis(),
      source: 'clockOut'
    },
    locationHistory: [
      // Break
      {
        latitude: aucklandLocations.greenlane.latitude + 0.0005,
        longitude: aucklandLocations.greenlane.longitude + 0.0003,
        accuracy: 10,
        timestamp: daysAgo(2, 9, 0).toMillis(),
        source: 'breakStart'
      },
      {
        latitude: aucklandLocations.greenlane.latitude + 0.0005,
        longitude: aucklandLocations.greenlane.longitude + 0.0003,
        accuracy: 10,
        timestamp: daysAgo(2, 9, 15).toMillis(),
        source: 'breakEnd'
      },
      // Travel
      {
        latitude: aucklandLocations.greenlane.latitude,
        longitude: aucklandLocations.greenlane.longitude,
        accuracy: 10,
        timestamp: daysAgo(2, 11, 0).toMillis(),
        source: 'travelStart'
      },
      {
        latitude: aucklandLocations.ellerslie.latitude,
        longitude: aucklandLocations.ellerslie.longitude,
        accuracy: 10,
        timestamp: daysAgo(2, 11, 30).toMillis(),
        source: 'travelEnd'
      }
    ],
    breaks: [
      {
        startTime: daysAgo(2, 9, 0),
        endTime: daysAgo(2, 9, 15),
        durationMinutes: 15
      }
    ],
    travelSegments: [
      {
        startTime: daysAgo(2, 11, 0),
        endTime: daysAgo(2, 11, 30),
        durationMinutes: 30,
        startLocation: {
          latitude: aucklandLocations.greenlane.latitude,
          longitude: aucklandLocations.greenlane.longitude,
          accuracy: 10,
          timestamp: daysAgo(2, 11, 0).toMillis(),
          source: 'travelStart'
        },
        endLocation: {
          latitude: aucklandLocations.ellerslie.latitude,
          longitude: aucklandLocations.ellerslie.longitude,
          accuracy: 10,
          timestamp: daysAgo(2, 11, 30).toMillis(),
          source: 'travelEnd'
        }
      }
    ],
    worksiteId: 'demo-worksite-3',
    worksiteName: 'Greenlane Renovation',
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
    clockIn: daysAgo(3, 8, 0),
    clockOut: daysAgo(3, 17, 0),
    clockInLocation: {
      latitude: aucklandLocations.mtEden.latitude,
      longitude: aucklandLocations.mtEden.longitude,
      accuracy: 10,
      timestamp: daysAgo(3, 8, 0).toMillis(),
      source: 'clockIn'
    },
    clockOutLocation: {
      latitude: aucklandLocations.mtEden.latitude + 0.0005,
      longitude: aucklandLocations.mtEden.longitude + 0.0005,
      accuracy: 15,
      timestamp: daysAgo(3, 17, 0).toMillis(),
      source: 'clockOut'
    },
    locationHistory: [
      // Morning break
      {
        latitude: aucklandLocations.mtEden.latitude + 0.0008,
        longitude: aucklandLocations.mtEden.longitude + 0.0003,
        accuracy: 10,
        timestamp: daysAgo(3, 10, 0).toMillis(),
        source: 'breakStart'
      },
      {
        latitude: aucklandLocations.mtEden.latitude + 0.0008,
        longitude: aucklandLocations.mtEden.longitude + 0.0003,
        accuracy: 10,
        timestamp: daysAgo(3, 10, 15).toMillis(),
        source: 'breakEnd'
      },
      // Lunch break
      {
        latitude: aucklandLocations.mtEden.latitude - 0.001,
        longitude: aucklandLocations.mtEden.longitude + 0.0008,
        accuracy: 12,
        timestamp: daysAgo(3, 13, 0).toMillis(),
        source: 'breakStart'
      },
      {
        latitude: aucklandLocations.mtEden.latitude - 0.001,
        longitude: aucklandLocations.mtEden.longitude + 0.0008,
        accuracy: 12,
        timestamp: daysAgo(3, 13, 30).toMillis(),
        source: 'breakEnd'
      }
    ],
    breaks: [
      {
        startTime: daysAgo(3, 10, 0),
        endTime: daysAgo(3, 10, 15),
        durationMinutes: 15
      },
      {
        startTime: daysAgo(3, 13, 0),
        endTime: daysAgo(3, 13, 30),
        durationMinutes: 30
      }
    ],
    travelSegments: [],
    worksiteId: 'demo-worksite-4',
    worksiteName: 'Mt Eden Residential',
    jobLog: {
      field1: 'Residential deck construction - day 2 of 3',
      field2: 'Kwila decking boards, joist hangers, coach bolts',
      field3: ''
    },
    status: 'completed',
    finalized: true,
    finalizedAt: daysAgo(2, 9, 0),
    finalizedBy: 'demo-manager',
    finalizedByEmail: 'manager@demo.trackable.co.nz'
  },
  // 5 days ago
  {
    id: 'demo-shift-4',
    companyId: DEMO_COMPANY_ID,
    userId: DEMO_USER_ID,
    userEmail: DEMO_USER_EMAIL,
    clockIn: daysAgo(5, 7, 0),
    clockOut: daysAgo(5, 16, 0),
    clockInLocation: {
      latitude: aucklandLocations.ponsonby.latitude,
      longitude: aucklandLocations.ponsonby.longitude,
      accuracy: 18,
      timestamp: daysAgo(5, 7, 0).toMillis(),
      source: 'clockIn'
    },
    clockOutLocation: {
      latitude: aucklandLocations.ponsonby.latitude - 0.0005,
      longitude: aucklandLocations.ponsonby.longitude + 0.0005,
      accuracy: 14,
      timestamp: daysAgo(5, 16, 0).toMillis(),
      source: 'clockOut'
    },
    locationHistory: [
      // Lunch break only
      {
        latitude: aucklandLocations.ponsonby.latitude + 0.001,
        longitude: aucklandLocations.ponsonby.longitude - 0.0005,
        accuracy: 10,
        timestamp: daysAgo(5, 12, 0).toMillis(),
        source: 'breakStart'
      },
      {
        latitude: aucklandLocations.ponsonby.latitude + 0.001,
        longitude: aucklandLocations.ponsonby.longitude - 0.0005,
        accuracy: 10,
        timestamp: daysAgo(5, 12, 30).toMillis(),
        source: 'breakEnd'
      }
    ],
    breaks: [
      {
        startTime: daysAgo(5, 12, 0),
        endTime: daysAgo(5, 12, 30),
        durationMinutes: 30
      }
    ],
    travelSegments: [],
    worksiteId: 'demo-worksite-5',
    worksiteName: 'Ponsonby Commercial Fit-out',
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
    worksiteId: 'demo-worksite-2',
    worksiteName: 'CBD Office Tower',
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
    worksiteId: 'demo-worksite-3',
    worksiteName: 'Greenlane Renovation',
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
    worksiteId: 'demo-worksite-2',
    worksiteName: 'CBD Office Tower',
    date: daysAgo(1, 8),
    status: 'pending',
    createdAt: daysAgo(1, 16)
  }
];

// Demo Worksites
export const demoWorksites = [
  {
    id: 'demo-worksite-1',
    companyId: DEMO_COMPANY_ID,
    name: 'Newmarket Apartments',
    address: '42 Broadway, Newmarket, Auckland 1023',
    latitude: aucklandLocations.newmarket.latitude,
    longitude: aucklandLocations.newmarket.longitude,
    status: 'active',
    createdAt: daysAgo(60)
  },
  {
    id: 'demo-worksite-2',
    companyId: DEMO_COMPANY_ID,
    name: 'CBD Office Tower',
    address: '15 Queen Street, Auckland CBD 1010',
    latitude: aucklandLocations.cbd.latitude,
    longitude: aucklandLocations.cbd.longitude,
    status: 'active',
    createdAt: daysAgo(45)
  },
  {
    id: 'demo-worksite-3',
    companyId: DEMO_COMPANY_ID,
    name: 'Greenlane Renovation',
    address: '88 Great South Rd, Greenlane, Auckland 1051',
    latitude: aucklandLocations.greenlane.latitude,
    longitude: aucklandLocations.greenlane.longitude,
    status: 'active',
    createdAt: daysAgo(30)
  },
  {
    id: 'demo-worksite-4',
    companyId: DEMO_COMPANY_ID,
    name: 'Mt Eden Residential',
    address: '7 Valley Rd, Mt Eden, Auckland 1024',
    latitude: aucklandLocations.mtEden.latitude,
    longitude: aucklandLocations.mtEden.longitude,
    status: 'active',
    createdAt: daysAgo(20)
  },
  {
    id: 'demo-worksite-5',
    companyId: DEMO_COMPANY_ID,
    name: 'Ponsonby Commercial Fit-out',
    address: '120 Ponsonby Rd, Ponsonby, Auckland 1011',
    latitude: aucklandLocations.ponsonby.latitude,
    longitude: aucklandLocations.ponsonby.longitude,
    status: 'active',
    createdAt: daysAgo(15)
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
