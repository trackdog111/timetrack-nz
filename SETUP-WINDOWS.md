# Windows Setup Guide for Trackable NZ

## Step-by-Step Setup on Windows

### Prerequisites

1. **Install Node.js**
   - Go to: https://nodejs.org/
   - Download the LTS version (18.x or higher)
   - Run the installer
   - Check "Automatically install necessary tools" during installation
   - Verify installation:
     ```cmd
     node --version
     npm --version
     ```

2. **Install Git** (Optional but recommended)
   - Go to: https://git-scm.com/download/win
   - Download and install
   - Use default settings

3. **Install VS Code** (Recommended)
   - Go to: https://code.visualstudio.com/
   - Download and install

### Method 1: Automatic Setup (Easiest)

1. **Extract the project to D:\Projects**
   - You should have: `D:\Projects\timetrack-nz\`

2. **Run the setup script:**
   ```cmd
   cd D:\Projects\timetrack-nz
   setup.bat
   ```

3. **Wait for installation** (this may take 5-10 minutes)

4. **The script will:**
   - Install all dependencies for mobile app
   - Install all dependencies for web dashboard
   - Open both apps in your browser

### Method 2: Manual Setup

1. **Open Command Prompt:**
   - Press `Win + R`
   - Type `cmd` and press Enter

2. **Navigate to project:**
   ```cmd
   cd D:\Projects\timetrack-nz
   ```

3. **Install Mobile App:**
   ```cmd
   cd mobile
   npm install
   ```
   (Wait for installation to complete)

4. **Install Web Dashboard:**
   ```cmd
   cd ..\web-dashboard
   npm install
   ```
   (Wait for installation to complete)

5. **You're ready!** See "Running the Apps" below.

### Running the Apps

You need TWO terminal windows running simultaneously:

**Terminal 1 - Mobile App:**
```cmd
cd D:\Projects\timetrack-nz\mobile
npm run dev
```
Then open: http://localhost:3000

**Terminal 2 - Web Dashboard:**
```cmd
cd D:\Projects\timetrack-nz\web-dashboard
npm run dev
```
Then open: http://localhost:5173

### Using VS Code (Recommended)

1. **Open VS Code**

2. **Open the project folder:**
   - File > Open Folder
   - Select `D:\Projects\timetrack-nz`

3. **Open Terminal in VS Code:**
   - Terminal > New Terminal (or Ctrl + `)

4. **Split Terminal:**
   - Click the split terminal icon (top right of terminal)
   - Now you have 2 terminals side by side

5. **In Terminal 1 (left):**
   ```cmd
   cd mobile
   npm run dev
   ```

6. **In Terminal 2 (right):**
   ```cmd
   cd web-dashboard
   npm run dev
   ```

### Troubleshooting

**Problem: "npm is not recognized"**
- Solution: Restart your computer after installing Node.js
- Or add Node.js to PATH manually:
  1. Search "Environment Variables" in Windows
  2. Edit PATH
  3. Add: `C:\Program Files\nodejs\`

**Problem: Port already in use**
- Solution: Change the port in `vite.config.ts`:
  ```typescript
  server: {
    port: 3001  // Change to any available port
  }
  ```

**Problem: "Cannot find module"**
- Solution: Delete `node_modules` and reinstall:
  ```cmd
  rmdir /s /q node_modules
  npm install
  ```

**Problem: Scripts not running in PowerShell**
- Solution: Run this once in PowerShell (as Administrator):
  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
  ```

### Building for Production

**Mobile App:**
```cmd
cd D:\Projects\timetrack-nz\mobile
npm run build
```

**Web Dashboard:**
```cmd
cd D:\Projects\timetrack-nz\web-dashboard
npm run build
```

Build files will be in the `dist/` folder of each app.

### Next Steps

1. ✅ Test the mobile app at http://localhost:3000
2. ✅ Test the web dashboard at http://localhost:5173
3. ✅ Customize branding, colors, company name
4. ✅ Set up backend API (future)
5. ✅ Deploy to production (future)

### Recommended VS Code Extensions

Install these for better development experience:

1. **ESLint** - Code quality
2. **Prettier** - Code formatting
3. **TypeScript and JavaScript** - Language support
4. **Ionic Snippets** - Ionic code snippets
5. **Path Intellisense** - Auto-complete file paths

To install:
- Open VS Code
- Press `Ctrl + Shift + X`
- Search for extension name
- Click Install

---

Need help? Check README.md or the full documentation.
