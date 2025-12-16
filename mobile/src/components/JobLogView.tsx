// TimeTrack NZ - Job Log View Component
// Features: Notes with speech-to-text, Materials list, Share to Chat

import { useState, useRef, useEffect } from 'react';
import { Theme, createStyles } from '../theme';
import { Shift, Material, CompanyLabels } from '../types';
import { fmtTimeShort } from '../utils';

interface JobLogViewProps {
  theme: Theme;
  currentShift: Shift | null;
  jobNotes: string;
  setJobNotes: (notes: string) => void;
  materials: Material[];
  onSaveNotes: () => void;
  onSaveMaterials: (materials: Material[]) => void;
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
  jobNotes,
  setJobNotes,
  materials,
  onSaveNotes,
  onSaveMaterials,
  onShareToChat,
  labels,
  requireNotes,
  showToast
}: JobLogViewProps) {
  const styles = createStyles(theme);
  
  // Speech-to-text state
  const [isListening, setIsListening] = useState(false);
  const [speechSupported] = useState(!!SpeechRecognition);
  const recognitionRef = useRef<any>(null);
  
  // Materials state
  const [newMaterialName, setNewMaterialName] = useState('');
  const [newMaterialQty, setNewMaterialQty] = useState('');
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  
  // Share menu state
  const [showShareMenu, setShowShareMenu] = useState<'notes' | 'materials' | null>(null);
  const [sharing, setSharing] = useState(false);

  // Initialize speech recognition
  useEffect(() => {
    if (speechSupported) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-NZ';
      
      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }
        
        if (finalTranscript) {
          setJobNotes(prev => {
            const separator = prev && !prev.endsWith(' ') && !prev.endsWith('\n') ? ' ' : '';
            return prev + separator + finalTranscript;
          });
        }
      };
      
      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          showToast('Microphone access denied');
        }
      };
      
      recognition.onend = () => {
        setIsListening(false);
      };
      
      recognitionRef.current = recognition;
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [speechSupported, setJobNotes, showToast]);

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      onSaveNotes(); // Save when stopping
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
        showToast('Listening... Speak now');
      } catch (err) {
        console.error('Failed to start speech recognition:', err);
      }
    }
  };

  const handleAddMaterial = () => {
    if (!newMaterialName.trim()) return;
    
    const newMaterial: Material = {
      name: newMaterialName.trim(),
      quantity: newMaterialQty.trim() || undefined
    };
    
    const updated = [...materials, newMaterial];
    onSaveMaterials(updated);
    setNewMaterialName('');
    setNewMaterialQty('');
    setShowAddMaterial(false);
    showToast('Material added ✓');
  };

  const handleRemoveMaterial = (index: number) => {
    const updated = materials.filter((_, i) => i !== index);
    onSaveMaterials(updated);
    showToast('Material removed');
  };

  const handleShare = async (destination: 'team' | 'manager') => {
    setSharing(true);
    
    // Build the message
    const time = fmtTimeShort(new Date());
    let message = `[Job Update - ${time}]`;
    
    if (showShareMenu === 'notes' && jobNotes.trim()) {
      message += `\n📝 Notes: ${jobNotes.trim()}`;
    }
    
    if (showShareMenu === 'materials' && materials.length > 0) {
      const materialsList = materials
        .map(m => m.quantity ? `${m.quantity} × ${m.name}` : m.name)
        .join(', ');
      message += `\n🔧 Materials: ${materialsList}`;
    }
    
    // Share both if sharing from materials and notes exist
    if (showShareMenu === 'materials' && jobNotes.trim()) {
      message = `[Job Update - ${time}]`;
      message += `\n📝 Notes: ${jobNotes.trim()}`;
      if (materials.length > 0) {
        const materialsList = materials
          .map(m => m.quantity ? `${m.quantity} × ${m.name}` : m.name)
          .join(', ');
        message += `\n🔧 Materials: ${materialsList}`;
      }
    }
    
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

  return (
    <div style={{ padding: '16px' }}>
      <h2 style={{ color: theme.text, fontSize: '20px', fontWeight: '600', marginBottom: '16px' }}>
        Job Log
      </h2>

      {/* Notes Section */}
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ color: theme.text, fontWeight: '600', margin: 0 }}>
            {labels.notesLabel}
            {requireNotes && <span style={{ color: theme.danger, marginLeft: '4px' }}>*</span>}
          </h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            {/* Speech-to-text button */}
            {speechSupported && (
              <button
                onClick={toggleListening}
                style={{
                  background: isListening ? theme.danger : theme.cardAlt,
                  border: `1px solid ${isListening ? theme.danger : theme.cardBorder}`,
                  borderRadius: '10px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: isListening ? 'white' : theme.text
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
              onClick={() => setShowShareMenu(showShareMenu === 'notes' ? null : 'notes')}
              disabled={!jobNotes.trim()}
              style={{
                background: theme.cardAlt,
                border: `1px solid ${theme.cardBorder}`,
                borderRadius: '10px',
                padding: '8px 12px',
                cursor: jobNotes.trim() ? 'pointer' : 'not-allowed',
                opacity: jobNotes.trim() ? 1 : 0.5,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: theme.text
              }}
              title="Share to chat"
            >
              <span style={{ fontSize: '16px' }}>📤</span>
              <span style={{ fontSize: '13px', fontWeight: '500' }}>Share</span>
            </button>
          </div>
        </div>

        {/* Share menu dropdown */}
        {showShareMenu === 'notes' && (
          <div style={{
            background: theme.cardAlt,
            borderRadius: '10px',
            padding: '12px',
            marginBottom: '12px',
            border: `1px solid ${theme.cardBorder}`
          }}>
            <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '10px' }}>Share update to:</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => handleShare('team')}
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
                👥 Team Chat
              </button>
              <button
                onClick={() => handleShare('manager')}
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

        {/* Listening indicator */}
        {isListening && (
          <div style={{
            background: theme.dangerBg,
            borderRadius: '8px',
            padding: '10px 12px',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ 
              width: '10px', 
              height: '10px', 
              borderRadius: '50%', 
              background: theme.danger,
              animation: 'pulse 1s infinite'
            }} />
            <span style={{ color: theme.danger, fontSize: '13px', fontWeight: '500' }}>
              Listening... Speak now
            </span>
          </div>
        )}

        <textarea
          placeholder="Describe what you did today..."
          value={jobNotes}
          onChange={(e) => setJobNotes(e.target.value)}
          onBlur={onSaveNotes}
          rows={6}
          style={{
            ...styles.input,
            resize: 'vertical',
            fontFamily: 'inherit'
          }}
        />
        <p style={{ color: theme.textLight, fontSize: '12px', marginTop: '8px' }}>
          Auto-saves when you tap away
        </p>
        {requireNotes && (
          <p style={{ color: theme.warning, fontSize: '12px', marginTop: '8px' }}>
            * Notes required before clocking out
          </p>
        )}
      </div>

      {/* Materials Section */}
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ color: theme.text, fontWeight: '600', margin: 0 }}>
            {labels.materialsLabel}
          </h3>
          {materials.length > 0 && (
            <button
              onClick={() => setShowShareMenu(showShareMenu === 'materials' ? null : 'materials')}
              style={{
                background: theme.cardAlt,
                border: `1px solid ${theme.cardBorder}`,
                borderRadius: '10px',
                padding: '8px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: theme.text
              }}
              title="Share update"
            >
              <span style={{ fontSize: '16px' }}>📤</span>
              <span style={{ fontSize: '13px', fontWeight: '500' }}>Share All</span>
            </button>
          )}
        </div>

        {/* Share menu for materials */}
        {showShareMenu === 'materials' && (
          <div style={{
            background: theme.cardAlt,
            borderRadius: '10px',
            padding: '12px',
            marginBottom: '12px',
            border: `1px solid ${theme.cardBorder}`
          }}>
            <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '10px' }}>
              Share notes & materials to:
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => handleShare('team')}
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
                👥 Team Chat
              </button>
              <button
                onClick={() => handleShare('manager')}
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

        {/* Materials list */}
        {materials.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            {materials.map((material, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  background: theme.cardAlt,
                  borderRadius: '8px',
                  marginBottom: '8px'
                }}
              >
                <div>
                  <span style={{ color: theme.text, fontWeight: '500' }}>{material.name}</span>
                  {material.quantity && (
                    <span style={{ color: theme.textMuted, marginLeft: '8px', fontSize: '13px' }}>
                      × {material.quantity}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveMaterial(index)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: theme.danger,
                    cursor: 'pointer',
                    fontSize: '16px',
                    padding: '4px 8px'
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add material form */}
        {showAddMaterial ? (
          <div style={{ background: theme.cardAlt, borderRadius: '10px', padding: '12px' }}>
            <div style={{ marginBottom: '10px' }}>
              <input
                type="text"
                placeholder="Material name"
                value={newMaterialName}
                onChange={(e) => setNewMaterialName(e.target.value)}
                style={{ ...styles.input, marginBottom: '8px' }}
                autoFocus
              />
              <input
                type="text"
                placeholder="Quantity (optional)"
                value={newMaterialQty}
                onChange={(e) => setNewMaterialQty(e.target.value)}
                style={styles.input}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleAddMaterial}
                disabled={!newMaterialName.trim()}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: 'none',
                  background: theme.success,
                  color: 'white',
                  fontWeight: '600',
                  cursor: newMaterialName.trim() ? 'pointer' : 'not-allowed',
                  opacity: newMaterialName.trim() ? 1 : 0.5
                }}
              >
                Add Material
              </button>
              <button
                onClick={() => {
                  setShowAddMaterial(false);
                  setNewMaterialName('');
                  setNewMaterialQty('');
                }}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: `1px solid ${theme.cardBorder}`,
                  background: 'transparent',
                  color: theme.textMuted,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddMaterial(true)}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '10px',
              border: `1px dashed ${theme.cardBorder}`,
              background: 'transparent',
              color: theme.textMuted,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <span>➕</span>
            <span>Add Material</span>
          </button>
        )}
      </div>

      {/* Tips Card */}
      <div style={styles.card}>
        <h3 style={{ color: theme.text, fontWeight: '600', marginBottom: '12px' }}>💡 Tips</h3>
        <ul style={{ color: theme.textMuted, fontSize: '14px', paddingLeft: '20px', margin: 0 }}>
          <li style={{ marginBottom: '4px' }}>Use the 🎤 button to dictate notes hands-free</li>
          <li style={{ marginBottom: '4px' }}>Track materials used on the job</li>
          <li style={{ marginBottom: '4px' }}>Share updates to team or manager chat</li>
          <li>Notes auto-save when you tap away</li>
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
