# Quick Start Commands - Copy & Paste

## Initial Setup (Run Once)

### Option 1: Automatic Setup
```cmd
cd D:\Projects\timetrack-nz
setup.bat
```

### Option 2: Manual Setup
```cmd
cd D:\Projects\timetrack-nz

REM Install mobile dependencies
cd mobile
npm install
cd ..

REM Install web dashboard dependencies
cd web-dashboard
npm install
cd ..
```

---

## Running the Apps (Daily Use)

### Start Mobile App (Terminal 1)
```cmd
cd D:\Projects\timetrack-nz\mobile
npm run dev
```
**Open:** http://localhost:3000

### Start Web Dashboard (Terminal 2)
```cmd
cd D:\Projects\timetrack-nz\web-dashboard
npm run dev
```
**Open:** http://localhost:5173

---

## VS Code Integrated Terminal

### Open VS Code
```cmd
cd D:\Projects\timetrack-nz
code .
```

### Then in VS Code Terminal (Ctrl + `):

**Terminal 1 (Mobile):**
```cmd
cd mobile
npm run dev
```

**Terminal 2 (Dashboard):**
```cmd
cd web-dashboard
npm run dev
```

---

## Stopping the Apps

Press `Ctrl + C` in each terminal window

---

## Build for Production

### Mobile App
```cmd
cd D:\Projects\timetrack-nz\mobile
npm run build
```

### Web Dashboard
```cmd
cd D:\Projects\timetrack-nz\web-dashboard
npm run build
```

---

## Clean Install (if having issues)

### Mobile App
```cmd
cd D:\Projects\timetrack-nz\mobile
rmdir /s /q node_modules
del package-lock.json
npm install
```

### Web Dashboard
```cmd
cd D:\Projects\timetrack-nz\web-dashboard
rmdir /s /q node_modules
del package-lock.json
npm install
```

---

## Check Node.js Installation
```cmd
node --version
npm --version
```

Should show v18.x or higher

---

## Update Dependencies (periodically)

### Mobile App
```cmd
cd D:\Projects\timetrack-nz\mobile
npm update
```

### Web Dashboard
```cmd
cd D:\Projects\timetrack-nz\web-dashboard
npm update
```

---

## Deploy to Mobile Devices (Future)

### Install Ionic CLI (once)
```cmd
npm install -g @ionic/cli
```

### Add iOS Platform
```cmd
cd D:\Projects\timetrack-nz\mobile
ionic capacitor add ios
```

### Add Android Platform
```cmd
cd D:\Projects\timetrack-nz\mobile
ionic capacitor add android
```

### Build and Sync
```cmd
npm run build
ionic capacitor sync
```

### Open in IDE
```cmd
ionic capacitor open ios
ionic capacitor open android
```

---

## Useful Commands

### Check what's running on a port
```cmd
netstat -ano | findstr :3000
netstat -ano | findstr :5173
```

### Kill a process by PID
```cmd
taskkill /PID <PID_NUMBER> /F
```

### Clear npm cache
```cmd
npm cache clean --force
```

---

## Folder Structure Reference

```
D:\Projects\timetrack-nz\
├── mobile\              ← React + Ionic mobile app
│   ├── src\
│   │   ├── App.tsx     ← Main mobile app code
│   │   └── main.tsx
│   ├── package.json
│   └── index.html
│
└── web-dashboard\       ← React web dashboard
    ├── src\
    │   ├── App.tsx      ← Main dashboard code
    │   ├── App.css      ← Dashboard styles
    │   └── main.tsx
    ├── package.json
    └── index.html
```

---

## Need Help?

1. Read `SETUP-WINDOWS.md` for detailed instructions
2. Read `README.md` for project overview
3. Check troubleshooting section in SETUP-WINDOWS.md
