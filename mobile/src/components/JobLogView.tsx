// TimeTrack NZ - Job Log View Component
// Features: 3 customizable text fields with speech-to-text and share

import { useState, useRef, useEffect } from 'react';
import { Theme, createStyles } from '../theme';
import { Shift, CompanyLabels } from '../types';
import { fmtTimeShort } from '../utils';

interface JobLogViewProps {
  theme: Theme;
  currentShift: Shift | null;
  field1: string;
  field2: string;
  field3: string;
  setField1: (value: string) => void;
  setField2: (value: string) => void;
  setField3: (value: string) => void;
  onSave: () => void;
  onShareToChat: (text: string, destination: 'team' | 'manager') => Promise<boolean>;
  labels: CompanyLabels;
  requireNotes: boolean;
  showToast: (message: string) => void;
}

// Check for speech recognition support
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export function JobLogView({
  theme,
  currentShift,
  field1,
  field2,
  field3,
  setField1,
  setField2,
  setField3,
  onSave,
  onShareToChat,
  labels,
  requireNotes,
  showToast
}: JobLogViewProps) {
  const styles = createStyles(theme);
  
  // Speech-to-text state - track which field is listening
  const [listeningField, setListeningField] = useState<1 | 2 | 3 | null>(null);
  const [speechSupported] = useState(!!SpeechRecognition);
  const recognitionRef = useRef<any>(null);
  
  // Share menu state
  const [showShareMenu, setShowShareMenu] = useState<1 | 2 | 3 | null>(null);
  const [sharing, setSharing] = useState(false);

  // Get field value by number
  const getFieldValue = (fieldNum: 1 | 2 | 3): string => {
    if (fieldNum === 1) return field1;
    if (fieldNum === 2) return field2;
    return field3;
  };

  // Set field value by number
  const setFieldValue = (fieldNum: 1 | 2 | 3, value: string) => {
    if (fieldNum === 1) setField1(value);
    else if (fieldNum === 2) setField2(value);
    else setField3(value);
  };

  // Get label by number
  const getLabel = (fieldNum: 1 | 2 | 3): string => {
    if (fieldNum === 1) return labels.field1Label;
    if (fieldNum === 2) return labels.field2Label;
    return labels.field3Label;
  };

  // Initialize speech recognition
  useEffect(() => {
    if (speechSupported) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-NZ';
      
      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          }
        }
        
        if (finalTranscript && listeningField) {
          const currentValue = getFieldValue(listeningField);
          const separator = currentValue && !currentValue.endsWith(' ') && !currentValue.endsWith('\n') ? ' ' : '';
          setFieldValue(listeningField, currentValue + separator + finalTranscript);
        }
      };
      
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setListeningField(null);
        if (event.error === 'not-allowed') {
          showToast('Microphone access denied');
        }
      };
      
      recognition.onend = () => {
        setListeningField(null);
      };
      
      recognitionRef.current = recognition;
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [speechSupported, listeningField, field1, field2, field3]);

  const toggleListening = (fieldNum: 1 | 2 | 3) => {
    if (!recognitionRef.current) return;
    
    if (listeningField === fieldNum) {
      // Stop listening
      recognitionRef.current.stop();
      setListeningField(null);
      onSave();
    } else {
      // Stop any current listening first
      if (listeningField) {
        recognitionRef.current.stop();
      }
      // Start listening for this field
      try {
        recognitionRef.current.start();
        setListeningField(fieldNum);
        showToast(`Listening for ${getLabel(fieldNum)}... Speak now`);
      } catch (err) {
        console.error('Failed to start speech recognition:', err);
      }
    }
  };

  const handleShare = async (fieldNum: 1 | 2 | 3, destination: 'team' | 'manager') => {
    setSharing(true);
    
    const time = fmtTimeShort(new Date());
    const value = getFieldValue(fieldNum);
    const label = getLabel(fieldNum);
    const message = `[${label} - ${time}]\n${value.trim()}`;
    
    const success = await onShareToChat(message, destination);
    setSharing(false);
    setShowShareMenu(null);
    
    if (success) {
      showToast(`Shared to ${destination === 'team' ? 'Team' : labels.managerDisplayName} ✓`);
    } else {
      showToast('Failed to share');
    }
  };

  // Not clocked in state
  if (!currentShift) {
    return (
      <div style={{ padding: '16px' }}>
        <div style={{ ...styles.card, textAlign: 'center' }}>
          <p style={{ color: theme.textMuted }}>Clock in to add job notes</p>
        </div>
      </div>
    );
  }

  // Render a single field box
  const renderFieldBox = (fieldNum: 1 | 2 | 3) => {
    const value = getFieldValue(fieldNum);
    const label = getLabel(fieldNum);
    const isListening = listeningField === fieldNum;
    const isShareOpen = showShareMenu === fieldNum;
    const isRequired = fieldNum === 1 && requireNotes;

    return (
      <div style={styles.card} key={fieldNum}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ color: theme.text, fontWeight: '600', margin: 0 }}>
            {label}
            {isRequired && <span style={{ color: theme.danger, marginLeft: '4px' }}>*</span>}
          </h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            {/* Speech-to-text button */}
            {speechSupported && (
              <button
                onClick={() => toggleListening(fieldNum)}
                style={{
                  background: isListening ? theme.danger : theme.cardAlt,
                  border: `1px solid ${isListening ? theme.danger : theme.cardBorder}`,
                  borderRadius: '10px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: isListening ? 'white' : theme.text,
                  animation: isListening ? 'pulse 1.5s infinite' : 'none'
                }}
                title={isListening ? 'Stop listening' : 'Voice input'}
              >
                <span style={{ fontSize: '16px' }}>{isListening ? '⏹️' : '🎤'}</span>
                <span style={{ fontSize: '13px', fontWeight: '500' }}>
                  {isListening ? 'Stop' : 'Talk'}
                </span>
              </button>
            )}
            {/* Share button */}
            <button
              onClick={() => setShowShareMenu(isShareOpen ? null : fieldNum)}
              disabled={!value.trim()}
              style={{
                background: theme.cardAlt,
                border: `1px solid ${theme.cardBorder}`,
                borderRadius: '10px',
                padding: '8px 12px',
                cursor: value.trim() ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: theme.text,
                opacity: value.trim() ? 1 : 0.5
              }}
              title="Share"
            >
              <span style={{ fontSize: '16px' }}>📤</span>
              <span style={{ fontSize: '13px', fontWeight: '500' }}>Share</span>
            </button>
          </div>
        </div>

        {/* Share menu */}
        {isShareOpen && (
          <div style={{
            background: theme.cardAlt,
            borderRadius: '10px',
            padding: '12px',
            marginBottom: '12px',
            border: `1px solid ${theme.cardBorder}`
          }}>
            <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '10px' }}>
              Share to:
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => handleShare(fieldNum, 'team')}
                disabled={sharing}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: 'none',
                  background: theme.primary,
                  color: 'white',
                  fontWeight: '600',
                  cursor: 'pointer',
                  opacity: sharing ? 0.7 : 1
                }}
              >
                👥 Team
              </button>
              <button
                onClick={() => handleShare(fieldNum, 'manager')}
                disabled={sharing}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: 'none',
                  background: theme.success,
                  color: 'white',
                  fontWeight: '600',
                  cursor: 'pointer',
                  opacity: sharing ? 0.7 : 1
                }}
              >
                👔 {labels.managerDisplayName}
              </button>
            </div>
          </div>
        )}

        {/* Text area */}
        <textarea
          placeholder={`Enter ${label.toLowerCase()}...`}
          value={value}
          onChange={(e) => setFieldValue(fieldNum, e.target.value)}
          onBlur={onSave}
          rows={4}
          style={{
            ...styles.input,
            resize: 'vertical',
            fontFamily: 'inherit'
          }}
        />
        
        {isRequired && (
          <p style={{ color: theme.warning, fontSize: '12px', marginTop: '8px' }}>
            * Required before clocking out
          </p>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: '16px' }}>
      <h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>
        Job Log
      </h2>

      {renderFieldBox(1)}
      {renderFieldBox(2)}
      {renderFieldBox(3)}

      {/* Tips Card */}
      <div style={styles.card}>
        <h3 style={{ color: theme.text, fontWeight: '600', marginBottom: '12px' }}>💡 Tips</h3>
        <ul style={{ color: theme.textMuted, fontSize: '14px', paddingLeft: '20px', margin: 0 }}>
          <li style={{ marginBottom: '4px' }}>Use the 🎤 button to dictate hands-free</li>
          <li style={{ marginBottom: '4px' }}>Share updates to team or manager chat</li>
          <li>All fields auto-save when you tap away</li>
        </ul>
      </div>

      {/* CSS for pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
