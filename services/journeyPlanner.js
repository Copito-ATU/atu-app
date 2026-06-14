import ROUTES from '../data/routes.json';

const WALK_KMH        = 4.8;
const BUS_KMH         = 18;
const DWELL_PER_STOP  = 1.5;
const MAX_WALK_KM     = 1.5;
const MAX_WALK_BRT    = 2.5;   // la gente camina más para tomar BRT/Metro
const MAX_TRANSFER_KM = 0.6;
const MAX_TRANSFER_BRT= 1.0;   // transbordos a BRT permiten más caminata

const SPEED_BY_TYPE = {
  brt:        38,   // Metropolitano: ~38 km/h promedio real (vía expresa dedicada)
  metro:      45,   // Línea 1: ~45 km/h (tren, sin semáforos)
  diametral:  16,
  radial:     13,
  periferica: 10,
  circular:   13,
};
const DWELL_BY_TYPE = {
  brt:        0.4,  // andén BRT dedicado: ~24 seg por parada
  metro:      0.35,
  diametral:  1.5,
  radial:     1.8,
  periferica: 2.0,
  circular:   1.6,
};
// Bonus de score: refleja confort, puntualidad y ventaja de vía exclusiva
const SCORE_BONUS = { brt: 15, metro: 12 };

// ── Utilidades ────────────────────────────────────────────────────────────────
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, d2r = Math.PI / 180;
  const dLat = (lat2 - lat1) * d2r, dLng = (lng2 - lng1) * d2r;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*d2r)*Math.cos(lat2*d2r)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function walkMin(km) { return (km / WALK_KMH) * 60; }
export function getRoute(id) { return ROUTES.find(r => r.id === id); }

function estimateRideMin(routeId, fromId, toId) {
  const route = getRoute(routeId);
  if (!route || fromId === toId) return 0;
  const st = route.stations, s = Math.min(fromId, toId), e = Math.max(fromId, toId);
  let km = 0;
  for (let i = s; i < e; i++)
    km += haversineKm(st[i].lat, st[i].lng, st[i+1].lat, st[i+1].lng);
  const spd   = SPEED_BY_TYPE[route.type] || BUS_KMH;
  const dwell = DWELL_BY_TYPE[route.type] || DWELL_PER_STOP;
  return (km / spd) * 60 + Math.abs(toId - fromId) * dwell;
}

export function getAllStations() {
  const seen = new Set();
  const result = [];
  for (const route of ROUTES) {
    for (const st of route.stations) {
      const key = st.lat + ',' + st.lng;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ id: st.id, name: st.name, lat: st.lat, lng: st.lng, system: route.type || 'corredor' });
      }
    }
  }
  return result;
}

export function routeAllPoints(routeId) {
  const route = getRoute(routeId);
  if (!route) return [];
  return route.stations.map(st => [st.lat, st.lng]);
}

export function stationPoints(routeId, fromId, toId) {
  const route = getRoute(routeId);
  if (!route) return [];
  const s = Math.min(fromId, toId), e = Math.max(fromId, toId);
  return route.stations.slice(s, e + 1).map(st => ({ lat: st.lat, lng: st.lng }));
}

