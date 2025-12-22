import { Theme, ChatMessage } from '../shared/types';
import { fmtTime } from '../shared/utils';

interface ChatViewProps {
  theme: Theme;
  isMobile: boolean;
  messages: ChatMessage[];
  chatTab: string;
  setChatTab: (tab: string) => void;
  newMsg: string;
  setNewMsg: (msg: string) => void;
  sendMsg: () => void;
  getEmployeeName: (userId?: string, userEmail?: string) => string;
}

export function ChatView({
  theme,
  isMobile,
  messages,
  chatTab,
  setChatTab,
  newMsg,
  setNewMsg,
  sendMsg,
  getEmployeeName
}: ChatViewProps) {
  const styles = {
    input: { padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.inputBorder}`, background: theme.input, color: theme.text, fontSize: '14px', width: '100%', boxSizing: 'border-box' as const },
    btn: { padding: '10px 20px', borderRadius: '8px', border: 'none', background: theme.primary, color: 'white', cursor: 'pointer', fontWeight: '600' as const, fontSize: '14px' }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: isMobile ? 'calc(100vh - 120px)' : 'calc(100vh - 80px)' }}>
      <h1 style={{ color: theme.text, marginBottom: '16px', fontSize: isMobile ? '22px' : '28px' }}>Chat</h1>
      
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button 
          onClick={() => setChatTab('team')} 
          style={{ ...styles.btn, flex: 1, background: chatTab === 'team' ? theme.primary : theme.cardAlt, color: chatTab === 'team' ? 'white' : theme.text }}
        >
          Team Chat
        </button>
        <button 
          onClick={() => setChatTab('dm')} 
          style={{ ...styles.btn, flex: 1, background: chatTab === 'dm' ? theme.primary : theme.cardAlt, color: chatTab === 'dm' ? 'white' : theme.text }}
        >
          Direct Messages
        </button>
      </div>
      
      <div style={{ flex: 1, background: theme.card, borderRadius: '12px', padding: '16px', overflowY: 'auto', marginBottom: '16px', border: `1px solid ${theme.cardBorder}` }}>
        {messages.filter(m => m.type === chatTab).length === 0 ? (
          <p style={{ color: theme.textMuted, textAlign: 'center', marginTop: '40px' }}>No messages yet</p>
        ) : (
          messages.filter(m => m.type === chatTab).map(m => (
            <div key={m.id} style={{ display: 'flex', justifyContent: m.senderId === 'employer' ? 'flex-end' : 'flex-start', marginBottom: '12px' }}>
              <div style={{ maxWidth: '75%', padding: '10px 14px', borderRadius: '12px', background: m.senderId === 'employer' ? theme.primary : theme.cardAlt }}>
                {m.senderId !== 'employer' && (
                  <p style={{ color: theme.textMuted, fontSize: '11px', marginBottom: '4px' }}>{getEmployeeName(m.senderId, m.senderEmail)}</p>
                )}
                <p style={{ color: m.senderId === 'employer' ? 'white' : theme.text, fontSize: '14px', margin: 0 }}>{m.text}</p>
                <p style={{ color: m.senderId === 'employer' ? 'rgba(255,255,255,0.6)' : theme.textLight, fontSize: '10px', marginTop: '4px' }}>{fmtTime(m.timestamp)}</p>
              </div>
            </div>
          ))
        )}
      </div>
      
      <div style={{ display: 'flex', gap: '8px' }}>
        <input 
          placeholder="Message..." 
          value={newMsg} 
          onChange={e => setNewMsg(e.target.value)} 
          onKeyPress={e => e.key === 'Enter' && sendMsg()} 
          style={{ ...styles.input, flex: 1, borderRadius: '24px' }} 
        />
        <button onClick={sendMsg} style={{ ...styles.btn, borderRadius: '24px' }}>Send</button>
      </div>
    </div>
  );
}