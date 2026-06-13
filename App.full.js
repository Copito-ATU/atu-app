import { StatusBar } from 'expo-status-bar';
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import * as Location from 'expo-location';
import { SERVER_URL, WALK_SPEED_KMH, ROUTE_COLORS } from './constants';

// ── Helpers ──────────────────────────────────────────────────────────────────

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, d2r = Math.PI / 180;
  const dLat = (lat2 - lat1) * d2r, dLng = (lng2 - lng1) * d2r;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*d2r)*Math.cos(lat2*d2r)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function nearestStation(lat, lng, routes) {
  let best = null, bestD = Infinity;
  for (const r of routes)
    for (const s of r.stations) {
      const d = haversineKm(lat, lng, s.lat, s.lng);
      if (d < bestD) { bestD = d; best = { ...s, routeId: r.id, routeName: r.name }; }
    }
  return best ? { station: best, distKm: bestD } : null;
}

function fmtTime(sec) {
  if (sec < 60) return `${sec} seg`;
  return `${Math.round(sec / 60)} min`;
}

function fmtDist(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

// ── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [routes,    setRoutes]    = useState([]);
  const [buses,     setBuses]     = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [connected, setConnected] = useState(false);

  const [userLat,  setUserLat]  = useState(null);
  const [userLng,  setUserLng]  = useState(null);
  const [station,  setStation]  = useState(null);
  const [distKm,   setDistKm]   = useState(0);

  const [arrivals,      setArrivals]      = useState([]);
  const [smartArrivals, setSmartArrivals] = useState([]);
  const [walkMin,       setWalkMin]       = useState(0);
  const [loadingArr,    setLoadingArr]    = useState(false);
  const [showAll,       setShowAll]       = useState(false);
  const [dismissed,     setDismissed]     = useState([]);

  // ── Data fetching ────────────────────────────────────────────────────────

  useEffect(() => {
    fetch(`${SERVER_URL}/api/routes`)
      .then(r => r.json()).then(d => { setRoutes(d); setConnected(true); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setInterval(() =>
      fetch(`${SERVER_URL}/api/buses`)
        .then(r => r.json()).then(d => { setBuses(d); setConnected(true); })
        .catch(() => setConnected(false))
    , 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const fetchInc = () =>
      fetch(`${SERVER_URL}/api/incidents`).then(r => r.json()).then(setIncidents).catch(() => {});
    fetchInc();
    const t = setInterval(fetchInc, 15000);
    return () => clearInterval(t);
  }, []);

  // ── GPS ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    let sub;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permiso GPS requerido'); return; }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10 },
        pos => {
          setUserLat(pos.coords.latitude);
          setUserLng(pos.coords.longitude);
        }
      );
    })();
    return () => sub?.remove();
  }, []);

  // ── Nearest station ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!userLat || routes.length === 0) return;
    const r = nearestStation(userLat, userLng, routes);
    if (r) { setStation(r.station); setDistKm(r.distKm); }
  }, [userLat, userLng, routes]);

  // ── Smart arrivals ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!station || !userLat) return;
    let active = true;
    const fetch_ = async () => {
      setLoadingArr(true);
      try {
        const url = `${SERVER_URL}/api/smart-arrivals?lat=${userLat}&lng=${userLng}&routeId=${station.routeId}&stationId=${station.id}`;
        const res  = await fetch(url);
        const data = await res.json();
        if (!active) return;
        setSmartArrivals(data.smartArrivals || []);
        setArrivals(data.allArrivals || []);
        setWalkMin(data.walkingMinutes || 0);
      } catch (_) {}
      setLoadingArr(false);
    };
    fetch_();
    const t = setInterval(fetch_, 5000);
    return () => { active = false; clearInterval(t); };
  }, [station?.id, station?.routeId, userLat, userLng]);

  // ── Nearby incidents ──────────────────────────────────────────────────────

  const nearbyInc = incidents.filter(inc =>
    !dismissed.includes(inc.id) &&
    userLat &&
    inc.severity === 'high' &&
    haversineKm(userLat, userLng, inc.lat, inc.lng) <= 1.5
  );

  const displayed  = showAll ? arrivals : smartArrivals;
  const walkSec    = Math.round(walkMin * 60);
  const busesRoute = station ? buses.filter(b => b.routeId === station.routeId) : [];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>🚌 ATU Lima</Text>
        <View style={s.connRow}>
          <View style={[s.dot, { backgroundColor: connected ? '#3fb950' : '#f85149' }]} />
          <Text style={[s.connTxt, { color: connected ? '#3fb950' : '#f85149' }]}>
            {connected ? `${buses.length} buses en vivo` : 'Conectando...'}
          </Text>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content}>

        {/* Incident banner */}
        {nearbyInc.length > 0 && (
          <View style={s.incBanner}>
            <Text style={s.incIcon}>
              {{ accident:'🚨', congestion:'🚦', closure:'🚧', breakdown:'⚠️' }[nearbyInc[0].type] || '⚠️'}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={s.incTitle}>{nearbyInc[0].description}</Text>
              {nearbyInc[0].nearStation ? <Text style={s.incSub}>Cerca de {nearbyInc[0].nearStation}</Text> : null}
            </View>
            <TouchableOpacity onPress={() => setDismissed(p => [...p, nearbyInc[0].id])}>
              <Text style={s.incClose}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* GPS card */}
        <View style={s.card}>
          <Text style={s.cardLabel}>📍 Tu ubicación</Text>
          {userLat ? (
            <Text style={s.gpsVal}>{userLat.toFixed(5)}, {userLng.toFixed(5)}</Text>
          ) : (
            <View style={s.row}>
              <ActivityIndicator color="#f0a500" size="small" />
              <Text style={s.hint}> Obteniendo GPS...</Text>
            </View>
          )}
        </View>

        {/* Nearest station card */}
        {station && (
          <View style={s.card}>
            <View style={s.row}>
              <View style={[s.routeDot, { backgroundColor: ROUTE_COLORS[station.routeId] || '#fff' }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.stName}>{station.name}</Text>
                <Text style={s.stSub}>{station.routeName} · {fmtDist(distKm)} · {fmtTime(walkSec)} caminando</Text>
              </View>
            </View>
          </View>
        )}

        {/* Smart arrivals */}
        <View style={s.card}>
          <View style={s.arrHeader}>
            <Text style={s.cardLabel}>⏱ Próximos buses</Text>
            {arrivals.length > 0 && (
              <TouchableOpacity onPress={() => setShowAll(v => !v)}>
                <Text style={s.toggleTxt}>{showAll ? 'Solo alcanzables' : `Ver todos (${arrivals.length})`}</Text>
              </TouchableOpacity>
            )}
          </View>

          {!station ? (
            <Text style={s.hint}>Esperando paradero más cercano...</Text>
          ) : loadingArr && displayed.length === 0 ? (
            <ActivityIndicator color="#f0a500" style={{ margin: 10 }} />
          ) : displayed.length === 0 ? (
            <Text style={s.hint}>{showAll ? 'Sin buses próximos' : 'No hay buses alcanzables ahora — prueba "Ver todos"'}</Text>
          ) : (
            displayed.slice(0, 5).map((a, i) => {
              const color = a.seconds < 60 ? '#ff6b6b' : a.minutes < 5 ? '#e3b341' : '#3fb950';
              return (
                <View key={i} style={s.arrRow}>
                  <View style={[s.svcBadge, { borderColor: ROUTE_COLORS[station.routeId] || '#fff' }]}>
                    <Text style={s.svcTxt}>{a.serviceCode}</Text>
                  </View>
                  <Text style={s.arrDir} numberOfLines={1}>→ {a.direction}</Text>
                  <View style={[s.timeBadge, { borderColor: color }]}>
                    <Text style={[s.timeTxt, { color }]}>{fmtTime(a.seconds)}</Text>
                  </View>
                </View>
              );
            })
          )}

          {!showAll && smartArrivals.length > 0 && (
            <View style={s.catchRow}>
              <Text style={s.catchTxt}>✓ {smartArrivals.length} buses que puedes alcanzar caminando {fmtTime(walkSec)}</Text>
            </View>
          )}
        </View>

        {/* Live bus count by route */}
        <View style={s.card}>
          <Text style={s.cardLabel}>🚌 Flota en tiempo real</Text>
          {routes.slice(0, 6).map(r => (
            <View key={r.id} style={s.routeRow}>
              <View style={[s.routeDot, { backgroundColor: ROUTE_COLORS[r.id] || '#fff' }]} />
              <Text style={s.routeName}>{r.shortName}</Text>
              <Text style={s.routeCount}>{buses.filter(b => b.routeId === r.id).length} buses</Text>
            </View>
          ))}
        </View>

      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: '#0d1117' },
  header:     { backgroundColor: '#16213e', paddingTop: 52, paddingBottom: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#ffffff15' },
  headerTitle:{ color: '#fff', fontSize: 20, fontWeight: '800' },
  connRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  dot:        { width: 8, height: 8, borderRadius: 4 },
  connTxt:    { fontSize: 12 },

  scroll:   { flex: 1 },
  content:  { padding: 14, gap: 12 },

  card:      { backgroundColor: '#16213e', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#ffffff10' },
  cardLabel: { color: '#8b949e', fontSize: 12, fontWeight: '600', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  row:       { flexDirection: 'row', alignItems: 'center' },
  hint:      { color: '#3d444d', fontSize: 13 },

  gpsVal: { color: '#3fb950', fontFamily: 'monospace', fontSize: 13 },

  routeDot:  { width: 10, height: 10, borderRadius: 5, marginRight: 10, flexShrink: 0 },
  stName:    { color: '#fff', fontWeight: '700', fontSize: 15 },
  stSub:     { color: '#8b949e', fontSize: 12, marginTop: 2 },

  arrHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  toggleTxt: { color: '#58a6ff', fontSize: 12 },
  arrRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#ffffff08', gap: 10 },
  svcBadge:  { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  svcTxt:    { color: '#c9d1d9', fontSize: 12, fontWeight: '700' },
  arrDir:    { flex: 1, color: '#8b949e', fontSize: 12 },
  timeBadge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  timeTxt:   { fontWeight: '700', fontSize: 13 },
  catchRow:  { marginTop: 10, backgroundColor: '#3fb95015', borderRadius: 8, padding: 8 },
  catchTxt:  { color: '#3fb950', fontSize: 12 },

  routeRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#ffffff08' },
  routeName:  { flex: 1, color: '#c9d1d9', fontSize: 13, marginLeft: 0 },
  routeCount: { color: '#58a6ff', fontWeight: '700', fontSize: 13 },

  incBanner: { backgroundColor: '#3a0f0f', borderRadius: 12, borderWidth: 1, borderColor: '#f85149', flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  incIcon:   { fontSize: 22 },
  incTitle:  { color: '#fff', fontWeight: '700', fontSize: 13 },
  incSub:    { color: '#ff9999', fontSize: 11, marginTop: 2 },
  incClose:  { color: '#ffffff60', fontSize: 16, padding: 4 },
});
