import React from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AntDesign, Ionicons } from '@expo/vector-icons';
import { C, GRAD, SHADOW, Reveal, PressableScale, Aurora } from '../theme';

const FEATURES = [
  { icon: 'map',             title: 'Rutas en tiempo real',     sub: 'Metropolitano y todos los corredores' },
  { icon: 'time',            title: 'Llegadas exactas',          sub: 'Sabe cuándo llega tu bus antes de salir' },
  { icon: 'card',            title: 'Tarjeta Lima Pass digital', sub: 'Consulta saldo y recarga desde la app' },
  { icon: 'notifications',   title: 'Alertas de servicio',       sub: 'Incidencias y desvíos al instante' },
];

export default function LoginScreen({ onSignIn, loading, loginDisabled }) {
  return (
    <View style={s.root}>
      <StatusBar style="light" />

      {/* Hero — aurora ambient over deep navy */}
      <View style={s.hero}>
        <Aurora />
        <SafeAreaView>
          <Reveal delay={80} from="top">
            <View style={s.logoRow}>
              <View style={s.logoBox}>
                <Text style={s.logoA}>A</Text>
                <View style={s.logoStripe} />
                <Text style={s.logoTU}>TU</Text>
              </View>
              <Text style={s.logoCity}>Lima</Text>
            </View>
          </Reveal>
          <Reveal delay={200}>
            <Text style={s.heroTitle}>Movilidad inteligente{'\n'}para Lima</Text>
          </Reveal>
          <Reveal delay={320}>
            <Text style={s.heroSub}>
              Planifica viajes, sigue buses en tiempo real{'\n'}
              y gestiona tu tarjeta, todo en un lugar.
            </Text>
          </Reveal>
        </SafeAreaView>
      </View>

      {/* Features + CTA */}
      <View style={s.card}>
        <View style={s.featuresList}>
          {FEATURES.map((f, i) => (
            <Reveal key={i} delay={420 + i * 90} from="right" distance={22}>
              <View style={s.featureRow}>
                <View style={s.featureIconBox}>
                  <Ionicons name={f.icon} size={20} color={C.blueBright} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.featureTitle}>{f.title}</Text>
                  <Text style={s.featureSub}>{f.sub}</Text>
                </View>
              </View>
            </Reveal>
          ))}
        </View>

        <Reveal delay={820}>
          <PressableScale
            style={[s.googleBtn, (loading || loginDisabled) && s.googleBtnDisabled]}
            onPress={(!loading && !loginDisabled) ? onSignIn : undefined}
            disabled={loading || loginDisabled}
          >
            {loading ? (
              <ActivityIndicator color={C.blue} />
            ) : (
              <>
                <AntDesign name="google" size={22} color="#4285F4" />
                <Text style={s.googleBtnTxt}>{loginDisabled ? 'Inicio de sesión deshabilitado' : 'Continuar con Google'}</Text>
              </>
            )}
          </PressableScale>
        </Reveal>

        {loginDisabled && (
          <Text style={s.disabledMsg}>
            El inicio de sesión por Google está deshabilitado en esta build.
          </Text>
        )}

        <Reveal delay={920}>
          <Text style={s.terms}>
            Al continuar aceptas los{' '}
            <Text style={s.termsLink}>Términos de servicio</Text>
            {' '}y la{' '}
            <Text style={s.termsLink}>Política de privacidad</Text>
            {' '}de ATU Lima.
          </Text>
        </Reveal>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.navy900 },

  // Hero section
  hero:       { flex: 1, paddingHorizontal: 28, paddingTop: 16, justifyContent: 'center', overflow: 'hidden' },
  logoRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 32 },
  logoBox:    { flexDirection: 'row', alignItems: 'center', position: 'relative' },
  logoA:      { color: '#fff', fontSize: 40, fontWeight: '900', letterSpacing: -2, zIndex: 2 },
  logoStripe: { position: 'absolute', left: 0, right: 0, height: 8, backgroundColor: C.cyan, top: 18, zIndex: 1, opacity: 0.85, borderRadius: 2 },
  logoTU:     { color: '#fff', fontSize: 40, fontWeight: '900', letterSpacing: -2, zIndex: 2 },
  logoCity:   { color: 'rgba(255,255,255,0.7)', fontSize: 22, fontWeight: '600' },
  heroTitle:  { color: '#fff', fontSize: 33, fontWeight: '900', lineHeight: 39, letterSpacing: -0.6, marginBottom: 14 },
  heroSub:    { color: 'rgba(255,255,255,0.78)', fontSize: 15, lineHeight: 22, fontWeight: '400' },

  // White card
  card: {
    backgroundColor: C.card,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    ...SHADOW.lift,
  },

  // Features list
  featuresList: { gap: 16, marginBottom: 28 },
  featureRow:   { flexDirection: 'row', alignItems: 'center', gap: 14 },
  featureIconBox:{ width: 44, height: 44, borderRadius: 13, backgroundColor: '#EEF4FF', justifyContent: 'center', alignItems: 'center' },
  featureTitle: { color: C.text, fontSize: 14.5, fontWeight: '800' },
  featureSub:   { color: C.textMut, fontSize: 12, marginTop: 1 },

  // Google button
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: C.hair,
    borderRadius: 16, paddingVertical: 16,
    ...SHADOW.card,
    marginBottom: 16,
  },
  googleBtnDisabled: { opacity: 0.6 },
  googleBtnTxt: { color: C.text, fontSize: 16, fontWeight: '800' },

  // Terms
  terms:     { color: C.textFaint, fontSize: 11, textAlign: 'center', lineHeight: 17 },
  termsLink: { color: C.blueBright, fontWeight: '700' },
  disabledMsg: { color: '#b91c1c', fontSize: 12, textAlign: 'center', marginTop: 6 },
});
