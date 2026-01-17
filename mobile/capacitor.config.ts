import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'nz.co.trackable.app',
  appName: 'Trackable NZ',
  webDir: 'dist',
  ios: {
    contentInset: 'always'
  },
  plugins: {
    Keyboard: {
      resize: 'body'
    }
  }
};

export default config;