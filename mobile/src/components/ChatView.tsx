// Trackable NZ - Chat View Component

import { Theme, createStyles } from '../theme';
import { ChatMessage, ChatTabType, CompanyLabels } from '../types';
import { fmtTime } from '../utils';

interface ChatViewProps {
  theme: Theme;
  messages: ChatMessage[];
  newMessage: string;
  setNewMessage: (message: string) => void;
  chatTab: ChatTabType;
  setChatTab: (tab: ChatTabType) => void;
  onSendMessage: () => void;
  userId: string;
  chatEnabled: boolean;
  labels: CompanyLabels;
}

export function ChatView({
  theme,
  messages,
  newMessage,
  setNewMessage,
  chatTab,
  setChatTab,
  onSendMessage,
  userId,
  chatEnabled,
  labels
}: ChatViewProps) {
  const styles = createStyles(theme);

  if (!chatEnabled) {
    return (
      <div>
        <div style={{ ...styles.card, textAlign: 'center' }}>
          <p style={{ color: theme.textMuted }}>Chat is disabled for your account</p>
        </div>
      </div>
    );
  }

  const filteredMessages = messages.filter(m => 
    chatTab === 'team' 
      ? m.type === 'team' 
      : (m.type === 'dm' && m.participants?.includes(userId))
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Tab switcher */}
      <div style={{
        display: 'flex',
        marginBottom: '16px',
        background: theme.card,
        borderRadius: '12px',
        padding: '4px',
        border: `1px solid ${theme.cardBorder}`
      }}>
        <button
          onClick={() => setChatTab('team')}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '10px',
            border: 'none',
            background: chatTab === 'team' ? theme.primary : 'transparent',
            color: chatTab === 'team' ? 'white' : theme.textMuted,
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Team Chat
        </button>
        <button
          onClick={() => setChatTab('employer')}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '10px',
            border: 'none',
            background: chatTab === 'employer' ? theme.primary : 'transparent',
            color: chatTab === 'employer' ? 'white' : theme.textMuted,
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          {labels.managerDisplayName} DM
        </button>
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, minHeight: '200px', marginBottom: '16px' }}>
        {filteredMessages.length === 0 ? (
          <div style={{ textAlign: 'center', color: theme.textLight, marginTop: '40px' }}>
            No messages yet. Start the conversation!
          </div>
        ) : (
          filteredMessages.map(msg => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                justifyContent: msg.senderId === userId ? 'flex-end' : 'flex-start',
                marginBottom: '12px'
              }}
            >
              <div style={{
                maxWidth: '75%',
                borderRadius: '16px',
                padding: '10px 14px',
                background: msg.senderId === userId ? theme.primary : theme.card,
                border: msg.senderId === userId ? 'none' : `1px solid ${theme.cardBorder}`
              }}>
                {msg.senderId !== userId && (
                  <p style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>
                    {msg.senderEmail}
                  </p>
                )}
                <p style={{
                  fontSize: '14px',
                  color: msg.senderId === userId ? 'white' : theme.text,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  {msg.text}
                </p>
                <p style={{
                  fontSize: '10px',
                  color: msg.senderId === userId ? 'rgba(255,255,255,0.6)' : theme.textLight,
                  marginTop: '4px'
                }}>
                  {fmtTime(msg.timestamp)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input area */}
      <div style={{
        padding: '16px',
        background: theme.card,
        borderRadius: '12px',
        border: `1px solid ${theme.cardBorder}`
      }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {newMessage.trim() && (
            <button
              onClick={() => setNewMessage('')}
              style={{
                background: theme.cardAlt,
                border: `1px solid ${theme.cardBorder}`,
                color: theme.textMuted,
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                padding: '12px 16px',
                borderRadius: '24px'
              }}
            >
              Clear
            </button>
          )}
          <input
            type="text"
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => { if (e.key === 'Enter') onSendMessage(); }}
            style={{
              ...styles.input,
              flex: 1,
              borderRadius: '24px'
            }}
          />
          <button
            onClick={onSendMessage}
            disabled={!newMessage.trim()}
            style={{
              ...styles.btn,
              borderRadius: '24px',
              padding: '12px 20px',
              opacity: newMessage.trim() ? 1 : 0.5
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}