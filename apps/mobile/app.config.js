const PROFILES = {
  development: { suffix: '.dev', name: 'Overload Development', scheme: 'overload-dev' },
  preview: { suffix: '.preview', name: 'Overload | Preview', scheme: 'overload-prev' },
  production: { suffix: '', name: 'Overload', scheme: 'overload' },
};

module.exports = ({ config }) => {
  const profile = process.env.EXPO_PUBLIC_APP_ENV || 'development';
  const { suffix, name, scheme } = PROFILES[profile] ?? PROFILES.development;

  return {
    ...config,
    name,
    slug: 'overload',
    scheme,
    version: '0.1.0',
    orientation: 'portrait',
    userInterfaceStyle: 'dark',
    newArchEnabled: true,
    icon: './assets/icon.png',
    plugins: [
      'expo-router',
      'expo-font',
      ['expo-build-properties', { android: { kotlinVersion: '1.9.24' } }],
      '@react-native-vector-icons/lucide',
    ],
    ios: {
      supportsTablet: false,
      bundleIdentifier: `com.overload.app${suffix}`,
    },
    android: {
      package: `com.overload.app${suffix}`,
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#14120F',
      },
    },
    androidStatusBar: {
      backgroundColor: '#1E1B17',
      barStyle: 'light-content',
    },
  };
};
