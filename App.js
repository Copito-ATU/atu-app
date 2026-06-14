import { StatusBar } from 'expo-status-bar';
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Keyboard, Dimensions, Linking, Image, Modal, SafeAreaView, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { exchangeCodeAsync, makeRedirectUri } from 'expo-auth-session';
import { GoogleAuthProvider, signInWithCredential, signOut, onAuthStateChanged } from 'firebase/auth';
import { FIREBASE_URL } from './constants';
import { auth, GOOGLE_WEB_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_ANDROID_CLIENT_ID, GOOGLE_IOS_CLIENT_ID, ENABLE_GOOGLE_LOGIN, BYPASS_AUTH, EXPO_USERNAME } from './services/firebase';
import { Platform } from 'react-native';
import { getTrafficAlerts } from './services/trafficAlerts';
import { searchPlaces, getPlaceCoords, getWalkingRoute, getTaxiEstimate, getTransitRoute } from './services/googleMaps';
import { planJourney, getBusArrivals, haversineKm, routeAllPoints, getAllStations } from './services/journeyPlanner';
import { TAMBOS } from './data/tambos';
const ALL_STATIONS = getAllStations();
import { askYatu } from './services/yatu';
import { WebView } from 'react-native-webview';
import RouteMapView from './components/RouteMapView';
import LoginScreen from './components/LoginScreen';
import { C, GRAD, SHADOW, R as RAD, Reveal, PressableScale, Aurora, Shine, Breathe, PulseRing, TypingDots } from './theme';

WebBrowser.maybeCompleteAuthSession();

const ATU_BLUE = C.blue;
const ATU_CYAN = C.cyan;
// Degradado azul de marca, unificado para todos los headers (midnight → ATU blue → sky)
const HEADER_GRAD = GRAD.header;
const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_H = Math.round(SCREEN_H * 0.50);

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const PROXY_URI = 'https://auth.expo.io/@djmunozromero/atu_rn';

const ATU_NEWS = [
  {
    id: 1, tag: 'OPERACIONES',
    title: 'Metropolitano: operación normal hoy',
    body: 'Todas las estaciones operan en horario regular 5:00 am – 10:30 pm con frecuencia de 3 min en hora punta.',
    color: ATU_BLUE, bg: '#001a52', emoji: '🚌', decor: '🚏   🛣️   🏙️',
  },
  {
    id: 2, tag: 'SERVICIO',
    title: 'Corredor Azul refuerza flota en hora punta',
    body: 'Mayor cantidad de unidades disponibles de 6–9 am y 5–8 pm en todas las rutas principales.',
    color: '#0284c7', bg: '#0c3d5e', emoji: '🔵', decor: '⚡   🚍   ⚡',
  },
  {
    id: 3, tag: 'TARIFAS 2026',
    title: 'Nueva tarifa integrada: S/ 2.80 por viaje',
    body: 'Válido en Metropolitano y todos los Corredores Complementarios usando tarjeta o aplicación.',
    color: '#16a34a', bg: '#052e16', emoji: '💳', decor: '💰   🎫   ✅',
  },
  {
    id: 4, tag: 'NUEVO RAMAL',
    title: 'Alimentadores Norte llegan a Los Olivos',
    body: 'Ramal extendido desde Terminal Naranjal hasta Los Olivos disponible desde el 1 de julio 2026.',
    color: '#d97706', bg: '#431407', emoji: '📍', decor: '🗺️   🚏   🆕',
  },
];

// ── Firebase ──────────────────────────────────────────────────────────────────
async function fbFetch(path) {
  const r = await fetch(`${FIREBASE_URL}${path}.json`);
  const d = await r.json();
  if (!d || typeof d !== 'object') return [];
  return Object.values(d);
}

// ── Fallback incidents (si Firebase no tiene datos) ───────────────────────────
const FALLBACK_INCIDENTS = [
  {
    // Incidente CERCA del usuario: Ca. José Gálvez / Av. Grau (Barrios Altos, Cercado de Lima)
    id: 'fi_galvez', type: 'Cierre vial parcial', severity: 'high', active: true,
    lat: -12.0576, lng: -77.0177, delay: 20,
    description: 'Ca. José Gálvez cerrada entre Av. Grau y Jr. Huánuco por trabajos de parchado de pistas (EMAPE). Buses de rutas 202, 204 y C301 desviados por Jr. Cusco hasta las 18:00 h. Se recomienda circular por Av. Abancay como alternativa.',
    affectedRoutes: ['C301', 'Ruta 202', 'Ruta 204'],
  },
  {
    id: 'fi1', type: 'Desvío de ruta', severity: 'high', active: true,
    lat: -12.0800, lng: -77.0300, delay: 15,
    description: 'Corredor Rojo desviado por Av. Javier Prado debido a obras viales. Se recomienda usar Corredor Azul como alternativa hasta las 18:00 h.',
    affectedRoutes: ['Corredor Rojo', 'C302', 'C303'],
  },
  {
    id: 'fi2', type: 'Alta demanda', severity: 'medium', active: true,
    lat: -11.9890, lng: -77.0590,
    description: 'Estaciones Naranjal e Independencia reportan alta afluencia. Se refuerza flota con unidades adicionales en hora punta 6–9 am y 5–8 pm.',
    affectedRoutes: ['Metropolitano'],
  },
  {
    id: 'fi3', type: 'Mantenimiento programado', severity: 'low', active: true,
    lat: -12.0870, lng: -77.0370,
    description: 'Estación La Cultura operará con un solo acceso habilitado hasta las 14:00 h por mantenimiento preventivo de torniquetes.',
    affectedRoutes: ['Metropolitano'],
  },
  {
    id: 'fi4', type: 'Interrupción parcial', severity: 'medium', active: true,
    lat: -12.0450, lng: -77.0410,
    description: 'Corredor Azul opera con 30% menos de unidades en tramo Av. Tacna – Av. Larco por mantenimiento de flota. Tiempos de espera aumentados a 8 min.',
    affectedRoutes: ['Corredor Azul', 'C101'],
  },
];

// ── Map segments ──────────────────────────────────────────────────────────────
function buildMapSegments(legs, walk1, walk2) {
  const segs = []; let wi = 0;
  for (const leg of legs) {
    if (leg.type === 'walk') {
      const wd = wi === 0 ? walk1 : walk2;
      segs.push({ polyline: wd?.polyline || '', color: '#f97316', dashed: true, type: 'walk', fromLat: leg.fromLat, fromLng: leg.fromLng, toLat: leg.toLat, toLng: leg.toLng });
      wi++;
    } else if (leg.type === 'bus') {
      segs.push({ points: leg.mapPoints || [], color: leg.routeColor || ATU_CYAN, dashed: false, label: leg.routeName, routeId: leg.routeId, routeLatlngs: routeAllPoints(leg.routeId), fromLabel: leg.fromStation.name, toLabel: leg.toStation.name, fromLat: leg.fromStation.lat, fromLng: leg.fromStation.lng, toLat: leg.toStation.lat, toLng: leg.toStation.lng });
    } else if (leg.type === 'transfer') {
      segs.push({ points: leg.mapPoints || [], color: '#58a6ff', dashed: true, fromLat: leg.fromLat, fromLng: leg.fromLng, toLat: leg.toLat, toLng: leg.toLng });
    }
  }
  return segs;
}

// ── Splash ────────────────────────────────────────────────────────────────────
function SplashScreen() {
  const logo   = useRef(new Animated.Value(0)).current;  // logo scale/fade-in
  const stripe = useRef(new Animated.Value(0)).current;  // cyan stripe sweep
  useEffect(() => {
    Animated.sequence([
      Animated.spring(logo, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }),
      Animated.timing(stripe, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);
  const logoScale  = logo.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });
  const stripeSlide = stripe.interpolate({ inputRange: [0, 1], outputRange: [-300, 0] });

  return (
    <View style={{ flex: 1, backgroundColor: C.navy900, justifyContent: 'center', alignItems: 'center' }}>
      <StatusBar style="light" />
      <Aurora />
      <Animated.View style={{ opacity: logo, transform: [{ scale: logoScale }], alignItems: 'center' }}>
        <View style={{ position: 'relative', flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 76, fontWeight: '900', letterSpacing: -5 }}>ATU</Text>
          <View style={{ position: 'absolute', left: 0, right: 0, top: 47, height: 11, overflow: 'hidden', borderRadius: 3 }}>
            <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: C.cyan, transform: [{ translateX: stripeSlide }] }} />
          </View>
        </View>
        <Text style={{ color: 'rgba(255,255,255,0.62)', fontSize: 17, fontWeight: '700', letterSpacing: 5, marginTop: 10 }}>L I M A</Text>
      </Animated.View>
      <View style={{ marginTop: 54, alignItems: 'center', justifyContent: 'center' }}>
        <PulseRing size={14} color={C.cyan} />
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.cyan }} />
      </View>
    </View>
  );
}

// ── Transición de pantallas (Animated nativo, driver nativo = sin jank) ────────
// mode: 'right' → avanzar (entra desde la derecha) · 'left' → retroceder (izq.)
//       'up' → Yatu sube · 'down' → Yatu baja al cerrar · 'fade' → misma pestaña
// Recorridos muy cortos + sin zoom = transición sutil que no marea
const TRANS_DIST = { right: 14, left: -14, up: 18, down: -18, fade: 0 };
function ScreenTransition({ routeKey, mode = 'fade', back = false, children }) {
  const t = useRef(new Animated.Value(back ? 1 : 0)).current;
  useLayoutEffect(() => {
    if (back) { t.setValue(1); return; } // volviendo atrás: sin animación
    t.setValue(0);
    Animated.timing(t, {
      toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  }, [routeKey, mode, back]);

  const opacity = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1] });
  const d = TRANS_DIST[mode] ?? 0;
  const move = t.interpolate({ inputRange: [0, 1], outputRange: [d, 0] });
  const transform = mode === 'up' || mode === 'down' ? [{ translateY: move }] : [{ translateX: move }];
  return <Animated.View style={{ flex: 1, opacity, transform }}>{children}</Animated.View>;
}

// ── Brillo lento que recorre una tarjeta (efecto "shine") ──────────────────────
function Shimmer({ band = 0.55, color = 'rgba(255,255,255,0.22)' }) {
  const x = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!w) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(1200),
      Animated.timing(x, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(x, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [w]);
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-w * 0.8, w * 1.2] });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={e => setW(e.nativeEvent.layout.width)}>
      <Animated.View style={{ position: 'absolute', top: -200, bottom: -200, width: w * band, transform: [{ translateX }, { rotate: '18deg' }] }}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', color, 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}

// ── Latido suave en bucle (para iconos / detalles vistosos) ────────────────────
function Pulse({ children, style, min = 1, max = 1.07, duration = 1500 }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [min, max] });
  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}

// ── App ───────────────────────────────────────────────────────────────────────
// Para el APK nativo, el redirectUri usa el esquema inverso del Android client ID
// Ejemplo: si androidClientId = "912531511612-abc.apps.googleusercontent.com"
//   → nativeScheme = "com.googleusercontent.apps.912531511612-abc"
function getNativeRedirect(clientId) {
  if (!clientId) return undefined;
  const id = clientId.replace('.apps.googleusercontent.com', '');
  return makeRedirectUri({ native: `com.googleusercontent.apps.${id}:/oauth2redirect` });
}

const nativeClientId  = Platform.OS === 'ios' ? GOOGLE_IOS_CLIENT_ID : GOOGLE_ANDROID_CLIENT_ID;
const nativeRedirect  = getNativeRedirect(nativeClientId);
const authClientId    = isExpoGo ? GOOGLE_WEB_CLIENT_ID : (nativeClientId || GOOGLE_WEB_CLIENT_ID);
const authRedirectUri = isExpoGo ? PROXY_URI : (nativeRedirect || PROXY_URI);

export default function App() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const [user, setUser] = useState(undefined); // undefined = cargando, null = sin sesión

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId:        authClientId,
    webClientId:     GOOGLE_WEB_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || GOOGLE_WEB_CLIENT_ID,
    iosClientId:     GOOGLE_IOS_CLIENT_ID     || GOOGLE_WEB_CLIENT_ID,
    redirectUri:     authRedirectUri,
    scopes:          ['openid', 'profile', 'email'],
    usePKCE:         !isExpoGo,
  });

  useEffect(() => {
    if (request?.redirectUri && __DEV__) {
      console.log('[ATU AUTH] redirectUri:', request.redirectUri);
      console.log('[ATU AUTH] isExpoGo:', isExpoGo, '| clientId:', authClientId);
    }
  }, [request]);

  useEffect(() => {
    if (BYPASS_AUTH) {
      setUser({ uid: 'bypass', displayName: 'Dev User', email: 'dev@example.com' });
      return () => {};
    }
    const unsub = onAuthStateChanged(auth, u => setUser(u ?? null));
    return unsub;
  }, []);

  useEffect(() => {
    if (response?.type !== 'success') {
      if (response?.type === 'error') {
        Alert.alert('Error de Google', response.error?.message || 'No se pudo conectar con Google');
      }
      return;
    }
    // En APK nativo con PKCE, el id_token viene directo en el response (no hay intercambio de código)
    if (!isExpoGo && response.authentication?.idToken) {
      const credential = GoogleAuthProvider.credential(response.authentication.idToken);
      signInWithCredential(auth, credential)
        .catch(e => Alert.alert('Error al iniciar sesión', e.message));
      return;
    }
    // Expo Go: intercambio de código usando el Web client + clientSecret
    exchangeCodeAsync(
      {
        clientId:     GOOGLE_WEB_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        code:         response.params.code,
        redirectUri:  authRedirectUri,
      },
      Google.discovery
    )
      .then(tokenResponse => {
        const credential = GoogleAuthProvider.credential(tokenResponse.idToken);
        return signInWithCredential(auth, credential);
      })
      .catch(e => Alert.alert('Error al iniciar sesión', e.message));
  }, [response]);

  // Flujo proxy para Expo Go: abre auth.expo.io/start con la URL de OAuth
  async function signInWithExpoGo() {
    if (!request?.url) return;
    try {
      const nativeUrl = makeRedirectUri();
      const startUrl = `${PROXY_URI}/start?${new URLSearchParams({ authUrl: request.url, returnUrl: nativeUrl })}`;
      const result = await WebBrowser.openAuthSessionAsync(startUrl, nativeUrl);
      if (result.type !== 'success') return;
      const parsed = request.parseReturnUrl(result.url);
      if (parsed.type !== 'success') {
        if (parsed.error) Alert.alert('Error de Google', parsed.error.message || 'No se pudo completar el acceso');
        return;
      }
      const tokenResponse = await exchangeCodeAsync(
        { clientId: GOOGLE_WEB_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, code: parsed.params.code, redirectUri: PROXY_URI },
        Google.discovery
      );
      const credential = GoogleAuthProvider.credential(tokenResponse.idToken);
      await signInWithCredential(auth, credential);
    } catch (e) {
      Alert.alert('Error al iniciar sesión', e.message);
    }
  }

  if (user === undefined) return <SplashScreen />;
  if (!user) return <LoginScreen onSignIn={isExpoGo ? signInWithExpoGo : () => promptAsync()} loading={!request} loginDisabled={!ENABLE_GOOGLE_LOGIN} />;
  return <MainApp user={user} />;
}

