// Run this from D:\Projects\timetrack-nz\web-dashboard\src\views
// node fix-button.js

const fs = require('fs');
let code = fs.readFileSync('AnalyticsView.tsx', 'utf8');

const oldLine = `<span onClick={(e) => { e.stopPropagation(); setDetailWorksiteId(ws.id); }} style={{ color: theme.primary, fontWeight: '600', fontSize: '14px', cursor: 'pointer', textDecoration: 'underline' }}>{ws.name}</span>`;

const newLine = `<span style={{ color: theme.text, fontWeight: '600', fontSize: '14px' }}>{ws.name}</span><button onClick={(e) => { e.stopPropagation(); setDetailWorksiteId(ws.id); }} style={{ marginLeft: '10px', padding: '3px 10px', borderRadius: '6px', border: \`1px solid \${theme.primary}\`, background: 'transparent', color: theme.primary, cursor: 'pointer', fontWeight: '600', fontSize: '11px' }}>{String.fromCodePoint(0x1F4CA)} Details</button>`;

if (code.includes(oldLine)) {
  code = code.replace(oldLine, newLine);
  fs.writeFileSync('AnalyticsView.tsx', code, 'utf8');
  console.log('SUCCESS - Button added!');
} else {
  console.log('ERROR - Could not find the target line. Check AnalyticsView.tsx line 969.');
}