function nearestStationIndex(route, lat, lng) {
  let best = 0, bestD = Infinity;
  route.stations.forEach((st, i) => {
    const d = haversineKm(lat, lng, st.lat, st.lng);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

// ── Pre-calcular transbordos entre rutas (lazy, una sola vez) ─────────────────
let _transfers = null;
let _bboxes    = null;

function _buildBboxes() {
  if (_bboxes) return _bboxes;
  _bboxes = ROUTES.map(r => {
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const s of r.stations) {
      if (s.lat < minLat) minLat = s.lat;
      if (s.lat > maxLat) maxLat = s.lat;
      if (s.lng < minLng) minLng = s.lng;
      if (s.lng > maxLng) maxLng = s.lng;
    }
    return { minLat, maxLat, minLng, maxLng };
  });
  return _bboxes;
}

function buildTransfers() {
  if (_transfers) return _transfers;
  const bboxes = _buildBboxes();
  const BUF = 0.02; // ~2.2 km in degrees — larger than any MAX_TRANSFER value
  _transfers = [];
  for (let i = 0; i < ROUTES.length; i++) {
    for (let j = i + 1; j < ROUTES.length; j++) {
      const bA = bboxes[i], bB = bboxes[j];
      if (bA.maxLat + BUF < bB.minLat || bA.minLat - BUF > bB.maxLat) continue;
      if (bA.maxLng + BUF < bB.minLng || bA.minLng - BUF > bB.maxLng) continue;
      const rA = ROUTES[i], rB = ROUTES[j];
      const isBrt = (r) => r.type === 'brt' || r.type === 'metro';
      const maxTr = (isBrt(rA) || isBrt(rB)) ? MAX_TRANSFER_BRT : MAX_TRANSFER_KM;
      let bestDist = Infinity, bestPair = null;
      for (const stA of rA.stations) {
        for (const stB of rB.stations) {
          const d = haversineKm(stA.lat, stA.lng, stB.lat, stB.lng);
          if (d < maxTr && d < bestDist) {
            bestDist = d;
            bestPair = { rA: rA.id, stA: stA.id, rB: rB.id, stB: stB.id, walkKm: d };
          }
        }
      }
      if (bestPair) _transfers.push(bestPair);
    }
  }
  return _transfers;
}

// ── Llegadas proyectadas ───────────────────────────────────────────────────────
function projectedSecondsToBoard(bus, route, boardId, goFwd) {
  const N = route.stations.length;
  const boardSt = route.stations[boardId];
  const busGoFwd = bus.direction === 'N';
  const busIdx = nearestStationIndex(route, bus.lat, bus.lng);
  const travelSec = (km) => (km * 1.25 / BUS_KMH) * 3600;
  const curEndSt = busGoFwd ? route.stations[N - 1] : route.stations[0];
  const deptSt = goFwd ? route.stations[0] : route.stations[N - 1];
  const distToCurEnd = haversineKm(bus.lat, bus.lng, curEndSt.lat, curEndSt.lng);
  const distDeptToBoard = haversineKm(deptSt.lat, deptSt.lng, boardSt.lat, boardSt.lng);
  const dwellSec = bus.dwellRemaining || 0;
  if (busGoFwd === goFwd) {
    const notPassed = goFwd ? busIdx <= boardId : busIdx >= boardId;
    if (notPassed) {
      const dist = haversineKm(bus.lat, bus.lng, boardSt.lat, boardSt.lng);
      if (dist < 0.04) return dwellSec;
      return travelSec(dist) + dwellSec;
    }
    let fullKm = 0;
    for (let i = 0; i < N - 1; i++)
      fullKm += haversineKm(route.stations[i].lat, route.stations[i].lng, route.stations[i+1].lat, route.stations[i+1].lng);
    return travelSec(distToCurEnd) + travelSec(fullKm) + travelSec(distDeptToBoard);
  }
  return travelSec(distToCurEnd) + travelSec(distDeptToBoard);
}

export function getBusArrivals(buses, routeId, boardId, alightId, walkMinutes) {
  const route = getRoute(routeId);
  if (!route || !route.stations[boardId]) return [];
  const walkSec = (walkMinutes || 0) * 60;
  const goFwd = alightId > boardId;
  const N = route.stations.length;
  const endName = goFwd ? route.stations[N - 1].name : route.stations[0].name;
  const all = (buses || [])
    .filter(b => b.routeId === routeId)
    .map(b => {
      const rawSec = projectedSecondsToBoard(b, route, boardId, goFwd);
      const seconds = Math.max(5, Math.round(rawSec));
      return { busId: b.id, serviceCode: b.serviceCode, serviceLabel: b.serviceLabel || b.serviceCode,
               direction: endName, seconds, minutesAway: Math.round(seconds / 60),
               catchable: seconds >= walkSec };
    })
    .sort((a, b) => a.seconds - b.seconds);
  const passing = all.filter(b => !b.catchable).slice(0, 4);
  const catchable = all.filter(b => b.catchable).slice(0, 5);
  return [...passing, ...catchable].sort((a, b) => a.seconds - b.seconds);
}

// ── Estación más cercana por ruta ──────────────────────────────────────────────
function nearestPerRoute(lat, lng) {
  return ROUTES.map(route => {
    const isBrt = route.type === 'brt' || route.type === 'metro';
    const maxKm = isBrt ? MAX_WALK_BRT : MAX_WALK_KM;
    let best = null, bestD = Infinity;
    route.stations.forEach(st => {
      const d = haversineKm(lat, lng, st.lat, st.lng);
      if (d < bestD) { bestD = d; best = st; }
    });
    return bestD <= maxKm
      ? { routeId: route.id, routeName: route.name, routeColor: route.color,
          routeType: route.type, station: best, walkKm: bestD }
      : null;
  }).filter(Boolean).sort((a, b) => a.walkKm - b.walkKm);
}

function busTypeId(route) {
  if (!route) return 'omnibus';
  if (route.id === 'METRO')  return 'metropolitano';
  if (route.id === 'LINEA1') return 'linea1';
  if (route.id?.startsWith('C'))  return 'corredor';
  const c = (route.carroceria || '').toUpperCase();
  if (c.includes('MICRO'))   return 'microbus';
  if (c.includes('MINI'))    return 'minibus';
  return 'omnibus';
}

function makeBusLeg(routeId, routeName, routeColor, fromSt, toSt, walkMinToBoardin, buses) {
  const route    = getRoute(routeId);
  const rideMin  = estimateRideMin(routeId, fromSt.id, toSt.id);
  const arrivals = getBusArrivals(buses, routeId, fromSt.id, toSt.id, walkMinToBoardin);
  const points   = stationPoints(routeId, fromSt.id, toSt.id);
  return {
    type: 'bus', routeId, routeName, routeColor,
    fromStation: fromSt, toStation: toSt,
    stops: Math.abs(toSt.id - fromSt.id),
    rideMinutes: Math.round(rideMin),
    walkMinToBoard: Math.round(walkMinToBoardin),
    arrivals, catchable: arrivals.filter(a => a.catchable), mapPoints: points,
    operador:   route?.operador   || null,
    carroceria: route?.carroceria || null,
    busTypeId:  busTypeId(route),
  };
}

// ── Helpers de diversidad ──────────────────────────────────────────────────────
function getPrimaryKey(journey) {
  return journey.legs.filter(l => l.type === 'bus').map(l => l.routeId).join('+');
}

function labelAlternative(alt, isFirst) {
  if (isFirst) return 'Más rápida';
  const busLegs = alt.legs.filter(l => l.type === 'bus');
  const hasMetro  = busLegs.some(l => l.routeId === 'METRO' || l.busTypeId === 'metropolitano');
  const hasLinea1 = busLegs.some(l => l.routeId === 'LINEA1' || l.busTypeId === 'linea1');
  const hasBrt    = busLegs.some(l => l.busTypeId === 'brt' || l.routeType === 'brt');
  if (hasMetro)  return 'Con Metropolitano';
  if (hasLinea1) return 'Con Línea 1';
  if (hasBrt)    return 'Corredor exclusivo';
  if (alt.transfers === 0) return 'Sin transbordo';
  return 'Alternativa';
}

function pickDiverse(candidates, maxN) {
  if (!candidates.length) return [];
  const usedKeys = new Set();
  const result   = [];

  for (const c of candidates) {
    if (result.length >= maxN) break;
    const key = getPrimaryKey(c);
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    c.routeLabel = labelAlternative(c, result.length === 0);
    result.push(c);
  }
  return result;
}

// ── Planificador principal ─────────────────────────────────────────────────────
export function planJourney(fromLat, fromLng, toLat, toLng, buses) {
  const transfers = buildTransfers();
  const origins = nearestPerRoute(fromLat, fromLng);
  const dests   = nearestPerRoute(toLat, toLng);

  if (!origins.length || !dests.length) {
    return { error: 'No hay rutas ATU cerca de tu origen o destino. Intenta un punto dentro de Lima Metropolitana.' };
  }

  const candidates = [];

  function tryJourney(legs, totalMin, numTransfers) {
    // Bonus de score para BRT/Metro: penaliza menos en el ranking
    const bonus = legs.filter(l => l.type === 'bus').reduce((acc, l) => {
      const r = getRoute(l.routeId);
      return acc + (SCORE_BONUS[r?.type] || 0);
    }, 0);
    const scoredMin = totalMin - bonus;
    const clonedLegs = legs.map(l => ({ ...l }));
    // Enrich first walk leg with fromLat/fromLng
    const firstWalk = clonedLegs.find(l => l.type === 'walk');
    if (firstWalk && firstWalk.to !== 'Tu destino') {
      firstWalk.fromLat = fromLat;
      firstWalk.fromLng = fromLng;
    }
    // Enrich last walk leg with fromLat/fromLng from the last bus leg's toStation
    const lastBusIdx = clonedLegs.map(l => l.type).lastIndexOf('bus');
    if (lastBusIdx !== -1) {
      const lastBus = clonedLegs[lastBusIdx];
      const lastWalk = clonedLegs.slice(lastBusIdx + 1).find(l => l.type === 'walk');
      if (lastWalk) {
        lastWalk.fromLat = lastBus.toStation.lat;
        lastWalk.fromLng = lastBus.toStation.lng;
      }
    }
    candidates.push({
      totalMinutes: Math.round(totalMin),
      _scoredMinutes: scoredMin,
      transfers: numTransfers,
      legs: clonedLegs,
      mapSegments: clonedLegs.map(leg => ({
        type:      leg.type,
        color:     leg.type === 'walk' ? '#9ca3af' : leg.type === 'transfer' ? '#58a6ff' : leg.routeColor,
        dashed:    leg.type !== 'bus',
        points:    leg.mapPoints || [],
        label:     leg.routeName || '',
        fromLabel: leg.fromStation?.name || leg.to || '',
        toLabel:   leg.toStation?.name   || leg.to || '',
        routeId:   leg.type === 'bus' ? leg.routeId : null,
        fromLat:   leg.fromStation?.lat ?? leg.fromLat ?? null,
        fromLng:   leg.fromStation?.lng ?? leg.fromLng ?? null,
        toLat:     leg.toStation?.lat   ?? leg.toLat   ?? null,
        toLng:     leg.toStation?.lng   ?? leg.toLng   ?? null,
      })),
    });
  }

  // BRT/Metro siempre incluidos; completar con buses regulares más cercanos
  function buildTop(candidates, maxReg) {
    const brt = candidates.filter(r => r.routeType === 'brt' || r.routeType === 'metro');
    const reg = candidates.filter(r => r.routeType !== 'brt' && r.routeType !== 'metro').slice(0, maxReg);
    return [...brt, ...reg];
  }
  const TOP_O = buildTop(origins, 6);
  const TOP_D = buildTop(dests, 6);

  // ── Opción A: ruta directa ────────────────────────────────────────────────
  for (const o of TOP_O) {
    for (const d of TOP_D) {
      if (o.routeId !== d.routeId || o.station.id === d.station.id) continue;
      const wFrom  = walkMin(o.walkKm);
      const busLeg = makeBusLeg(o.routeId, o.routeName, o.routeColor, o.station, d.station, wFrom, buses);
      const bestBus = busLeg.catchable[0];
      const waitMin = bestBus ? bestBus.seconds / 60 : (busLeg.arrivals[0]?.seconds || 120) / 60;
      const wTo    = walkMin(d.walkKm);
      tryJourney([
        { type: 'walk', to: o.station.name, toLat: o.station.lat, toLng: o.station.lng,
          distKm: o.walkKm, minutes: Math.round(wFrom), mapPoints: [] },
        busLeg,
        { type: 'walk', to: 'Tu destino', toLat, toLng,
          distKm: d.walkKm, minutes: Math.round(wTo), mapPoints: [] },
      ], wFrom + waitMin + busLeg.rideMinutes + wTo, 0);
    }
  }

  // ── Opción B: un transbordo (auto-descubrimiento geográfico) ───────────────
  const originIds = new Set(TOP_O.map(o => o.routeId));
  const destIds   = new Set(TOP_D.map(d => d.routeId));
  const directDist = haversineKm(fromLat, fromLng, toLat, toLng);

  for (const tr of transfers) {
    const pairs = [];
    if (originIds.has(tr.rA) && destIds.has(tr.rB))
      pairs.push({ boarding: tr.rA, trStA: tr.stA, trStB: tr.stB, connecting: tr.rB, trWalk: tr.walkKm });
    if (originIds.has(tr.rB) && destIds.has(tr.rA))
      pairs.push({ boarding: tr.rB, trStA: tr.stB, trStB: tr.stA, connecting: tr.rA, trWalk: tr.walkKm });

    for (const p of pairs) {
      const rOrigin = getRoute(p.boarding);
      const rDest   = getRoute(p.connecting);
      if (!rOrigin || !rDest) continue;
      const o = TOP_O.find(x => x.routeId === p.boarding);
      const d = TOP_D.find(x => x.routeId === p.connecting);
      if (!o || !d) continue;
      const stTrA = rOrigin.stations[p.trStA];
      const stTrB = rDest.stations[p.trStB];
      if (!stTrA || !stTrB) continue;
      const dFromTransferToDest = haversineKm(stTrB.lat, stTrB.lng, d.station.lat, d.station.lng);
      if (dFromTransferToDest > directDist * 2.5) continue;

      const wFrom = walkMin(o.walkKm);
      const wTr   = walkMin(p.trWalk);
      const leg1  = makeBusLeg(p.boarding,   rOrigin.name, rOrigin.color, o.station, stTrA, wFrom, buses);
      const leg2  = makeBusLeg(p.connecting, rDest.name,   rDest.color,   stTrB, d.station, wTr, buses);
      const wait1 = leg1.catchable[0] ? leg1.catchable[0].seconds/60 : (leg1.arrivals[0]?.seconds||120)/60;
      const wait2 = leg2.catchable[0] ? leg2.catchable[0].seconds/60 : (leg2.arrivals[0]?.seconds||120)/60;
      const wTo   = walkMin(d.walkKm);
      const total = wFrom + wait1 + leg1.rideMinutes + wTr + wait2 + leg2.rideMinutes + wTo;

      tryJourney([
        { type: 'walk', to: o.station.name, toLat: o.station.lat, toLng: o.station.lng,
          distKm: o.walkKm, minutes: Math.round(wFrom), mapPoints: [] },
        leg1,
        { type: 'transfer', from: stTrA.name, to: stTrB.name,
          fromLat: stTrA.lat, fromLng: stTrA.lng, toLat: stTrB.lat, toLng: stTrB.lng,
          walkKm: p.trWalk, minutes: Math.max(1, Math.round(wTr)),
          mapPoints: [{ lat: stTrA.lat, lng: stTrA.lng }, { lat: stTrB.lat, lng: stTrB.lng }] },
        leg2,
        { type: 'walk', to: 'Tu destino', toLat, toLng,
          distKm: d.walkKm, minutes: Math.round(wTo), mapPoints: [] },
      ], total, 1);
    }
  }

  if (!candidates.length) {
    const o = origins[0];
    return { error: `La parada más cercana es "${o.station.name}" (${(o.walkKm*1000).toFixed(0)} m). No se encontró ruta hacia ese destino.` };
  }

  candidates.sort((a, b) => a._scoredMinutes - b._scoredMinutes);
  return { alternatives: pickDiverse(candidates, 3) };
}