function MainApp({ user }) {
  // ── Estado principal ───────────────────────────────────────────────────────
  const [userLat, setUserLat] = useState(null);
  const [userLng, setUserLng] = useState(null);
  const [gpsReady, setGpsReady] = useState(false);
  const [buses, setBuses]       = useState([]);
  const [connected, setConnected] = useState(false);

  const [screen, setScreen]       = useState('home');
  const [query, setQuery]         = useState('');
  const [suggestions, setSugs]    = useState([]);
  const [destination, setDest]    = useState(null);
  const [loadingSug, setLoadingSug] = useState(false);
  const [planning, setPlanning]   = useState(false);
  const [journey, setJourney]         = useState(null);
  const [alternatives, setAlternatives] = useState([]);
  const [taxi, setTaxi]           = useState(null);
  const [transit, setTransit]     = useState(null);
  const [resultTab, setResultTab] = useState('atu');
  const [error, setError]         = useState('');
  const [recents, setRecents]     = useState([]);
  const [campanas, setCampanas]   = useState([]);
  const [noticias, setNoticias]   = useState([]);
  const [noticiasLoaded, setNoticiasLoaded] = useState(false);
  const [tab, setTab]             = useState('home');
  const [verTodasModal, setVerTodasModal] = useState(null); // null | 'campanas' | 'noticias'
  const [incidents, setIncidents]   = useState([]);
  const [routesGeo, setRoutesGeo]   = useState([]);
  const [stations, setStations]     = useState([]);
  const [peakHours, setPeakHours]   = useState(null);
  const [busTypes, setBusTypes]     = useState({});
  const debRef = useRef(null);

  useEffect(() => {
    let sub;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('GPS requerido'); return; }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 20 },
        pos => { setUserLat(pos.coords.latitude); setUserLng(pos.coords.longitude); setGpsReady(true); }
      );
    })();
    return () => sub?.remove();
  }, []);

  useEffect(() => {
    const poll = async () => {
      try { const d = await fbFetch('/buses'); setBuses(d); setConnected(d.length > 0); }
      catch (_) { setConnected(false); }
    };
    poll(); const t = setInterval(poll, 3000); return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Carga Firebase y TomTom en paralelo
      const [fbResult, tomResult] = await Promise.allSettled([
        fbFetch('/incidents'),
        getTrafficAlerts(),
      ]);
      if (cancelled) return;

      const fbData  = fbResult.status  === 'fulfilled' ? (fbResult.value  || []) : [];
      const tomData = tomResult.status === 'fulfilled' ? (tomResult.value || []) : [];

      // Normaliza incidencias del simulador Firebase al mismo formato
      const fbNorm = fbData
        .filter(i => i && i.severity)
        .map(i => ({
          id:             i.id,
          type:           i.label || i.type || 'Incidencia',
          severity:       i.severity,
          description:    i.nearStation
            ? `${i.icon ? i.icon + ' ' : ''}Cerca de estación ${i.nearStation}. Duración estimada: ${i.durationMinutes || '?'} min.`
            : (i.label || ''),
          affectedRoutes: [],
          active:         true,
          delay:          0,
          _source:        'fb',
        }));

      const merged = [...fbNorm, ...tomData];
      if (merged.length > 0) setIncidents(merged);
    };
    load();
    const t = setInterval(load, 300000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  useEffect(() => {
    fetch(`${FIREBASE_URL}/noticias.json`)
      .then(r => r.json())
      .then(data => {
        setCampanas(data && Array.isArray(data.campanas) && data.campanas.length > 0 ? data.campanas : ATU_NEWS.slice(0, 3));
        setNoticias(data && Array.isArray(data.noticias) && data.noticias.length > 0 ? data.noticias : ATU_NEWS.slice(1));
      })
      .catch(() => { setCampanas(ATU_NEWS.slice(0, 3)); setNoticias(ATU_NEWS.slice(1)); })
      .finally(() => setNoticiasLoaded(true));
  }, []);

  // ── Datos ATU reales: rutas geo, estaciones, horas pico ──────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [routesRes, peakRes, demandRes] = await Promise.allSettled([
          fetch(`${FIREBASE_URL}/routes_geo.json`).then(r => r.json()),
          fetch(`${FIREBASE_URL}/peak_hours.json`).then(r => r.json()),
          fetch(`${FIREBASE_URL}/station_demand.json`).then(r => r.json()),
        ]);

        // Rutas geo: Firebase devuelve objeto {R1461: {...}, ...} → convertir a array
        if (routesRes.status === 'fulfilled' && routesRes.value) {
          const raw = routesRes.value;
          const arr = Array.isArray(raw) ? raw : Object.values(raw);
          setRoutesGeo(arr.filter(r => r && r.latlngs));
        }

        // Horas pico
        if (peakRes.status === 'fulfilled' && peakRes.value) {
          setPeakHours(peakRes.value);
        }

        // Tipos de bus con fotos
        try {
          const btRes = await fetch(`${FIREBASE_URL}/bus_types.json`).then(r => r.json());
          if (btRes && typeof btRes === 'object') setBusTypes(btRes);
        } catch (_) {}

        // Estaciones con demanda real — fusionar con coords de metropolitano
        if (demandRes.status === 'fulfilled' && demandRes.value) {
          const d = demandRes.value;
          const METRO_COORDS = {
            'Naranjal':         { lat: -11.9812, lng: -77.0592 },
            'Los Jazmines':     { lat: -12.0021, lng: -77.0548 },
            'Izaguirre':        { lat: -12.0105, lng: -77.0523 },
            'Caquetá':          { lat: -12.0420, lng: -77.0390 },
            'Quilca':           { lat: -12.0490, lng: -77.0368 },
            'Estación Central': { lat: -12.0572, lng: -77.0358 },
            'Estadio Nacional': { lat: -12.0688, lng: -77.0321 },
            'México':           { lat: -12.0761, lng: -77.0291 },
            '28 de Julio':      { lat: -12.0835, lng: -77.0268 },
            'Javier Prado':     { lat: -12.0890, lng: -77.0248 },
            'Canaval y Moreyra':{ lat: -12.0963, lng: -77.0225 },
            'Ricardo Palma':    { lat: -12.1042, lng: -77.0205 },
            'Benavides':        { lat: -12.1118, lng: -77.0191 },
            'Angamos':          { lat: -12.1268, lng: -77.0165 },
            'Matellini':        { lat: -12.1774, lng: -77.0171 },
            'Bulevar':          { lat: -12.1168, lng: -77.0198 },
            'Balta':            { lat: -12.1143, lng: -77.0196 },
            'Plaza de Flores':  { lat: -12.1098, lng: -77.0178 },
            'Aramburú':         { lat: -12.0928, lng: -77.0225 },
            'Andrés Reyes':     { lat: -12.0898, lng: -77.0225 },
            'Canadá':           { lat: -12.0868, lng: -77.0178 },
            'Enotria':          { lat: -12.0320, lng: -77.0487 },
            'Comas':            { lat: -11.9400, lng: -77.0450 },
            'Chimpu Ocllo':     { lat: -11.9450, lng: -77.0480 },
          };
          const LINEA1_COORDS = {
            'V. El Salvador':       { lat: -12.2135, lng: -76.9415 },
            'Parque Industrial':    { lat: -12.1980, lng: -76.9560 },
            'Villa María':          { lat: -12.1820, lng: -76.9650 },
            'San Juan':             { lat: -12.1620, lng: -76.9770 },
            'Pumacahua':            { lat: -12.1420, lng: -76.9860 },
            'Atocongo':             { lat: -12.1280, lng: -76.9930 },
            'San Borja Sur':        { lat: -12.1050, lng: -77.0010 },
            'Angamos':              { lat: -12.0980, lng: -77.0040 },
            'La Cultura':           { lat: -12.0850, lng: -77.0080 },
            'Arriola':              { lat: -12.0660, lng: -77.0170 },
            'Garcilaso':            { lat: -12.0580, lng: -77.0220 },
            'Colmena':              { lat: -12.0540, lng: -77.0340 },
            'Presbítero Maestro':   { lat: -12.0460, lng: -77.0170 },
            'Bayóvar':              { lat: -11.9840, lng: -76.9650 },
            'Los Jardines':         { lat: -12.0010, lng: -76.9590 },
          };
          const stArr = [];
          Object.entries(d.cosac || {}).forEach(([id, s]) => {
            const name = s.name || '';
            const coords = Object.entries(METRO_COORDS).find(([k]) =>
              name.toLowerCase().includes(k.toLowerCase())
            );
            if (coords) stArr.push({ id: `cosac_${id}`, name, system: 'cosac', demand: s.total, ...coords[1] });
          });
          Object.entries(d.linea1 || {}).forEach(([id, s]) => {
            const name = s.name || '';
            const coords = Object.entries(LINEA1_COORDS).find(([k]) =>
              name.toLowerCase().includes(k.toLowerCase())
            );
            if (coords) stArr.push({ id: `l1_${id}`, name, system: 'linea1', demand: s.total, ...coords[1] });
          });
          setStations(stArr);
        }
      } catch (_) {}
    };
    load();
  }, []);

  function onQueryChange(text) {
    setQuery(text); setDest(null); setSugs([]);
    if (debRef.current) clearTimeout(debRef.current);
    if (text.length < 2) return;
    debRef.current = setTimeout(async () => {
      setLoadingSug(true);
      try { setSugs(await searchPlaces(text, userLat, userLng)); } catch (_) {}
      setLoadingSug(false);
    }, 400);
  }

  const [customOrigin, setCustomOrigin] = useState(null);

  async function selectSuggestion(place) {
    Keyboard.dismiss(); setSugs([]);
    const name = place.structured_formatting?.main_text || place.description;
    setQuery(name); setDest(null);
    const coords = await getPlaceCoords(place.place_id);
    if (coords) {
      const dest = { name, ...coords };
      setDest(dest);
      planWithDest(dest);
    }
  }

  async function planWithDest(dest) {
    const fromLat = customOrigin?.lat ?? userLat;
    const fromLng = customOrigin?.lng ?? userLng;
    if (!dest?.lat || !fromLat) return;
    setPlanning(true); setError(''); setJourney(null); setAlternatives([]); setTaxi(null); setTransit(null);
    const atuResult = planJourney(fromLat, fromLng, dest.lat, dest.lng, buses);

    if (atuResult.error) {
      setError(atuResult.error);
      try {
        const [tx, tr] = await Promise.all([
          getTaxiEstimate(fromLat, fromLng, dest.lat, dest.lng).catch(() => null),
          getTransitRoute(fromLat, fromLng, dest.lat, dest.lng).catch(() => null),
        ]);
        setTaxi(tx); setTransit(tr);
        setResultTab(tr ? 'transit' : tx ? 'taxi' : 'atu');
      } catch (_) {}
      setQuery(''); setSugs([]);
      setPlanning(false); setScreen('results'); return;
    }

    // Fetch taxi/transit in background while showing picker
    Promise.all([
      getTaxiEstimate(fromLat, fromLng, dest.lat, dest.lng).catch(() => null),
      getTransitRoute(fromLat, fromLng, dest.lat, dest.lng).catch(() => null),
    ]).then(([tx, tr]) => {
      setTaxi(tx); setTransit(tr);
      setResultTab(tr ? 'transit' : tx ? 'taxi' : 'atu');
    });

    setAlternatives(atuResult.alternatives);
    setRecents([dest]);
    setQuery('');
    setSugs([]);
    setPlanning(false);
    setScreen('picker');
  }

  async function handleAlternativeSelect(alt) {
    const fromLat = customOrigin?.lat ?? userLat;
    const fromLng = customOrigin?.lng ?? userLng;
    setPlanning(true);

    const legs = alt.legs.map(l => ({ ...l }));
    const firstBus  = legs.find(l => l.type === 'bus');
    const lastBus   = [...legs].reverse().find(l => l.type === 'bus');
    const firstWalk = legs.find(l => l.type === 'walk');
    const lastWalk  = [...legs].reverse().find(l => l.type === 'walk');

    const [walk1, walk2] = await Promise.all([
      firstBus ? getWalkingRoute(fromLat, fromLng, firstBus.fromStation.lat, firstBus.fromStation.lng).catch(() => null) : Promise.resolve(null),
      lastBus  ? getWalkingRoute(lastBus.toStation.lat, lastBus.toStation.lng, destination.lat, destination.lng).catch(() => null) : Promise.resolve(null),
    ]);

    if (walk1 && firstWalk) firstWalk.googleMin = Math.round(walk1.durationSec / 60);
    if (walk2 && lastWalk)  lastWalk.googleMin  = Math.round(walk2.durationSec / 60);
    if (walk1 && firstBus)  firstBus.walkMinToBoard = Math.round(walk1.durationSec / 60);

    let total = alt.totalMinutes;
    if (walk1 && firstWalk) total += (walk1.durationSec / 60) - (firstWalk.minutes || 0);
    if (walk2 && lastWalk)  total += (walk2.durationSec / 60) - (lastWalk.minutes  || 0);

    const mapSegments = buildMapSegments(legs, walk1, walk2);
    setJourney({ ...alt, legs, totalMinutes: Math.round(total), mapSegments });
    setResultTab('atu');
    setPlanning(false);
    setScreen('results');
  }

  async function plan() {
    if (!gpsReady)    { Alert.alert('GPS no listo'); return; }
    if (!destination) { Alert.alert('Selecciona un destino'); return; }
    planWithDest(destination);
  }

  // ── Dirección de la transición según el contexto de navegación ──────────────
  const prevScreenRef = useRef('home');
  const prevTabRef    = useRef(tab);
  useEffect(() => { prevScreenRef.current = screen; }, [screen]);
  useEffect(() => { prevTabRef.current = tab; }, [tab]);
  const ORDER = { home: 0, picker: 1, results: 2 };
  const deepMode = (ORDER[screen] ?? 1) >= (ORDER[prevScreenRef.current] ?? 0) ? 'right' : 'left';
  let homeMode = 'fade';
  if (prevScreenRef.current === 'yatu') homeMode = 'down';
  else if (prevScreenRef.current === 'picker' || prevScreenRef.current === 'results') homeMode = 'left';
  else {
    const ci = NAV_TABS.findIndex(t => t.key === tab);
    const pi = NAV_TABS.findIndex(t => t.key === prevTabRef.current);
    homeMode = ci > pi ? 'right' : ci < pi ? 'left' : 'fade';
  }

  if (screen === 'yatu') {
    return (
      <ScreenTransition routeKey="yatu" mode="up">
        <YatuScreen onBack={() => setScreen('home')} user={user} />
      </ScreenTransition>
    );
  }

  if (screen === 'picker') {
    return (
      <ScreenTransition routeKey="picker" mode={deepMode} back={deepMode === 'left'}>
        <RoutePickerScreen
          alternatives={alternatives}
          destination={destination}
          planning={planning}
          onBack={() => setScreen('home')}
          onSelect={handleAlternativeSelect}
          peakHours={peakHours}
          isBack={deepMode === 'left'}
        />
      </ScreenTransition>
    );
  }

  if (screen === 'results') {
    return (
      <ScreenTransition routeKey="results" mode={deepMode} back={deepMode === 'left'}>
        <ResultScreen
          journey={journey} taxi={taxi} transit={transit}
          buses={buses} connected={connected}
          userLat={userLat} userLng={userLng} destination={destination}
          onBack={() => setScreen('picker')}
          resultTab={resultTab} setResultTab={setResultTab} error={error}
          busTypes={busTypes} peakHours={peakHours}
        />
      </ScreenTransition>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {tab === 'billetera'
        ? <BilleteraScreen user={user} onSignOut={() => signOut(auth)} />
        : tab === 'noticias'
          ? <NoticiasScreen campanas={campanas} noticias={noticias} noticiasLoaded={noticiasLoaded} />
          : tab === 'paraderos'
            ? <ParaderosScreen userLat={userLat} userLng={userLng} onGoYatu={() => setScreen('yatu')} />
          : tab === 'alertas'
            ? <AlertasScreen incidents={incidents} connected={connected} userLat={userLat} userLng={userLng} />
            : <HomeScreen
                query={query} onQueryChange={onQueryChange}
                suggestions={suggestions} onSelectSuggestion={selectSuggestion}
                onClearQuery={() => { setQuery(''); setSugs([]); setDest(null); }}
                loadingSug={loadingSug} planning={planning}
                destination={destination}
                gpsReady={gpsReady} buses={buses} connected={connected}
                recents={recents}
                onSelectRecent={r => { setQuery(r.name || ''); setDest(r); planWithDest(r); }}
                campanas={campanas} noticias={noticias}
                noticiasLoaded={noticiasLoaded}
                peakHours={peakHours}
                user={user}
                userLat={userLat} userLng={userLng}
                stations={stations}
                customOrigin={customOrigin}
                onSetCustomOrigin={setCustomOrigin}
                onGoYatu={() => setScreen('yatu')}
                onGoNoticias={() => setTab('noticias')}
                onGoParaderos={() => setTab('paraderos')}
              />
      }
      <BottomNav tab={tab} setTab={setTab} />

      {/* FAB Yatu — visible fuera del Inicio */}
      {(tab === 'noticias' || tab === 'alertas' || tab === 'billetera' || tab === 'paraderos') && (
        <YatuFab key={tab} onPress={() => setScreen('yatu')} />
      )}

      <VerTodasModal
        visible={verTodasModal !== null}
        tipo={verTodasModal}
        items={verTodasModal === 'campanas' ? campanas : noticias}
        onClose={() => setVerTodasModal(null)}
      />
    </View>
  );
}

// ── Home Screen ───────────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

// Próximas salidas cerca (Home) — datos de demostración
const NEXT_DEPARTURES = [
  { system: 'METROPOLITANO', sysColor: '#13315E', stop: 'Est. Ricardo Palma', fare: 'S/ 3.20',
    sub: 'A 180 m · 3 min caminando', min: '4 min', minColor: '#1E9E6A', time: '08:22', warn: false },
  { system: 'CORR. ROJO', sysColor: '#C8102E', stop: 'Paradero Pardo', fare: 'S/ 2.00',
    sub: 'Retraso · +15 min', min: '11 min', minColor: '#0E2147', time: '08:29', warn: true },
];

function getPeakLevel(peakHours) {
  if (!peakHours) return null;
  const h    = new Date().getHours();
  const vals = peakHours.cosac || peakHours.linea1 || [];
  const pct  = vals[h] || 0;
  if (pct >= 80) return { label: 'Hora pico',    color: '#ef4444', bg: '#fef2f2', icon: '🔴', code: 'peak'   };
  if (pct >= 50) return { label: 'Flujo alto',   color: '#f59e0b', bg: '#fffbeb', icon: '🟡', code: 'high'   };
  if (pct >= 25) return { label: 'Flujo normal', color: '#22c55e', bg: '#f0fdf4', icon: '🟢', code: 'normal' };
  return              { label: 'Flujo bajo',   color: '#3b82f6', bg: '#eff6ff', icon: '🔵', code: 'low'    };
}

// Consejo inteligente basado en la hora actual y las próximas horas.
// journeyMinutes: tiempo actual de la ruta (para calcular ahorro si espera).
function getPeakAdvice(peakHours, journeyMinutes) {
  if (!peakHours) return null;
  const h    = new Date().getHours();
  const vals = peakHours.cosac || [];
  const now  = vals[h] || 0;

  const fmt = (hh) => `${hh > 12 ? hh - 12 : hh === 0 ? 12 : hh}:00 ${hh >= 12 ? 'pm' : 'am'}`;

  // baseMin ya es el tiempo calculado por el simulador con las condiciones actuales.
  // Para estimar a otra hora: escalar por la relación de factores (after/now).
  // factor(pct) = 1 + (pct/100)*0.55  →  a 0% congestión factor=1, a 100% factor=1.55
  const factorOf  = (pct) => 1 + (pct / 100) * 0.55;
  const timeAfter = (nowPct, afterPct, baseMin) => {
    if (!baseMin) return null;
    return Math.round(baseMin * (factorOf(afterPct) / factorOf(nowPct)));
  };

  if (now >= 80) {
    let end = h + 1;
    while (end < 24 && (vals[end] || 0) >= 60) end++;
    const afterPct  = end < 24 ? (vals[end] || 10) : 10;
    const afterTime = timeAfter(now, afterPct, journeyMinutes);
    const savings   = afterTime ? journeyMinutes - afterTime : null;
    // Severidad real basada en minutos ahorrados, no en el % de congestión
    const sev = savings >= 15 ? 'high' : savings >= 6 ? 'mid' : 'low';
    if (sev === 'low') return null; // diferencia insignificante, no mostrar

    const summaryNums = `Ahora ${journeyMinutes} min → ${fmt(end)} ~${afterTime} min`;
    return sev === 'high' ? {
      color: '#ef4444', bg: '#fef2f2', icon: '🚨',
      title: 'Hora pico activa',
      summary: summaryNums,
      body: `El tráfico baja a las ${fmt(end)}. Ahora ~${journeyMinutes} min · esperando llegarías en ~${afterTime} min (${savings} min menos).`,
    } : {
      color: '#f59e0b', bg: '#fff8ed', icon: '⚠️',
      title: 'Tráfico elevado',
      summary: summaryNums,
      body: `Hay algo de congestión. Si esperas hasta las ${fmt(end)}, llegarías en ~${afterTime} min (${savings} min menos).`,
    };
  }

  // Buscar próximo pico en las siguientes 4 horas
  let nextPeakH = null;
  for (let i = 1; i <= 4; i++) {
    if (h + i < 24 && (vals[h + i] || 0) >= 70) { nextPeakH = h + i; break; }
  }

  if (nextPeakH !== null) {
    const peakPct  = vals[nextPeakH] || 70;
    const peakTime = timeAfter(now, peakPct, journeyMinutes);
    const extra    = peakTime && journeyMinutes ? peakTime - journeyMinutes : null;
    const gap      = nextPeakH - h;

    if (gap <= 2 && extra >= 5) {
      return {
        color: '#f59e0b', bg: '#fff8ed', icon: gap === 1 ? '⚡' : '⏰',
        title: `Tráfico a las ${fmt(nextPeakH)}`,
        summary: `Ahora ${journeyMinutes} min → ${fmt(nextPeakH)} ~${peakTime} min`,
        body: gap === 1
          ? `¡Sal ahora! A las ${fmt(nextPeakH)} el tráfico sube y el viaje tomará ~${peakTime} min (${extra} min más).`
          : `Tienes tiempo. Si esperas hasta las ${fmt(nextPeakH)}, el viaje subirá a ~${peakTime} min (${extra} min más).`,
      };
    }

    // Hay tráfico más tarde pero no urgente → info tranquila
    return {
      color: '#3b82f6', bg: '#eff6ff', icon: '✅',
      title: 'Sin tráfico ahora',
      summary: `Pico a las ${fmt(nextPeakH)}`,
      body: journeyMinutes && extra > 0
        ? `Buen momento para salir. A las ${fmt(nextPeakH)} el tráfico sube; si esperas, el viaje pasaría de ${journeyMinutes} a ~${peakTime} min (${extra} min más).`
        : `Buen momento para salir. El tráfico sube a partir de las ${fmt(nextPeakH)}.`,
    };
  }

  // Sin congestión relevante en las próximas horas
  return {
    color: '#22c55e', bg: '#f0fdf4', icon: '✅',
    title: 'Sin tráfico',
    summary: 'Rutas despejadas',
    body: 'No hay congestión prevista en las próximas horas. Buen momento para viajar.',
  };
}

// Banner completo para el picker (sin modal, se ve todo)
function TrafficBanner({ peakHours, journeyMinutes, style }) {
  const advice = getPeakAdvice(peakHours, journeyMinutes);
  if (!advice) return null;
  return (
    <View style={[tfb.wrap, { backgroundColor: advice.bg, borderLeftColor: advice.color }, style]}>
      <Text style={tfb.icon}>{advice.icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[tfb.title, { color: advice.color }]}>{advice.title}</Text>
        <Text style={tfb.body}>{advice.body}</Text>
      </View>
    </View>
  );
}
const tfb = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12, borderLeftWidth: 3 },
  icon:  { fontSize: 20 },
  title: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  body:  { fontSize: 12, color: '#374151', lineHeight: 17 },
});

