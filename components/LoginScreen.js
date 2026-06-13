import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AntDesign } from '@expo/vector-icons';

const ATU_BLUE = '#003087';
const ATU_CYAN = '#00AEEF';

const FEATURES = [
  { icon: '🗺️', title: 'Rutas en tiempo real',      sub: 'Metropolitano y todos los corredores' },
  { icon: '⏱️', title: 'Llegadas exactas',           sub: 'Sabe cuándo llega tu bus antes de salir' },
  { icon: '💳', title: 'Tarjeta Lima Pass digital',  sub: 'Consulta saldo y recarga desde la app' },
  { icon: '🚨', title: 'Alertas de servicio',        sub: 'Incidencias y desvíos al instante' },
];

export default function LoginScreen({ onSignIn, loading }) {
  return (
    <View style={s.root}>
      <StatusBar style="light" />

      {/* Hero */}
      <View style={s.hero}>
        <SafeAreaView>
          <View style={s.logoRow}>
            <View style={s.logoBox}>
              <Text style={s.logoA}>A</Text>
              <View style={s.logoStripe} />
              <Text style={s.logoTU}>TU</Text>
            </View>
            <Text style={s.logoCity}>Lima</Text>
          </View>
          <Text style={s.heroTitle}>Movilidad inteligente{'\n'}para Lima</Text>
          <Text style={s.heroSub}>
            Planifica viajes, sigue buses en tiempo real{'\n'}
            y gestiona tu tarjeta, todo en un lugar.
          </Text>
        </SafeAreaView>
      </View>

      {/* Features + CTA */}
      <View style={s.card}>
        <View style={s.featuresList}>
          {FEATURES.map((f, i) => (
            <View key={i} style={s.featureRow}>
              <View style={s.featureIconBox}>
                <Text style={s.featureIcon}>{f.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.featureTitle}>{f.title}</Text>
                <Text style={s.featureSub}>{f.sub}</Text>
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[s.googleBtn, loading && s.googleBtnDisabled]}
          onPress={onSignIn}
          disabled={loading}
          activeOpacity={0.88}
        >
          {loading ? (
            <ActivityIndicator color={ATU_BLUE} />
          ) : (
            <>
              <AntDesign name="google" size={22} color="#4285F4" />
              <Text style={s.googleBtnTxt}>Continuar con Google</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={s.terms}>
          Al continuar aceptas los{' '}
          <Text style={s.termsLink}>Términos de servicio</Text>
          {' '}y la{' '}
          <Text style={s.termsLink}>Política de privacidad</Text>
          {' '}de ATU Lima.
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: ATU_BLUE },

  // Hero section
  hero:       { flex: 1, paddingHorizontal: 28, paddingTop: 16, justifyContent: 'center' },
  logoRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 32 },
  logoBox:    { flexDirection: 'row', alignItems: 'center', position: 'relative' },
  logoA:      { color: '#fff', fontSize: 40, fontWeight: '900', letterSpacing: -2, zIndex: 2 },
  logoStripe: { position: 'absolute', left: 0, right: 0, height: 8, backgroundColor: ATU_CYAN, top: 18, zIndex: 1, opacity: 0.8 },
  logoTU:     { color: '#fff', fontSize: 40, fontWeight: '900', letterSpacing: -2, zIndex: 2 },
  logoCity:   { color: 'rgba(255,255,255,0.7)', fontSize: 22, fontWeight: '600' },
  heroTitle:  { color: '#fff', fontSize: 32, fontWeight: '900', lineHeight: 38, letterSpacing: -0.5, marginBottom: 14 },
  heroSub:    { color: 'rgba(255,255,255,0.75)', fontSize: 15, lineHeight: 22, fontWeight: '400' },

  // White card
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
  },

  // Features list
  featuresList: { gap: 16, marginBottom: 28 },
  featureRow:   { flexDirection: 'row', alignItems: 'center', gap: 14 },
  featureIconBox:{ width: 42, height: 42, borderRadius: 12, backgroundColor: '#f0f7ff', justifyContent: 'center', alignItems: 'center' },
  featureIcon:  { fontSize: 20 },
  featureTitle: { color: '#111', fontSize: 14, fontWeight: '700' },
  featureSub:   { color: '#6b7280', fontSize: 12, marginTop: 1 },

  // Google button
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: '#e5e7eb',
    borderRadius: 14, paddingVertical: 15,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
    marginBottom: 16,
  },
  googleBtnDisabled: { opacity: 0.6 },
  googleLogo: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  googleG:      { color: '#4285F4', fontSize: 14, fontWeight: '900' },
  googleBtnTxt: { color: '#111', fontSize: 16, fontWeight: '700' },

  // Terms
  terms:     { color: '#9ca3af', fontSize: 11, textAlign: 'center', lineHeight: 17 },
  termsLink: { color: ATU_BLUE, fontWeight: '600' },
});
