import Constants from 'expo-constants';

/**
 * Whether this build carries Firebase at all. app.config.js leaves the native
 * modules out until the profile's config files exist, and requiring a React
 * Native Firebase package without its native half throws — so every import of
 * one goes through `loadFirebase`, never a top-level `import`.
 */
export const firebaseEnabled: boolean = Constants.expoConfig?.extra?.firebase === true;

/**
 * Google sign-in is built in only once the project has an OAuth client, which
 * appears after Google is enabled under Authentication (see app.config.js).
 */
export const googleSignInEnabled: boolean = Constants.expoConfig?.extra?.googleSignIn === true;

/** The OAuth web client id from google-services.json, for Google sign-in. */
export const googleWebClientId: string | undefined = Constants.expoConfig?.extra?.googleWebClientId;

type Firebase = {
  auth: typeof import('@react-native-firebase/auth');
  firestore: typeof import('@react-native-firebase/firestore');
};

let loaded: Firebase | null = null;
let settingsApplied: Promise<unknown> | null = null;

export function loadFirebase(): Firebase {
  if (!firebaseEnabled) throw new Error('Firebase is not configured for this build');
  if (!loaded) {
    /* eslint-disable @typescript-eslint/no-require-imports -- lazy on purpose, see above */
    loaded = {
      auth: require('@react-native-firebase/auth'),
      firestore: require('@react-native-firebase/firestore'),
    };
    /* eslint-enable @typescript-eslint/no-require-imports */
  }
  return loaded;
}

/**
 * Firestore, once its settings are applied. SQLite is the offline store; a
 * second cache inside Firestore would only cost memory and disk. Settings
 * must land before the first read or write, so every Firestore call awaits
 * this.
 */
export async function firestoreReady() {
  const { firestore } = loadFirebase();
  settingsApplied ??= firestore.initializeFirestore(firestore.getFirestore().app, { persistence: false });
  await settingsApplied;
  return firestore;
}