// Chip compacto con modal flotante al tocar (para pantalla de resultados)
function TrafficCard({ advice }) {
  const [open, setOpen] = React.useState(false);
  if (!advice) return null;
  return (
    <>
      <TouchableOpacity
        style={[tfc.chip, { backgroundColor: advice.bg, borderColor: advice.color + '66' }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.75}
      >
        <Text style={tfc.chipIcon}>{advice.icon}</Text>
        <Text style={[tfc.chipTitle, { color: advice.color }]}>{advice.title}</Text>
        <Text style={[tfc.chipMore, { color: advice.color + 'CC' }]}>· Ver mejor hora</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={tfc.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={[tfc.floatCard, { borderColor: advice.color + '55' }]}>
            <View style={tfc.floatTop}>
              <Text style={tfc.floatIcon}>{advice.icon}</Text>
              <Text style={[tfc.floatTitle, { color: advice.color }]}>{advice.title}</Text>
            </View>
            <Text style={tfc.floatSummary}>{advice.summary}</Text>
            <Text style={tfc.floatBody}>{advice.body}</Text>
            <Text style={tfc.floatDismiss}>Toca para cerrar</Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}
const tfc = StyleSheet.create({
  chip:        { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'center', marginBottom: 10 },
  chipIcon:    { fontSize: 13 },
  chipTitle:   { fontSize: 12, fontWeight: '800' },
  chipMore:    { fontSize: 11, fontWeight: '600' },
  backdrop:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  floatCard:   { backgroundColor: '#1C2B4A', borderWidth: 1, borderRadius: 16, padding: 20, width: '100%', maxWidth: 340 },
  floatTop:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  floatIcon:   { fontSize: 22 },
  floatTitle:  { fontSize: 16, fontWeight: '900', color: '#fff' },
  floatSummary:{ fontSize: 13, fontWeight: '700', color: '#94A3B8', marginBottom: 10 },
  floatBody:   { fontSize: 14, color: '#CBD5E1', lineHeight: 21 },
  floatDismiss:{ fontSize: 11, color: '#4B5563', textAlign: 'center', marginTop: 14 },
});

function HomeScreen({ query, onQueryChange, suggestions, onSelectSuggestion, onClearQuery,
                      loadingSug, planning, destination, gpsReady,
                      buses, connected, recents, onSelectRecent, campanas, noticias, noticiasLoaded,
                      peakHours, user, userLat, userLng, stations,
                      customOrigin, onSetCustomOrigin,
                      onGoYatu, onGoNoticias, onGoParaderos }) {
  const peak = getPeakLevel(peakHours);
  const firstName = user?.displayName?.split(' ')[0] || 'Pasajero';
  const [searchModalOpen, setSearchModalOpen] = React.useState(false);
  // Lugares guardados
  const [savedPlaces, setSavedPlaces] = React.useState({ casa: null, trabajo: null, universidad: null });
  // Modo del modal: 'dest' | 'origin' | 'casa' | 'trabajo' | 'universidad'
  const [modalMode, setModalMode] = React.useState('dest');
  // Chip activo en modo dest: 'sugeridos' | 'casa' | 'trabajo' | 'universidad'
  const [savedFilter, setSavedFilter] = React.useState('sugeridos');
  const [showHomeQR, setShowHomeQR] = React.useState(false);
  const [homeQrSecs, setHomeQrSecs] = React.useState(120);
  React.useEffect(() => {
    if (!showHomeQR) { setHomeQrSecs(120); return; }
    const t = setInterval(() => setHomeQrSecs(s => s > 0 ? s - 1 : 0), 1000);
    return () => clearInterval(t);
  }, [showHomeQR]);
  const [auxQuery, setAuxQuery] = React.useState('');
  const [auxSugs, setAuxSugs]   = React.useState([]);
  const [auxLoading, setAuxLoading] = React.useState(false);

  // ── Voz ───────────────────────────────────────────────────────────────────
  const [isRecording, setIsRecording]     = React.useState(false);
  const [isTranscribing, setIsTranscribing] = React.useState(false);
  const recordingRef  = React.useRef(null);
  const recordTimer   = React.useRef(null);

  async function startVoice() {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Activa el micrófono en Ajustes para usar la búsqueda por voz.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsRecording(true);
      recordTimer.current = setTimeout(stopVoice, 10000);
    } catch {
      Alert.alert('Error', 'No se pudo iniciar el micrófono.');
    }
  }

  async function stopVoice() {
    clearTimeout(recordTimer.current);
    const rec = recordingRef.current;
    if (!rec) return;
    recordingRef.current = null;
    setIsRecording(false);
    setIsTranscribing(true);
    try {
      await rec.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = rec.getURI();
      const form = new FormData();
      form.append('file', { uri, type: 'audio/m4a', name: 'voz.m4a' });
      form.append('model', 'whisper-1');
      form.append('language', 'es');
      const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.EXPO_PUBLIC_OPENAI_KEY}` },
        body: form,
      });
      const d = await r.json();
      if (d.text?.trim()) {
        onQueryChange(d.text.trim());
        setSearchModalOpen(true);
      }
    } catch {
      Alert.alert('Error', 'No se pudo transcribir el audio. Intenta de nuevo.');
    } finally {
      setIsTranscribing(false);
    }
  }

  function handleMicPress() {
    if (isTranscribing) return;
    if (isRecording) stopVoice(); else startVoice();
  }

  React.useEffect(() => {
    AsyncStorage.getItem('ATU_SAVED_PLACES').then(v => {
      if (v) try { setSavedPlaces(JSON.parse(v)); } catch (_) {}
    });
  }, []);

  React.useEffect(() => {
    if (modalMode === 'dest') { setAuxSugs([]); return; }
    if (!auxQuery || auxQuery.length < 2) { setAuxSugs([]); return; }
    setAuxLoading(true);
    const t = setTimeout(() => {
      searchPlaces(auxQuery, userLat, userLng)
        .then(r => { setAuxSugs(r || []); setAuxLoading(false); })
        .catch(() => { setAuxSugs([]); setAuxLoading(false); });
    }, 400);
    return () => clearTimeout(t);
  }, [auxQuery, modalMode]);
  // Incidente más cercano al usuario para mostrar en el mapa
  const nearestAlert = React.useMemo(() => {
    if (!userLat || !userLng) return FALLBACK_INCIDENTS.find(i => i.severity === 'high' && i.active !== false) || null;
    return FALLBACK_INCIDENTS
      .filter(i => i.active !== false && i.lat && i.lng)
      .sort((a, b) => haversineKm(userLat, userLng, a.lat, a.lng) - haversineKm(userLat, userLng, b.lat, b.lng))[0] || null;
  }, [userLat, userLng]);

  return (
    <View style={hs.root}>
      <StatusBar style="light" />

      {/* ── HEADER UNIFICADO: logo · location · search · yatu ── */}
      <LinearGradient colors={HEADER_GRAD} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={hs.header}>
        {/* Fila superior: saludo + ubicación + peak + avatar */}
        <View style={hs.headerTop}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={hs.greetHi}>{getGreeting()}, {firstName}</Text>
            <TouchableOpacity style={hs.greetLocRow} activeOpacity={0.7}>
              <Ionicons name="location-sharp" size={15} color={ATU_CYAN} />
              <Text style={hs.greetLoc} numberOfLines={1}>{gpsReady ? 'Miraflores, Lima' : 'Ubicando...'}</Text>
              <Ionicons name="chevron-down" size={13} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {peak && <View style={hs.peakPill}><Ionicons name="ellipse" size={7} color={peak.color} /><Text style={hs.peakTxt}>{peak.label}</Text></View>}
            <View style={hs.avatarCircle}>
              <Text style={hs.avatarTxt}>{(user?.displayName?.[0] || user?.email?.[0] || 'U').toUpperCase()}</Text>
            </View>
          </View>
        </View>

        {/* Barra de búsqueda */}
        <Reveal delay={90}>
          <View style={hs.searchBar}>
            <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
              activeOpacity={0.88} onPress={() => setSearchModalOpen(true)}>
              <Ionicons name="search-outline" size={20} color={C.blueBright} />
              <Text style={[hs.searchInput, { color: query ? C.text : C.textFaint }]} numberOfLines={1}>
                {query || '¿A dónde quieres ir?'}
              </Text>
            </TouchableOpacity>
            {query.length > 0
              ? <TouchableOpacity onPress={onClearQuery} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close-circle" size={18} color="#9ca3af" />
                </TouchableOpacity>
              : <TouchableOpacity onPress={handleMicPress} disabled={isTranscribing}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  {isTranscribing
                    ? <ActivityIndicator size="small" color={C.cyan} />
                    : isRecording
                      ? <Breathe min={0.85} max={1.25} duration={500}>
                          <Ionicons name="mic" size={20} color="#EF4444" />
                        </Breathe>
                      : <Ionicons name="mic-outline" size={19} color={C.textFaint} />
                  }
                </TouchableOpacity>
            }
          </View>
        </Reveal>

        {/* Botón Yatu — dentro del header */}
        <Reveal delay={180}>
          <TouchableOpacity style={hs.yatuBtn} activeOpacity={0.85} onPress={onGoYatu}>
            <Breathe style={hs.yatuIconBox} min={1} max={1.12} duration={1700}>
              <Ionicons name="sparkles" size={16} color="#fff" />
            </Breathe>
            <Text style={hs.yatuTxt}>
              ¿Qué bus o qué letra tomar?{'  '}<Text style={hs.yatuBold}>Pregúntale a Yatu</Text>
            </Text>
            <Ionicons name="chevron-forward" size={15} color="#9FB4D6" />
          </TouchableOpacity>
        </Reveal>
      </LinearGradient>

      {/* ── MAPA (fondo claro, alerta flotante, botón locate) ── */}
      <Reveal delay={260} distance={22} style={hs.mapBig}>
        {gpsReady && userLat && userLng ? (
          <RouteMapView
            segments={[]}
            fromLat={userLat} fromLng={userLng}
            liveBuses={[]}
            stations={ALL_STATIONS}
            tambos={TAMBOS}
          />
        ) : (
          <View style={hs.mapLoading}>
            <ActivityIndicator color={ATU_BLUE} size="large" />
            <Text style={hs.mapLoadingTxt}>Cargando mapa...</Text>
          </View>
        )}
      </Reveal>

      {/* planning indicator — sutil, sin bloquear la pantalla */}
      {planning && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E8EDF4' }}>
          <ActivityIndicator color={ATU_BLUE} size="small" />
          <Text style={{ fontSize: 13, fontWeight: '700', color: ATU_BLUE }}>Buscando rutas para ti...</Text>
        </View>
      )}

      <ScrollView style={hs.scroll} contentContainerStyle={hs.content} keyboardShouldPersistTaps="handled">

        {/* Accesos guardados: Casa · Trabajo · Universidad */}
        <Reveal delay={300} style={hs.savedRow}>
          {[
            { key: 'casa',        label: 'Casa',        icon: 'home' },
            { key: 'trabajo',     label: 'Trabajo',     icon: 'briefcase' },
            { key: 'universidad', label: 'Universidad', icon: 'school' },
          ].map(({ key, label, icon }) => {
            const saved = !!savedPlaces[key];
            return (
              <TouchableOpacity key={key} style={hs.savedCard} activeOpacity={0.85}
                onPress={() => { setSavedFilter(key); setSearchModalOpen(true); }}>
                <View style={hs.savedIconBox}>
                  <Ionicons name={`${icon}-outline`} size={19} color={C.blueBright} />
                </View>
                <Text style={hs.savedLabel}>{label}</Text>
                {saved && <View style={hs.savedDot} />}
              </TouchableOpacity>
            );
          })}
        </Reveal>

        {/* Próximas salidas cerca */}
        <Reveal delay={380} style={hs.section}>
          <View style={hs.sectionRow}>
            <Text style={hs.sectionTitle}>Próximas salidas cerca</Text>
            <TouchableOpacity onPress={onGoParaderos} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={hs.sectionMore}>Ver todas ›</Text>
            </TouchableOpacity>
          </View>
          <View style={{ gap: 9 }}>
            {NEXT_DEPARTURES.map((d, i) => (
              <TouchableOpacity key={i} style={[hs.depCard, d.warn && hs.depCardWarn]} activeOpacity={0.85} onPress={onGoParaderos}>
                <View style={[hs.depBadge, { backgroundColor: d.sysColor }]}>
                  <Text style={hs.depBadgeTxt} numberOfLines={1}>{d.system}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={hs.depName} numberOfLines={1}>{d.stop} · <Text style={hs.depFare}>{d.fare}</Text></Text>
                  <Text style={[hs.depSub, d.warn && { color: C.amber, fontWeight: '700' }]} numberOfLines={1}>{d.sub}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[hs.depMin, { color: d.minColor }]}>{d.min}</Text>
                  <Text style={hs.depTime}>{d.time}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </Reveal>

        {/* Recientes */}
        {recents.length > 0 && (
          <Reveal delay={340} style={hs.section}>
            <Text style={hs.sectionTitle}>Recientes</Text>
            <View style={hs.listCard}>
              {recents.slice(0, 2).map((r, i) => (
                <TouchableOpacity key={i} style={[hs.recentRow, i < Math.min(recents.length, 2) - 1 && hs.recentBorder]}
                  onPress={() => onSelectRecent(r)}>
                  <View style={hs.recentIconBox}><Ionicons name="time-outline" size={18} color={ATU_BLUE} /></View>
                  <Text style={hs.recentTxt} numberOfLines={1}>{r.name || 'Destino'}</Text>
                  <Text style={hs.recentArrow}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Reveal>
        )}


        {/* Acceso rápido a Noticias */}
        {noticiasLoaded && (campanas.length > 0 || noticias.length > 0) && (
          <Reveal delay={420}>
            <TouchableOpacity style={hs.noticiasTeaser} activeOpacity={0.88} onPress={onGoNoticias}>
              <View style={hs.noticiasTeaserLeft}>
                <View style={hs.teaserIconBox}>
                  <Ionicons name="newspaper" size={18} color={C.blueBright} />
                </View>
                <View>
                  <Text style={hs.noticiasTeaserTitle}>Campañas y noticias</Text>
                  <Text style={hs.noticiasTeaserSub}>{(campanas.length + noticias.length)} publicaciones · toca para ver</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#C5CDD8" />
            </TouchableOpacity>
          </Reveal>
        )}

        <View style={{ height: 16 }} />
      </ScrollView>

      {/* ── BOTÓN PAGAR QR ── */}
      <TouchableOpacity style={hs.payBar} activeOpacity={0.9} onPress={() => setShowHomeQR(true)}>
        <LinearGradient colors={['#1A7BE0', '#0A4FB8', '#072C6E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={hs.payBarGrad} />
        {/* Círculos decorativos para dar profundidad (recortados por el radio) */}
        <View style={hs.payCircle1} />
        <View style={hs.payCircle2} />
        <Shimmer band={0.5} color="rgba(255,255,255,0.32)" />
        {/* Caja icono QR — late suavemente */}
        <Pulse style={hs.payBarIconBox} min={1} max={1.07} duration={1500}>
          <Ionicons name="qr-code" size={22} color="#fff" />
        </Pulse>
        {/* Texto */}
        <View style={{ flex: 1 }}>
          <Text style={hs.payBarTitle}>Pagar pasaje · QR</Text>
          <View style={hs.payBarSubRow}>
            <Ionicons name="wifi-outline" size={11} color="#9FC1F5" />
            <Text style={hs.payBarSub}>Tarjeta ATU · NFC activo</Text>
          </View>
        </View>
        {/* Saldo */}
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={hs.payBarSaldoLabel}>Saldo</Text>
          <Text style={hs.payBarAmount}>S/ 24.50</Text>
        </View>
      </TouchableOpacity>

      {/* ── MODAL QR (desde inicio) ── */}
      <QRPayModal visible={showHomeQR} onClose={() => setShowHomeQR(false)} secs={homeQrSecs} />

      {/* ── MODAL BUSCAR RUTA (estilo InDrive) ── */}
      <Modal
        visible={searchModalOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => { setSearchModalOpen(false); setModalMode('dest'); setAuxQuery(''); setAuxSugs([]); }}
      >
        <View style={hs.modalBackdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1}
            onPress={() => { setSearchModalOpen(false); setModalMode('dest'); setAuxQuery(''); setAuxSugs([]); }} />
          <View style={hs.searchSheet}>
            <View style={hs.sheetHandle} />

            {modalMode !== 'dest' ? (
              /* ── MODO SECUNDARIO: origen o editar preset ── */
              <>
                <View style={hs.sheetTitleRow}>
                  <TouchableOpacity onPress={() => { setModalMode('dest'); setAuxQuery(''); setAuxSugs([]); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginRight: 10 }}>
                    <Ionicons name="arrow-back" size={22} color="#111" />
                  </TouchableOpacity>
                  <Text style={[hs.sheetTitle, { textAlign: 'left' }]}>
                    {modalMode === 'origin' ? 'Desde dónde sales'
                      : modalMode === 'casa' ? 'Guardar como Casa'
                      : modalMode === 'trabajo' ? 'Guardar como Trabajo'
                      : 'Guardar como Universidad'}
                  </Text>
                </View>
                <View style={hs.sheetSearchRow}>
                  <Ionicons name="search" size={18} color="#555" style={{ marginHorizontal: 12 }} />
                  <TextInput style={hs.sheetSearchInput} autoFocus returnKeyType="search"
                    placeholder={modalMode === 'origin' ? 'Escribe el punto de partida' : 'Busca la dirección'}
                    placeholderTextColor="#aaa"
                    value={auxQuery} onChangeText={setAuxQuery} />
                  {auxLoading
                    ? <ActivityIndicator size="small" color={ATU_BLUE} style={{ marginRight: 12 }} />
                    : auxQuery.length > 0
                      ? <TouchableOpacity onPress={() => { setAuxQuery(''); setAuxSugs([]); }} style={{ marginRight: 12 }}>
                          <Ionicons name="close-circle" size={18} color="#9ca3af" />
                        </TouchableOpacity>
                      : null}
                </View>
                <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                  {modalMode === 'origin' && (
                    <TouchableOpacity style={hs.sheetResultRow}
                      onPress={() => { onSetCustomOrigin(null); setModalMode('dest'); setAuxQuery(''); setAuxSugs([]); }}>
                      <View style={[hs.sheetResultIcon, { backgroundColor: '#EEF3F9' }]}>
                        <Ionicons name="locate" size={18} color={ATU_BLUE} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={hs.sheetResultMain}>Mi ubicación actual (GPS)</Text>
                        <Text style={hs.sheetResultSub}>{gpsReady ? 'Listo' : 'Ubicando...'}</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                  {auxSugs.map((p, i) => (
                    <TouchableOpacity key={i} style={hs.sheetResultRow}
                      onPress={async () => {
                        try {
                          const coords = await getPlaceCoords(p.place_id);
                          const name = p.structured_formatting?.main_text || p.description;
                          if (modalMode === 'origin') {
                            onSetCustomOrigin({ name, ...coords });
                          } else {
                            const updated = { ...savedPlaces, [modalMode]: { name, place_id: p.place_id, ...coords } };
                            setSavedPlaces(updated);
                            AsyncStorage.setItem('ATU_SAVED_PLACES', JSON.stringify(updated)).catch(() => {});
                          }
                        } catch (_) {}
                        setModalMode('dest'); setAuxQuery(''); setAuxSugs([]);
                      }}>
                      <View style={hs.sheetResultIcon}>
                        <Ionicons name="location-outline" size={18} color="#9ca3af" />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={hs.sheetResultMain} numberOfLines={1}>{p.structured_formatting?.main_text || p.description}</Text>
                        <Text style={hs.sheetResultSub} numberOfLines={1}>{p.structured_formatting?.secondary_text || 'Lima, Perú'}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {!auxLoading && auxQuery.length <= 1 && (
                    <View style={{ padding: 32, alignItems: 'center' }}>
                      <Ionicons name="search-outline" size={34} color="#d1d5db" />
                      <Text style={{ color: '#9ca3af', fontSize: 14, fontWeight: '600', marginTop: 10 }}>Escribe para buscar</Text>
                    </View>
                  )}
                  <View style={{ height: 24 }} />
                </ScrollView>
              </>
            ) : (
              /* ── MODO PRINCIPAL: destino ── */
              <>
                <View style={hs.sheetTitleRow}>
                  <Text style={hs.sheetTitle}>Introduce tu ruta</Text>
                  <TouchableOpacity style={hs.sheetCloseBtn}
                    onPress={() => { setSearchModalOpen(false); setAuxQuery(''); setAuxSugs([]); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close" size={18} color="#111" />
                  </TouchableOpacity>
                </View>

                {/* Origen (tappable) */}
                <TouchableOpacity style={hs.sheetOriginRow} activeOpacity={0.8}
                  onPress={() => { setModalMode('origin'); setAuxQuery(customOrigin?.name || ''); }}>
                  <View style={hs.sheetOriginIcon}>
                    <Ionicons name="walk-outline" size={20} color="#555" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={hs.sheetOriginLabel}>De</Text>
                    <Text style={hs.sheetOriginAddr} numberOfLines={1}>
                      {customOrigin ? customOrigin.name : (gpsReady ? 'Mi ubicación actual' : 'Ubicando...')}
                    </Text>
                  </View>
                  <Ionicons name="pencil-outline" size={16} color="#9ca3af" />
                </TouchableOpacity>

                {/* Input destino */}
                <View style={hs.sheetSearchRow}>
                  <Ionicons name="search" size={18} color="#555" style={{ marginHorizontal: 12 }} />
                  <TextInput style={hs.sheetSearchInput} autoFocus returnKeyType="search"
                    placeholder="¿A dónde vas?" placeholderTextColor="#aaa"
                    value={query} onChangeText={onQueryChange}
                    onSubmitEditing={() => {
                      if (suggestions.length > 0) { onSelectSuggestion(suggestions[0]); setSearchModalOpen(false); }
                    }} />
                  {loadingSug
                    ? <ActivityIndicator size="small" color={ATU_BLUE} style={{ marginRight: 12 }} />
                    : query.length > 0
                      ? <TouchableOpacity onPress={onClearQuery} style={{ marginRight: 12 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="close-circle" size={18} color="#9ca3af" />
                        </TouchableOpacity>
                      : <View style={hs.sheetMapPinBtn}><Ionicons name="map-outline" size={20} color={ATU_BLUE} /></View>
                  }
                </View>

                <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">

                  {/* ── 4 chips: Sugeridos | Casa | Trabajo | Universidad
                       Solo visibles cuando NO se está escribiendo ── */}
                  {!query.length && (
                    <View style={hs.filterChipRow}>
                      {[
                        { key: 'sugeridos',   label: 'Sugeridos'   },
                        { key: 'casa',        label: 'Casa'        },
                        { key: 'trabajo',     label: 'Trabajo'     },
                        { key: 'universidad', label: 'Universidad' },
                      ].map(({ key, label }) => (
                        <TouchableOpacity key={key}
                          style={[hs.filterChip, savedFilter === key && hs.filterChipActive]}
                          onPress={() => setSavedFilter(key)} activeOpacity={0.8}>
                          <Text style={[hs.filterChipTxt, savedFilter === key && hs.filterChipTxtActive]}>
                            {label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* ── Contenido según chip activo ── */}
                  {query.length > 0 ? (
                    /* Escribiendo → solo resultados API */
                    suggestions.length > 0 ? suggestions.map((p, i) => (
                      <TouchableOpacity key={i} style={hs.sheetResultRow}
                        onPress={() => { onSelectSuggestion(p); setSearchModalOpen(false); }}>
                        <View style={hs.sheetResultIcon}>
                          <Ionicons name="location-outline" size={18} color="#9ca3af" />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={hs.sheetResultMain} numberOfLines={1}>{p.structured_formatting?.main_text || p.description}</Text>
                          <Text style={hs.sheetResultSub} numberOfLines={1}>{p.structured_formatting?.secondary_text || 'Lima, Perú'}</Text>
                        </View>
                        <Ionicons name="bookmark-outline" size={18} color="#d1d5db" />
                      </TouchableOpacity>
                    )) : loadingSug ? null : (
                      <View style={{ paddingVertical: 28, alignItems: 'center' }}>
                        <Ionicons name="search-outline" size={32} color="#d1d5db" />
                        <Text style={{ color: '#9ca3af', fontSize: 13, fontWeight: '600', marginTop: 10 }}>Sin resultados</Text>
                      </View>
                    )
                  ) : savedFilter === 'sugeridos' ? (
                    /* Sugeridos → recientes */
                    recents.length > 0 ? recents.map((r, i) => (
                      <TouchableOpacity key={i} style={hs.sheetResultRow}
                        onPress={() => { onSelectRecent(r); setSearchModalOpen(false); }}>
                        <View style={hs.sheetResultIcon}>
                          <Ionicons name="time-outline" size={18} color="#9ca3af" />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={hs.sheetResultMain} numberOfLines={1}>{r.name || 'Destino'}</Text>
                          <Text style={hs.sheetResultSub} numberOfLines={1}>Lima, Perú</Text>
                        </View>
                        <Ionicons name="bookmark-outline" size={18} color="#d1d5db" />
                      </TouchableOpacity>
                    )) : (
                      <View style={{ paddingVertical: 28, alignItems: 'center' }}>
                        <Text style={{ color: '#9ca3af', fontSize: 13, fontWeight: '600' }}>Escribe un destino para buscar</Text>
                      </View>
                    )
                  ) : (
                    /* Casa / Trabajo / Universidad → la dirección guardada */
                    (() => {
                      const ICONS = { casa: 'home-outline', trabajo: 'briefcase-outline', universidad: 'school-outline' };
                      const LABELS = { casa: 'Casa', trabajo: 'Trabajo', universidad: 'Universidad' };
                      const place = savedPlaces[savedFilter];
                      return (
                        <View style={{ paddingTop: 6 }}>
                          <TouchableOpacity style={hs.sheetResultRow}
                            onPress={() => {
                              if (place) {
                                onSelectSuggestion({ description: place.name, place_id: place.place_id, structured_formatting: { main_text: place.name } });
                                setSearchModalOpen(false);
                              } else {
                                setModalMode(savedFilter); setAuxQuery('');
                              }
                            }}>
                            <View style={[hs.sheetResultIcon, place && { backgroundColor: '#EEF3F9' }]}>
                              <Ionicons name={ICONS[savedFilter]} size={18} color={place ? ATU_BLUE : '#9ca3af'} />
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={hs.sheetResultMain}>{LABELS[savedFilter]}</Text>
                              <Text style={hs.sheetResultSub} numberOfLines={1}>
                                {place ? place.name : 'No guardado aún'}
                              </Text>
                            </View>
                            <TouchableOpacity
                              onPress={() => { setModalMode(savedFilter); setAuxQuery(place?.name || ''); }}
                              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                              <Ionicons name="pencil-outline" size={18} color={place ? ATU_BLUE : '#bbb'} />
                            </TouchableOpacity>
                          </TouchableOpacity>
                          {!place && (
                            <TouchableOpacity style={[hs.sheetResultRow, { marginTop: 2 }]}
                              onPress={() => { setModalMode(savedFilter); setAuxQuery(''); }}>
                              <View style={[hs.sheetResultIcon, { backgroundColor: '#EEF3F9' }]}>
                                <Ionicons name="add" size={18} color={ATU_BLUE} />
                              </View>
                              <Text style={[hs.sheetResultMain, { color: ATU_BLUE }]}>Agregar dirección</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })()
                  )}
                  <View style={{ height: 24 }} />
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Route Picker ──────────────────────────────────────────────────────────────
function RouteOptionCard({ alt, onSelect, index, peakHours }) {
  const busLegs  = alt.legs.filter(l => l.type === 'bus');
  const walkLegs = alt.legs.filter(l => l.type === 'walk');
  const totalWalkMin = walkLegs.reduce((s, l) => s + (l.minutes || 0), 0);
  const totalStops   = busLegs.reduce((s, l) => s + (l.stops || 0), 0);
  const firstBus  = busLegs[0];
  const nextCatch = firstBus?.catchable?.[0];
  const isFirst   = index === 0;

  const LABEL_COLOR = {
    'Más rápida':          { bg: '#FFF3E0', txt: '#B45309', icon: '⚡' },
    'Sin transbordo':      { bg: '#F0FDF4', txt: '#16A34A', icon: '🚌' },
    'Con Metropolitano':   { bg: '#EFF6FF', txt: '#1D4ED8', icon: '🚇' },
    'Con Línea 1':         { bg: '#EFF6FF', txt: '#1D4ED8', icon: '🚇' },
    'Corredor exclusivo':  { bg: '#F0FDF4', txt: '#16A34A', icon: '🚍' },
    'Alternativa':         { bg: '#F5F3FF', txt: '#7C3AED', icon: '🔀' },
  };
  const lc      = LABEL_COLOR[alt.routeLabel] || { bg: '#F5F3FF', txt: '#7C3AED', icon: '🔀' };
  const peakLvl = getPeakLevel(peakHours);

  return (
    <TouchableOpacity style={[pick.card, isFirst && pick.cardFirst]} onPress={onSelect} activeOpacity={0.88}>
      {/* Top: label + time */}
      <View style={pick.cardTop}>
        <View style={[pick.labelBadge, { backgroundColor: lc.bg }]}>
          <Text style={[pick.labelTxt, { color: lc.txt }]}>{lc.icon} {alt.routeLabel}</Text>
        </View>
        <Text style={[pick.cardTime, isFirst && pick.cardTimeFirst]}>{alt.totalMinutes} <Text style={pick.cardTimeUnit}>min</Text></Text>
      </View>

      {/* Route pills */}
      <View style={pick.routeRow}>
        {busLegs.map((leg, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Ionicons name="swap-horizontal-outline" size={13} color="#9CA3AF" />}
            <View style={[pick.routePill, { backgroundColor: leg.routeColor || ATU_BLUE }]}>
              <Text style={pick.routePillTxt} numberOfLines={1}>
                {leg.routeName?.split(' ').slice(0, 2).join(' ') || leg.routeId}
              </Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* Journey breakdown: walk · bus · transfer · walk */}
      <View style={pick.breakdown}>
        {alt.legs.map((leg, i) => {
          if (leg.type === 'walk')     return <Text key={i} style={pick.bdWalk}>🚶 {leg.minutes || 1} min</Text>;
          if (leg.type === 'transfer') return <Text key={i} style={pick.bdTransfer}>🔄</Text>;
          if (leg.type === 'bus')      return (
            <Text key={i} style={[pick.bdBus, { color: leg.routeColor || ATU_BLUE }]}>
              🚌 {leg.rideMinutes} min
            </Text>
          );
          return null;
        })}
        {totalStops > 0 && <Text style={pick.bdSep}>· {totalStops} paradas</Text>}
      </View>

      {/* Next bus info */}
      {nextCatch ? (
        <Text style={pick.nextBus}>🟢 Próximo bus en {Math.round(nextCatch.seconds / 60)} min</Text>
      ) : firstBus?.arrivals?.[0] ? (
        <Text style={pick.nextBusWait}>⏳ Próximo bus en {Math.round(firstBus.arrivals[0].seconds / 60)} min</Text>
      ) : null}

      {/* Traffic chip */}
      {peakLvl && (
        <View style={[pick.trafficChip, { backgroundColor: peakLvl.bg }]}>
          <Text style={[pick.trafficChipTxt, { color: peakLvl.color }]}>
            {peakLvl.icon} {peakLvl.label} · tiempo puede variar
          </Text>
        </View>
      )}

      {/* CTA */}
      <View style={[pick.selectBtn, isFirst && pick.selectBtnFirst]}>
        <Text style={[pick.selectBtnTxt, isFirst && pick.selectBtnTxtFirst]}>Ver esta ruta →</Text>
      </View>
    </TouchableOpacity>
  );
}

function RoutePickerScreen({ alternatives, destination, planning, onBack, onSelect, peakHours, isBack }) {
  const destName = destination?.name?.split(',')[0] || 'Destino';
  return (
    <View style={pick.root}>
      <StatusBar style="light" />
      <View style={pick.header}>
        <LinearGradient colors={HEADER_GRAD} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <TouchableOpacity onPress={onBack} style={pick.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={pick.headerDest} numberOfLines={1}>📍 {destName}</Text>
          <Text style={pick.headerSub}>
            {planning ? 'Preparando ruta...' : `${alternatives.length} rutas encontradas`}
          </Text>
        </View>
      </View>

      {planning ? (
        <View style={pick.loadingBox}>
          <ActivityIndicator color={ATU_BLUE} size="large" />
          <Text style={pick.loadingTxt}>Calculando la mejor ruta...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={pick.list} showsVerticalScrollIndicator={false}>
          <TrafficBanner peakHours={peakHours} style={{ marginBottom: 4 }} />
          <Text style={pick.sectionTitle}>Elige cómo llegar</Text>
          {alternatives.map((alt, i) => (
            isBack
              ? <RouteOptionCard key={i} alt={alt} index={i} onSelect={() => onSelect(alt)} peakHours={peakHours} />
              : <Reveal key={i} delay={i * 100} distance={22}>
                  <RouteOptionCard alt={alt} index={i} onSelect={() => onSelect(alt)} peakHours={peakHours} />
                </Reveal>
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </View>
  );
}

const pick = StyleSheet.create({
  root:            { flex: 1, backgroundColor: '#F2F4F8' },
  header:          { backgroundColor: '#0C1E40', paddingTop: 54, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:         { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)' },
  headerDest:      { color: '#fff', fontSize: 15, fontWeight: '800' },
  headerSub:       { color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 2 },
  sectionTitle:    { fontSize: 13, fontWeight: '700', color: '#6B7280', marginBottom: 6, marginTop: 4, letterSpacing: 0.3 },
  list:            { padding: 16, gap: 14 },
  card:            { backgroundColor: '#fff', borderRadius: 18, padding: 16, shadowColor: '#000', shadowOffset: { width:0, height:2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3, borderWidth: 1.5, borderColor: 'transparent' },
  cardFirst:       { borderColor: '#1668AD' },
  cardTop:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  labelBadge:      { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, maxWidth: '60%' },
  labelTxt:        { fontSize: 12, fontWeight: '700' },
  cardTime:        { fontSize: 28, fontWeight: '900', color: '#1C2B4A' },
  cardTimeFirst:   { color: '#1668AD' },
  cardTimeUnit:    { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  routeRow:        { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  routePill:       { borderRadius: 7, paddingHorizontal: 10, paddingVertical: 5, maxWidth: 160 },
  routePillTxt:    { color: '#fff', fontSize: 11, fontWeight: '800' },
  breakdown:       { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  bdWalk:          { fontSize: 12, color: '#6B7280' },
  bdBus:           { fontSize: 12, fontWeight: '700' },
  bdTransfer:      { fontSize: 12 },
  bdSep:           { fontSize: 11, color: '#9CA3AF' },
  nextBus:         { fontSize: 12, fontWeight: '600', color: '#16A34A', marginBottom: 12 },
  nextBusWait:     { fontSize: 12, fontWeight: '600', color: '#D97706', marginBottom: 12 },
  selectBtn:        { backgroundColor: '#E8F0FE', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  selectBtnFirst:   { backgroundColor: '#1668AD' },
  selectBtnTxt:     { fontSize: 13, fontWeight: '800', color: '#1668AD' },
  selectBtnTxtFirst:{ color: '#fff' },
  trafficChip:      { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 10, alignSelf: 'flex-start' },
  trafficChipTxt:   { fontSize: 11, fontWeight: '700' },
  loadingBox:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingTxt:       { fontSize: 14, fontWeight: '600', color: '#8895AE' },
});

// ── Noticias Screen ───────────────────────────────────────────────────────────
function NoticiasCard({ n }) {
  const fadeAnim    = React.useRef(new Animated.Value(0)).current;
  const shimmerAnim = React.useRef(new Animated.Value(0.5)).current;
  const [imgReady, setImgReady] = React.useState(!n.img);

  React.useEffect(() => {
    if (imgReady) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 1,   duration: 750, useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0.5, duration: 750, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [imgReady]);

  function onImgDone() {
    setImgReady(true);
    Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }

  return (
    <TouchableOpacity style={ns.card} activeOpacity={0.9}
      onPress={() => n.url && Linking.openURL(n.url).catch(() => {})}>
      {n.img ? (
        <View style={ns.cardImg}>
          {/* Skeleton pulsante debajo */}
          <Animated.View style={[StyleSheet.absoluteFill, ns.skeleton, { opacity: shimmerAnim }]} />
          {/* Imagen hace fade-in cuando carga */}
          <Animated.Image
            source={{ uri: n.img }}
            style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]}
            resizeMode="cover"
            onLoad={onImgDone}
            onError={onImgDone}
          />
        </View>
      ) : (
        <View style={[ns.cardImg, { backgroundColor: n.bg || '#001a52', justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ fontSize: 52 }}>{n.emoji || '🚌'}</Text>
        </View>
      )}
      <View style={[ns.cardTag, { backgroundColor: n.color || ATU_BLUE }]}>
        <Text style={ns.cardTagTxt}>{n.tag || 'ATU'}</Text>
      </View>
      <View style={ns.cardBody}>
        <Text style={ns.cardTitle} numberOfLines={2}>{n.title}</Text>
        {n.body ? <Text style={ns.cardBodyTxt} numberOfLines={2}>{n.body}</Text> : null}
        {n.url ? <Text style={ns.cardLink}>Leer más →</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

function NoticiasScreen({ campanas, noticias, noticiasLoaded }) {
  const [tab, setTab] = React.useState('campanas');
  const items = tab === 'campanas' ? (campanas || []) : (noticias || []);

  return (
    <View style={ns.root}>
      <StatusBar style="light" />
      {/* Header */}
      <View style={ns.header}>
        <LinearGradient colors={HEADER_GRAD} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <Text style={ns.headerTitle}>Noticias</Text>
        <Text style={ns.headerSub}>Campañas y actualizaciones ATU</Text>
        {/* Tabs */}
        <View style={ns.tabRow}>
          {[{ key: 'campanas', label: 'Campañas y eventos' }, { key: 'noticias', label: 'Noticias ATU' }].map(t => (
            <TouchableOpacity key={t.key} style={[ns.tabBtn, tab === t.key && ns.tabBtnActive]} onPress={() => setTab(t.key)} activeOpacity={0.8}>
              <Text style={[ns.tabTxt, tab === t.key && ns.tabTxtActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {!noticiasLoaded ? (
        <View style={ns.loadingBox}>
          <ActivityIndicator color={ATU_BLUE} size="large" />
          <Text style={ns.loadingTxt}>Cargando...</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={ns.emptyBox}>
          <Text style={{ fontSize: 48 }}>📰</Text>
          <Text style={ns.emptyTxt}>No hay publicaciones aún</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={ns.list}>
          {items.map((n, i) => (
            <Reveal key={n.id ?? i} delay={i * 90} distance={20}>
              <NoticiasCard n={n} />
            </Reveal>
          ))}
          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </View>
  );
}

const ns = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#F4F6FA' },
  header:        { backgroundColor: '#0C1E40', paddingTop: 54, paddingHorizontal: 18, paddingBottom: 0 },
  headerTitle:   { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  headerSub:     { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.5)', marginTop: 3, marginBottom: 14 },
  tabRow:        { flexDirection: 'row', gap: 6 },
  tabBtn:        { paddingHorizontal: 14, paddingVertical: 10, borderTopLeftRadius: 10, borderTopRightRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)' },
  tabBtnActive:  { backgroundColor: '#F4F6FA' },
  tabTxt:        { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },
  tabTxtActive:  { color: ATU_BLUE },
  list:          { padding: 16, gap: 16, paddingBottom: 120 },
  card:          { backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.09, shadowRadius: 8, elevation: 3 },
  cardImg:       { width: '100%', height: 180, overflow: 'hidden' },
  skeleton:      { backgroundColor: '#D8DFE9' },
  cardTag:       { position: 'absolute', top: 14, left: 14, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5 },
  cardTagTxt:    { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  cardBody:      { padding: 15 },
  cardTitle:     { fontSize: 16, fontWeight: '800', color: '#0E2147', lineHeight: 22 },
  cardBodyTxt:   { fontSize: 13, fontWeight: '500', color: '#6b7280', lineHeight: 18, marginTop: 5 },
  cardLink:      { fontSize: 12.5, fontWeight: '800', color: ATU_BLUE, marginTop: 10 },
  loadingBox:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingTxt:    { fontSize: 14, fontWeight: '600', color: '#8895AE' },
  emptyBox:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyTxt:      { fontSize: 15, fontWeight: '700', color: '#8895AE' },
});

// ── Bottom Nav ────────────────────────────────────────────────────────────────
const NAV_TABS = [
  { key: 'home',      iconOn: 'home',          iconOff: 'home-outline',          label: 'Inicio'    },
  { key: 'paraderos', iconOn: 'bus',           iconOff: 'bus-outline',           label: 'Paraderos' },
  { key: 'alertas',   iconOn: 'notifications', iconOff: 'notifications-outline', label: 'Alertas'   },
  { key: 'billetera', iconOn: 'wallet',        iconOff: 'wallet-outline',        label: 'Billetera' },
];
function NavItem({ t, active, onPress }) {
  const a     = useRef(new Animated.Value(active ? 1 : 0)).current; // estado activo
  const press = useRef(new Animated.Value(1)).current;             // feedback de toque
  useEffect(() => {
    Animated.spring(a, { toValue: active ? 1 : 0, friction: 7, tension: 160, useNativeDriver: true }).start();
  }, [active]);
  const pillScale = a.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const iconLift  = a.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });
  return (
    <TouchableOpacity
      style={hs.navItem} activeOpacity={1} onPress={onPress}
      onPressIn={()  => Animated.spring(press, { toValue: 0.82, friction: 7, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(press, { toValue: 1, friction: 4, tension: 150, useNativeDriver: true }).start()}
    >
      <Animated.View style={[hs.navPillWrap, { transform: [{ scale: press }] }]}>
        <Animated.View style={[hs.navPillBg, { opacity: a, transform: [{ scale: pillScale }] }]}>
          <LinearGradient colors={GRAD.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={hs.navPillFill} />
        </Animated.View>
        <Animated.View style={{ transform: [{ translateY: iconLift }] }}>
          <Ionicons name={active ? t.iconOn : t.iconOff} size={21} color={active ? '#fff' : '#6A7894'} />
        </Animated.View>
      </Animated.View>
      <Text style={[hs.navLabel, active && hs.navLabelActive]}>{t.label}</Text>
    </TouchableOpacity>
  );
}

function BottomNav({ tab, setTab }) {
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, friction: 8, tension: 55, useNativeDriver: true }).start();
  }, []);
  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [120, 0] });
  return (
    <Animated.View style={[hs.navWrap, { opacity: enter, transform: [{ translateY }] }]} pointerEvents="box-none">
      <View style={hs.navShadow}>
        <BlurView intensity={38} tint="light" style={hs.navBlur}>
          <View style={hs.navInner}>
            {NAV_TABS.map(t => (
              <NavItem key={t.key} t={t} active={tab === t.key} onPress={() => setTab(t.key)} />
            ))}
          </View>
        </BlurView>
      </View>
    </Animated.View>
  );
}

// FAB Yatu animado — aparece con pop, rebota al pulsar
function YatuFab({ onPress }) {
  const enter = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={[fabSt.fab, { opacity: enter, transform: [{ scale: Animated.multiply(enter, press) }] }]}>
      <TouchableOpacity
        activeOpacity={0.9} onPress={onPress} style={fabSt.fabInner}
        onPressIn={()  => Animated.spring(press, { toValue: 0.9, friction: 7, useNativeDriver: true }).start()}
        onPressOut={() => Animated.spring(press, { toValue: 1, friction: 4, useNativeDriver: true }).start()}
      >
        <LinearGradient colors={GRAD.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={fabSt.fabGrad} />
        <Ionicons name="sparkles" size={17} color="#fff" />
        <Text style={fabSt.fabTxt}>Yatu</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Ver Todas Modal ────────────────────────────────────────────────────────────
function VerTodasModal({ visible, tipo, items, onClose }) {
  const title = tipo === 'campanas' ? 'Campañas y eventos' : 'Noticias ATU';
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={vt.root}>
        <View style={vt.header}>
          <TouchableOpacity onPress={onClose} style={vt.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={vt.closeTxt}>✕</Text>
          </TouchableOpacity>
          <Text style={vt.headerTitle}>{title}</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={vt.list}>
          {(items || []).map((n, i) => (
            <TouchableOpacity key={n.id ?? i} style={vt.card} activeOpacity={0.9}
              onPress={() => n.url && Linking.openURL(n.url).catch(() => {})}>
              {n.img
                ? <Image source={{ uri: n.img }} style={vt.cardImg} resizeMode="cover" />
                : <View style={[vt.cardImg, { backgroundColor: n.bg || '#001a52', justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ fontSize: 48 }}>{n.emoji || '🚌'}</Text>
                  </View>
              }
              <View style={vt.cardBody}>
                <View style={[vt.tag, { backgroundColor: n.color || ATU_BLUE }]}>
                  <Text style={vt.tagTxt}>{n.tag || 'ATU'}</Text>
                </View>
                <Text style={vt.cardTitle} numberOfLines={3}>{n.title}</Text>
                {n.body ? <Text style={vt.cardDate}>{n.body}</Text> : null}
                <Text style={vt.cardLink}>Ver en gob.pe →</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Mapa Screen ───────────────────────────────────────────────────────────────
const LIMA_CENTER = { lat: -12.0464, lng: -77.0428 };
function MapaScreen({ buses, connected, userLat, userLng, incidents, routesGeo, stations }) {
  const webRef = useRef(null);
  const centerLat = userLat ?? LIMA_CENTER.lat;
  const centerLng = userLng ?? LIMA_CENTER.lng;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <View style={mp.header}>
        <View>
          <Text style={mp.headerTitle}>Mapa en vivo</Text>
          <Text style={[mp.headerSub, { color: connected ? '#22c55e' : '#9ca3af' }]}>
            {connected ? `${buses.length} buses activos` : 'Sin conexión'}
          </Text>
        </View>
        <View style={[mp.badge, { backgroundColor: connected ? '#dcfce7' : '#f3f4f6', borderColor: connected ? '#bbf7d0' : '#e5e7eb' }]}>
          <View style={[mp.dot, { backgroundColor: connected ? '#22c55e' : '#d1d5db' }]} />
          <Text style={[mp.badgeTxt, { color: connected ? '#15803d' : '#9ca3af' }]}>EN VIVO</Text>
        </View>
      </View>
      <RouteMapView
        ref={webRef}
        segments={[]}
        fromLat={centerLat} fromLng={centerLng}
        toLat={centerLat}   toLng={centerLng}
        liveBuses={buses}
        incidents={incidents}
        routesGeo={routesGeo}
        stations={stations}
      />
    </View>
  );
}

// ── Alertas Screen ─────────────────────────────────────────────────────────────
const SEVERITY_CFG = {
  high:   { color: '#DC2626', rail: '#EF4444', tint: '#FEF2F2', label: 'GRAVE',    icon: 'alert-circle',     level: 3, meter: 'Congestión pesada'   },
  medium: { color: '#D97706', rail: '#F59E0B', tint: '#FFF7ED', label: 'MODERADO', icon: 'warning',          level: 2, meter: 'Tránsito moderado'   },
  low:    { color: '#15803D', rail: '#22C55E', tint: '#ECFDF5', label: 'FLUIDO',   icon: 'checkmark-circle', level: 1, meter: 'Tránsito fluido'     },
};

function AlertasScreen({ incidents, connected, userLat, userLng }) {
  const [confirmed, setConfirmed] = React.useState({});
  const source = (incidents || []).length > 0 ? incidents : FALLBACK_INCIDENTS;
  const active = source.filter(i => i.active !== false);
  const hasLocation = !!(userLat && userLng);

  return (
    <View style={al.root}>
      <StatusBar style="light" />
      {/* Header — solo fila del título (igual que home) */}
      <View style={al.header}>
        <LinearGradient colors={HEADER_GRAD} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={al.headerTitleRow}>
          <Text style={al.headerTitle}>Alertas en vivo</Text>
          <View style={al.enRutaBadge}>
            <View style={{ width: 9, height: 9, alignItems: 'center', justifyContent: 'center' }}>
              <PulseRing size={9} color={C.cyan} />
              <View style={al.enRutaDot} />
            </View>
            <Text style={al.enRutaTxt}>En tu ruta</Text>
          </View>
        </View>
      </View>

      {/* Mapa — fuera del header, igual que en Inicio */}
      <View style={al.mapOuter}>
        {hasLocation ? (
          <RouteMapView
            segments={[]}
            fromLat={userLat} fromLng={userLng}
            toLat={userLat}   toLng={userLng}
            liveBuses={[]}
            incidents={active}
          />
        ) : (
          <View style={al.mapPlaceholder}>
            <ActivityIndicator color={ATU_CYAN} />
            <Text style={al.mapPlaceholderTxt}>Obteniendo ubicación...</Text>
          </View>
        )}
        {/* Badge de incidencias activas flotando sobre el mapa */}
        {active.length > 0 && (
          <View style={al.mapIncidentBadge}>
            <Ionicons name="warning" size={13} color="#A9690A" />
            <Text style={al.mapIncidentBadgeTxt}>{active.length} incidencia{active.length > 1 ? 's' : ''} activa{active.length > 1 ? 's' : ''}</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={al.list}>
        {active.length === 0 ? (
          <View style={al.emptyBox}>
            <Ionicons name="checkmark-circle" size={56} color="#1E9E6A" />
            <Text style={al.emptyTitle}>Todo en orden</Text>
            <Text style={al.emptySub}>No hay incidencias activas</Text>
          </View>
        ) : active.map((inc, i) => {
          const cfg = SEVERITY_CFG[inc.severity] || SEVERITY_CFG.low;
          const nearbyKm = (hasLocation && inc.lat && inc.lng)
            ? haversineKm(userLat, userLng, inc.lat, inc.lng)
            : null;
          const isNearby = nearbyKm !== null && nearbyKm < 2.0;
          const distLabel = nearbyKm === null ? null
            : nearbyKm < 1 ? `${Math.round(nearbyKm * 1000)} m` : `${nearbyKm.toFixed(1)} km`;
          return (
            <Reveal key={inc.id ?? i} delay={Math.min(i, 6) * 80} distance={18} style={al.card}>
              {/* Riel de color según severidad */}
              <View style={[al.rail, { backgroundColor: cfg.rail }]} />
              <View style={al.cardInner}>
                {/* Fila superior: icono · severidad · distancia · retraso */}
                <View style={al.cardTop}>
                  <View style={[al.iconBox, { backgroundColor: cfg.tint }]}>
                    <Ionicons name={cfg.icon} size={21} color={cfg.rail} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={al.topMeta}>
                      <View style={[al.sevChip, { backgroundColor: cfg.tint }]}>
                        <Text style={[al.sevChipTxt, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                      {isNearby && (
                        <View style={al.nearChip}>
                          <Ionicons name="navigate" size={9} color={C.blueBright} />
                          <Text style={al.nearChipTxt}>En tu zona</Text>
                        </View>
                      )}
                    </View>
                    <Text style={al.cardTitle} numberOfLines={2}>{inc.type || 'Incidencia de tránsito'}</Text>
                  </View>
                  {!!inc.delay && (
                    <View style={[al.delayPill, { backgroundColor: cfg.tint }]}>
                      <Ionicons name="time" size={11} color={cfg.color} />
                      <Text style={[al.delayTxt, { color: cfg.color }]}>+{inc.delay}'</Text>
                    </View>
                  )}
                </View>

                {/* Medidor de congestión vehicular */}
                <View style={al.meterRow}>
                  <View style={al.meterBars}>
                    {[1, 2, 3].map(n => (
                      <View key={n} style={[al.meterSeg, { backgroundColor: n <= cfg.level ? cfg.rail : C.hair }]} />
                    ))}
                  </View>
                  <Text style={[al.meterTxt, { color: cfg.color }]}>{cfg.meter}</Text>
                  {distLabel && <Text style={al.meterDist}>· a {distLabel}</Text>}
                </View>

                {/* Descripción */}
                {!!inc.description && (
                  <Text style={al.cardDesc} numberOfLines={3}>{inc.description}</Text>
                )}

                {/* Rutas afectadas */}
                {inc.affectedRoutes?.length > 0 && (
                  <View style={al.routesWrap}>
                    <Text style={al.routesLabel}>Afecta a</Text>
                    {inc.affectedRoutes.map((r, ri) => (
                      <View key={ri} style={al.routeChip}><Text style={al.routeChipTxt}>{r}</Text></View>
                    ))}
                  </View>
                )}

                {/* Confirmar (solo si está cerca) */}
                {isNearby && (
                  <TouchableOpacity
                    style={al.confirmBtn}
                    activeOpacity={0.85}
                    onPress={() => setConfirmed(prev => ({ ...prev, [inc.id ?? i]: (prev[inc.id ?? i] || 23) + 1 }))}>
                    <Ionicons name="hand-left-outline" size={15} color={C.blueBright} />
                    <Text style={al.confirmBtnTxt}>Confirmar que sigue aquí</Text>
                  </TouchableOpacity>
                )}

                {/* Pie: confirmaciones */}
                <View style={al.footRow}>
                  <Ionicons name="people" size={12} color={C.textFaint} />
                  <Text style={al.confirmCount}>
                    {(confirmed[inc.id ?? i] || 23)} personas confirmaron · hace 4 min
                  </Text>
                </View>
              </View>
            </Reveal>
          );
        })}
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

// ── Paraderos cercanos (live arrivals board) ───────────────────────────────────
const SYSTEM_CFG = {
  'METROPOLITANO':  { grad: ['#1E5BAE', '#0E2147'], tint: '#EAF1FB', color: '#1668AD' },
  'CORREDOR ROJO':  { grad: ['#E0556B', '#A50E26'], tint: '#FDECEF', color: '#C8102E' },
  'CORREDOR AZUL':  { grad: ['#22BEF5', '#0A66D2'], tint: '#E7F3FC', color: '#0A66D2' },
  'LÍNEA 1 · TREN': { grad: ['#27B57E', '#15795A'], tint: '#E8F8F0', color: '#15795A' },
};
const sysCfg = name => SYSTEM_CFG[name] || SYSTEM_CFG['METROPOLITANO'];

const NEARBY_STOPS = [
  { name: 'Est. Ricardo Palma', system: 'METROPOLITANO', dist: '180 m', walk: '3 min', accessible: true,
    services: [
      { code: 'C', desc: 'Expreso → Sur · Angamos', time: 'Llegando', soon: true },
      { code: 'B', desc: 'Regular → Sur',            time: '7 min' },
      { code: 'A', desc: 'Regular → Norte',          time: '12 min' },
    ] },
  { name: 'Paradero Av. Pardo', system: 'CORREDOR ROJO', dist: '240 m', walk: '4 min', accessible: true,
    services: [
      { code: '301', desc: '→ Centro de Lima',        time: '6 min' },
      { code: '305', desc: '→ San Isidro · retraso',  time: '+15 min', delay: true },
    ] },
  { name: 'Est. Gamarra', system: 'LÍNEA 1 · TREN', dist: '650 m', walk: '9 min', accessible: true,
    services: [
      { code: 'L1', desc: '→ Villa El Salvador', time: '6 min' },
    ] },
  { name: 'Est. Benavides', system: 'METROPOLITANO', dist: '720 m', walk: '10 min', accessible: false,
    services: [
      { code: 'C',  desc: 'Expreso → Sur',           time: '9 min' },
      { code: 'IM', desc: 'Interruta → Matellini',   time: '14 min' },
    ] },
];

function ParaderosScreen({ userLat, userLng, onGoYatu }) {
  return (
    <View style={ps.root}>
      <StatusBar style="light" />
      {/* Header */}
      <View style={ps.header}>
        <LinearGradient colors={HEADER_GRAD} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={ps.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={ps.headerTitle}>Paraderos cercanos</Text>
            <Text style={ps.headerSub}>{userLat ? 'Miraflores, Lima' : 'Ubicando...'} · llegadas en vivo</Text>
          </View>
          <View style={ps.liveBadge}>
            <View style={{ width: 7, height: 7, alignItems: 'center', justifyContent: 'center' }}>
              <PulseRing size={7} color="#34D399" />
              <View style={ps.liveDot} />
            </View>
            <Text style={ps.liveTxt}>En vivo</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={ps.list} showsVerticalScrollIndicator={false}>
        {NEARBY_STOPS.map((st, i) => {
          const cfg = sysCfg(st.system);
          return (
            <Reveal key={i} delay={i * 90} distance={20} style={ps.card}>
              {/* Encabezado del paradero */}
              <View style={ps.stopTop}>
                <View style={[ps.sysIcon, { backgroundColor: cfg.color }]}>
                  <Ionicons name={st.system.startsWith('LÍNEA') ? 'train' : 'bus'} size={17} color="#fff" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={ps.stopName} numberOfLines={1}>{st.name}</Text>
                  <View style={ps.stopMeta}>
                    <View style={[ps.sysChip, { backgroundColor: cfg.tint }]}>
                      <Text style={[ps.sysChipTxt, { color: cfg.color }]}>{st.system}</Text>
                    </View>
                    <Text style={ps.stopDist} numberOfLines={1}>· {st.dist} · {st.walk} a pie</Text>
                  </View>
                </View>
                {st.accessible && (
                  <View style={ps.accBox}><Ionicons name="accessibility" size={15} color={C.green} /></View>
                )}
              </View>

              {/* Servicios que pasan por el paradero */}
              <View style={ps.svcWrap}>
                {st.services.map((sv, si) => (
                  <View key={si} style={[ps.svcRow, si < st.services.length - 1 && ps.svcBorder]}>
                    <LinearGradient colors={cfg.grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={ps.codeBadge}>
                      <Text style={ps.codeTxt}>{sv.code}</Text>
                    </LinearGradient>
                    <Text style={ps.svcDesc} numberOfLines={1}>{sv.desc}</Text>
                    <View style={ps.svcTimeWrap}>
                      {sv.soon && (
                        <View style={{ width: 7, height: 7, marginRight: 5, alignItems: 'center', justifyContent: 'center' }}>
                          <PulseRing size={7} color={C.green} />
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.green }} />
                        </View>
                      )}
                      <Text style={[ps.svcTime, sv.soon && { color: '#1A8F62' }, sv.delay && { color: C.amber }]}>{sv.time}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <TouchableOpacity style={[ps.detailBtn, { backgroundColor: cfg.tint }]} activeOpacity={0.85}>
                <Text style={[ps.detailTxt, { color: cfg.color }]}>Ver paradero</Text>
                <Ionicons name="chevron-forward" size={14} color={cfg.color} />
              </TouchableOpacity>
            </Reveal>
          );
        })}
        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

// ── Cuenta Screen ─────────────────────────────────────────────────────────────
function CuentaScreen({ user, onSignOut }) {
  const [subScreen, setSubScreen] = useState(null);
  if (subScreen === 'tarjeta') return <TarjetaScreen onBack={() => setSubScreen(null)} />;

  const displayName = user?.displayName || 'Usuario ATU';
  const email       = user?.email || '';
  const photoURL    = user?.photoURL || null;
  const initials    = displayName.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

  const QUICK = [
    { icon: '💳', label: 'Tarjeta ATU',  bg: '#eff6ff', border: '#bfdbfe', onPress: () => setSubScreen('tarjeta') },
    { icon: '🕐', label: 'Historial',    bg: '#f0fdf4', border: '#bbf7d0', onPress: null },
    { icon: '❓', label: 'Ayuda',        bg: '#fffbeb', border: '#fde68a', onPress: null },
    { icon: '⚙️', label: 'Config.',      bg: '#f9fafb', border: '#e5e7eb', onPress: null },
  ];
  const MENU = [
    { icon: '🚌', label: 'Mis viajes',            sub: 'Historial completo de tus viajes',    onPress: null },
    { icon: '🔔', label: 'Notificaciones',         sub: 'Alertas de servicio y campañas',      onPress: null },
    { icon: '🛡️', label: 'Seguridad',              sub: 'Contraseña y acceso a la cuenta',     onPress: null },
    { icon: '📄', label: 'Términos y condiciones', sub: '',                                    onPress: null },
    { icon: '🚪', label: 'Cerrar sesión',          sub: '',                                    onPress: onSignOut },
  ];

  return (
    <View style={cu.root}>
      <StatusBar style="dark" />
      <View style={cu.header}>
        {/* Avatar: foto real de Google o iniciales */}
        {photoURL ? (
          <Image source={{ uri: photoURL }} style={cu.avatarImg} />
        ) : (
          <View style={cu.avatar}><Text style={cu.avatarTxt}>{initials}</Text></View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={cu.name} numberOfLines={1}>{displayName}</Text>
          <Text style={cu.email} numberOfLines={1}>{email}</Text>
          <View style={cu.starsRow}>
            {[1,2,3,4,5].map(s => <Text key={s} style={[cu.star, s <= 4 && { color: '#f59e0b' }]}>★</Text>)}
            <Text style={cu.rating}> 4.8 · Pasajero ATU</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={cu.content}>
        {/* Quick grid */}
        <View style={cu.quickGrid}>
          {QUICK.map((q, i) => (
            <TouchableOpacity key={i} style={[cu.quickBtn, { backgroundColor: q.bg, borderColor: q.border }]}
              activeOpacity={0.8} onPress={q.onPress || undefined}>
              <Text style={cu.quickIcon}>{q.icon}</Text>
              <Text style={cu.quickLabel}>{q.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Saldo tarjeta */}
        <TouchableOpacity style={cu.saldoCard} activeOpacity={0.88} onPress={() => setSubScreen('tarjeta')}>
          <View style={{ flex: 1 }}>
            <Text style={cu.saldoLabel}>Saldo Lima Pass</Text>
            <Text style={cu.saldoAmt}>PEN 12.50</Text>
            <Text style={cu.saldoSub}>Válido hasta dic 2026</Text>
          </View>
          <View style={cu.recargaBtn}>
            <Text style={cu.recargaBtnTxt}>+ Recargar</Text>
          </View>
        </TouchableOpacity>

        {/* Menu */}
        <View style={cu.menuCard}>
          {MENU.map((m, i) => (
            <TouchableOpacity key={i}
              style={[cu.menuRow, i < MENU.length - 1 && cu.menuBorder]}
              activeOpacity={0.75}
              onPress={m.onPress || undefined}>
              <View style={cu.menuIconBox}><Text style={{ fontSize: 18 }}>{m.icon}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={[cu.menuLabel, m.label === 'Cerrar sesión' && { color: '#ef4444' }]}>{m.label}</Text>
                {m.sub ? <Text style={cu.menuSub}>{m.sub}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

// ── Billetera Screen ──────────────────────────────────────────────────────────
const QR_HTML = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;display:flex;align-items:center;justify-content:center;background:transparent;}canvas{border-radius:8px;}</style><script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script></head><body><div id="qr"></div><script>new QRCode(document.getElementById("qr"),{text:"ATU-PAY:5021-4821:S/2.50:"+Date.now(),width:200,height:200,colorDark:"#0C1E40",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.M});<\/script></body></html>`;

// ── QR Pay Modal ─ efectos de escáner ─────────────────────────────────────────
function QRPayModal({ visible, onClose, secs }) {
  const cardScale   = useRef(new Animated.Value(0.82)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const beam        = useRef(new Animated.Value(0)).current;
  const ring1Scale  = useRef(new Animated.Value(1)).current;
  const ring1Op     = useRef(new Animated.Value(0)).current;
  const ring2Scale  = useRef(new Animated.Value(1)).current;
  const ring2Op     = useRef(new Animated.Value(0)).current;

  useLayoutEffect(() => {
    if (!visible) { cardScale.setValue(0.82); cardOpacity.setValue(0); return; }

    // Entrada del card
    Animated.parallel([
      Animated.spring(cardScale,   { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    // Beam scanner
    const beamLoop = Animated.loop(Animated.sequence([
      Animated.timing(beam, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(beam, { toValue: 0, duration: 0, useNativeDriver: true }),
      Animated.delay(350),
    ]));
    beamLoop.start();

    // Glow rings con offset de fase
    const makeRing = (scale, op, delay) => Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(scale, { toValue: 1.18, duration: 1100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(op,    { toValue: 0.55, duration: 300,  useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(scale, { toValue: 1.38, duration: 1100, easing: Easing.in(Easing.ease),  useNativeDriver: true }),
        Animated.timing(op,    { toValue: 0,    duration: 900,  useNativeDriver: true }),
      ]),
      Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
    ]));
    const r1 = makeRing(ring1Scale, ring1Op, 0);
    const r2 = makeRing(ring2Scale, ring2Op, 700);
    r1.start(); r2.start();

    return () => { beamLoop.stop(); r1.stop(); r2.stop(); };
  }, [visible]);

  const beamY  = beam.interpolate({ inputRange: [0, 1], outputRange: [0, 218] });
  const mins   = String(Math.floor(secs / 60)).padStart(2, '0');
  const rest   = String(secs % 60).padStart(2, '0');
  const urgent = secs <= 20;

  const Corner = ({ style }) => (
    <View style={[{ position: 'absolute', width: 22, height: 22 }, style]} />
  );

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={wl.qrRoot}>
        <StatusBar style="light" />
        <LinearGradient colors={['#0A1A38', '#071128']} style={StyleSheet.absoluteFill} />

        {/* Header */}
        <View style={wl.qrHeader}>
          <TouchableOpacity style={wl.qrBack} onPress={onClose} activeOpacity={0.8}>
            <Ionicons name="chevron-down" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={wl.qrTitle}>Pagar pasaje</Text>
          <View style={{ width: 38 }} />
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>

          {/* Glow rings detrás del card */}
          <Animated.View style={{ position: 'absolute', width: 274, height: 274, borderRadius: 40,
            backgroundColor: '#1A6FD4', opacity: ring1Op, transform: [{ scale: ring1Scale }] }} />
          <Animated.View style={{ position: 'absolute', width: 274, height: 274, borderRadius: 40,
            backgroundColor: '#0EA5E9', opacity: ring2Op, transform: [{ scale: ring2Scale }] }} />

          {/* Card con entrada animada */}
          <Animated.View style={[wl.qrCard, { opacity: cardOpacity, transform: [{ scale: cardScale }] }]}>

            {/* QR */}
            <WebView source={{ html: QR_HTML }} style={wl.qrWebView} scrollEnabled={false} originWhitelist={['*']} />

            {/* Beam scanner */}
            <View style={{ position: 'absolute', top: 26, left: 26, right: 26, bottom: 26, overflow: 'hidden', borderRadius: 6 }} pointerEvents="none">
              <Animated.View style={{ position: 'absolute', left: -4, right: -4, height: 3,
                backgroundColor: C.cyan, borderRadius: 2,
                shadowColor: C.cyan, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 1, shadowRadius: 8,
                transform: [{ translateY: beamY }] }} />
            </View>

            {/* Brackets en esquinas */}
            <View style={{ position: 'absolute', top: 14, left: 14, width: 22, height: 22,
              borderTopWidth: 3, borderLeftWidth: 3, borderColor: C.cyan, borderTopLeftRadius: 5 }} pointerEvents="none" />
            <View style={{ position: 'absolute', top: 14, right: 14, width: 22, height: 22,
              borderTopWidth: 3, borderRightWidth: 3, borderColor: C.cyan, borderTopRightRadius: 5 }} pointerEvents="none" />
            <View style={{ position: 'absolute', bottom: 14, left: 14, width: 22, height: 22,
              borderBottomWidth: 3, borderLeftWidth: 3, borderColor: C.cyan, borderBottomLeftRadius: 5 }} pointerEvents="none" />
            <View style={{ position: 'absolute', bottom: 14, right: 14, width: 22, height: 22,
              borderBottomWidth: 3, borderRightWidth: 3, borderColor: C.cyan, borderBottomRightRadius: 5 }} pointerEvents="none" />
          </Animated.View>

          {/* "Escaneando…" */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 22 }}>
            <Breathe min={1} max={1.22} duration={900}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.cyan }} />
            </Breathe>
            <Text style={{ color: '#A2B4D2', fontSize: 13, fontWeight: '700' }}>Escaneando…</Text>
          </View>

          {/* NFC */}
          <View style={[wl.nfcRow, { marginTop: 10 }]}>
            <Breathe min={1} max={1.18} duration={1300}>
              <Ionicons name="wifi-outline" size={20} color="#5BBDF5" />
            </Breathe>
            <Text style={wl.nfcTxt}>NFC activado · acerca tu teléfono</Text>
          </View>

          {/* Info: saldo + timer */}
          <View style={wl.qrInfoRow}>
            <View style={{ alignItems: 'center' }}>
              <Text style={wl.qrInfoLabel}>Saldo</Text>
              <Text style={wl.qrInfoVal}>S/ 24.50</Text>
            </View>
            <View style={wl.qrDivider} />
            <View style={{ alignItems: 'center' }}>
              <Text style={wl.qrInfoLabel}>Código válido</Text>
              <Breathe min={1} max={urgent ? 1.12 : 1} duration={500}>
                <Text style={[wl.qrInfoVal, { color: urgent ? '#f87171' : '#5BBDF5' }]}>{mins}:{rest}</Text>
              </Breathe>
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 24, paddingBottom: 36 }}>
          <TouchableOpacity style={wl.qrDoneBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={wl.qrDoneTxt}>Listo</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function BilleteraScreen({ user, onSignOut }) {
  const [showQR, setShowQR] = React.useState(false);
  const [qrSecs, setQrSecs] = React.useState(120);
  const nombre = user?.displayName?.split(' ')[0]?.toUpperCase() || 'USUARIO';

  React.useEffect(() => {
    if (!showQR) { setQrSecs(120); return; }
    const t = setInterval(() => setQrSecs(s => s > 0 ? s - 1 : 0), 1000);
    return () => clearInterval(t);
  }, [showQR]);

  const movimientos = [
    { tipo: 'METROP.', bg: '#13315E', desc: 'Pasaje · Troncal Norte', cuando: 'Hoy · 08:14',  monto: '−S/ 2.50',  montoColor: '#0E2147' },
    { tipo: 'RECARGA', bg: '#1A8F62', desc: 'Recarga · Yape',         cuando: 'Ayer · 19:02', monto: '+S/ 20.00', montoColor: '#1E9E6A' },
    { tipo: 'LÍNEA 1', bg: '#13315E', desc: 'Pasaje · Tren',          cuando: 'Ayer · 08:31', monto: '−S/ 1.50',  montoColor: '#0E2147' },
  ];

  const qrMins = String(Math.floor(qrSecs / 60)).padStart(2, '0');
  const qrRest = String(qrSecs % 60).padStart(2, '0');

  return (
    <View style={wl.root}>
      <StatusBar style="light" />
      <View style={wl.header}>
        <LinearGradient colors={HEADER_GRAD} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={wl.headerRow}>
          <Text style={wl.headerTitle}>Billetera</Text>
          <TouchableOpacity
            style={wl.signOutBtn}
            onPress={() => Alert.alert('Cerrar sesión', '¿Seguro que quieres salir?', [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Salir', style: 'destructive', onPress: onSignOut },
            ])}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="log-out-outline" size={20} color="rgba(255,255,255,0.7)" />
            <Text style={wl.signOutTxt}>Salir</Text>
          </TouchableOpacity>
        </View>

        {/* ── Tarjeta ATU ── */}
        <Reveal delay={140} distance={24}>
        <View style={wl.card}>
          {/* Círculos decorativos */}
          <View style={wl.cardCircle1} />
          <View style={wl.cardCircle2} />
          {/* Brillo premium recorriendo la tarjeta */}
          <Shine band={0.45} color="rgba(255,255,255,0.18)" delay={1400} />
          {/* Contenido */}
          <View style={wl.cardRow}>
            <Text style={wl.cardLabel}>Tarjeta ATU · Interoperable</Text>
            <Breathe min={1} max={1.14} duration={1600}>
              <Ionicons name="wifi" size={22} color="#5BBDF5" />
            </Breathe>
          </View>
          <View style={wl.chip} />
          <Text style={wl.cardNumber}>5021 •••• •••• 4821</Text>
          <View style={wl.cardBottom}>
            <View>
              <Text style={wl.saldoLabel}>Saldo disponible</Text>
              <Text style={wl.saldoAmount}>S/ 24<Text style={wl.saldoCents}>.50</Text></Text>
            </View>
            <Text style={wl.cardName}>{nombre}</Text>
          </View>
        </View>
        </Reveal>

        {/* Botones */}
        <Reveal delay={260} style={wl.btnRow}>
          <TouchableOpacity style={wl.btnPrimary} onPress={() => setShowQR(true)} activeOpacity={0.88}>
            <Ionicons name="qr-code" size={17} color="#fff" />
            <Text style={wl.btnPrimaryTxt}>Pagar · QR</Text>
          </TouchableOpacity>
          <TouchableOpacity style={wl.btnSecondary} activeOpacity={0.88}>
            <Ionicons name="add-circle-outline" size={17} color="#fff" />
            <Text style={wl.btnSecondaryTxt}>Recargar</Text>
          </TouchableOpacity>
        </Reveal>
      </View>

      <ScrollView contentContainerStyle={wl.body}>
        <Text style={wl.movTitle}>Movimientos</Text>
        {movimientos.map((m, i) => (
          <Reveal key={i} delay={360 + i * 90} from="right" distance={20}
            style={[wl.movRow, i < movimientos.length - 1 && wl.movBorder]}>
            <View style={[wl.movBadge, { backgroundColor: m.bg }]}>
              <Text style={wl.movBadgeTxt} numberOfLines={1}>{m.tipo}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={wl.movDesc}>{m.desc}</Text>
              <Text style={wl.movCuando}>{m.cuando}</Text>
            </View>
            <Text style={[wl.movMonto, { color: m.montoColor }]}>{m.monto}</Text>
          </Reveal>
        ))}
      </ScrollView>

      <QRPayModal visible={showQR} onClose={() => setShowQR(false)} secs={qrSecs} />
    </View>
  );
}

// ── Tarjeta Screen ─────────────────────────────────────────────────────────────
function TarjetaScreen({ onBack }) {
  const [selectedAmount, setSelectedAmount] = useState(null);
  const AMOUNTS = [5, 10, 20, 50];
  const METHODS = [
    { key: 'yape',     label: 'Yape',     color: '#6d28d9', icon: '💜' },
    { key: 'plin',     label: 'Plin',     color: '#059669', icon: '💚' },
    { key: 'banco',    label: 'Banco',    color: '#0284c7', icon: '🏦' },
    { key: 'efectivo', label: 'Efectivo', color: '#d97706', icon: '💵' },
  ];
  const TRANSACTIONS = [
    { id: 't1', type: 'viaje',   label: 'Viaje — Metropolitano',       date: 'Hoy, 8:32 am',       amount: -2.80 },
    { id: 't2', type: 'recarga', label: 'Recarga vía Yape',            date: 'Hoy, 7:55 am',       amount: +10.00 },
    { id: 't3', type: 'viaje',   label: 'Viaje — Corredor Azul',       date: 'Ayer, 6:14 pm',      amount: -2.80 },
    { id: 't4', type: 'viaje',   label: 'Viaje — Corredor Rojo',       date: 'Ayer, 12:40 pm',     amount: -2.80 },
    { id: 't5', type: 'viaje',   label: 'Viaje — Alimentadores Norte', date: 'Lun 9 jun, 8:01 am', amount: -2.80 },
    { id: 't6', type: 'recarga', label: 'Recarga vía Banco BCP',       date: 'Lun 9 jun, 7:50 am', amount: +20.00 },
    { id: 't7', type: 'viaje',   label: 'Viaje — Metropolitano',       date: 'Dom 8 jun, 5:20 pm', amount: -2.80 },
  ];

  return (
    <View style={ta.root}>
      <StatusBar style="light" />
      <View style={ta.header}>
        <LinearGradient colors={HEADER_GRAD} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <TouchableOpacity onPress={onBack} style={ta.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={ta.headerTitle}>Tarjeta ATU</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={ta.content} showsVerticalScrollIndicator={false}>
        {/* Card visual */}
        <Reveal delay={120} distance={24}>
        <View style={ta.card}>
          {/* Background decorations */}
          <View style={ta.cardCircle1} />
          <View style={ta.cardCircle2} />
          <View style={ta.cardStripe} />
          <Shine band={0.45} color="rgba(0,174,239,0.14)" delay={1400} />

          {/* Header */}
          <View style={ta.cardTop}>
            <View>
              <Text style={ta.cardChipLabel}>LIMA PASS</Text>
              <Text style={ta.cardChip}>◈  chip integrado</Text>
            </View>
            <View style={ta.cardLogoBlock}>
              <Text style={ta.cardLogoA}>ATU</Text>
              <View style={ta.cardLogoCyanBar} />
            </View>
          </View>

          {/* Balance */}
          <Text style={ta.cardBalance}>S/ 12.50</Text>
          <Text style={ta.cardBalanceLbl}>Saldo disponible</Text>

          {/* Route line: Metropolitano Norte–Sur */}
          <View style={ta.routeLineRow}>
            <View style={[ta.routeStop, { backgroundColor: ATU_CYAN, width: 12, height: 12, borderRadius: 6 }]} />
            <View style={ta.routeSegment} />
            <View style={ta.routeStop} />
            <View style={ta.routeSegment} />
            <View style={ta.routeStop} />
            <View style={ta.routeSegment} />
            <View style={[ta.routeStop, { backgroundColor: '#ffd700', width: 12, height: 12, borderRadius: 6 }]} />
          </View>
          <View style={ta.routeLabels}>
            <Text style={ta.routeLabel}>Naranjal</Text>
            <Text style={ta.routeLabel}>Independencia</Text>
            <Text style={ta.routeLabel}>Central</Text>
            <Text style={ta.routeLabel}>Matellini</Text>
          </View>

          {/* Card number */}
          <View style={ta.cardBottom}>
            <Text style={ta.cardNumber}>•••• •••• •••• 7842</Text>
            <Text style={ta.cardExpiry}>12/27</Text>
          </View>
        </View>
        </Reveal>

        {/* Quick stats */}
        <Reveal delay={240} style={ta.statsRow}>
          <View style={ta.statBox}>
            <Text style={ta.statVal}>47</Text>
            <Text style={ta.statLbl}>Viajes este mes</Text>
          </View>
          <View style={ta.statDiv} />
          <View style={ta.statBox}>
            <Text style={ta.statVal}>S/ 131.60</Text>
            <Text style={ta.statLbl}>Gastado (jun)</Text>
          </View>
          <View style={ta.statDiv} />
          <View style={ta.statBox}>
            <Text style={ta.statVal}>dic 2026</Text>
            <Text style={ta.statLbl}>Válida hasta</Text>
          </View>
        </Reveal>

        {/* Recargar */}
        <View style={ta.section}>
          <Text style={ta.sectionTitle}>Recargar tarjeta</Text>
          <View style={ta.amountsRow}>
            {AMOUNTS.map(a => (
              <TouchableOpacity key={a}
                style={[ta.amountBtn, selectedAmount === a && ta.amountBtnSel]}
                onPress={() => setSelectedAmount(a)} activeOpacity={0.8}>
                <Text style={[ta.amountTxt, selectedAmount === a && ta.amountTxtSel]}>S/{a}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {selectedAmount && (
            <Text style={ta.selectedHint}>Monto: S/{selectedAmount} — elige cómo pagar</Text>
          )}
          <View style={ta.methodsGrid}>
            {METHODS.map(m => (
              <TouchableOpacity key={m.key}
                style={[ta.methodBtn, { borderColor: m.color + '55' }]}
                activeOpacity={0.8}
                onPress={() => {
                  if (!selectedAmount) { Alert.alert('Selecciona un monto primero'); return; }
                  Alert.alert('Confirmar recarga', `Recargar S/${selectedAmount} con ${m.label}`, [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Confirmar', onPress: () => Alert.alert('¡Éxito!', `Se recargaron S/${selectedAmount} a tu tarjeta Lima Pass.`) },
                  ]);
                }}>
                <Text style={ta.methodIcon}>{m.icon}</Text>
                <Text style={[ta.methodLbl, { color: m.color }]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Transactions */}
        <View style={ta.section}>
          <Text style={ta.sectionTitle}>Últimos movimientos</Text>
          <View style={ta.txCard}>
            {TRANSACTIONS.map((tx, i) => (
              <View key={tx.id} style={[ta.txRow, i < TRANSACTIONS.length - 1 && ta.txBorder]}>
                <View style={[ta.txIconBox, { backgroundColor: tx.type === 'recarga' ? '#dcfce7' : '#eff6ff' }]}>
                  <Text style={{ fontSize: 16 }}>{tx.type === 'recarga' ? '⬆️' : '🚌'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ta.txLabel}>{tx.label}</Text>
                  <Text style={ta.txDate}>{tx.date}</Text>
                </View>
                <Text style={[ta.txAmount, { color: tx.amount > 0 ? '#22c55e' : '#374151' }]}>
                  {tx.amount > 0 ? '+' : ''}S/{Math.abs(tx.amount).toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Result Screen ─────────────────────────────────────────────────────────────
const ROUTE_NAMES = {
  METRO: 'Metropolitano', AZUL: 'Corredor Azul',
  ROJO: 'Corredor Rojo',  MORADO: 'Corredor Morado',
  'ALIM-N': 'Alimentadores Norte', 'ALIM-S': 'Alimentadores Sur',
};
const VEHICLE_KMH = 20, VEHICLE_WAIT = 3, WALK_THRESH = 9;
function calcEta(distKm) {
  const walkMin    = Math.max(1, Math.round((distKm / 4.8) * 60));
  const vehicleMin = distKm < 0.15 ? 1 : Math.max(3, Math.round((distKm / VEHICLE_KMH) * 60) + VEHICLE_WAIT);
  return { walkMin, vehicleMin, useVehicle: walkMin > WALK_THRESH, distKm };
}

function ResultScreen({ journey, taxi, transit, buses, connected, userLat, userLng,
                        destination, onBack, resultTab, setResultTab, error, busTypes, peakHours }) {
  // Fix initial map position so the WebView doesn't rebuild on every GPS tick
  const initPos = React.useRef({ lat: userLat, lng: userLng });

  const firstBus = journey?.legs?.find(l => l.type === 'bus');

  const eta = useMemo(() => {
    if (!firstBus || userLat == null) {
      const f = firstBus?.walkMinToBoard || 5;
      return { walkMin: f, vehicleMin: f, useVehicle: false, distKm: 0 };
    }
    return calcEta(haversineKm(userLat, userLng, firstBus.fromStation.lat, firstBus.fromStation.lng));
  }, [userLat, userLng, firstBus]);

  const effectiveEta = eta.useVehicle ? eta.vehicleMin : eta.walkMin;

  const liveLegs = useMemo(() => {
    if (!journey) return [];
    const result = []; let cumEta = effectiveEta;
    for (const leg of journey.legs) {
      if (leg.type === 'bus') {
        const live = getBusArrivals(buses, leg.routeId, leg.fromStation.id, leg.toStation.id, cumEta);
        const catchable = live.filter(a => a.catchable);
        result.push({ ...leg, arrivals: live, catchable, etaMin: cumEta });
        const boardAt = catchable.length > 0 ? catchable[0].minutesAway : cumEta;
        cumEta = boardAt + leg.rideMinutes;
      } else if (leg.type === 'transfer') {
        cumEta += leg.minutes; result.push(leg);
      } else { result.push(leg); }
    }
    return result;
  }, [journey?.legs, buses, effectiveEta]);

  const liveBusesForMap = useMemo(() => {
    // Parada activa = la cuya parada de abordaje esté más cerca del usuario ahora
    const busLegs = liveLegs.filter(l => l.type === 'bus');
    if (!busLegs.length) return [];
    let activeLeg = busLegs[0];
    if (userLat && userLng) {
      let minDist = Infinity;
      for (const leg of busLegs) {
        const d = haversineKm(userLat, userLng, leg.fromStation.lat, leg.fromStation.lng);
        if (d < minDist) { minDist = d; activeLeg = leg; }
      }
    }

    const am = new Map();
    (activeLeg.arrivals || []).forEach(a => {
      am.set(a.busId, { catchable: a.catchable, boardLat: activeLeg.fromStation.lat });
    });

    const PASS = 0.00018;
    return buses.filter(b => {
      const info = am.get(b.id); if (!info) return false;
      if (info.catchable) return true;
      if (b.direction === 'N' && b.lat < info.boardLat - PASS) return false;
      if (b.direction === 'S' && b.lat > info.boardLat + PASS) return false;
      return true;
    }).map(b => ({ ...b, catchable: am.get(b.id).catchable }));
  }, [buses, liveLegs, userLat, userLng]);

  const activeSegments = journey?.mapSegments || [];

  const destName = destination?.name?.split(',')[0] || 'Destino';

  return (
    <View style={rs.root}>
      <StatusBar style="light" />

      {/* ── Mapa — solo ocupa el espacio sobre el sheet ── */}
      <View style={rs.mapWrap}>
        <RouteMapView
          segments={activeSegments}
          fromLat={initPos.current.lat} fromLng={initPos.current.lng}
          toLat={destination?.lat} toLng={destination?.lng}
          liveBuses={liveBusesForMap}
          liveUserLat={userLat} liveUserLng={userLng}
          trafficCode={getPeakLevel(peakHours)?.code}
        />
        {/* Overlay encima del mapa: botón atrás + badge destino */}
        <View style={rs.mapOverlay} pointerEvents="box-none">
          <TouchableOpacity style={rs.backBtn} onPress={onBack} activeOpacity={0.85} pointerEvents="auto">
            <Text style={rs.backBtnTxt}>←</Text>
          </TouchableOpacity>
          <View style={rs.destBadge}>
            <Text style={rs.destBadgeTxt} numberOfLines={1}>{destName}</Text>
            <Text style={rs.destBadgeArrow}>›</Text>
          </View>
        </View>
      </View>

      {/* ── Sheet debajo del mapa (flujo normal, no absolute) ── */}
      <View style={rs.sheet}>
        <View style={rs.sheetHandle} />

        {!!error && <View style={rs.errorBanner}><Text style={rs.errorTxt}>⚠️ {error}</Text></View>}

        <ScrollView contentContainerStyle={rs.sheetContent} showsVerticalScrollIndicator={false}>
          <ATUContent liveLegs={liveLegs} eta={eta} journey={journey} connected={connected} busTypes={busTypes} peakHours={peakHours} />
        </ScrollView>
      </View>
    </View>
  );
}

// ── ATU Content ───────────────────────────────────────────────────────────────
function ATUContent({ liveLegs, eta, journey, connected, busTypes, peakHours }) {
  if (!journey) return (
    <View style={s.emptyState}>
      <Text style={s.emptyIcon}>🚌</Text>
      <Text style={s.emptyTitle}>Sin ruta ATU disponible</Text>
      <Text style={s.emptyBody}>No hay estaciones ATU cerca de tu origen o destino en esta zona.</Text>
    </View>
  );

  const advice = getPeakAdvice(peakHours, journey.totalMinutes);

  return (
    <View>
      {/* Chip de tráfico — encima del resumen, toca para detalle completo */}
      {advice && <TrafficCard advice={advice} />}

      {/* ── Fila centrada: tiempo + tipo de ruta ── */}
      <View style={s.summaryRow}>
        <Text style={s.summaryTime}>
          {journey.totalMinutes}<Text style={s.summaryTimeUnit}> min</Text>
        </Text>
        <View style={s.summaryDot} />
        <Text style={s.summaryMeta}>
          {journey.transfers === 0 ? 'Directo' : `${journey.transfers} transbordo${journey.transfers > 1 ? 's' : ''}`}
        </Text>
        <View style={s.summaryDot} />
        <View style={[s.liveDot, { backgroundColor: connected ? '#3fb950' : '#30363d' }]} />
      </View>

      {!connected && (
        <View style={s.fbWarning}>
          <Text style={s.fbWarningTxt}>⚡ Activa el simulador para ver llegadas en tiempo real</Text>
        </View>
      )}

      {liveLegs.map((leg, i) => {
        const isLast = i === liveLegs.length - 1;
        if (leg.type === 'walk' && i === 0) {
          const isClose = !eta.useVehicle;
          return (
            <LegRow key={i} isLast={isLast} icon={isClose ? '🚶' : '🚕'} iconBg={isClose ? '#1a2035' : '#1a1400'} iconBorder={isClose ? undefined : '#f0a500'} lineColor={isClose ? '#30363d' : '#f0a500'}>
              <Text style={[s.legMode, { color: isClose ? '#8b949e' : '#f0a500' }]}>{isClose ? 'CAMINATA' : 'BUS / TAXI DE CALLE'}</Text>
              <Text style={s.legMain}>Llegar a {leg.to}</Text>
              <View style={s.etaOptionsRow}>
                <View style={[s.etaOption, !isClose && s.etaOptionSel]}>
                  <Text style={s.etaOptionIcon}>🚕</Text>
                  <Text style={[s.etaOptionTime, !isClose && { color: '#f0a500' }]}>~{eta.vehicleMin} min</Text>
                  <Text style={s.etaOptionLabel}>bus / taxi</Text>
                </View>
                <View style={[s.etaOption, isClose && s.etaOptionSel]}>
                  <Text style={s.etaOptionIcon}>🚶</Text>
                  <Text style={[s.etaOptionTime, isClose && { color: ATU_CYAN }]}>{eta.walkMin} min</Text>
                  <Text style={s.etaOptionLabel}>a pie</Text>
                </View>
              </View>
              <Text style={s.legSub}>{eta.distKm > 0 ? `${(eta.distKm * 1000).toFixed(0)} m` : ''}{!isClose ? ' · toma cualquier bus/taxi en la avenida más cercana' : ''}</Text>
            </LegRow>
          );
        }
        if (leg.type === 'walk') return (
          <LegRow key={i} isLast={isLast} icon="🚶" iconBg="#1a2035" lineColor="#30363d">
            <Text style={s.legMode}>CAMINATA AL DESTINO</Text>
            <Text style={s.legSub}>{leg.googleMin != null ? leg.googleMin : leg.minutes} min{leg.distKm ? ` · ${(leg.distKm * 1000).toFixed(0)} m` : ''}</Text>
          </LegRow>
        );
        if (leg.type === 'transfer') return (
          <LegRow key={i} isLast={isLast} icon="🔄" iconBg="#1a2035" lineColor="#58a6ff">
            <Text style={[s.legMode, { color: '#58a6ff' }]}>TRANSBORDO</Text>
            <Text style={s.legMain}>{leg.from} → {leg.to}</Text>
            <Text style={s.legSub}>{leg.minutes} min caminando</Text>
          </LegRow>
        );
        const color = leg.routeColor || ATU_CYAN;
        const bt = busTypes?.[leg.busTypeId];
        const operadorShort = leg.operador
          ? leg.operador.replace(/^EMPRESA DE TRANSPORTES\s*/i,'').replace(/^EMP[.\s]*/i,'').replace(/\s+S\.?A\.?C?\.?$/i,'').trim().slice(0,35)
          : null;
        return (
          <LegRow key={i} isLast={isLast} icon="🚌" iconBg={color + '22'} iconBorder={color} lineColor={color}>
            <Text style={[s.legMode, { color }]}>{ROUTE_NAMES[leg.routeId] || leg.routeName}</Text>
            {/* Foto + info del bus */}
            {bt?.photoUrl ? (
              <View style={s.busCard}>
                <Image source={{ uri: bt.photoUrl }} style={s.busPhoto} resizeMode="cover" />
                <View style={s.busCardInfo}>
                  <View style={[s.busTypeBadge, { backgroundColor: color + '33', borderColor: color }]}>
                    <Text style={[s.busTypeTxt, { color }]}>{bt.label || leg.carroceria}</Text>
                  </View>
                  {operadorShort ? (
                    <Text style={s.busOperador} numberOfLines={2}>{operadorShort}</Text>
                  ) : null}
                </View>
              </View>
            ) : operadorShort ? (
              <Text style={s.busOperador}>{operadorShort}</Text>
            ) : null}
            <View style={s.stationRow}><View style={[s.stationDot, { backgroundColor: color }]} /><Text style={s.stationName}>{leg.fromStation.name}</Text></View>
            <ArrivalBoard arrivals={leg.arrivals || []} walkMin={leg.etaMin} connected={connected} />
            <View style={s.stationRow}><View style={[s.stationDot, { backgroundColor: color, borderRadius: 3 }]} /><Text style={s.stationName}>{leg.toStation.name}</Text></View>
            <Text style={s.legSub}>{leg.stops} paradas · ~{leg.rideMinutes} min en bus</Text>
          </LegRow>
        );
      })}
    </View>
  );
}

// ── Transit Content ───────────────────────────────────────────────────────────
function TransitContent({ transit }) {
  if (!transit) return (
    <View style={s.emptyState}>
      <Text style={s.emptyIcon}>🚌</Text>
      <Text style={s.emptyTitle}>Sin datos de buses públicos</Text>
      <Text style={s.emptyBody}>
        Google no tiene rutas de buses para esta zona.{'\n\n'}
        Las combis y micros de Lima no están mapeadas digitalmente — eso es precisamente el problema que el sistema ATU busca resolver.
      </Text>
    </View>
  );

  const busLegs = transit.steps.filter(s => s.mode === 'TRANSIT');
  return (
    <View>
      <View style={s.summaryBar}>
        <View style={s.summaryItem}>
          <Text style={[s.summaryVal, { color: '#22c55e' }]}>{transit.totalDurationText}</Text>
          <Text style={s.summaryLbl}>duración</Text>
        </View>
        <View style={s.summaryDiv} />
        <View style={s.summaryItem}>
          <Text style={[s.summaryVal, { color: '#22c55e' }]}>{transit.totalDistanceText}</Text>
          <Text style={s.summaryLbl}>distancia</Text>
        </View>
        <View style={s.summaryDiv} />
        <View style={s.summaryItem}>
          <Text style={[s.summaryVal, { color: '#22c55e' }]}>{busLegs.length <= 1 ? 'Directo' : `${busLegs.length - 1} transb.`}</Text>
          <Text style={s.summaryLbl}>ruta</Text>
        </View>
      </View>
      {!!transit.arrivalTime && <Text style={[s.taxiNote, { color: '#22c55e' }]}>🕐 Llegada estimada: {transit.arrivalTime}</Text>}
      {transit.steps.map((step, i) => {
        const isLast = i === transit.steps.length - 1;
        if (step.mode === 'WALKING') return (
          <LegRow key={i} isLast={isLast} icon="🚶" iconBg="#1a2035" lineColor="#30363d">
            <Text style={s.legMode}>CAMINATA</Text>
            <Text style={s.legMain} numberOfLines={2}>{step.instruction}</Text>
            <Text style={s.legSub}>{step.durationText} · {step.distanceText}</Text>
          </LegRow>
        );
        if (step.mode === 'TRANSIT') {
          const col = step.color, vIcon = step.vehicleType === 'SUBWAY' ? '🚇' : '🚌';
          return (
            <LegRow key={i} isLast={isLast} icon={vIcon} iconBg={col + '22'} iconBorder={col} lineColor={col}>
              <Text style={[s.legMode, { color: col }]}>{step.lineName}</Text>
              <View style={s.stationRow}>
                <View style={[s.stationDot, { backgroundColor: col }]} />
                <Text style={s.stationName}>{step.departureStop}</Text>
                {!!step.departureTime && <Text style={[s.legSub, { marginLeft: 6 }]}>{step.departureTime}</Text>}
              </View>
              <View style={{ paddingLeft: 18, paddingVertical: 4 }}>
                <Text style={[s.legSub, { color: col }]}>{step.numStops} {step.numStops === 1 ? 'parada' : 'paradas'} · {step.durationText}</Text>
              </View>
              <View style={s.stationRow}>
                <View style={[s.stationDot, { backgroundColor: col, borderRadius: 3 }]} />
                <Text style={s.stationName}>{step.arrivalStop}</Text>
              </View>
            </LegRow>
          );
        }
        return null;
      })}
    </View>
  );
}

// ── Taxi Content ──────────────────────────────────────────────────────────────
function TaxiContent({ taxi }) {
  if (!taxi) return (
    <View style={s.emptyState}>
      <Text style={s.emptyIcon}>🚕</Text>
      <Text style={s.emptyTitle}>Sin estimado de taxi</Text>
      <Text style={s.emptyBody}>No se pudo obtener el tiempo estimado en auto.</Text>
    </View>
  );
  return (
    <View>
      <View style={s.summaryBar}>
        <View style={s.summaryItem}>
          <Text style={[s.summaryVal, { color: '#f0a500' }]}>{taxi.durationText}</Text>
          <Text style={s.summaryLbl}>en auto</Text>
        </View>
        <View style={s.summaryDiv} />
        <View style={s.summaryItem}>
          <Text style={[s.summaryVal, { color: '#f0a500' }]}>{taxi.distanceText}</Text>
          <Text style={s.summaryLbl}>distancia</Text>
        </View>
        <View style={s.summaryDiv} />
        <View style={s.summaryItem}>
          <Text style={[s.summaryVal, { color: '#f0a500' }]}>{taxi.costText}</Text>
          <Text style={s.summaryLbl}>estimado</Text>
        </View>
      </View>
      <Text style={s.taxiNote}>Precio estimado Lima. Varía según tráfico.</Text>
      <View style={s.taxiApps}>
        <TouchableOpacity style={[s.taxiBtn, { borderColor: '#f0a500' }]}
          onPress={() => Linking.openURL('https://indriver.com').catch(() => {})}>
          <Text style={s.taxiBtnTxt}>InDriver</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.taxiBtn, { borderColor: '#333' }]}
          onPress={() => Linking.openURL('uber://').catch(() => Linking.openURL('https://m.uber.com'))}>
          <Text style={s.taxiBtnTxt}>Uber</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Arrival Board ─────────────────────────────────────────────────────────────
function ArrivalBoard({ arrivals, walkMin, connected }) {
  const [expanded, setExpanded] = React.useState(false);
  if (!connected) return (
    <View style={s.arrivalsBox}><Text style={s.noArrivals}>⚡ Activa el simulador para ver llegadas en tiempo real</Text></View>
  );
  if (!arrivals || arrivals.length === 0) return (
    <View style={s.arrivalsBox}><Text style={s.noArrivals}>Sin buses en servicio ahora</Text></View>
  );
  const catchable = arrivals.filter(b => b.catchable);
  const passing   = arrivals.filter(b => !b.catchable);
  const best      = catchable[0] || passing[0];
  const extra     = catchable.slice(1);          // los otros que puedes tomar
  const totalExtra = extra.length + passing.length;

  return (
    <View style={s.arrivalsBox}>
      <Text style={s.arrivalsTitle}>{`Llegas en ${walkMin} min`}</Text>

      {catchable.length === 0 && (
        <View style={s.missWarning}>
          <Text style={s.missWarningTxt}>⚠️ No llegas a tiempo.{'\n'}Sal más pronto o considera un taxi.</Text>
        </View>
      )}

      {/* Un solo bus destacado */}
      {best && <BusRow b={best} />}

      {/* Botón expandir */}
      {!expanded && totalExtra > 0 && (
        <TouchableOpacity onPress={() => setExpanded(true)} style={s.verMasBtn}>
          <Text style={s.verMasTxt}>Ver {totalExtra} bus{totalExtra > 1 ? 'es' : ''} más ›</Text>
        </TouchableOpacity>
      )}

      {/* Expandido: todos los demás */}
      {expanded && (
        <>
          {extra.map((b, i) => <BusRow key={`e-${b.busId}-${i}`} b={b} />)}
          {passing.length > 0 && (
            <>
              <Text style={[s.arrivalGroupLabelGreen, { color: '#555', marginTop: 6 }]}>
                Ya pasan ({passing.length})
              </Text>
              {passing.map((b, i) => <BusRow key={`p-${b.busId}-${i}`} b={b} />)}
            </>
          )}
          <TouchableOpacity onPress={() => setExpanded(false)} style={s.verMasBtn}>
            <Text style={s.verMasTxt}>▲ Ver menos</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

function BusRow({ b }) {
  const isGreen = b.catchable;
  return (
    <View style={s.arrivalRow}>
      <View style={[s.catchBadge, { backgroundColor: isGreen ? '#0d3320' : '#1a1a1a', borderColor: isGreen ? '#3fb950' : '#3a3a3a' }]}>
        <Text style={s.catchIcon}>{isGreen ? '✅' : '❌'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.arrivalCode, { color: isGreen ? '#3fb950' : '#555' }]}>{b.serviceCode || 'Bus'}{b.serviceLabel && b.serviceLabel !== b.serviceCode ? ` — ${b.serviceLabel}` : ''}</Text>
        <Text style={s.arrivalDir} numberOfLines={1}>→ {b.direction}</Text>
      </View>
      <Text style={[s.arrivalTime, { color: isGreen ? '#3fb950' : '#555' }]}>{b.minutesAway === 0 ? 'ahora' : `${b.minutesAway} min`}</Text>
    </View>
  );
}

function LegRow({ icon, iconBg, iconBorder, lineColor, isLast, children }) {
  return (
    <View style={s.legRow}>
      <View style={s.legIconCol}>
        <View style={[s.legIcon, { backgroundColor: iconBg, borderColor: iconBorder || 'transparent', borderWidth: iconBorder ? 2 : 0 }]}>
          <Text style={s.legIconTxt}>{icon}</Text>
        </View>
        {!isLast && <View style={[s.legLine, { backgroundColor: lineColor || '#30363d' }]} />}
      </View>
      <View style={s.legBody}>{children}</View>
    </View>
  );
}

// ── Mapa styles ───────────────────────────────────────────────────────────────
const mp = StyleSheet.create({
  header:    { backgroundColor: '#fff', paddingTop: 54, paddingBottom: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  headerTitle:{ fontSize: 20, fontWeight: '900', color: '#111' },
  headerSub: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  badge:     { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  dot:       { width: 7, height: 7, borderRadius: 4 },
  badgeTxt:  { fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
});

// ── Alertas styles ────────────────────────────────────────────────────────────
const al = StyleSheet.create({
  root:               { flex: 1, backgroundColor: '#f9fafb' },
  header:             { backgroundColor: '#13315E', paddingTop: 54, paddingBottom: 14, paddingHorizontal: 20 },
  headerTitle:        { fontSize: 20, fontWeight: '900', color: '#fff' },
  headerSub:          { fontSize: 12, color: '#6b7280', fontWeight: '600', marginTop: 2 },
  mapOuter:           { height: 270, overflow: 'hidden', position: 'relative' },
  mapPlaceholder:     { flex: 1, backgroundColor: '#E9EDE3', alignItems: 'center', justifyContent: 'center', gap: 8 },
  mapPlaceholderTxt:  { color: '#6b7280', fontSize: 12, fontWeight: '600' },
  mapIncidentBadge:   { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FCEFD6', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3 },
  mapIncidentBadgeTxt:{ fontSize: 11.5, fontWeight: '800', color: '#A9690A' },
  list:               { padding: 16, gap: 12, paddingBottom: 120 },
  emptyBox:       { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle:     { fontSize: 20, fontWeight: '800', color: '#111' },
  emptySub:       { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20 },
  cardTitle:      { fontSize: 15, fontWeight: '800', color: C.text, lineHeight: 20 },
  cardDesc:       { fontSize: 13, color: C.textMut, lineHeight: 19, marginTop: 10 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  enRutaBadge:    { flexDirection: 'row', alignItems: 'center', gap: 6 },
  enRutaDot:      { width: 7, height: 7, borderRadius: 4, backgroundColor: C.cyan },
  enRutaTxt:      { color: C.cyan, fontSize: 11, fontWeight: '700' },
  mapOuter:           { height: 200, marginTop: 10, overflow: 'hidden', borderRadius: 12 },
  mapPlaceholder:     { flex: 1, backgroundColor: '#1a3a6e', alignItems: 'center', justifyContent: 'center', gap: 8 },
  mapPlaceholderTxt:  { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600' },

  // ── Tarjeta de incidencia (congestión vehicular) ──
  card:           { backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', flexDirection: 'row', ...SHADOW.card },
  rail:           { width: 5 },
  cardInner:      { flex: 1, padding: 15 },
  cardTop:        { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconBox:        { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  topMeta:        { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  sevChip:        { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  sevChipTxt:     { fontSize: 9.5, fontWeight: '900', letterSpacing: 0.7 },
  nearChip:       { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#EEF4FF', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  nearChipTxt:    { fontSize: 9.5, fontWeight: '800', color: C.blueBright, letterSpacing: 0.3 },
  delayPill:      { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6, flexShrink: 0 },
  delayTxt:       { fontSize: 13, fontWeight: '900' },
  meterRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 13 },
  meterBars:      { flexDirection: 'row', gap: 3 },
  meterSeg:       { width: 18, height: 6, borderRadius: 3 },
  meterTxt:       { fontSize: 12, fontWeight: '800' },
  meterDist:      { fontSize: 11.5, fontWeight: '600', color: C.textFaint },
  routesWrap:     { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  routesLabel:    { fontSize: 11, fontWeight: '700', color: C.textFaint, marginRight: 2 },
  routeChip:      { backgroundColor: '#EEF2F9', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 4 },
  routeChipTxt:   { color: C.text, fontSize: 11, fontWeight: '800' },
  confirmBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1.5, borderColor: '#D4E0F5', backgroundColor: '#F5F9FF', borderRadius: 13, height: 44, marginTop: 14 },
  confirmBtnTxt:  { color: C.blueBright, fontSize: 13.5, fontWeight: '800' },
  footRow:        { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12 },
  confirmCount:   { fontSize: 11, fontWeight: '600', color: C.textFaint },
});

// ── Paraderos styles ───────────────────────────────────────────────────────────
const ps = StyleSheet.create({
  root:         { flex: 1, backgroundColor: C.bg },
  header:       { paddingTop: 54, paddingBottom: 16, paddingHorizontal: 18 },
  headerRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle:  { fontSize: 21, fontWeight: '900', color: '#fff', letterSpacing: -0.4 },
  headerSub:    { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.6)', marginTop: 3 },
  liveBadge:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 6 },
  liveDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: '#34D399' },
  liveTxt:      { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },

  list:         { padding: 16, gap: 14 },
  card:         { backgroundColor: '#fff', borderRadius: 18, padding: 15, ...SHADOW.card },
  stopTop:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sysIcon:      { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stopName:     { fontSize: 15.5, fontWeight: '800', color: C.text },
  stopMeta:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  sysChip:      { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  sysChipTxt:   { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  stopDist:     { flex: 1, fontSize: 11, fontWeight: '600', color: C.textFaint },
  accBox:       { width: 30, height: 30, borderRadius: 9, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  svcWrap:      { marginTop: 12, backgroundColor: '#F7F9FD', borderRadius: 13, paddingHorizontal: 12 },
  svcRow:       { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11 },
  svcBorder:    { borderBottomWidth: 1, borderBottomColor: '#EAEFF7' },
  codeBadge:    { minWidth: 38, height: 30, borderRadius: 9, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  codeTxt:      { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: -0.2 },
  svcDesc:      { flex: 1, fontSize: 13, fontWeight: '600', color: C.text },
  svcTimeWrap:  { flexDirection: 'row', alignItems: 'center' },
  svcTime:      { fontSize: 13, fontWeight: '800', color: C.text },

  detailBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12, height: 40, marginTop: 12 },
  detailTxt:    { fontSize: 13, fontWeight: '800' },
});

// ── Ver Todas styles ──────────────────────────────────────────────────────────
const vt = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#f9fafb' },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#111' },
  closeBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  closeTxt:    { fontSize: 14, color: '#374151', fontWeight: '700' },
  list:        { padding: 16, gap: 16 },
  card:        { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  cardImg:     { width: '100%', height: 180 },
  cardBody:    { padding: 14, gap: 6 },
  tag:         { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  tagTxt:      { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  cardTitle:   { color: '#111', fontSize: 15, fontWeight: '800', lineHeight: 21 },
  cardDate:    { color: '#6b7280', fontSize: 12 },
  cardLink:    { color: ATU_BLUE, fontSize: 12, fontWeight: '700', marginTop: 2 },
});

// ── Cuenta styles ─────────────────────────────────────────────────────────────
const cu = StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#f9fafb' },
  header:       { backgroundColor: '#fff', paddingTop: 54, paddingBottom: 20, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  avatarWrap:   { },
  avatar:       { width: 60, height: 60, borderRadius: 30, backgroundColor: ATU_BLUE, justifyContent: 'center', alignItems: 'center' },
  avatarImg:    { width: 60, height: 60, borderRadius: 30 },
  avatarTxt:    { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  name:         { fontSize: 20, fontWeight: '900', color: '#111', letterSpacing: -0.3 },
  email:        { fontSize: 12, color: '#6b7280', marginTop: 1 },
  starsRow:     { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  star:         { fontSize: 14, color: '#d1d5db' },
  rating:       { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  content:      { padding: 16, gap: 16 },
  quickGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickBtn:     { width: '47%', alignItems: 'center', paddingVertical: 16, borderRadius: 14, borderWidth: 1, gap: 6 },
  quickIcon:    { fontSize: 26 },
  quickLabel:   { fontSize: 12, fontWeight: '700', color: '#374151' },
  saldoCard:    { backgroundColor: '#fff', borderRadius: 16, padding: 18, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2 },
  saldoLabel:   { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  saldoAmt:     { fontSize: 28, fontWeight: '900', color: '#111', letterSpacing: -1 },
  saldoSub:     { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  recargaBtn:   { backgroundColor: ATU_BLUE, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  recargaBtnTxt:{ color: '#fff', fontSize: 13, fontWeight: '800' },
  menuCard:     { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  menuRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, paddingHorizontal: 16 },
  menuBorder:   { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  menuIconBox:  { width: 38, height: 38, borderRadius: 19, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  menuLabel:    { fontSize: 15, fontWeight: '600', color: '#111' },
  menuSub:      { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  menuArrow:    { color: '#d1d5db', fontSize: 20 },
});

// ── Home styles ───────────────────────────────────────────────────────────────
const hs = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#F4F6FA' },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, gap: 16 },

  // ── Header unificado (logo · ubicación · search · yatu) ──────────────────
  header:       { backgroundColor: '#0C1E40', paddingTop: 50, paddingHorizontal: 18, paddingBottom: 16, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerTop:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  logoBox:      { flexDirection: 'row', alignItems: 'center', position: 'relative' },
  logoA:        { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: -1, zIndex: 2 },
  logoStripe:   { position: 'absolute', left: 0, right: 0, height: 5, backgroundColor: ATU_CYAN, top: 11, zIndex: 1 },
  logoTU:       { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: -1, zIndex: 2 },
  locChip:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, marginLeft: 8 },
  locationTxt:  { color: 'rgba(255,255,255,0.88)', fontSize: 12.5, fontWeight: '700' },
  peakPill:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.13)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  peakTxt:      { color: '#fff', fontSize: 10.5, fontWeight: '700' },
  avatarCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: ATU_CYAN, alignItems: 'center', justifyContent: 'center' },
  avatarTxt:    { color: '#fff', fontSize: 16, fontWeight: '900' },
  // Saludo personalizado
  greetHi:      { color: '#9FB6D6', fontSize: 13, fontWeight: '600' },
  greetLocRow:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  greetLoc:     { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: -0.3, maxWidth: 200 },
  // Accesos guardados
  savedRow:     { flexDirection: 'row', gap: 10 },
  savedCard:    { flex: 1, backgroundColor: '#fff', borderRadius: 16, paddingVertical: 13, alignItems: 'center', gap: 8, ...SHADOW.card },
  savedIconBox: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#EEF4FF', alignItems: 'center', justifyContent: 'center' },
  savedLabel:   { fontSize: 12.5, fontWeight: '700', color: C.text },
  savedDot:     { position: 'absolute', top: 10, right: 12, width: 7, height: 7, borderRadius: 4, backgroundColor: C.green },
  // Próximas salidas
  depCard:      { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 15, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1.5, borderColor: C.hair },
  depCardWarn:  { borderColor: '#F4D9A6' },
  depBadge:     { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, maxWidth: 84 },
  depBadgeTxt:  { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.3 },
  depName:      { fontSize: 13, fontWeight: '700', color: C.text },
  depFare:      { color: '#1A8F62', fontWeight: '800' },
  depSub:       { fontSize: 11, fontWeight: '600', color: C.textMut, marginTop: 2 },
  depMin:       { fontSize: 16, fontWeight: '900', letterSpacing: -0.3 },
  depTime:      { fontSize: 10.5, fontWeight: '600', color: C.textFaint, marginTop: 1 },
  // Search bar dentro del header
  searchBar:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 0, height: 52, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 10, elevation: 5 },
  searchInput:  { flex: 1, color: '#0E2147', fontSize: 15.5, fontWeight: '600', paddingVertical: 0, marginLeft: 10, marginRight: 8 },
  // Sugerencias (dentro del header, bajo el searchBar)
  suggestionsBox:  { backgroundColor: '#fff', borderRadius: 14, overflow: 'hidden', marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  suggestionRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14 },
  suggestBorder:   { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  suggestIconBox:  { width: 30, height: 30, borderRadius: 15, backgroundColor: '#EEF3F9', justifyContent: 'center', alignItems: 'center' },
  suggestMain:     { color: '#0E2147', fontSize: 14, fontWeight: '700' },
  suggestSub:      { color: '#8895AE', fontSize: 12, marginTop: 1 },
  // Yatu dentro del header
  yatuBtn:         { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: 'rgba(91,189,245,0.14)' },
  yatuIconBox:     { width: 30, height: 30, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  yatuTxt:         { flex: 1, fontSize: 12.5, fontWeight: '600', color: '#CFE0F5' },
  yatuBold:        { fontSize: 12.5, fontWeight: '800', color: '#fff' },

  // ── Mapa grande ──────────────────────────────────────────────────────────
  mapBig:          { height: 200, marginHorizontal: 14, marginTop: 12, borderRadius: 22, overflow: 'hidden', position: 'relative', shadowColor: '#0C1E40', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 16, elevation: 6 },
  mapLoading:      { flex: 1, backgroundColor: '#E9EDE3', justifyContent: 'center', alignItems: 'center', gap: 8 },
  mapLoadingTxt:   { color: '#6b7280', fontSize: 12, fontWeight: '600' },
  mapAlertBar:     { position: 'absolute', top: 10, left: 10, right: 10, backgroundColor: '#fff', borderRadius: 13, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#0E2147', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.14, shadowRadius: 8, elevation: 4 },
  mapAlertIcon:    { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  mapAlertTitle:   { fontSize: 12.5, fontWeight: '800', color: '#0E2147' },
  mapAlertSub:     { fontSize: 10.5, fontWeight: '600', color: '#8895AE' },
  mapLocateBtn:    { position: 'absolute', right: 12, bottom: 12, width: 40, height: 40, borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.16, shadowRadius: 6, elevation: 3 },

  // ── Planificar (estático, fuera del scroll) ───────────────────────────────
  planArea:      { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E8EDF4', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  planDestRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planDestDot:   { width: 10, height: 10, borderRadius: 5, backgroundColor: '#EA4335', borderWidth: 2, borderColor: '#fff', shadowColor: '#EA4335', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.4, shadowRadius: 3, elevation: 2 },
  planDestTxt:   { flex: 1, fontSize: 13, fontWeight: '700', color: '#3F4A5E' },
  planBtn:       { backgroundColor: ATU_BLUE, borderRadius: 13, paddingVertical: 14, alignItems: 'center', shadowColor: ATU_BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.32, shadowRadius: 8, elevation: 4 },
  planBtnTxt:    { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.3 },

  // ── Barra de pago ─────────────────────────────────────────────────────────
  payBar:        { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: '#1F5396', overflow: 'hidden', marginHorizontal: 14, marginBottom: 100, borderRadius: 24, paddingHorizontal: 16, height: 72, shadowColor: '#0C1E40', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 16, elevation: 8 },
  payBarGrad:    { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 24 },
  payBarIconBox: { width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  payBarTitle:   { color: '#fff', fontSize: 15.5, fontWeight: '800', letterSpacing: -0.2 },
  payBarSubRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  payBarSub:     { color: '#9FC1F5', fontSize: 11, fontWeight: '600' },
  payBarSaldoLabel: { color: '#9FC1F5', fontSize: 9, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  payBarAmount:  { color: '#fff', fontSize: 20, fontWeight: '900', letterSpacing: -0.5, marginTop: 1 },
  payCircle1:    { position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.08)', right: -26, top: -56 },
  payCircle2:    { position: 'absolute', width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255,255,255,0.06)', right: 78, bottom: -46 },

  // ── Secciones ─────────────────────────────────────────────────────────────
  section:       { gap: 10 },
  sectionRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle:  { color: '#0E2147', fontSize: 17, fontWeight: '800' },
  sectionMore:   { color: ATU_BLUE, fontSize: 13, fontWeight: '700' },

  // Recents
  listCard:    { backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 5, elevation: 2 },
  recentRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
  recentBorder:{ borderBottomWidth: 1, borderBottomColor: '#F1F4F9' },
  recentIconBox:{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#EEF3F9', justifyContent: 'center', alignItems: 'center' },
  recentTxt:   { flex: 1, color: '#0E2147', fontSize: 14, fontWeight: '600' },
  recentArrow: { color: '#C5CDD8', fontSize: 18 },

  // Carousels
  carouselContent:  { paddingLeft: 4, paddingRight: 16, gap: 14 },
  carouselCard:     { width: 240, backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.09, shadowRadius: 8, elevation: 3 },
  carouselImgWrap:  { height: 140, position: 'relative' },
  carouselRealImg:  { width: '100%', height: 140 },
  carouselImg:      { height: 140, justifyContent: 'center', alignItems: 'center' },
  carouselDecor:    { position: 'absolute', fontSize: 40, opacity: 0.15, letterSpacing: 6, textAlign: 'center' },
  carouselEmoji:    { fontSize: 56 },
  carouselTag:      { position: 'absolute', bottom: 10, left: 10, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  carouselTagTxt:   { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  carouselContent2: { padding: 12, gap: 4 },
  carouselTitle:    { color: '#0E2147', fontSize: 14, fontWeight: '800', lineHeight: 19 },
  carouselBody:     { color: '#6b7280', fontSize: 12, lineHeight: 17 },

  // Bottom nav — liquid glass dock flotante
  navWrap:        { position: 'absolute', left: 16, right: 16, bottom: 26 },
  navShadow:      { borderRadius: 30, shadowColor: '#0C1E40', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.22, shadowRadius: 24, elevation: 16 },
  navBlur:        { borderRadius: 30, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)' },
  navInner:       { flexDirection: 'row', alignItems: 'center', height: 66, paddingHorizontal: 6, backgroundColor: 'rgba(247,250,253,0.62)' },
  navItem:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  navPillWrap:    { width: 46, height: 34, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  navPillBg:      { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 13, overflow: 'hidden', shadowColor: ATU_BLUE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 5 },
  navPillFill:    { flex: 1, borderRadius: 13 },
  navLabel:       { fontSize: 10.5, color: '#6A7894', fontWeight: '600', letterSpacing: 0.1 },
  navLabelActive: { color: ATU_BLUE, fontWeight: '800' },

  // Teaser noticias
  noticiasTeaser:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 13, shadowColor: '#0A1F4D', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  noticiasTeaserLeft:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  teaserIconBox:        { width: 38, height: 38, borderRadius: 12, backgroundColor: '#EEF4FF', alignItems: 'center', justifyContent: 'center' },
  noticiasTeaserTitle:  { fontSize: 14, fontWeight: '800', color: '#0E2147' },
  noticiasTeaserSub:    { fontSize: 11.5, fontWeight: '600', color: '#8895AE', marginTop: 2 },

  // ── Modal buscar ruta ──
  modalBackdrop:        { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.38)' },
  searchSheet:          { backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26, height: SCREEN_H * 0.78, paddingBottom: 16 },
  sheetHandle:          { width: 40, height: 4, borderRadius: 2, backgroundColor: '#d1d5db', alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  sheetTitleRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  sheetTitle:           { flex: 1, fontSize: 17, fontWeight: '800', color: '#111', textAlign: 'center' },
  sheetCloseBtn:        { position: 'absolute', right: 16, width: 32, height: 32, borderRadius: 16, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  sheetOriginRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14, backgroundColor: '#f9fafb', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  sheetOriginIcon:      { width: 44, height: 44, borderRadius: 12, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  sheetOriginLabel:     { fontSize: 12, fontWeight: '600', color: '#9ca3af' },
  sheetOriginAddr:      { fontSize: 15, fontWeight: '700', color: '#111', marginTop: 1 },
  sheetSearchRow:       { flexDirection: 'row', alignItems: 'center', margin: 12, borderWidth: 2, borderColor: ATU_BLUE, borderRadius: 14, backgroundColor: '#fff', minHeight: 52 },
  sheetSearchInput:     { flex: 1, fontSize: 15, color: '#111', paddingVertical: 13, fontWeight: '500' },
  sheetMapPinBtn:       { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  sheetChipsRow:        { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 8 },
  sheetChip:            { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 24, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  sheetChipActive:      { backgroundColor: '#111', borderColor: '#111' },
  sheetChipTxt:         { fontSize: 13, fontWeight: '700', color: '#6b7280' },
  sheetChipTxtActive:   { color: '#fff' },
  sheetResultRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  sheetResultIcon:      { width: 40, height: 40, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  sheetResultMain:      { fontSize: 15, fontWeight: '700', color: '#111' },
  sheetResultSub:       { fontSize: 12.5, fontWeight: '500', color: '#9ca3af', marginTop: 2 },
  filterChipRow:        { flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10 },
  filterChip:           { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 20, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  filterChipActive:     { backgroundColor: '#111', borderColor: '#111' },
  filterChipTxt:        { fontSize: 12, fontWeight: '700', color: '#6b7280', textAlign: 'center' },
  filterChipTxtActive:  { color: '#fff' },

  // Skeleton
  skeletonRow:     { flexDirection: 'row', gap: 14, paddingLeft: 4 },
  skeletonCard:    { width: 240, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 },
  skeletonImg:     { width: '100%', height: 140, backgroundColor: '#e5e7eb' },
  skeletonContent: { padding: 12, gap: 8 },
  skeletonLine:    { height: 10, width: '90%', backgroundColor: '#e5e7eb', borderRadius: 5 },
});

// ── Result styles (dark theme) ────────────────────────────────────────────────
const rs = StyleSheet.create({
  // Root: relative so children can position absolute on top of map
  root:          { flex: 1, flexDirection: 'column', backgroundColor: '#081A3A' },
  mapWrap:       { flex: 1 },  // ocupa solo el espacio sobre el sheet

  // Overlay de botones encima del mapa (relativo a mapWrap)
  mapOverlay:    { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingTop: 54, paddingHorizontal: 14, gap: 10 },
  backBtn:       { width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 8 },
  backBtnTxt:    { color: '#111', fontSize: 20, fontWeight: '800', lineHeight: 22 },
  destBadge:     { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
  destBadgeTxt:  { color: '#fff', fontSize: 14, fontWeight: '700', flex: 1 },
  destBadgeArrow:{ color: '#aaa', fontSize: 18 },

  // Sheet en flujo normal debajo del mapa — ya no es absolute
  sheet: {
    height: SHEET_H,
    backgroundColor: '#081A3A',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 20,
  },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)', alignSelf: 'center', marginTop: 10, marginBottom: 4 },

  // Sheet scroll content
  sheetContent: { padding: 14, paddingBottom: 40 },

  // Error
  errorBanner: { backgroundColor: '#3a0f0f', padding: 10, borderBottomWidth: 1, borderBottomColor: '#f85149' },
  errorTxt:    { color: '#f85149', fontSize: 12 },
});

// ── Tarjeta styles ─────────────────────────────────────────────────────────────
const ta = StyleSheet.create({
  root:          { flex: 1, backgroundColor: '#f9fafb' },
  header:        { backgroundColor: ATU_BLUE, paddingTop: 54, paddingBottom: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle:   { color: '#fff', fontSize: 18, fontWeight: '900' },
  backBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  content:       { padding: 16, gap: 16 },
  card:           { backgroundColor: '#001a5c', borderRadius: 22, padding: 22, marginTop: 4, overflow: 'hidden', shadowColor: '#001a5c', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 },
  cardCircle1:    { position: 'absolute', right: -60, top: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(0,174,239,0.1)' },
  cardCircle2:    { position: 'absolute', right: 10, top: 10, width: 130, height: 130, borderRadius: 65, borderWidth: 1, borderColor: 'rgba(0,174,239,0.18)', backgroundColor: 'transparent' },
  cardStripe:     { position: 'absolute', left: -20, right: -20, bottom: 72, height: 1.5, backgroundColor: 'rgba(0,174,239,0.18)', transform: [{ rotate: '-2deg' }] },
  cardTop:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  cardChipLabel:  { color: 'rgba(255,255,255,0.4)', fontSize: 8, fontWeight: '700', letterSpacing: 2, marginBottom: 5 },
  cardChip:       { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },
  cardLogoBlock:  { alignItems: 'flex-end' },
  cardLogoA:      { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  cardLogoCyanBar:{ height: 3, width: '100%', backgroundColor: ATU_CYAN, borderRadius: 2, marginTop: 3 },
  cardLogoCity:   { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600' },
  cardBalance:    { color: '#fff', fontSize: 42, fontWeight: '900', letterSpacing: -1.5 },
  cardBalanceLbl: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600', marginTop: 2, marginBottom: 14 },
  routeLineRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  routeStop:      { width: 9, height: 9, borderRadius: 4.5, backgroundColor: 'rgba(0,174,239,0.65)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)' },
  routeSegment:   { flex: 1, height: 2, backgroundColor: 'rgba(0,174,239,0.3)' },
  routeLabels:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  routeLabel:     { color: 'rgba(255,255,255,0.38)', fontSize: 8, fontWeight: '500' },
  cardBottom:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardNumber:     { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600', letterSpacing: 2 },
  cardExpiry:     { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600' },
  statsRow:      { backgroundColor: '#fff', borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingVertical: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  statBox:       { flex: 1, alignItems: 'center' },
  statVal:       { color: '#111', fontSize: 15, fontWeight: '900' },
  statLbl:       { color: '#9ca3af', fontSize: 10, fontWeight: '600', marginTop: 2, textAlign: 'center' },
  statDiv:       { width: 1, height: 32, backgroundColor: '#f3f4f6' },
  section:       { gap: 12 },
  sectionTitle:  { color: '#111', fontSize: 17, fontWeight: '800' },
  amountsRow:    { flexDirection: 'row', gap: 10 },
  amountBtn:     { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 2, borderColor: '#e5e7eb', backgroundColor: '#fff', alignItems: 'center' },
  amountBtnSel:  { borderColor: ATU_BLUE, backgroundColor: '#eff6ff' },
  amountTxt:     { color: '#374151', fontSize: 15, fontWeight: '800' },
  amountTxtSel:  { color: ATU_BLUE },
  selectedHint:  { color: ATU_BLUE, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  methodsGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  methodBtn:     { width: '47%', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5, paddingVertical: 14, alignItems: 'center', gap: 6 },
  methodIcon:    { fontSize: 24 },
  methodLbl:     { fontSize: 13, fontWeight: '800' },
  txCard:        { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  txRow:         { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  txBorder:      { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  txIconBox:     { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  txLabel:       { color: '#111', fontSize: 14, fontWeight: '600' },
  txDate:        { color: '#9ca3af', fontSize: 11, marginTop: 1 },
  txAmount:      { fontSize: 15, fontWeight: '800', minWidth: 56, textAlign: 'right' },
});

// ── Shared dark styles (result content) ───────────────────────────────────────
const s = StyleSheet.create({
  // Empty states
  emptyState: { padding: 32, alignItems: 'center', gap: 10 },
  emptyIcon:  { fontSize: 44 },
  emptyTitle: { color: '#c9d1d9', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  emptyBody:  { color: '#484f58', fontSize: 13, textAlign: 'center', lineHeight: 20 },

  // Summary row compacto
  summaryRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#13294F', marginBottom: 8 },
  summaryTime:     { color: '#fff', fontSize: 32, fontWeight: '900', letterSpacing: -0.5 },
  summaryTimeUnit: { fontSize: 15, fontWeight: '600', color: '#8b949e' },
  summaryMeta:     { color: '#8b949e', fontSize: 15, fontWeight: '600' },
  summaryDot:      { width: 4, height: 4, borderRadius: 2, backgroundColor: '#30363d' },
  summaryPeakChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  summaryPeakTxt:  { fontSize: 11, fontWeight: '800' },
  // Legacy (aún usados en Transit/Taxi summary)
  summaryBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#13294F', marginBottom: 12 },
  summaryItem:{ alignItems: 'center' },
  summaryVal: { color: '#fff', fontSize: 18, fontWeight: '800' },
  summaryLbl: { color: '#484f58', fontSize: 11, marginTop: 2 },
  summaryDiv: { width: 1, height: 28, backgroundColor: '#13294F' },
  liveDot:    { width: 7, height: 7, borderRadius: 4 },
  liveTxt:    { fontSize: 12, fontWeight: '700' },

  fbWarning:    { backgroundColor: '#2d1a00', borderRadius: 8, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#f0a500' },
  fbWarningTxt: { color: '#f0a500', fontSize: 12, textAlign: 'center' },

  // ETA options
  etaOptionsRow:  { flexDirection: 'row', gap: 8, marginVertical: 8 },
  etaOption:      { flex: 1, backgroundColor: '#05122E', borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#13294F', gap: 2 },
  etaOptionSel:   { borderColor: '#f0a500', backgroundColor: '#1a1400' },
  etaOptionIcon:  { fontSize: 20 },
  etaOptionTime:  { color: '#c9d1d9', fontSize: 16, fontWeight: '800' },
  etaOptionLabel: { color: '#484f58', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Leg rows
  legRow:    { flexDirection: 'row', minHeight: 70 },
  legIconCol:{ width: 46, alignItems: 'center' },
  legIcon:   { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  legIconTxt:{ fontSize: 16 },
  legLine:   { flex: 1, width: 2, marginVertical: 4, borderRadius: 1, minHeight: 16 },
  legBody:   { flex: 1, paddingBottom: 16, paddingTop: 4, gap: 2 },
  legMode:   { color: '#8b949e', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  legMain:   { color: '#c9d1d9', fontWeight: '700', fontSize: 14 },
  legSub:    { color: '#484f58', fontSize: 12, marginTop: 2 },

  // Bus card (foto + operador)
  busCard:        { flexDirection: 'row', gap: 10, marginVertical: 8, alignItems: 'center' },
  busPhoto:       { width: 100, height: 66, borderRadius: 8, backgroundColor: '#13294F' },
  busCardInfo:    { flex: 1, gap: 5 },
  busTypeBadge:   { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, borderWidth: 1 },
  busTypeTxt:     { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  busOperador:    { color: '#8b949e', fontSize: 11, fontStyle: 'italic', lineHeight: 15 },

  // Station
  stationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 },
  stationDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  stationName:{ color: '#fff', fontSize: 13, fontWeight: '700', flex: 1 },

  // Arrivals
  arrivalsBox:           { backgroundColor: '#05122E', borderRadius: 10, padding: 10, marginVertical: 6, borderWidth: 1, borderColor: '#13294F' },
  arrivalsTitle:         { color: '#484f58', fontSize: 11, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  noArrivals:            { color: '#484f58', fontSize: 12, textAlign: 'center', paddingVertical: 4 },
  arrivalGroupLabelGreen:{ color: '#3fb950', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  showMoreBtn:           { paddingVertical: 6 },
  showMoreTxt:           { color: '#484f58', fontSize: 11 },
  verMasBtn:  { marginTop: 6, paddingVertical: 5, paddingHorizontal: 10, alignSelf: 'flex-start', backgroundColor: '#13294F', borderRadius: 6 },
  verMasTxt:  { color: '#58a6ff', fontSize: 12, fontWeight: '600' },
  arrivalRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  catchBadge:  { width: 30, height: 30, borderRadius: 15, borderWidth: 1, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  catchIcon:   { fontSize: 13 },
  arrivalCode: { fontSize: 13, fontWeight: '800' },
  arrivalDir:  { color: '#484f58', fontSize: 11, marginTop: 1 },
  arrivalTime: { fontSize: 15, fontWeight: '800', minWidth: 44, textAlign: 'right' },
  missWarning: { backgroundColor: '#2d1a00', borderRadius: 6, padding: 8, marginTop: 6 },
  missWarningTxt:{ color: '#f0a500', fontSize: 11, lineHeight: 17 },

  // Taxi
  taxiNote:  { color: '#484f58', fontSize: 12, textAlign: 'center', marginVertical: 12 },
  taxiApps:  { flexDirection: 'row', gap: 10 },
  taxiBtn:   { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1 },
  taxiBtnTxt:{ color: '#fff', fontWeight: '700', fontSize: 15 },
});

// ── Yatu Screen ───────────────────────────────────────────────────────────────
const YATU_SUGGESTIONS = [
  '¿Qué bus va a Miraflores?',
  '¿Cómo llego a San Isidro?',
  '¿Letra del Metro a SJL?',
  '¿Horarios del Metropolitano?',
];

function YatuScreen({ onBack, user }) {
  const [messages, setMessages] = React.useState([
    { id: 'g0', role: 'assistant', text: '¡Hola! Soy Yatu, tu asistente de viajes 🚌\nDime a dónde quieres ir y te digo qué bus tomar o qué letra del Metropolitano usar.' },
  ]);
  const [input, setInput] = React.useState('');
  const [typing, setTyping] = React.useState(false);
  const scrollRef = React.useRef(null);

  async function send(text) {
    const q = (text || input).trim();
    if (!q) return;
    setInput('');
    Keyboard.dismiss();
    const userMsg = { id: `u${Date.now()}`, role: 'user', text: q };
    const history = [...messages, userMsg];
    setMessages(history);
    setTyping(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    try {
      const apiMsgs = history
        .filter(m => m.role !== 'assistant' || m.id !== 'g0')
        .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }));
      const reply = await askYatu(apiMsgs);
      setMessages(prev => [...prev, { id: `y${Date.now()}`, role: 'assistant', text: reply }]);
    } catch (e) {
      setMessages(prev => [...prev, { id: `ye${Date.now()}`, role: 'assistant', text: 'Lo siento, tuve un problema al conectarme. Intenta de nuevo 🙏' }]);
    } finally {
      setTyping(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  return (
    <View style={yt.root}>
      <StatusBar style="light" />
      {/* Header */}
      <View style={yt.header}>
        <LinearGradient colors={HEADER_GRAD} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <TouchableOpacity style={yt.backBtn} onPress={onBack} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Breathe style={yt.headerIcon} min={1} max={1.08} duration={2000}>
          <Ionicons name="sparkles" size={23} color="#fff" />
        </Breathe>
        <View style={{ flex: 1 }}>
          <Text style={yt.headerTitle}>Yatu</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 7, height: 7, alignItems: 'center', justifyContent: 'center' }}>
              <PulseRing size={7} color="#34D399" />
              <View style={yt.onlineDot} />
            </View>
            <Text style={yt.headerSub}>Asistente de viajes · IA</Text>
          </View>
        </View>
      </View>

      {/* Mensajes */}
      <ScrollView
        ref={scrollRef}
        style={yt.msgs}
        contentContainerStyle={yt.msgsContent}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {messages.map(m => {
          const isYatu = m.role === 'assistant';
          return (
            <Reveal key={m.id} duration={280} distance={14} from={isYatu ? 'left' : 'right'}
              style={[yt.msgRow, !isYatu && yt.msgRowUser]}>
              {isYatu && (
                <View style={yt.yatuAvatar}>
                  <Ionicons name="sparkles" size={16} color="#fff" />
                </View>
              )}
              <View style={[yt.bubble, isYatu ? yt.bubbleYatu : yt.bubbleUser]}>
                <Text style={isYatu ? yt.bubbleTextYatu : yt.bubbleTextUser}>{m.text}</Text>
              </View>
            </Reveal>
          );
        })}
        {typing && (
          <View style={yt.msgRow}>
            <View style={yt.yatuAvatar}>
              <Ionicons name="sparkles" size={16} color="#fff" />
            </View>
            <View style={[yt.bubble, yt.bubbleYatu, yt.typingBubble]}>
              <TypingDots color={C.textFaint} size={7} />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Input */}
      <View style={yt.inputArea}>
        {/* Sugerencias */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={yt.suggestRow}>
          {YATU_SUGGESTIONS.map((s, i) => (
            <TouchableOpacity key={i} style={yt.suggestChip} onPress={() => send(s)} activeOpacity={0.8}>
              <Text style={yt.suggestChipTxt}>{s}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {/* Campo de texto */}
        <View style={yt.inputRow}>
          <TextInput
            style={yt.inputField}
            value={input}
            onChangeText={setInput}
            placeholder="Escribe o pregunta a Yatu…"
            placeholderTextColor="#9AA6BC"
            multiline
            maxLength={300}
            returnKeyType="send"
            onSubmitEditing={() => send()}
          />
          <TouchableOpacity
            style={[yt.sendBtn, (!input.trim() || typing) && { opacity: 0.5 }]}
            onPress={() => send()}
            disabled={!input.trim() || typing}
            activeOpacity={0.85}
          >
            <Ionicons name="arrow-forward" size={19} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── Yatu styles ────────────────────────────────────────────────────────────────
const yt = StyleSheet.create({
  root:            { flex: 1, backgroundColor: '#EEF3F9' },
  header:          { backgroundColor: '#0E2147', paddingTop: 54, paddingBottom: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn:         { width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  headerIcon:      { width: 42, height: 42, borderRadius: 13, backgroundColor: '#2468B8', alignItems: 'center', justifyContent: 'center', shadowColor: '#5BBDF5', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 10, elevation: 4 },
  headerTitle:     { fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  onlineDot:       { width: 7, height: 7, borderRadius: 4, backgroundColor: '#34D399' },
  headerSub:       { fontSize: 11.5, fontWeight: '600', color: '#9FB4D6' },
  msgs:            { flex: 1 },
  msgsContent:     { padding: 18, paddingBottom: 8, gap: 14 },
  msgRow:          { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  msgRowUser:      { flexDirection: 'row-reverse' },
  yatuAvatar:      { width: 30, height: 30, borderRadius: 9, backgroundColor: '#2468B8', alignItems: 'center', justifyContent: 'center', flexShrink: 0, alignSelf: 'flex-end' },
  bubble:          { maxWidth: '80%', borderRadius: 5 },
  bubbleYatu:      { backgroundColor: '#fff', borderRadius: 5, borderBottomLeftRadius: 16, borderTopRightRadius: 16, borderTopLeftRadius: 16, padding: 13, borderWidth: 1, borderColor: '#E2E8F1' },
  bubbleUser:      { backgroundColor: '#1668AD', borderRadius: 16, borderBottomRightRadius: 5, padding: 13 },
  bubbleTextYatu:  { fontSize: 14, fontWeight: '500', color: '#0E2147', lineHeight: 20 },
  bubbleTextUser:  { fontSize: 14, fontWeight: '600', color: '#fff', lineHeight: 20 },
  typingBubble:    { paddingVertical: 14 },
  typingDots:      { fontSize: 18, color: '#9FB4D6', letterSpacing: 3 },
  inputArea:       { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E9EDF3', paddingTop: 10, paddingBottom: 22 },
  suggestRow:      { paddingHorizontal: 14, paddingBottom: 10, gap: 8 },
  suggestChip:     { borderWidth: 1.5, borderColor: '#CFE0F0', backgroundColor: '#F2F8FD', borderRadius: 20, paddingHorizontal: 13, paddingVertical: 8 },
  suggestChipTxt:  { fontSize: 12.5, fontWeight: '700', color: '#1A4F8A' },
  inputRow:        { flexDirection: 'row', alignItems: 'flex-end', gap: 9, paddingHorizontal: 14 },
  inputField:      { flex: 1, backgroundColor: '#F1F4F9', borderWidth: 1.5, borderColor: '#E2E8F1', borderRadius: 16, paddingHorizontal: 15, paddingVertical: 10, fontSize: 13.5, fontWeight: '500', color: '#0E2147', maxHeight: 100 },
  sendBtn:         { width: 42, height: 42, borderRadius: 12, backgroundColor: '#1668AD', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});

// ── Billetera styles ───────────────────────────────────────────────────────────
const wl = StyleSheet.create({
  root:           { flex: 1, backgroundColor: '#F4F6FA' },
  header:         { backgroundColor: '#13315E', paddingTop: 52, paddingHorizontal: 20, paddingBottom: 22 },
  headerRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  signOutBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  signOutTxt:     { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '700' },
  headerTitle:    { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.4 },
  // Tarjeta
  card:           { borderRadius: 20, padding: 18, backgroundColor: '#1C4684', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.6, shadowRadius: 24, elevation: 10, position: 'relative' },
  cardCircle1:    { position: 'absolute', right: -50, top: -50, width: 190, height: 190, borderRadius: 95, borderWidth: 1.5, borderColor: 'rgba(91,189,245,0.1)' },
  cardCircle2:    { position: 'absolute', right: -16, top: -16, width: 120, height: 120, borderRadius: 60, borderWidth: 1.5, borderColor: 'rgba(91,189,245,0.08)' },
  cardRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, position: 'relative' },
  cardLabel:      { fontSize: 12.5, fontWeight: '800', color: '#fff', letterSpacing: 0.4 },
  chip:           { width: 42, height: 30, borderRadius: 7, backgroundColor: '#D9C27A', marginBottom: 14, position: 'relative' },
  cardNumber:     { fontSize: 14, fontWeight: '700', color: '#C7D4EA', letterSpacing: 3, marginBottom: 14, position: 'relative' },
  cardBottom:     { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', position: 'relative' },
  saldoLabel:     { fontSize: 11, fontWeight: '600', color: '#8FA3C4' },
  saldoAmount:    { fontSize: 30, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  saldoCents:     { fontSize: 20, color: '#5BBDF5' },
  cardName:       { fontSize: 11, fontWeight: '700', color: '#8FA3C4' },
  // Botones
  btnRow:         { flexDirection: 'row', gap: 10, marginTop: 16 },
  btnPrimary:     { flex: 1, height: 52, borderRadius: 14, backgroundColor: '#2468B8', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnPrimaryTxt:  { color: '#fff', fontSize: 15, fontWeight: '800' },
  btnSecondary:   { flex: 1, height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(255,255,255,0.06)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnSecondaryTxt:{ color: '#fff', fontSize: 15, fontWeight: '800' },
  // Lista movimientos
  body:           { padding: 18, paddingBottom: 120 },
  movTitle:       { fontSize: 13, fontWeight: '800', color: '#0E2147', marginBottom: 13 },
  movRow:         { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  movBorder:      { borderBottomWidth: 1, borderBottomColor: '#EAEEF4' },
  movBadge:       { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, minWidth: 62, alignItems: 'center' },
  movBadgeTxt:    { fontSize: 9, fontWeight: '800', color: '#fff', textAlign: 'center', letterSpacing: 0.3 },
  movDesc:        { fontSize: 13.5, fontWeight: '700', color: '#0E2147' },
  movCuando:      { fontSize: 11, fontWeight: '600', color: '#8895AE' },
  movMonto:       { fontSize: 14, fontWeight: '800' },
  // QR Modal
  qrRoot:         { flex: 1, backgroundColor: '#0A1A38', flexDirection: 'column' },
  qrHeader:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 52, paddingHorizontal: 20, paddingBottom: 8 },
  qrBack:         { width: 38, height: 38, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  qrTitle:        { fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  qrCard:         { backgroundColor: '#fff', borderRadius: 28, padding: 26, shadowColor: '#000', shadowOffset: { width: 0, height: 30 }, shadowOpacity: 0.6, shadowRadius: 40, elevation: 20, width: 274, height: 274, alignItems: 'center', justifyContent: 'center' },
  qrWebView:      { width: 222, height: 222, backgroundColor: 'transparent' },
  nfcRow:         { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22 },
  nfcTxt:         { fontSize: 14, fontWeight: '700', color: '#A2B4D2' },
  qrInfoRow:      { flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 22 },
  qrDivider:      { width: 1, height: 32, backgroundColor: 'rgba(125,170,220,0.25)' },
  qrInfoLabel:    { fontSize: 11, fontWeight: '600', color: '#8FA3C4', textAlign: 'center' },
  qrInfoVal:      { fontSize: 20, fontWeight: '800', color: '#fff', textAlign: 'center' },
  qrDoneBtn:      { height: 54, borderRadius: 15, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  qrDoneTxt:      { color: '#fff', fontSize: 16, fontWeight: '800' },
});

const fabSt = StyleSheet.create({
  fab:      { position: 'absolute', right: 15, bottom: 112, zIndex: 40, borderRadius: 25, backgroundColor: '#1B4E97', shadowColor: '#1B4E97', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.7, shadowRadius: 20, elevation: 12 },
  fabInner: { height: 50, paddingLeft: 13, paddingRight: 17, borderRadius: 25, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 8 },
  fabGrad:  { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  fabTxt:   { fontSize: 15, fontWeight: '800', color: '#fff' },
});
