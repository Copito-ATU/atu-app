import { initializeApp, getApps } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY            || 'REPLACE_WITH_FIREBASE_API_KEY',
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN        || 'atu-hackathon-2026.firebaseapp.com',
  databaseURL:       process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL       || 'https://atu-hackathon-2026-default-rtdb.firebaseio.com',
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID         || 'atu-hackathon-2026',
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET     || 'atu-hackathon-2026.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID|| '912531511612',
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID             || 'REPLACE_WITH_FIREBASE_APP_ID',
  measurementId:     process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID     || 'REPLACE_WITH_MEASUREMENT_ID',
};

// ─── Google OAuth Client IDs ──────────────────────────────────────────────────
// Web client (Expo Go via proxy auth.expo.io):
export const GOOGLE_WEB_CLIENT_ID    = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID    || 'REPLACE_WITH_GOOGLE_WEB_CLIENT_ID';
export const GOOGLE_CLIENT_SECRET    = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_SECRET    || 'REPLACE_WITH_GOOGLE_CLIENT_SECRET';

// Android client — creado en Google Cloud Console con SHA-1 del keystore EAS
// Pasos: 1) eas credentials -p android → copia el SHA-1
//        2) Cloud Console → APIs → Credenciales → Nuevo ID cliente OAuth → Android
//        3) Pega el package "com.solera.atulima" y el SHA-1
//        4) Reemplaza el string de abajo con el ID generado
export const GOOGLE_ANDROID_CLIENT_ID = ''; // TODO: reemplazar tras crear en Cloud Console

// iOS client — solo si construyes IPA (opcional por ahora)
export const GOOGLE_IOS_CLIENT_ID    = ''; // TODO: reemplazar tras crear en Cloud Console

// Tu username de Expo (expo.dev) — necesario SOLO para Expo Go
// 1. Crea cuenta gratis en https://expo.dev/signup
// 2. `npx expo login` en la terminal
// 3. `npx expo whoami` para ver tu username
// 4. Reemplaza el valor de abajo con ese username
export const EXPO_USERNAME = 'djmunozromero';

// ─── Detección de entorno ─────────────────────────────────────────────────────
// Expo Go → usa proxy https://auth.expo.io (Google Cloud Console lo acepta)
// APK / IPA  → usa esquema nativo com.googleusercontent.apps.{id}:/oauthredirect
const isExpoGo = Constants.appOwnership === 'expo';

export const GOOGLE_REDIRECT_URI = isExpoGo
  ? `https://auth.expo.io/@${EXPO_USERNAME}/atu_rn`
  : undefined; // undefined = makeRedirectUri() nativo automático

// ─────────────────────────────────────────────────────────────────────────────

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
