// ════════════════════════════════════════════════════════════════════════════
//  ATU · Design System
//  Refined, on-brand palette (ATU institutional blue + sky-blue) + a small set
//  of high-impact, dependency-free animation primitives built on Animated.
// ════════════════════════════════════════════════════════════════════════════
import React, { useRef, useEffect } from 'react';
import { Animated, Easing, Pressable, View, StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// ── Color tokens ──────────────────────────────────────────────────────────────
export const C = {
  // Brand — official ATU
  blue:       '#003087',
  cyan:       '#00AEEF',

  // Refined navy scale (depth for headers / dark surfaces)
  ink:        '#05122E',
  navy900:    '#06142E',
  navy800:    '#0A2150',
  navy700:    '#0E2D6E',
  royal:      '#0B3FA8',
  blueBright: '#1466C9',
  sky:        '#19B6F0',

  // Text
  text:       '#0B1B3F',
  textMut:    '#69769A',
  textFaint:  '#9AA6BC',

  // Surfaces
  bg:         '#F3F6FC',
  card:       '#FFFFFF',
  hair:       '#E7EDF6',

  // Semantic
  green:      '#16A34A',
  amber:      '#E08A0B',
  red:        '#EF4444',
  white:      '#FFFFFF',
};

// ── Gradients ───────────────────────────────────────────────────────────────
export const GRAD = {
  // Signature header gradient — midnight navy → ATU blue → vivid sky-blue
  header:     ['#031A47', '#0A2E73', '#1466C9'],
  headerDeep: ['#05122E', '#0A2150', '#103079'],
  // Accent — sky → royal, for CTAs / FAB / active states
  accent:     ['#22BEF5', '#0A66D2'],
  royal:      ['#1466C9', '#0A2E73'],
  card:       ['#0E2D6E', '#0A2150'],
};

// ── Scale tokens ──────────────────────────────────────────────────────────────
export const R = { sm: 10, md: 14, lg: 18, xl: 24, xxl: 30, pill: 999 };
export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const SHADOW = {
  // Soft floating-card shadow
  card: {
    shadowColor: '#0A1F4D', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10, shadowRadius: 16, elevation: 4,
  },
  // Pronounced lift for hero / floating elements
  lift: {
    shadowColor: '#06142E', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22, shadowRadius: 24, elevation: 12,
  },
  // Colored glow under accent buttons
  glow: {
    shadowColor: '#0A66D2', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.40, shadowRadius: 16, elevation: 8,
  },
};

export const MOTION = {
  fast: 220, base: 340, slow: 560,
  ease:    Easing.out(Easing.cubic),
  easeIO:  Easing.inOut(Easing.cubic),
  spring:  { friction: 7, tension: 120 },
};

// ════════════════════════════════════════════════════════════════════════════
//  Motion primitives
// ════════════════════════════════════════════════════════════════════════════

// ── Reveal ──────────────────────────────────────────────────────────────────
// Entrance: fades up (or from a chosen direction) once on mount. Compose with a
// per-item `delay` to build staggered page-load reveals.
export function Reveal({
  children, delay = 0, distance = 16, from = 'bottom',
  duration = MOTION.base, style,
}) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(t, {
      toValue: 1, duration, delay, easing: MOTION.ease, useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, []);
  const d = { bottom: distance, top: -distance, left: -distance, right: distance }[from] ?? distance;
  const axis = from === 'left' || from === 'right' ? 'translateX' : 'translateY';
  const move = t.interpolate({ inputRange: [0, 1], outputRange: [d, 0] });
  return (
    <Animated.View style={[style, { opacity: t, transform: [{ [axis]: move }] }]}>
      {children}
    </Animated.View>
  );
}

// ── PressableScale ────────────────────────────────────────────────────────────
// Tactile press feedback — springs down on touch, back on release. Drop-in for
// TouchableOpacity where you want a more physical interaction.
export function PressableScale({
  children, onPress, style, scaleTo = 0.95, disabled, hitSlop, accessibilityLabel,
}) {
  const s = useRef(new Animated.Value(1)).current;
  const to = (v, friction) =>
    Animated.spring(s, { toValue: v, friction, tension: 180, useNativeDriver: true }).start();
  return (
    <Pressable
      onPress={onPress} disabled={disabled} hitSlop={hitSlop}
      accessibilityLabel={accessibilityLabel}
      onPressIn={() => to(scaleTo, 8)} onPressOut={() => to(1, 5)}
    >
      <Animated.View style={[style, { transform: [{ scale: s }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

// ── Aurora ──────────────────────────────────────────────────────────────────
// Living, drifting gradient blobs over a deep navy base. High-impact ambient
// background for splash / auth / hero surfaces. Pure Animated (no deps).
export function Aurora({ style, blobs }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 7000, easing: MOTION.easeIO, useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 7000, easing: MOTION.easeIO, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const BLOBS = blobs || [
    { colors: ['#1E78E6', 'rgba(30,120,230,0)'], size: 360, top: -80,  left: -90,  dx: 36,  dy: 28 },
    { colors: ['#16C7F0', 'rgba(22,199,240,0)'], size: 300, top: 180,  left: 150,  dx: -42, dy: -30 },
    { colors: ['#0A3FA8', 'rgba(10,63,168,0)'],  size: 420, top: 360,  left: -120, dx: 30,  dy: -34 },
  ];
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, style]} pointerEvents="none">
      {BLOBS.map((b, i) => {
        const tx = t.interpolate({ inputRange: [0, 1], outputRange: [0, b.dx] });
        const ty = t.interpolate({ inputRange: [0, 1], outputRange: [0, b.dy] });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute', top: b.top, left: b.left,
              width: b.size, height: b.size, borderRadius: b.size / 2,
              transform: [{ translateX: tx }, { translateY: ty }],
            }}
          >
            <LinearGradient
              colors={b.colors} start={{ x: 0.5, y: 0.2 }} end={{ x: 0.5, y: 1 }}
              style={{ flex: 1, borderRadius: b.size / 2 }}
            />
          </Animated.View>
        );
      })}
    </View>
  );
}

// ── Shine ─────────────────────────────────────────────────────────────────────
// A slow diagonal highlight sweeping across a surface (premium "shimmer").
export function Shine({ band = 0.5, color = 'rgba(255,255,255,0.28)', delay = 1000, dur = 1600 }) {
  const x = useRef(new Animated.Value(0)).current;
  const [w, setW] = React.useState(0);
  useEffect(() => {
    if (!w) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(x, { toValue: 1, duration: dur, easing: MOTION.easeIO, useNativeDriver: true }),
      Animated.timing(x, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [w]);
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [-w * 0.9, w * 1.3] });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none"
      onLayout={e => setW(e.nativeEvent.layout.width)}>
      <Animated.View style={{ position: 'absolute', top: -200, bottom: -200,
        width: (w || 1) * band, transform: [{ translateX }, { rotate: '18deg' }] }}>
        <LinearGradient colors={['rgba(255,255,255,0)', color, 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
      </Animated.View>
    </View>
  );
}

// ── Breathe ─────────────────────────────────────────────────────────────────
// Gentle looping scale — for icons / live indicators that should feel alive.
export function Breathe({ children, style, min = 1, max = 1.08, duration = 1500 }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration, easing: MOTION.easeIO, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration, easing: MOTION.easeIO, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [min, max] });
  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}

// ── PulseRing ─────────────────────────────────────────────────────────────────
// An expanding-and-fading ring — radar / "live" pulse behind a dot or icon.
export function PulseRing({ size = 56, color = C.sky, style }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(v, { toValue: 1, duration: 1900, easing: Easing.out(Easing.ease), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.9] });
  const opacity = v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[{
        position: 'absolute', width: size, height: size, borderRadius: size / 2,
        backgroundColor: color, opacity, transform: [{ scale }],
      }, style]}
    />
  );
}

// ── TypingDots ────────────────────────────────────────────────────────────────
// Three dots bouncing in sequence — chat "is typing" indicator.
export function TypingDots({ color = C.textFaint, size = 7 }) {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    const make = (v, delay) => Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(v, { toValue: 1, duration: 320, easing: MOTION.easeIO, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 320, easing: MOTION.easeIO, useNativeDriver: true }),
      Animated.delay(360 - delay),
    ]));
    const anims = dots.map((v, i) => make(v, i * 160));
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, []);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      {dots.map((v, i) => (
        <Animated.View key={i} style={{
          width: size, height: size, borderRadius: size / 2, backgroundColor: color,
          transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }],
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
        }} />
      ))}
    </View>
  );
}
