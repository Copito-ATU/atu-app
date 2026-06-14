import React, { useMemo, useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

// liveBuses:    [{ id, lat, lng, direction, routeColor, catchable }]
// incidents:    [{ id, lat, lng, type, severity, description }]
// routesGeo:    [{ id, code, latlngs, color, tipo, interval, fleet }]
// stations:     [{ id, name, lat, lng, system, demand }]
// tambos:       [{ id, lat, lng, name, address }]
// liveUserLat/Lng: live GPS position (injected via JS, does NOT rebuild HTML)
export default function RouteMapView({ segments, fromLat, fromLng, toLat, toLng, liveBuses, incidents, routesGeo, stations, tambos, liveUserLat, liveUserLng, trafficCode }) {
  const webRef       = useRef(null);
  const liveBusesRef = useRef(liveBuses);
  const incidentsRef = useRef(incidents);
  const routesRef    = useRef(routesGeo);
  const stationsRef  = useRef(stations);
  const tambosRef    = useRef(tambos);

  const html = useMemo(
    () => buildHtml(segments, fromLat, fromLng, toLat, toLng, trafficCode),
    [segments, fromLat, fromLng, toLat, toLng, trafficCode]
  );

  useEffect(() => {
    liveBusesRef.current = liveBuses;
    if (!webRef.current || !liveBuses) return;
    webRef.current.injectJavaScript(
      `if(typeof updateLiveBuses==='function'){updateLiveBuses(${JSON.stringify(liveBuses)});}true;`
    );
  }, [liveBuses]);

  useEffect(() => {
    incidentsRef.current = incidents;
    if (!webRef.current || !incidents) return;
    webRef.current.injectJavaScript(
      `if(typeof updateIncidents==='function'){updateIncidents(${JSON.stringify(incidents)});}true;`
    );
  }, [incidents]);

  useEffect(() => {
    routesRef.current = routesGeo;
    if (!webRef.current || !routesGeo?.length) return;
    webRef.current.injectJavaScript(
      `if(typeof loadRoutesGeo==='function'){loadRoutesGeo(${JSON.stringify(routesGeo)});}true;`
    );
  }, [routesGeo]);

  useEffect(() => {
    stationsRef.current = stations;
    if (!webRef.current || !stations?.length) return;
    webRef.current.injectJavaScript(
      `if(typeof loadStations==='function'){loadStations(${JSON.stringify(stations)});}true;`
    );
  }, [stations]);

  useEffect(() => {
    tambosRef.current = tambos;
    if (!webRef.current || !tambos?.length) return;
    webRef.current.injectJavaScript(
      `if(typeof loadTambos==='function'){loadTambos(${JSON.stringify(tambos)});}true;`
    );
  }, [tambos]);

  useEffect(() => {
    if (!webRef.current || liveUserLat == null) return;
    webRef.current.injectJavaScript(
      `if(typeof updateUserPos==='function'){updateUserPos(${liveUserLat},${liveUserLng});}true;`
    );
  }, [liveUserLat, liveUserLng]);

  function onMapReady() {
    if (liveBusesRef.current?.length)
      webRef.current?.injectJavaScript(
        `if(typeof updateLiveBuses==='function'){updateLiveBuses(${JSON.stringify(liveBusesRef.current)});}true;`
      );
    if (incidentsRef.current?.length)
      webRef.current?.injectJavaScript(
        `if(typeof updateIncidents==='function'){updateIncidents(${JSON.stringify(incidentsRef.current)});}true;`
      );
    if (routesRef.current?.length)
      webRef.current?.injectJavaScript(
        `if(typeof loadRoutesGeo==='function'){loadRoutesGeo(${JSON.stringify(routesRef.current)});}true;`
      );
    if (stationsRef.current?.length)
      webRef.current?.injectJavaScript(
        `if(typeof loadStations==='function'){loadStations(${JSON.stringify(stationsRef.current)});}true;`
      );
    if (tambosRef.current?.length)
      webRef.current?.injectJavaScript(
        `if(typeof loadTambos==='function'){loadTambos(${JSON.stringify(tambosRef.current)});}true;`
      );
  }

  function centerRoute() {
    webRef.current?.injectJavaScript('if(typeof centerRoute==="function"){centerRoute();}true;');
  }

  return (
    <View style={s.wrap}>
      <WebView
        ref={webRef}
        source={{ html }}
        style={s.map}
        scrollEnabled={false}
        javaScriptEnabled
        originWhitelist={['*']}
        mixedContentMode="always"
        onLoadEnd={onMapReady}
      />
      <TouchableOpacity style={s.centerFab} onPress={centerRoute} activeOpacity={0.75}>
        <Ionicons name="locate" size={20} color="#1668AD" />
      </TouchableOpacity>
    </View>
  );
}

function buildHtml(segments, fromLat, fromLng, toLat, toLng, trafficCode) {
  const payload = JSON.stringify({ segments: segments || [], fromLat, fromLng, toLat, toLng });

  // Color de sombra del polyline según nivel de tráfico
  const trafficShadow = {
    peak:   'rgba(239,68,68,0.32)',
    high:   'rgba(245,158,11,0.28)',
    normal: 'rgba(0,0,0,0.12)',
    low:    'rgba(34,197,94,0.20)',
  }[trafficCode] || 'rgba(0,0,0,0.12)';

  const trafficBadge = {
    peak:   { bg: '#fef2f2', color: '#ef4444', icon: '🔴', label: 'Hora pico' },
    high:   { bg: '#fff8ed', color: '#f59e0b', icon: '🟡', label: 'Flujo alto' },
    normal: { bg: '#f0fdf4', color: '#22c55e', icon: '🟢', label: 'Flujo normal' },
    low:    { bg: '#eff6ff', color: '#3b82f6', icon: '🔵', label: 'Flujo bajo' },
  }[trafficCode] || null;

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body,#map { width:100%; height:100%; background:#e8e4dc; }
  .leaflet-container { background:#e8e4dc; }
  .stop-lbl {
    background:transparent; border:none;
    font-size:11px; font-weight:700; font-family:sans-serif;
    color:#1a2744; white-space:nowrap;
    text-shadow:0 1px 2px rgba(255,255,255,0.9), 0 0 5px rgba(255,255,255,0.6);
  }
  @keyframes board-pulse {
    0%   { transform:scale(1);   opacity:0.7; }
    60%  { transform:scale(2.6); opacity:0; }
    100% { transform:scale(2.6); opacity:0; }
  }
  .board-pulse { animation:board-pulse 2s ease-out infinite; border-radius:50%; position:absolute; width:100%; height:100%; top:0; left:0; }

  @keyframes traffic-pulse {
    0%,100% { stroke-opacity:0.75; }
    50%     { stroke-opacity:0.18; }
  }
  @keyframes traffic-flow {
    to { stroke-dashoffset:-22; }
  }
  @keyframes approach-flow {
    to { stroke-dashoffset:-28; }
  }
</style>
</head>
<body><div id="map"></div>
<script>
function decodePoly(str) {
  var idx=0,lat=0,lng=0,res=[];
  while(idx<str.length){
    var b,shift=0,result=0;
    do{b=str.charCodeAt(idx++)-63;result|=(b&0x1f)<<shift;shift+=5;}while(b>=0x20);
    lat+=(result&1)?~(result>>1):(result>>1);
    shift=0;result=0;
    do{b=str.charCodeAt(idx++)-63;result|=(b&0x1f)<<shift;shift+=5;}while(b>=0x20);
    lng+=(result&1)?~(result>>1):(result>>1);
    res.push([lat/1e5,lng/1e5]);
  }
  return res;
}

var d = ${payload};
var map = L.map('map',{zoomControl:false,attributionControl:false});
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{
  maxZoom:22, maxNativeZoom:19, subdomains:'abcd'
}).addTo(map);

var bounds = [];

function closestIdx(latlngs, lat, lng) {
  var best = 0, bestD = Infinity;
  for (var i = 0; i < latlngs.length; i++) {
    var dlat = latlngs[i][0] - lat, dlng = latlngs[i][1] - lng;
    var d = dlat * dlat + dlng * dlng;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// Index bus segments by routeId so updateLiveBuses can draw approach lines
var busRouteMap = {};
(d.segments||[]).forEach(function(seg){
  if (!seg.dashed && seg.routeId && seg.fromLat != null) {
    busRouteMap[seg.routeId] = {
      color:      seg.color || '#1668AD',
      boardLat:   seg.fromLat, boardLng: seg.fromLng,
      alightLat:  seg.toLat,   alightLng: seg.toLng,
      latlngs:    seg.routeLatlngs || [],
    };
  }
});

function mkBoardIcon(color) {
  return L.divIcon({
    className:'', iconSize:[22,32], iconAnchor:[11,32],
    html:'<div style="display:flex;flex-direction:column;align-items:center;gap:0">'+
         '<div style="background:'+color+';color:#fff;font-size:13px;font-weight:900;'+
         'width:22px;height:20px;border-radius:5px;border:2px solid #fff;'+
         'display:flex;align-items:center;justify-content:center;'+
         'box-shadow:0 2px 8px rgba(0,0,0,0.35)">🚏</div>'+
         '<div style="width:2px;height:10px;background:'+color+';opacity:0.7"></div>'+
         '</div>'
  });
}
function mkAlightIcon(color) {
  return L.divIcon({
    className:'', iconSize:[22,32], iconAnchor:[11,32],
    html:'<div style="display:flex;flex-direction:column;align-items:center;gap:0">'+
         '<div style="background:'+color+';color:#fff;font-size:13px;font-weight:900;'+
         'width:22px;height:20px;border-radius:5px;border:2px solid #fff;'+
         'display:flex;align-items:center;justify-content:center;'+
         'box-shadow:0 2px 8px rgba(0,0,0,0.35)">🏁</div>'+
         '<div style="width:2px;height:10px;background:'+color+';opacity:0.7"></div>'+
         '</div>'
  });
}

(d.segments||[]).forEach(function(seg){
  var pts = [];

  if (seg.polyline && seg.polyline.length > 0) {
    pts = decodePoly(seg.polyline);
  } else if (seg.points && seg.points.length > 0) {
    pts = seg.points.map(function(p){ return [p.lat, p.lng]; });
  } else if (seg.fromLat != null && seg.toLat != null) {
    pts = [[seg.fromLat, seg.fromLng], [seg.toLat, seg.toLng]];
  }

  if (!pts.length) return;
  pts.forEach(function(p){ bounds.push(p); });

  var color   = seg.color || '#9ca3af';
  var dashed  = seg.dashed !== false;

  if (dashed) {
    L.polyline(pts, {
      color: color, weight: 3, opacity: 0.7,
      dashArray: '6, 8'
    }).addTo(map);
    if (seg.type === 'walk') {
      for(var i=0;i<pts.length;i+=Math.max(1,Math.floor(pts.length/5))){
        L.circleMarker(pts[i],{radius:3,fillColor:color,color:'#fff',fillOpacity:1,weight:1}).addTo(map);
      }
    }
  } else {
    // Sombra con color de tráfico
    var shadow = L.polyline(pts, {color:'${trafficShadow}',weight:9,opacity:1});
    shadow.addTo(map);
    var shadowEl = shadow.getElement && shadow.getElement();
    if (shadowEl) {
      ${trafficCode === 'peak'
        ? "shadowEl.style.animation = 'traffic-pulse 1.3s ease-in-out infinite';"
        : trafficCode === 'high'
        ? "shadowEl.style.animation = 'traffic-pulse 2s ease-in-out infinite';"
        : '// sin animación en tráfico bajo'}
    }

    // Línea de ruta con su color original
    L.polyline(pts, {color:color,weight:5,opacity:0.95}).addTo(map);

    // Overlay de flujo de tráfico (solo en hora pico o flujo alto)
    ${trafficCode === 'peak' || trafficCode === 'high' ? `
    var flowColor = '${trafficCode === 'peak' ? '#ef4444' : '#f59e0b'}';
    var flowLine = L.polyline(pts, {
      color: flowColor, weight: 4, opacity: 0.7,
      dashArray: '12, 9',
    });
    flowLine.addTo(map);
    var flowEl = flowLine.getElement && flowLine.getElement();
    if (flowEl) flowEl.style.animation = 'traffic-flow ${trafficCode === 'peak' ? '0.7s' : '1.1s'} linear infinite';
    ` : '// sin overlay de flujo'}

    if (seg.fromLat != null) {
      L.marker([seg.fromLat,seg.fromLng],{icon:mkBoardIcon(color)})
        .bindTooltip(seg.fromLabel||'',{className:'stop-lbl',direction:'top',offset:[0,-32]})
        .addTo(map);
    }
    if (seg.toLat != null) {
      L.marker([seg.toLat,seg.toLng],{icon:mkAlightIcon(color)})
        .bindTooltip(seg.toLabel||'',{className:'stop-lbl',direction:'top',offset:[0,-32]})
        .addTo(map);
    }
    if (seg.label) {
      var mid = pts[Math.floor(pts.length/2)];
      // Show only the route code: last word if multi-word (e.g. "Corredor C101" → "C101")
      var shortLabel = seg.label.trim().split(/\s+/).pop();
      L.marker(mid,{
        icon: L.divIcon({
          className:'',
          html:'<div style="background:'+color+';color:#fff;font-size:10px;font-weight:800;'+
               'padding:2px 6px;border-radius:6px;white-space:nowrap;'+
               'box-shadow:0 1px 4px rgba(0,0,0,0.2);font-family:sans-serif">'+shortLabel+'</div>',
          iconAnchor:[0,0]
        }),
        interactive:false
      }).addTo(map);
    }

    // Pulsing ring at board stop so catchable buses can "aim" for it
    if (seg.fromLat != null) {
      L.marker([seg.fromLat, seg.fromLng], {
        icon: L.divIcon({
          className:'',
          iconSize:[36,36], iconAnchor:[18,18],
          html:'<div style="position:relative;width:36px;height:36px">'+
               '<div class="board-pulse" style="background:'+color+';opacity:0.35"></div>'+
               '</div>'
        }),
        zIndexOffset:-200, interactive:false
      }).addTo(map);
    }
  }
});

// Origin marker — only when coords are valid
if (d.fromLat != null && d.fromLng != null) {
  bounds.push([d.fromLat,d.fromLng]);
  L.marker([d.fromLat,d.fromLng],{
    zIndexOffset: 2000,
    icon:L.divIcon({
      className:'',iconSize:[40,48],iconAnchor:[20,48],
      html:'<div style="display:flex;flex-direction:column;align-items:center">'+
           '<div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center">'+
           '<div style="position:absolute;width:40px;height:40px;border-radius:50%;background:#1668AD;opacity:0.18;animation:board-pulse 2s ease-out infinite"></div>'+
           '<div style="width:30px;height:30px;background:#1668AD;border-radius:50%;'+
           'border:3px solid #fff;box-shadow:0 3px 12px rgba(22,104,173,0.55);'+
           'display:flex;align-items:center;justify-content:center;position:relative;z-index:1">'+
           '<div style="font-size:16px;line-height:1">🧍</div>'+
           '</div>'+
           '</div>'+
           '<div style="width:2px;height:10px;background:#1668AD;opacity:0.7"></div>'+
           '</div>'
    })
  }).bindTooltip('Tu ubicación',{className:'stop-lbl',direction:'top',permanent:false}).addTo(map);
}

// Destination marker — only when coords are valid
if (d.toLat != null && d.toLng != null) {
  bounds.push([d.toLat,d.toLng]);
  L.marker([d.toLat,d.toLng],{
    icon:L.divIcon({
      className:'',iconSize:[36,44],iconAnchor:[18,44],
      html:'<div style="display:flex;flex-direction:column;align-items:center">'+
           '<div style="width:34px;height:34px;background:#e53935;border-radius:50%;'+
           'border:3px solid #fff;box-shadow:0 3px 10px rgba(229,57,53,0.5);'+
           'display:flex;align-items:center;justify-content:center;">'+
           '<div style="width:12px;height:12px;background:#fff;border-radius:50%"></div>'+
           '</div>'+
           '<div style="width:2px;height:10px;background:#e53935;opacity:0.7"></div>'+
           '</div>'
    })
  }).bindTooltip('Destino',{className:'stop-lbl',direction:'top',permanent:false}).addTo(map);
}

var validFrom = d.fromLat != null && d.fromLng != null;

// Paradas clave del viaje (para auto-centrado progresivo)
var journeyStops = [];
(d.segments||[]).forEach(function(seg){
  if (!seg.dashed) {
    if (seg.fromLat != null) journeyStops.push({lat:seg.fromLat, lng:seg.fromLng, type:'board'});
    if (seg.toLat   != null) journeyStops.push({lat:seg.toLat,   lng:seg.toLng,   type:'alight'});
  }
});
if (d.toLat != null) journeyStops.push({lat:d.toLat, lng:d.toLng, type:'dest'});

// Vista inicial inteligente: origen → primera parada de embarque
var firstBoard = (d.segments||[]).find(function(s){ return !s.dashed && s.fromLat != null; });
if (firstBoard && validFrom) {
  map.fitBounds([[d.fromLat,d.fromLng],[firstBoard.fromLat,firstBoard.fromLng]],{padding:[90,90],maxZoom:15});
} else if (bounds.length > 1) {
  map.fitBounds(bounds,{padding:[48,48],maxZoom:14});
} else if (validFrom) {
  map.setView([d.fromLat,d.fromLng],15);
}

// Centrar ruta completa (botón locate)
window.centerRoute = function() {
  try {
    if (bounds.length > 1) {
      map.fitBounds(bounds,{padding:[48,48],maxZoom:14});
    } else if (d.fromLat != null) {
      map.setView([d.fromLat,d.fromLng],13);
    }
  } catch(e) {}
};

// Auto-centrado progresivo según posición del usuario
var _lastStopIdx = 0;
window.updateUserPos = function(lat, lng) {
  if (!journeyStops.length) return;

  // Encuentra la parada más cercana al usuario
  var minD = Infinity, nearIdx = 0;
  for (var i = 0; i < journeyStops.length; i++) {
    var dlat = journeyStops[i].lat - lat;
    var dlng = journeyStops[i].lng - lng;
    var d2 = dlat*dlat + dlng*dlng;
    if (d2 < minD) { minD = d2; nearIdx = i; }
  }

  // Distancia en metros a la parada más cercana
  var nearSt = journeyStops[nearIdx];
  var distM  = Math.sqrt(
    Math.pow((nearSt.lat - lat) * 111000, 2) +
    Math.pow((nearSt.lng - lng) * 85000,  2)
  );

  // Avanza el índice si el usuario llegó a la parada (< 120 m)
  if (distM < 120 && nearIdx >= _lastStopIdx) {
    _lastStopIdx = Math.min(nearIdx + 1, journeyStops.length - 1);
  }

  // Próxima parada objetivo
  var targetSt = journeyStops[_lastStopIdx];
  try {
    map.fitBounds(
      [[lat, lng], [targetSt.lat, targetSt.lng]],
      {padding:[90,90], maxZoom:15, animate:true, duration:0.6}
    );
  } catch(e) {}
};

// ── Buses en vivo ────────────────────────────────────────────────────────
var liveMarkers   = {};
var approachLines = {};  // busId → L.polyline (dashed line bus→board stop)
var prevPos       = {};  // busId → {lat, lng}  (last known position)
var busRotations  = {};  // busId → bearing degrees (persisted between updates)

// Fallback compass strings → degrees
var DIR_DEG = {
  N:0, NNE:22, NE:45, ENE:67,
  E:90, ESE:112, SE:135, SSE:157,
  S:180, SSW:202, SW:225, WSW:247,
  W:270, WNW:292, NW:315, NNW:337
};

// Returns true bearing (0–360°) from point A to point B
function calcBearing(lat1, lng1, lat2, lng2) {
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var rlat1 = lat1 * Math.PI / 180;
  var rlat2 = lat2 * Math.PI / 180;
  var y = Math.sin(dLng) * Math.cos(rlat2);
  var x = Math.cos(rlat1) * Math.sin(rlat2) - Math.sin(rlat1) * Math.cos(rlat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// Finds nearest point on latlngs array then returns bearing to the next point
// goForward=true → toward end of route; false → toward start
function routeBearing(latlngs, busLat, busLng, goForward) {
  var minD = Infinity, idx = 0;
  for (var i = 0; i < latlngs.length; i++) {
    var d = (latlngs[i][0] - busLat) * (latlngs[i][0] - busLat) +
            (latlngs[i][1] - busLng) * (latlngs[i][1] - busLng);
    if (d < minD) { minD = d; idx = i; }
  }
  var next = goForward
    ? Math.min(idx + 1, latlngs.length - 1)
    : Math.max(idx - 1, 0);
  if (next === idx) return goForward ? 0 : 180;
  return calcBearing(latlngs[idx][0], latlngs[idx][1], latlngs[next][0], latlngs[next][1]);
}

function busIcon(color, dir, catchable, bearing) {
  var rot = (bearing !== undefined && bearing !== null)
    ? bearing
    : (DIR_DEG[dir] !== undefined ? DIR_DEG[dir] : 90);
  var c  = catchable !== false ? '#1e2329' : '#777';
  var op = catchable !== false ? '1' : '0.45';
  var shadow = catchable !== false
    ? 'drop-shadow(0 3px 8px rgba(0,0,0,0.55)) drop-shadow(0 1px 2px rgba(0,0,0,0.3))'
    : 'drop-shadow(0 1px 3px rgba(0,0,0,0.2))';
  // Bus SVG naturally faces RIGHT — mirror when going leftward
  var flip = (rot > 180 && rot <= 360) ? 'scaleX(-1)' : 'scaleX(1)';

  // Bus faces RIGHT: windshield on right, rear window on left
  var svg =
    '<svg width="34" height="22" viewBox="0 0 44 28" xmlns="http://www.w3.org/2000/svg">' +
    '<rect x="1" y="2" width="42" height="20" rx="6" fill="' + c + '"/>' +
    '<rect x="1" y="2" width="42" height="20" rx="6" fill="none"' +
    '  stroke="rgba(255,255,255,0.15)" stroke-width="1"/>' +
    '<rect x="3" y="5" width="9" height="14" rx="2" fill="rgba(195,220,240,0.72)"/>' +
    '<path d="M14,5 L39,5 L40,7 L40,17 Q40,19 38,19 L16,19 Q14,19 14,17 L14,5Z"' +
    '  fill="rgba(195,220,240,0.82)"/>' +
    '<rect x="1" y="2" width="42" height="5" rx="6" fill="rgba(255,255,255,0.06)"/>' +
    '<circle cx="11" cy="25" r="4.2" fill="#111" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/>' +
    '<circle cx="11" cy="25" r="1.8" fill="rgba(255,255,255,0.15)"/>' +
    '<circle cx="33" cy="25" r="4.2" fill="#111" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/>' +
    '<circle cx="33" cy="25" r="1.8" fill="rgba(255,255,255,0.15)"/>' +
    (catchable !== false
      ? '<circle cx="22" cy="12" r="2.8" fill="rgba(0,0,0,0.3)"/>' +
        '<circle cx="22" cy="12" r="2" fill="#22c55e" stroke="rgba(255,255,255,0.9)" stroke-width="1"/>'
      : '') +
    '</svg>';

  return L.divIcon({
    className:  '',
    iconSize:   [34, 22],
    iconAnchor: [17, 11],
    html: '<div style="transform:' + flip + ';filter:' + shadow + ';opacity:' + op + ';display:inline-block">' + svg + '</div>'
  });
}

function updateLiveBuses(buses) {
  var seen = {};

  // Paso 1: encontrar el bus catchable más lejano por ruta+dirección (el "último" en la cola)
  // Clave = routeId:dirección para que N y S tengan líneas separadas
  var furthestByRoute = {};
  buses.forEach(function(b) {
    var catchable = b.catchable !== undefined ? b.catchable : true;
    if (!catchable || !b.routeId) return;
    var rseg = busRouteMap[b.routeId];
    if (!rseg) return;
    var key = b.routeId + ':' + (b.direction || 'N');
    var rll = rseg.latlngs;
    var score;
    if (rll && rll.length > 2) {
      var bi = closestIdx(rll, b.lat, b.lng);
      var pi = closestIdx(rll, rseg.boardLat, rseg.boardLng);
      score = Math.abs(bi - pi);
    } else {
      var dlat = b.lat - rseg.boardLat, dlng = b.lng - rseg.boardLng;
      score = dlat * dlat + dlng * dlng;
    }
    if (!furthestByRoute[key] || score > furthestByRoute[key].score) {
      furthestByRoute[key] = { b: b, score: score };
    }
  });

  // Paso 2: actualizar marcadores de buses (todos)
  buses.forEach(function(b) {
    seen[b.id] = true;
    var catchable = b.catchable !== undefined ? b.catchable : true;
    var color = b.routeColor || '#1668AD';

    var prev = prevPos[b.id];
    if (prev) {
      var dlat = b.lat - prev.lat, dlng = b.lng - prev.lng;
      if (Math.abs(dlat) > 0.000005 || Math.abs(dlng) > 0.000005) {
        busRotations[b.id] = calcBearing(prev.lat, prev.lng, b.lat, b.lng);
      }
    }
    prevPos[b.id] = { lat: b.lat, lng: b.lng };

    if (busRotations[b.id] === undefined) {
      var rll = routeLatLngs[b.routeId];
      if (rll && rll.length > 1) {
        busRotations[b.id] = routeBearing(rll, b.lat, b.lng, b.direction !== 'S');
      }
    }

    var bearing = busRotations[b.id] !== undefined ? busRotations[b.id] : null;
    var icon = busIcon(color, b.direction, catchable, bearing);
    if (liveMarkers[b.id]) {
      liveMarkers[b.id].setLatLng([b.lat, b.lng]);
      liveMarkers[b.id].setIcon(icon);
      liveMarkers[b.id].setZIndexOffset(catchable ? 500 : 50);
    } else {
      liveMarkers[b.id] = L.marker([b.lat, b.lng], {
        icon: icon, zIndexOffset: catchable ? 500 : 50
      }).addTo(map);
    }
  });

  // Paso 3: una sola línea de aproximación por ruta+dirección (desde el bus más lejano)
  var seenRoutes = {};
  Object.keys(furthestByRoute).forEach(function(key) {
    seenRoutes[key] = true;
    var b    = furthestByRoute[key].b;
    var rseg = busRouteMap[b.routeId];
    var apt;
    var rll = rseg.latlngs;
    if (rll && rll.length > 2) {
      var busIdx   = closestIdx(rll, b.lat, b.lng);
      var boardIdx = closestIdx(rll, rseg.boardLat, rseg.boardLng);
      if (busIdx !== boardIdx) {
        apt = busIdx < boardIdx
          ? rll.slice(busIdx, boardIdx + 1)
          : rll.slice(boardIdx, busIdx + 1).reverse();
      } else {
        apt = [[b.lat, b.lng], [rseg.boardLat, rseg.boardLng]];
      }
    } else {
      apt = [[b.lat, b.lng], [rseg.boardLat, rseg.boardLng]];
    }
    if (approachLines[key]) {
      approachLines[key].setLatLngs(apt);
    } else {
      approachLines[key] = L.polyline(apt, {
        color: '#9AA4B5', weight: 3, opacity: 0.72,
        dashArray: '8, 12', lineJoin: 'round', lineCap: 'round',
      }).addTo(map);
      approachLines[key].bringToBack();
      var _ap = approachLines[key];
      setTimeout(function() {
        var el = _ap.getElement && _ap.getElement();
        if (el) el.style.animation = 'approach-flow 1s linear infinite';
      }, 60);
    }
  });

  // Limpiar marcadores y líneas de rutas que ya no están
  Object.keys(liveMarkers).forEach(function(id) {
    if (!seen[id]) {
      map.removeLayer(liveMarkers[id]);
      delete liveMarkers[id];
      delete prevPos[id];
      delete busRotations[id];
    }
  });
  Object.keys(approachLines).forEach(function(routeId) {
    if (!seenRoutes[routeId]) {
      map.removeLayer(approachLines[routeId]);
      delete approachLines[routeId];
    }
  });
}

// ── Incidentes de tráfico ────────────────────────────────────────────────────
var incidentMarkers = {};

function incidentIcon(severity, type) {
  var colors = { high: '#ef4444', medium: '#f59e0b', low: '#3b82f6' };
  var c = colors[severity] || '#6b7280';
  var t = (type || '').toLowerCase();
  var emoji = t.indexOf('cerrad') >= 0 ? '🚧'
            : t.indexOf('accidente') >= 0 ? '🚨'
            : t.indexOf('obras') >= 0 ? '🔧'
            : t.indexOf('tr') >= 0 ? '🚗'
            : t.indexOf('peligro') >= 0 ? '⚠️'
            : t.indexOf('closure') >= 0 ? '🚧'
            : '⚠️';
  var ring = severity === 'high' ? '0 0 0 4px ' + c + '44' : 'none';
  return L.divIcon({
    className: '',
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    html: '<div style="width:34px;height:34px;border-radius:50%;background:' + c + ';' +
          'border:2.5px solid rgba(255,255,255,0.95);' +
          'display:flex;align-items:center;justify-content:center;' +
          'font-size:17px;box-shadow:0 3px 10px rgba(0,0,0,0.25),' + ring + ';">' +
          emoji + '</div>'
  });
}

function updateIncidents(incidents) {
  Object.keys(incidentMarkers).forEach(function(id) {
    map.removeLayer(incidentMarkers[id]);
  });
  incidentMarkers = {};
  (incidents || []).forEach(function(inc) {
    if (!inc.lat || !inc.lng) return;
    var icon = incidentIcon(inc.severity, inc.type);
    var popup = '<div style="font-family:sans-serif;max-width:220px;padding:2px">' +
                '<b style="font-size:13px;color:#111">' + (inc.type || 'Incidencia') + '</b>' +
                (inc.description ? '<p style="font-size:12px;color:#555;margin:5px 0 0">' + inc.description + '</p>' : '') +
                '</div>';
    incidentMarkers[String(inc.id)] = L.marker([inc.lat, inc.lng], {
      icon: icon,
      zIndexOffset: 300
    }).bindPopup(popup, { maxWidth: 240 }).addTo(map);
  });
}

// ── Rutas reales ATU ─────────────────────────────────────────────────────────
var routePolylines = {};
var routeLatLngs   = {}; // id → latlngs, used for bearing calculation

function loadRoutesGeo(routes) {
  Object.values(routePolylines).forEach(function(p) { map.removeLayer(p); });
  routePolylines = {};
  routeLatLngs   = {};
  (routes || []).forEach(function(r) {
    if (!r.latlngs || r.latlngs.length < 2) return;
    routeLatLngs[r.id] = r.latlngs;
    var popup = '<div style="font-family:sans-serif;padding:2px 4px">' +
      '<b style="font-size:13px;color:#111">' + r.code + '</b>' +
      '</div>';
    routePolylines[r.id] = L.polyline(r.latlngs, {
      color:   r.color || '#94a3b8',
      weight:  2.5,
      opacity: 0.55,
    }).bindPopup(popup, { maxWidth: 220 }).addTo(map);
  });
}

// ── Estaciones ATU ───────────────────────────────────────────────────────────
var stationLayers = [];

function mkStopIcon(color) {
  return L.divIcon({
    className:'', iconSize:[36,46], iconAnchor:[18,46],
    html:'<svg width="36" height="46" viewBox="0 0 44 56" xmlns="http://www.w3.org/2000/svg">'+
           '<path d="M22,54 C22,54 3,38 3,21 A19,19 0 1,1 41,21 C41,38 22,54 22,54Z" fill="'+color+'"/>'+
           '<circle cx="22" cy="21" r="14" fill="none" stroke="white" stroke-width="2.5"/>'+
           '<rect x="18" y="7" width="8" height="4" rx="1" fill="white"/>'+
           '<rect x="11" y="11" width="22" height="18" rx="2" fill="white"/>'+
           '<rect x="13" y="13" width="18" height="10" rx="1" fill="'+color+'"/>'+
           '<rect x="11" y="24" width="22" height="4" rx="0.5" fill="white"/>'+
           '<circle cx="16.5" cy="26" r="2" fill="'+color+'"/>'+
           '<circle cx="27.5" cy="26" r="2" fill="'+color+'"/>'+
           '<rect x="13" y="29" width="6" height="4" rx="1" fill="white"/>'+
           '<rect x="25" y="29" width="6" height="4" rx="1" fill="white"/>'+
         '</svg>'
  });
}

function loadStations(stations) {
  stationLayers.forEach(function(m) { map.removeLayer(m); });
  stationLayers = [];
  (stations || []).forEach(function(st) {
    if (!st.lat || !st.lng) return;
    var isCosac  = st.system === 'cosac';
    var isLinea1 = st.system === 'linea1';
    var color    = isCosac ? '#f0a500' : isLinea1 ? '#003087' : '#1668AD';
    var marker   = L.marker([st.lat, st.lng], { icon: mkStopIcon(color) });
    marker.bindTooltip(st.name || '', { className:'stop-lbl', direction:'top', offset:[0,-26] });
    marker.addTo(map);
    stationLayers.push(marker);
  });
}
// ── Tiendas Tambo+ ───────────────────────────────────────────────────────────
var tamboLayers = [];
var tamboIcon = L.divIcon({
  className: '',
  iconSize: [52, 34],
  iconAnchor: [26, 34],
  html: '<div style="display:flex;flex-direction:column;align-items:center;gap:0">' +
        '<div style="background:#F5C21A;border-radius:6px;padding:3px 6px;' +
        'border:1.5px solid rgba(0,0,0,0.1);box-shadow:0 2px 8px rgba(0,0,0,0.28);' +
        'display:flex;align-items:center;justify-content:center">' +
        '<span style="color:#9C27B0;font-family:sans-serif;' +
        'font-weight:900;font-size:12px;letter-spacing:-0.5px;line-height:1">TAMBO</span>' +
        '<span style="color:#F5C21A;background:#9C27B0;border-radius:50%;' +
        'font-size:7px;font-weight:900;font-family:sans-serif;' +
        'width:11px;height:11px;display:inline-flex;align-items:center;justify-content:center;' +
        'margin-left:1px;margin-bottom:4px;flex-shrink:0">+</span>' +
        '</div>' +
        '<div style="width:2px;height:6px;background:#9C27B0;opacity:0.85"></div>' +
        '</div>'
});

function loadTambos(tambos) {
  tamboLayers.forEach(function(m) { map.removeLayer(m); });
  tamboLayers = [];
  (tambos || []).forEach(function(t) {
    if (!t.lat || !t.lng) return;
    var popup = '<div style="font-family:sans-serif;padding:4px 6px;min-width:140px">' +
      '<b style="font-size:12px;color:#FF6B00">🛒 ' + (t.name || 'Tambo+') + '</b>' +
      (t.address ? '<p style="font-size:11px;color:#555;margin:4px 0 0">' + t.address + '</p>' : '') +
      '</div>';
    var m = L.marker([t.lat, t.lng], { icon: tamboIcon, zIndexOffset: 200 })
      .bindPopup(popup, { maxWidth: 220 });
    m.addTo(map);
    tamboLayers.push(m);
  });
}

${trafficBadge ? `
// Badge de tráfico en esquina superior derecha del mapa
(function(){
  var badge = L.control({position:'topright'});
  badge.onAdd = function(){
    var d = L.DomUtil.create('div');
    d.style.cssText = 'background:${trafficBadge.bg};border:1.5px solid ${trafficBadge.color};'
      + 'color:${trafficBadge.color};font-size:11px;font-weight:700;'
      + 'padding:5px 10px;border-radius:20px;'
      + 'box-shadow:0 2px 8px rgba(0,0,0,0.15);font-family:sans-serif;'
      + 'pointer-events:none;';
    d.innerHTML = '${trafficBadge.icon} ${trafficBadge.label}';
    return d;
  };
  badge.addTo(map);
})();
` : ''}
</script>
</body></html>`;
}

const s = StyleSheet.create({
  wrap:         { flex: 1 },
  map:          { flex: 1, backgroundColor: '#e8e4dc' },
  centerFab: {
    position: 'absolute', bottom: 12, right: 12,
    width: 40, height: 40, borderRadius: 11,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16, shadowRadius: 6, elevation: 3,
  },
});
