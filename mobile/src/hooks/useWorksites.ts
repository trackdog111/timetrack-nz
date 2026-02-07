// Trackable NZ - Worksites Hook (Mobile)
// Fetches active worksites for worksite picker on clock-in screen

import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase';
import { Worksite } from '../types';

export function useWorksites(companyId: string | null) {
  const [worksites, setWorksites] = useState<Worksite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) {
      setWorksites([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'worksites'),
      where('companyId', '==', companyId),
      where('status', '==', 'active'),
      orderBy('name', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sites = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Worksite[];
      setWorksites(sites);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching worksites:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [companyId]);

  return { worksites, loading };
}
