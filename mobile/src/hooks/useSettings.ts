// TimeTrack NZ - Settings Hook

import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { EmployeeSettings, CompanyLabels } from '../types';
import { defaultSettings, defaultLabels } from '../utils';

export function useSettings(user: User | null) {
  const [settings, setSettings] = useState<EmployeeSettings>(defaultSettings);
  const [labels, setLabels] = useState<CompanyLabels>(defaultLabels);

  useEffect(() => {
    if (!user) return;

    const loadSettings = async () => {
      try {
        // Load employee settings
        const docRef = doc(db, 'employees', user.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists() && docSnap.data().settings) {
          const empSettings = { ...defaultSettings, ...docSnap.data().settings };
          setSettings(empSettings);
          
          // If company labels exist in employee settings, use them
          if (empSettings.companyLabels) {
            setLabels({ ...defaultLabels, ...empSettings.companyLabels });
          }
        } else {
          // Create default employee document
          await setDoc(docRef, {
            email: user.email,
            name: user.email?.split('@')[0] || 'Employee',
            role: 'employee',
            settings: defaultSettings,
            createdAt: Timestamp.now()
          }, { merge: true });
        }

        // Try to load company-wide settings (for labels)
        const companyRef = doc(db, 'company', 'settings');
        const companySnap = await getDoc(companyRef);
        if (companySnap.exists()) {
          const companyData = companySnap.data();
          setLabels({
            notesLabel: companyData.notesLabel || defaultLabels.notesLabel,
            materialsLabel: companyData.materialsLabel || defaultLabels.materialsLabel,
            managerDisplayName: companyData.managerDisplayName || defaultLabels.managerDisplayName
          });
        }
      } catch (err) {
        console.error('Error loading settings:', err);
      }
    };

    loadSettings();

    // Also subscribe to company settings changes
    const companyRef = doc(db, 'company', 'settings');
    const unsubscribe = onSnapshot(companyRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setLabels({
          notesLabel: data.notesLabel || defaultLabels.notesLabel,
          materialsLabel: data.materialsLabel || defaultLabels.materialsLabel,
          managerDisplayName: data.managerDisplayName || defaultLabels.managerDisplayName
        });
      }
    });

    return () => unsubscribe();
  }, [user]);

  return { settings, labels };
}
