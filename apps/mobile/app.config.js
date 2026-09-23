const fs = require('node:fs');
const path = require('node:path');

const PROFILES = {
  development: { suffix: '.dev', name: 'Overload | Development', scheme: 'overload-dev' },
  preview: { suffix: '.preview', name: 'Overload | Preview', scheme: 'overload-prev' },
  production: { suffix: '', name: 'Overload', scheme: 'overload' },
};

/**
 * Each profile is its own Firebase project, so dev and preview never touch
 * real accounts. The config files live in firebase/<profile>/ and are not
 * committed (firebase/*.example.* show their shape): download them from the
 * Firebase console. Until a profile's pair is there, Firebase stays out of the
 * build entirely and the app runs local-only — `extra.firebase` tells the JS side.
 */
function firebaseFiles(profile, bundleId) {
  const dir = path.join(__dirname, 'firebase', profile);
  const ios = path.join(dir, 'GoogleService-Info.plist');
  const android = path.join(dir, 'google-services.json');
  if (!fs.existsSync(ios) || !fs.existsSync(android)) return null;

  const plist = fs.readFileSync(ios, 'utf8');
  const plistValue = (key) => new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(plist)?.[1];
  // A plist from another profile would build fine and sign in to the wrong
  // app; fail here instead.
  if (plistValue('BUNDLE_ID') !== bundleId) {
    throw new Error(`firebase/${profile}/GoogleService-Info.plist is for ${plistValue('BUNDLE_ID')}, not ${bundleId}`);
  }

  // Google sign-in needs the project's OAuth *web* client (type 3) to mint an
  // id token Firebase accepts, and on iOS the reversed client id as a URL
  // scheme. Both appear only once Google is enabled under Authentication and
  // the files are downloaded again; until then Google sign-in stays off.
  const clients = JSON.parse(fs.readFileSync(android, 'utf8')).client?.flatMap((c) => c.oauth_client ?? []) ?? [];
  const googleWebClientId = clients.find((c) => c.client_type === 3)?.client_id;
  const googleSignIn = Boolean(googleWebClientId && plistValue('REVERSED_CLIENT_ID'));

  return {
    ios: `./firebase/${profile}/GoogleService-Info.plist`,
    android: `./firebase/${profile}/google-services.json`,
    googleWebClientId,
    googleSignIn,
  };
}

module.exports = ({ config }) => {
  const profile = PROFILES[process.env.EXPO_PUBLIC_APP_ENV] ? process.env.EXPO_PUBLIC_APP_ENV : 'development';
  const { suffix, name, scheme } = PROFILES[profile];
  const firebase = firebaseFiles(profile, `com.overload.app${suffix}`);

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
      [
        'expo-build-properties',
        {
          android: { kotlinVersion: '1.9.24' },
          // React Native Firebase's iOS SDKs are Swift pods and need static frameworks.
          ...(firebase ? { ios: { useFrameworks: 'static' } } : {}),
        },
      ],
      '@react-native-vector-icons/lucide',
      ...(firebase
        ? [
            '@react-native-firebase/app',
            '@react-native-firebase/auth',
            'expo-apple-authentication',
            // Reads the reversed client id from the GoogleService-Info.plist.
            ...(firebase.googleSignIn ? ['@react-native-google-signin/google-signin'] : []),
          ]
        : []),
    ],
    extra: {
      firebase: firebase !== null,
      googleSignIn: firebase?.googleSignIn ?? false,
      googleWebClientId: firebase?.googleWebClientId,
      profile,
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: `com.overload.app${suffix}`,
      ...(firebase ? { googleServicesFile: firebase.ios, usesAppleSignIn: true } : {}),
    },
    android: {
      package: `com.overload.app${suffix}`,
      ...(firebase ? { googleServicesFile: firebase.android } : {}),
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
