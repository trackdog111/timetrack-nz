import React, { useState, useEffect } from 'react';

// NZ Employment Law Break Calculations
const calculateBreakEntitlements = (hoursWorked) => {
  if (hoursWorked <= 2) return { paidRestBreaks: 0, unpaidMealBreaks: 0 };
  if (hoursWorked <= 4) return { paidRestBreaks: 1, unpaidMealBreaks: 0 };
  if (hoursWorked <= 6) return { paidRestBreaks: 1, unpaidMealBreaks: 1 };
  if (hoursWorked <= 10) return { paidRestBreaks: 2, unpaidMealBreaks: 1 };
  if (hoursWorked <= 12) return { paidRestBreaks: 3, unpaidMealBreaks: 1 };
  if (hoursWorked <= 14) return { paidRestBreaks: 4, unpaidMealBreaks: 2 };
  return { paidRestBreaks: 5, unpaidMealBreaks: 2 };
};

const formatTime = (date) => {
  return new Date(date).toLocaleTimeString('en-NZ', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  });
};

const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-NZ', { 
    weekday: 'short',
    day: 'numeric', 
    month: 'short',
    year: 'numeric'
  });
};

const formatDuration = (minutes) => {
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hrs}h ${mins}m`;
};

export default function EmployeeTracker() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginTime, setLoginTime] = useState(null);
  const [logoutTime, setLogoutTime] = useState(null);
  const [loginLocation, setLoginLocation] = useState(null);
  const [logoutLocation, setLogoutLocation] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [breaks, setBreaks] = useState([]);
  const [breakInput, setBreakInput] = useState('');
  const [breakType, setBreakType] = useState('rest');
  const [employeeName, setEmployeeName] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('clock');
  const [loadingLocation, setLoadingLocation] = useState(false);

  // Get current location
  const getCurrentLocation = () => {
    return new Promise((resolve, reject) => {
      setLoadingLocation(true);
      if (!navigator.geolocation) {
        setLoadingLocation(false);
        reject(new Error('Geolocation not supported'));
        return;
      }
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: new Date().toISOString()
          };
          setCurrentLocation(loc);
          setLocationError(null);
          setLoadingLocation(false);
          resolve(loc);
        },
        (error) => {
          setLocationError(error.message);
          setLoadingLocation(false);
          reject(error);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  };

  // Handle employee login
  const handleLogin = () => {
    if (!employeeName.trim()) return;
    setIsAuthenticated(true);
  };

  // Clock In
  const handleClockIn = async () => {
    try {
      const location = await getCurrentLocation();
      const now = new Date().toISOString();
      setLoginTime(now);
      setLoginLocation(location);
      setIsLoggedIn(true);
      setLogoutTime(null);
      setLogoutLocation(null);
      setBreaks([]);
    } catch (error) {
      // Allow clock in even without location
      const now = new Date().toISOString();
      setLoginTime(now);
      setIsLoggedIn(true);
      setLogoutTime(null);
      setLogoutLocation(null);
      setBreaks([]);
    }
  };

  // Clock Out
  const handleClockOut = async () => {
    try {
      const location = await getCurrentLocation();
      const now = new Date().toISOString();
      setLogoutTime(now);
      setLogoutLocation(location);
      setIsLoggedIn(false);
      
      // Save to history
      const shift = {
        id: Date.now(),
        employeeName,
        loginTime,
        logoutTime: now,
        loginLocation,
        logoutLocation: location,
        breaks: [...breaks],
        date: formatDate(loginTime)
      };
      setHistory(prev => [shift, ...prev]);
    } catch (error) {
      const now = new Date().toISOString();
      setLogoutTime(now);
      setIsLoggedIn(false);
      
      const shift = {
        id: Date.now(),
        employeeName,
        loginTime,
        logoutTime: now,
        loginLocation,
        logoutLocation: null,
        breaks: [...breaks],
        date: formatDate(loginTime)
      };
      setHistory(prev => [shift, ...prev]);
    }
  };

  // Add break
  const handleAddBreak = () => {
    const minutes = parseInt(breakInput);
    if (isNaN(minutes) || minutes <= 0) return;
    
    const newBreak = {
      id: Date.now(),
      duration: minutes,
      type: breakType,
      time: new Date().toISOString()
    };
    setBreaks(prev => [...prev, newBreak]);
    setBreakInput('');
  };

  // Remove break
  const handleRemoveBreak = (id) => {
    setBreaks(prev => prev.filter(b => b.id !== id));
  };

  // Calculate totals
  const calculateTotals = (start, end, shiftBreaks) => {
    if (!start) return { totalWorked: 0, paidHours: 0, unpaidBreaks: 0, entitlements: { paidRestBreaks: 0, unpaidMealBreaks: 0 } };
    
    const endTime = end || new Date().toISOString();
    const totalMinutes = (new Date(endTime) - new Date(start)) / 1000 / 60;
    const totalHours = totalMinutes / 60;
    
    // Get NZ law entitlements
    const entitlements = calculateBreakEntitlements(totalHours);
    
    // Calculate breaks taken
    const restBreaksTaken = shiftBreaks.filter(b => b.type === 'rest').reduce((sum, b) => sum + b.duration, 0);
    const mealBreaksTaken = shiftBreaks.filter(b => b.type === 'meal').reduce((sum, b) => sum + b.duration, 0);
    
    // Paid rest breaks (10 min each as per NZ law)
    const paidRestMinutes = Math.min(restBreaksTaken, entitlements.paidRestBreaks * 10);
    
    // Unpaid meal breaks (30 min each)
    const unpaidMealMinutes = mealBreaksTaken;
    
    // Any rest breaks beyond entitlement become unpaid
    const unpaidRestMinutes = Math.max(0, restBreaksTaken - paidRestMinutes);
    
    const totalUnpaidMinutes = unpaidMealMinutes + unpaidRestMinutes;
    const paidMinutes = totalMinutes - totalUnpaidMinutes;
    
    return {
      totalWorked: totalMinutes,
      paidHours: paidMinutes,
      unpaidBreaks: totalUnpaidMinutes,
      paidRestMinutes,
      unpaidRestMinutes,
      unpaidMealMinutes,
      entitlements,
      restBreaksTaken,
      mealBreaksTaken
    };
  };

  const currentTotals = calculateTotals(loginTime, logoutTime, breaks);

  // Login Screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl p-8 shadow-2xl border border-slate-700">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">Trackable NZ</h1>
              <p className="text-slate-400">Employee Time & Attendance</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Employee Name</label>
                <input
                  type="text"
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
              </div>
              
              <button
                onClick={handleLogin}
                disabled={!employeeName.trim()}
                className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
              >
                Sign In
              </button>
            </div>
            
            <p className="text-center text-slate-500 text-sm mt-6">
              NZ Employment Law Compliant
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-slate-800/80 backdrop-blur-lg border-b border-slate-700 sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Trackable NZ</h1>
                <p className="text-xs text-slate-400">{employeeName}</p>
              </div>
            </div>
            <button
              onClick={() => setIsAuthenticated(false)}
              className="text-slate-400 hover:text-white text-sm"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="max-w-2xl mx-auto px-4 pt-4">
        <div className="flex gap-2 bg-slate-800/50 rounded-xl p-1">
          {[
            { id: 'clock', label: 'Clock In/Out', icon: '⏰' },
            { id: 'breaks', label: 'Breaks', icon: '☕' },
            { id: 'history', label: 'History', icon: '📋' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 px-4 rounded-lg font-medium text-sm transition-all ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Clock Tab */}
        {activeTab === 'clock' && (
          <>
            {/* Status Card */}
            <div className={`rounded-2xl p-6 border ${
              isLoggedIn 
                ? 'bg-gradient-to-br from-emerald-900/50 to-teal-900/50 border-emerald-700/50' 
                : 'bg-slate-800/50 border-slate-700'
            }`}>
              <div className="flex items-center justify-between mb-4">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  isLoggedIn 
                    ? 'bg-emerald-500/20 text-emerald-400' 
                    : 'bg-slate-700 text-slate-400'
                }`}>
                  {isLoggedIn ? '● Clocked In' : '○ Clocked Out'}
                </span>
                <span className="text-slate-400 text-sm">{formatDate(new Date())}</span>
              </div>
              
              {loginTime && (
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Clock In</span>
                    <span className="text-white font-mono">{formatTime(loginTime)}</span>
                  </div>
                  {logoutTime && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Clock Out</span>
                      <span className="text-white font-mono">{formatTime(logoutTime)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-3 border-t border-slate-700">
                    <span className="text-slate-400">Total Time</span>
                    <span className="text-2xl font-bold text-white">{formatDuration(currentTotals.totalWorked)}</span>
                  </div>
                </div>
              )}
              
              <button
                onClick={isLoggedIn ? handleClockOut : handleClockIn}
                disabled={loadingLocation}
                className={`w-full py-4 rounded-xl font-bold text-lg transition-all duration-300 ${
                  isLoggedIn
                    ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-500/30 hover:shadow-rose-500/50'
                    : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50'
                } hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50`}
              >
                {loadingLocation ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Getting Location...
                  </span>
                ) : isLoggedIn ? 'Clock Out' : 'Clock In'}
              </button>
            </div>

            {/* Location Card */}
            {(loginLocation || logoutLocation) && (
              <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  GPS Locations
                </h3>
                <div className="space-y-4">
                  {loginLocation && (
                    <div className="bg-slate-700/50 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
                        <span className="text-emerald-400 font-medium text-sm">Clock In Location</span>
                      </div>
                      <p className="text-white font-mono text-sm">
                        {loginLocation.lat.toFixed(6)}, {loginLocation.lng.toFixed(6)}
                      </p>
                      <p className="text-slate-400 text-xs mt-1">
                        Accuracy: ±{Math.round(loginLocation.accuracy)}m
                      </p>
                    </div>
                  )}
                  {logoutLocation && (
                    <div className="bg-slate-700/50 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 bg-rose-400 rounded-full"></span>
                        <span className="text-rose-400 font-medium text-sm">Clock Out Location</span>
                      </div>
                      <p className="text-white font-mono text-sm">
                        {logoutLocation.lat.toFixed(6)}, {logoutLocation.lng.toFixed(6)}
                      </p>
                      <p className="text-slate-400 text-xs mt-1">
                        Accuracy: ±{Math.round(logoutLocation.accuracy)}m
                      </p>
                    </div>
                  )}
                </div>
                {locationError && (
                  <p className="text-amber-400 text-sm mt-4 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    {locationError}
                  </p>
                )}
              </div>
            )}

            {/* Hours Summary */}
            {loginTime && (
              <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
                <h3 className="text-white font-semibold mb-4">Hours Summary</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-emerald-500/10 rounded-xl p-4 border border-emerald-500/20">
                    <p className="text-emerald-400 text-sm mb-1">Paid Hours</p>
                    <p className="text-2xl font-bold text-white">{formatDuration(currentTotals.paidHours)}</p>
                  </div>
                  <div className="bg-amber-500/10 rounded-xl p-4 border border-amber-500/20">
                    <p className="text-amber-400 text-sm mb-1">Unpaid Breaks</p>
                    <p className="text-2xl font-bold text-white">{formatDuration(currentTotals.unpaidBreaks)}</p>
                  </div>
                </div>
                
                <div className="mt-4 p-4 bg-slate-700/30 rounded-xl">
                  <p className="text-slate-400 text-sm mb-2">NZ Law Entitlements (based on {(currentTotals.totalWorked / 60).toFixed(1)}h shift):</p>
                  <div className="flex gap-4 text-sm">
                    <span className="text-emerald-400">
                      {currentTotals.entitlements.paidRestBreaks}× 10min paid rest
                    </span>
                    <span className="text-amber-400">
                      {currentTotals.entitlements.unpaidMealBreaks}× 30min unpaid meal
                    </span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Breaks Tab */}
        {activeTab === 'breaks' && (
          <>
            {!isLoggedIn ? (
              <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700 text-center">
                <svg className="w-16 h-16 text-slate-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-slate-400">Clock in to record breaks</p>
              </div>
            ) : (
              <>
                {/* Add Break */}
                <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
                  <h3 className="text-white font-semibold mb-4">Add Break</h3>
                  <div className="flex gap-3 mb-4">
                    <button
                      onClick={() => setBreakType('rest')}
                      className={`flex-1 py-3 rounded-xl font-medium transition-all ${
                        breakType === 'rest'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      ☕ Rest Break
                    </button>
                    <button
                      onClick={() => setBreakType('meal')}
                      className={`flex-1 py-3 rounded-xl font-medium transition-all ${
                        breakType === 'meal'
                          ? 'bg-amber-500 text-white'
                          : 'bg-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      🍽️ Meal Break
                    </button>
                  </div>
                  <div className="flex gap-3">
                    <input
                      type="number"
                      value={breakInput}
                      onChange={(e) => setBreakInput(e.target.value)}
                      placeholder="Minutes"
                      className="flex-1 px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      onClick={handleAddBreak}
                      disabled={!breakInput}
                      className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium rounded-xl disabled:opacity-50 transition-all hover:scale-105 active:scale-95"
                    >
                      Add
                    </button>
                  </div>
                  <p className="text-slate-500 text-sm mt-3">
                    💡 Rest breaks: 10min paid | Meal breaks: 30min unpaid
                  </p>
                </div>

                {/* Breaks List */}
                <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
                  <h3 className="text-white font-semibold mb-4">Today's Breaks</h3>
                  {breaks.length === 0 ? (
                    <p className="text-slate-400 text-center py-4">No breaks recorded yet</p>
                  ) : (
                    <div className="space-y-3">
                      {breaks.map(b => (
                        <div key={b.id} className="flex items-center justify-between bg-slate-700/50 rounded-xl p-4">
                          <div className="flex items-center gap-3">
                            <span className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${
                              b.type === 'rest' ? 'bg-emerald-500/20' : 'bg-amber-500/20'
                            }`}>
                              {b.type === 'rest' ? '☕' : '🍽️'}
                            </span>
                            <div>
                              <p className="text-white font-medium">{b.duration} minutes</p>
                              <p className="text-slate-400 text-sm">
                                {b.type === 'rest' ? 'Rest Break' : 'Meal Break'} • {formatTime(b.time)}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveBreak(b.id)}
                            className="text-slate-400 hover:text-rose-400 transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Break Summary */}
                  {breaks.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-700">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-slate-400">Rest Breaks Taken</p>
                          <p className="text-white font-medium">{currentTotals.restBreaksTaken} min</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Meal Breaks Taken</p>
                          <p className="text-white font-medium">{currentTotals.mealBreaksTaken} min</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
            <h3 className="text-white font-semibold mb-4">Shift History</h3>
            {history.length === 0 ? (
              <p className="text-slate-400 text-center py-8">No completed shifts yet</p>
            ) : (
              <div className="space-y-4">
                {history.map(shift => {
                  const totals = calculateTotals(shift.loginTime, shift.logoutTime, shift.breaks);
                  return (
                    <div key={shift.id} className="bg-slate-700/50 rounded-xl p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-white font-medium">{shift.date}</p>
                          <p className="text-slate-400 text-sm">
                            {formatTime(shift.loginTime)} - {formatTime(shift.logoutTime)}
                          </p>
                        </div>
                        <span className="text-emerald-400 font-bold">
                          {formatDuration(totals.paidHours)} paid
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                          <p className="text-slate-400 text-xs">Total</p>
                          <p className="text-white">{formatDuration(totals.totalWorked)}</p>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                          <p className="text-slate-400 text-xs">Paid</p>
                          <p className="text-emerald-400">{formatDuration(totals.paidHours)}</p>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-2 text-center">
                          <p className="text-slate-400 text-xs">Unpaid</p>
                          <p className="text-amber-400">{formatDuration(totals.unpaidBreaks)}</p>
                        </div>
                      </div>
                      {(shift.loginLocation || shift.logoutLocation) && (
                        <div className="mt-3 pt-3 border-t border-slate-600 text-xs text-slate-400">
                          {shift.loginLocation && (
                            <p>📍 In: {shift.loginLocation.lat.toFixed(4)}, {shift.loginLocation.lng.toFixed(4)}</p>
                          )}
                          {shift.logoutLocation && (
                            <p>📍 Out: {shift.logoutLocation.lat.toFixed(4)}, {shift.logoutLocation.lng.toFixed(4)}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* NZ Law Reference */}
        <div className="bg-slate-800/30 rounded-2xl p-4 border border-slate-700/50">
          <p className="text-slate-500 text-xs text-center">
            Break calculations based on NZ Employment Relations Act 2000. 
            Rest breaks (10min) are paid. Meal breaks (30min) are unpaid.
          </p>
        </div>
      </main>
    </div>
  );
}
