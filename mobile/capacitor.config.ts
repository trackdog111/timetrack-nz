import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'nz.trackable.app',
  appName: 'Trackable NZ',
  webDir: 'dist',
  android: {
    // Required for background-geolocation to work properly
    useLegacyBridge: true
  },
  ios: {
    contentInset: 'always'
  }
};

export default config;