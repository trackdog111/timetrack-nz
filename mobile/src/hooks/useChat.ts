// TimeTrack NZ - Chat Hook

import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { ChatMessage, ChatTabType } from '../types';

export function useChat(user: User | null, chatEnabled: boolean) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatTab, setChatTab] = useState<ChatTabType>('team');

  // Subscribe to messages
  useEffect(() => {
    if (!user || !chatEnabled) return;

    const q = query(
      collection(db, 'messages'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(
        snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }) as ChatMessage)
          .reverse()
      );
    });

    return () => unsubscribe();
  }, [user, chatEnabled]);

  // Send message
  const sendMessage = async () => {
    if (!user || !newMessage.trim()) return;

    try {
      const msgData: any = {
        type: chatTab === 'team' ? 'team' : 'dm',
        senderId: user.uid,
        senderEmail: user.email,
        text: newMessage.trim(),
        timestamp: Timestamp.now()
      };

      if (chatTab === 'employer') {
        msgData.participants = [user.uid, 'employer'];
      }

      await addDoc(collection(db, 'messages'), msgData);
      setNewMessage('');
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  // Send job update to chat (for share feature)
  const sendJobUpdate = async (
    text: string,
    destination: 'team' | 'manager'
  ) => {
    if (!user) return false;

    try {
      const msgData: any = {
        type: destination === 'team' ? 'team' : 'dm',
        senderId: user.uid,
        senderEmail: user.email,
        text: text,
        timestamp: Timestamp.now()
      };

      if (destination === 'manager') {
        msgData.participants = [user.uid, 'employer'];
      }

      await addDoc(collection(db, 'messages'), msgData);
      return true;
    } catch (err) {
      console.error('Failed to send job update:', err);
      return false;
    }
  };

  return {
    messages,
    newMessage,
    setNewMessage,
    chatTab,
    setChatTab,
    sendMessage,
    sendJobUpdate
  };
}
