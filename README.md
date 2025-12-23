# Trackable NZ - Employee Time Tracking System

NZ Employment Relations Act 2000 Compliant Time Tracking

## 📁 Project Structure

```
timetrack-nz/
├── README.md
├── SETUP-WINDOWS.md          # Windows setup instructions
├── setup.bat                  # Windows setup script
├── mobile/                    # React + Ionic mobile app
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts
│   ├── public/
│   └── src/
│       ├── main.tsx
│       └── App.tsx
│
└── web-dashboard/             # React web dashboard
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    ├── tsconfig.node.json
    ├── vite.config.ts
    ├── public/
    └── src/
        ├── main.tsx
        ├── App.tsx
        └── App.css
```

## 🚀 Quick Start (Windows)

### Option 1: Automatic Setup (Recommended)

1. Open Command Prompt or PowerShell in `D:\Projects\timetrack-nz`
2. Run the setup script:
   ```cmd
   setup.bat
   ```

### Option 2: Manual Setup

1. **Install Node.js** (if not already installed)
   - Download from: https://nodejs.org/
   - Version 18 or higher required

2. **Install Mobile App Dependencies:**
   ```cmd
   cd mobile
   npm install
   ```

3. **Install Web Dashboard Dependencies:**
   ```cmd
   cd ..\web-dashboard
   npm install
   ```

4. **Run Mobile App:**
   ```cmd
   cd mobile
   npm run dev
   ```
   Access at: http://localhost:3000

5. **Run Web Dashboard** (in a new terminal):
   ```cmd
   cd web-dashboard
   npm run dev
   ```
   Access at: http://localhost:5173

## 📱 Mobile App Features

**For Employees:**
- ✅ Clock in/out with GPS tracking
- ✅ Break selection: 10m, 15m, 30m, 45m, 1hr, or custom
- ✅ Automatic NZ law break calculation (paid/unpaid)
- ✅ Real-time hours tracking
- ✅ Shift history
- ✅ Works on iOS & Android (via Ionic Capacitor)

## 💻 Web Dashboard Features

**For Managers/Admins:**
- ✅ Live employee monitoring
- ✅ Employee management
- ✅ Timesheet viewing & approval
- ✅ NZ employment law compliance checks
- ✅ Reports & analytics
- ✅ Export to CSV
- ✅ Settings & configuration
- ⏳ Xero integration (coming soon)

## 🇳🇿 NZ Employment Law Compliance

### Break Rules:
- **Rest breaks (≤20 min)**: PAID ✅
- **Meal breaks (>20 min)**: UNPAID ✅

### Entitlements (auto-calculated):
- 2-4 hours: 1 paid rest break
- 4-6 hours: 1 paid rest + 1 unpaid meal
- 6-10 hours: 2 paid rest + 1 unpaid meal
- 10-12 hours: 3 paid rest + 1 unpaid meal
- 12-14 hours: 4 paid rest + 2 unpaid meal
- 14+ hours: 5 paid rest + 2 unpaid meal

## 🔧 Development

### Tech Stack:
- **Mobile**: React 18 + Ionic 7 + TypeScript
- **Web**: React 18 + TypeScript + Vite
- **Styling**: Ionic CSS + Custom CSS
- **Geolocation**: Browser Geolocation API

### Build for Production:

**Mobile:**
```cmd
cd mobile
npm run build
```

**Web Dashboard:**
```cmd
cd web-dashboard
npm run build
```

### Deploy to iOS/Android:

Install Ionic CLI globally:
```cmd
npm install -g @ionic/cli
```

Add platforms:
```cmd
cd mobile
ionic capacitor add ios
ionic capacitor add android
```

Build and sync:
```cmd
npm run build
ionic capacitor sync
```

Open in Xcode/Android Studio:
```cmd
ionic capacitor open ios
ionic capacitor open android
```

## 📝 VS Code Setup

1. **Open folder in VS Code:**
   ```
   File > Open Folder > D:\Projects\timetrack-nz
   ```

2. **Recommended Extensions:**
   - ESLint
   - Prettier
   - TypeScript and JavaScript Language Features
   - Ionic Snippets

3. **Run both apps simultaneously:**
   - Terminal 1: `cd mobile && npm run dev`
   - Terminal 2: `cd web-dashboard && npm run dev`

## 🔮 Future Features

- [ ] Backend API (Node.js + Express)
- [ ] Database (PostgreSQL)
- [ ] Real-time sync
- [ ] Xero Payroll integration
- [ ] Push notifications
- [ ] Facial recognition
- [ ] Advanced reporting
- [ ] Multi-location support

## 📞 Support

For issues or questions, check the documentation or contact support.

---

**© 2024 Trackable NZ - All Rights Reserved**
