const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || 'REPLACE_WITH_GOOGLE_MAPS_API_KEY';
const BASE = 'https://maps.googleapis.com/maps/api';

// Busca lugares en Lima según texto escrito
export async function searchPlaces(query, userLat, userLng) {
  if (!query || query.length < 2) return [];
  const loc  = userLat ? `&location=${userLat},${userLng}&radius=40000` : '';
  const url  = `${BASE}/place/autocomplete/json?input=${encodeURIComponent(query)}${loc}&language=es&components=country:pe&key=${KEY}`;
  const r    = await fetch(url);
  const data = await r.json();
  return (data.predictions || []).slice(0, 5);
}

// Obtiene coordenadas de un place_id
export async function getPlaceCoords(placeId) {
  const url  = `${BASE}/place/details/json?place_id=${placeId}&fields=geometry,name,formatted_address&key=${KEY}`;
  const r    = await fetch(url);
  const data = await r.json();
  const loc  = data.result?.geometry?.location;
  return loc ? { lat: loc.lat, lng: loc.lng, name: data.result.formatted_address } : null;
}

// Ruta en transporte público (Google Transit)
export async function getTransitRoute(fromLat, fromLng, toLat, toLng) {
  const url  = `${BASE}/directions/json?origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&mode=transit&transit_mode=bus&language=es&region=pe&key=${KEY}`;
  const r    = await fetch(url);
  const data = await r.json();
  if (data.status !== 'OK' || !data.routes?.length) return null;
  const result = parseDirections(data.routes[0]);
  result.polyline = data.routes[0].overview_polyline?.points || '';
  return result;
}

// URL de mapa estático con ruta dibujada
export function staticMapUrl(fromLat, fromLng, toLat, toLng, polyline, width = 600, height = 280) {
  const path   = polyline ? `&path=color:0x00AEEFcc|weight:4|enc:${encodeURIComponent(polyline)}` : '';
  const origin = `&markers=color:0x003087|label:A|${fromLat},${fromLng}`;
  const dest   = `&markers=color:0xFF4444|label:B|${toLat},${toLng}`;
  const style  = [
    '&style=element:geometry|color:0x0d1117',
    '&style=element:labels.text.fill|color:0x8b949e',
    '&style=element:labels.text.stroke|color:0x0d1117',
    '&style=feature:road|element:geometry|color:0x21262d',
    '&style=feature:road.arterial|element:geometry|color:0x161b22',
    '&style=feature:water|element:geometry|color:0x001a52',
  ].join('');
  return `${BASE}/staticmap?size=${width}x${height}&scale=2${path}${origin}${dest}${style}&key=${KEY}`;
}

// Ruta caminando — devuelve también el polyline para el mapa
export async function getWalkingRoute(fromLat, fromLng, toLat, toLng) {
  const url  = `${BASE}/directions/json?origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&mode=walking&language=es&key=${KEY}`;
  const r    = await fetch(url);
  const data = await r.json();
  if (data.status !== 'OK' || !data.routes?.length) return null;
  const leg = data.routes[0].legs[0];
  return {
    durationText: leg.duration.text,
    durationSec:  leg.duration.value,
    distanceText: leg.distance.text,
    polyline:     data.routes[0].overview_polyline?.points || '',
  };
}

// Tiempo y distancia en auto (para estimar taxi)
export async function getTaxiEstimate(fromLat, fromLng, toLat, toLng) {
  const url  = `${BASE}/distancematrix/json?origins=${fromLat},${fromLng}&destinations=${toLat},${toLng}&mode=driving&language=es&key=${KEY}`;
  const r    = await fetch(url);
  const data = await r.json();
  const el   = data.rows?.[0]?.elements?.[0];
  if (!el || el.status !== 'OK') return null;
  const distKm  = el.distance.value / 1000;
  const costMin = Math.round(4 + distKm * 1.5);
  const costMax = Math.round(4 + distKm * 2.2);
  return {
    durationText: el.duration.text,
    durationSec:  el.duration.value,
    distanceText: el.distance.text,
    distKm,
    costMin, costMax,
    costText: `S/ ${costMin}–${costMax}`,
  };
}

// ── Parser de respuesta Directions ────────────────────────────────────────────

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}

// Asigna color según nombre de línea de tránsito
function lineColor(lineName, vehicleType) {
  const n = (lineName || '').toUpperCase();
  if (n.includes('METROPOLITANO') || n.includes('METRO')) return '#f0a500';
  if (n.includes('AZUL')   || n.includes('301') || n.includes('303')) return '#1a73e8';
  if (n.includes('ROJO')   || n.includes('201') || n.includes('204')) return '#e53935';
  if (n.includes('MORADO') || n.includes('404') || n.includes('405')) return '#8e24aa';
  if (n.includes('ALIM')   || n.includes('A0')  || n.includes('S0'))  return '#00897b';
  if (vehicleType === 'SUBWAY') return '#f0a500';
  return '#00AEEF';
}

function parseDirections(route) {
  const leg   = route.legs[0];
  const steps = leg.steps.map(step => {
    const base = {
      mode:         step.travel_mode,
      durationText: step.duration.text,
      durationSec:  step.duration.value,
      distanceText: step.distance.text,
      instruction:  stripHtml(step.html_instructions),
      startLat:     step.start_location.lat,
      startLng:     step.start_location.lng,
      endLat:       step.end_location.lat,
      endLng:       step.end_location.lng,
      polyline:     step.polyline?.points || '',
      color:        '#9ca3af',
      dashed:       true,
    };
    if (step.travel_mode === 'TRANSIT') {
      const td      = step.transit_details;
      const vType   = td.line?.vehicle?.type || 'BUS';
      const lName   = td.line?.name || td.line?.short_name || '—';
      const color   = lineColor(lName, vType);
      return {
        ...base,
        color,
        dashed:        false,
        lineName:      lName,
        lineShort:     td.line?.short_name  || td.line?.name || '—',
        vehicleType:   vType,
        departureStop: td.departure_stop?.name || '',
        departureLat:  td.departure_stop?.location?.lat || step.start_location.lat,
        departureLng:  td.departure_stop?.location?.lng || step.start_location.lng,
        arrivalStop:   td.arrival_stop?.name   || '',
        arrivalLat:    td.arrival_stop?.location?.lat  || step.end_location.lat,
        arrivalLng:    td.arrival_stop?.location?.lng  || step.end_location.lng,
        numStops:      td.num_stops || 1,
        departureTime: td.departure_time?.text || '',
      };
    }
    return base;
  });

  return {
    totalDurationText: leg.duration.text,
    totalDurationSec:  leg.duration.value,
    totalDistanceText: leg.distance.text,
    arrivalTime:       leg.arrival_time?.text || '',
    steps,
  };
}
