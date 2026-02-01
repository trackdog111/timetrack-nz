// Trackable NZ - Demo Mode Context
// Provides demo data throughout the app when in demo mode

import React, { createContext, useContext, ReactNode } from 'react';
import { Shift, ChatMessage, Expense, Employee, CompanyLabels } from './types';
import { 
  demoShifts, 
  demoChatMessages, 
  demoExpenses, 
  demoEmployees,
  demoCompanyLabels,
  DEMO_USER_ID,
  DEMO_USER_EMAIL,
  DEMO_USER_NAME
} from './demoData';

interface DemoContextType {
  isDemoMode: boolean;
  demoUserId: string;
  demoUserEmail: string;
  demoUserName: string;
  getShifts: () => Shift[];
  getActiveShift: () => Shift | null;
  getChatMessages: () => ChatMessage[];
  getExpenses: () => Expense[];
  getEmployees: () => Employee[];
  getCompanyLabels: () => CompanyLabels;
}

const DemoContext = createContext<DemoContextType | null>(null);

export function DemoProvider({ 
  children, 
  isDemoMode 
}: { 
  children: ReactNode; 
  isDemoMode: boolean;
}) {
  const getShifts = (): Shift[] => {
    if (!isDemoMode) return [];
    return demoShifts.filter((s: Shift) => s.userId === DEMO_USER_ID);
  };

  const getActiveShift = (): Shift | null => {
    if (!isDemoMode) return null;
    return demoShifts.find((s: Shift) => s.userId === DEMO_USER_ID && s.status === 'active') || null;
  };

  const getChatMessages = (): ChatMessage[] => {
    if (!isDemoMode) return [];
    return demoChatMessages;
  };

  const getExpenses = (): Expense[] => {
    if (!isDemoMode) return [];
    return demoExpenses.filter((e: Expense) => e.odId === DEMO_USER_ID);
  };

  const getEmployees = (): Employee[] => {
    if (!isDemoMode) return [];
    return demoEmployees;
  };

  const getCompanyLabels = (): CompanyLabels => {
    return demoCompanyLabels;
  };

  return (
    <DemoContext.Provider value={{
      isDemoMode,
      demoUserId: DEMO_USER_ID,
      demoUserEmail: DEMO_USER_EMAIL,
      demoUserName: DEMO_USER_NAME,
      getShifts,
      getActiveShift,
      getChatMessages,
      getExpenses,
      getEmployees,
      getCompanyLabels
    }}>
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) {
    throw new Error('useDemo must be used within a DemoProvider');
  }
  return context;
}
