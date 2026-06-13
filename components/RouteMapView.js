import React, { useMemo, useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

// liveBuses:    [{ id, lat, lng, direction, routeColor, catchable }]
// incidents:    [{ id, lat, lng, type, severity, description }]
// routesGeo:    [{ id, code, latlngs, color, tipo, interval, fleet }]
// stations:     [{ id, name, lat, lng, system, demand }]
// liveUserLat/Lng: live GPS position (injected via JS, does NOT rebuild HTML)
export default function RouteMapView({ segments, fromLat, fromLng, toLat, toLng, liveBuses, incidents, routesGeo, stations, liveUserLat, liveUserLng }) {
  const webRef       = useRef(null);
  const liveBusesRef = useRef(liveBuses);
  const incidentsRef = useRef(incidents);
  const routesRef    = useRef(routesGeo);
  const stationsRef  = useRef(stations);

  const html = useMemo(
    () => buildHtml(segments, fromLat, fromLng, toLat, toLng),
    [segments, fromLat, fromLng, toLat, toLng]
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

function buildHtml(segments, fromLat, fromLng, toLat, toLng) {
  const payload = JSON.stringify({ segments: segments || [], fromLat, fromLng, toLat, toLng });

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
  maxZoom:19,subdomains:'abcd'
}).addTo(map);

var bounds = [];

// Index bus segments by routeId so updateLiveBuses can draw approach lines
var busRouteMap = {};
(d.segments||[]).forEach(function(seg){
  if (!seg.dashed && seg.routeId && seg.fromLat != null) {
    busRouteMap[seg.routeId] = {
      color:    seg.color || '#1668AD',
      boardLat: seg.fromLat, boardLng: seg.fromLng,
      alightLat: seg.toLat,  alightLng: seg.toLng,
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
    L.polyline(pts, {color:'rgba(0,0,0,0.12)',weight:7,opacity:1}).addTo(map);
    L.polyline(pts, {color:color,weight:5,opacity:0.95}).addTo(map);

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
      L.marker(mid,{
        icon: L.divIcon({
          className:'',
          html:'<div style="background:'+color+';color:#fff;font-size:10px;font-weight:800;'+
               'padding:2px 7px;border-radius:8px;white-space:nowrap;'+
               'box-shadow:0 1px 5px rgba(0,0,0,0.22);font-family:sans-serif">'+seg.label+'</div>',
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
    icon:L.divIcon({
      className:'',iconSize:[36,44],iconAnchor:[18,44],
      html:'<div style="display:flex;flex-direction:column;align-items:center">'+
           '<div style="width:34px;height:34px;background:#1668AD;border-radius:50%;'+
           'border:3px solid #fff;box-shadow:0 3px 10px rgba(22,104,173,0.5);'+
           'display:flex;align-items:center;justify-content:center;">'+
           '<div style="width:12px;height:12px;background:#fff;border-radius:50%"></div>'+
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
  // Prefer real geometric bearing; fall back to compass string
  var rot = (bearing !== undefined && bearing !== null)
    ? bearing
    : (DIR_DEG[dir] !== undefined ? DIR_DEG[dir] : 0);
  var c   = catchable !== false ? color : '#aab0bc';
  var op  = catchable !== false ? '1' : '0.45';

  // Slightly darken color for roof details
  var shadow = catchable !== false
    ? 'drop-shadow(0 2px 5px rgba(0,0,0,0.38)) drop-shadow(0 0 1px rgba(0,0,0,0.25))'
    : 'drop-shadow(0 1px 3px rgba(0,0,0,0.2))';

  // Waze/Google-style aerial bus:
  // bullet/teardrop silhouette — pointed nose (top=front), rounded rear
  var svg =
    '<svg width="18" height="30" viewBox="0 0 20 34" xmlns="http://www.w3.org/2000/svg">' +
    // Soft ground shadow
    '<ellipse cx="10" cy="31" rx="7.5" ry="2.5" fill="rgba(0,0,0,0.16)"/>' +
    // Main body: pointed front, rounded back
    '<path d="M10 1 L1 10 L1 27 Q1 33 6.5 33 L13.5 33 Q19 33 19 27 L19 10 Z"' +
    '  fill="' + c + '"/>' +
    // White halo outline — gives pop on any map tile
    '<path d="M10 1 L1 10 L1 27 Q1 33 6.5 33 L13.5 33 Q19 33 19 27 L19 10 Z"' +
    '  fill="none" stroke="rgba(255,255,255,0.95)" stroke-width="2" stroke-linejoin="round"/>' +
    // Windshield glass (front triangle)
    '<path d="M10 3.5 L3.5 10.5 L16.5 10.5 Z" fill="rgba(210,238,255,0.55)"/>' +
    // Roof front highlight strip
    '<rect x="2" y="10.5" width="16" height="5" rx="0"' +
    '  fill="rgba(255,255,255,0.12)"/>' +
    // Roof AC unit 1
    '<rect x="6.5" y="17" width="7" height="2.5" rx="1.2"' +
    '  fill="rgba(0,0,0,0.2)"/>' +
    // Roof AC unit 2
    '<rect x="6.5" y="22.5" width="7" height="2.5" rx="1.2"' +
    '  fill="rgba(0,0,0,0.2)"/>' +
    // Rear bumper line
    '<rect x="3" y="29.5" width="14" height="1.2" rx="0.6"' +
    '  fill="rgba(0,0,0,0.18)"/>' +
    // Tail lights
    '<rect x="1.5" y="27.5" width="4" height="2.2" rx="1.1"' +
    '  fill="rgba(255,50,50,0.92)"/>' +
    '<rect x="14.5" y="27.5" width="4" height="2.2" rx="1.1"' +
    '  fill="rgba(255,50,50,0.92)"/>' +
    // Catchable green pulse dot
    (catchable !== false
      ? '<circle cx="10" cy="23.5" r="3" fill="rgba(0,0,0,0.18)"/>' +
        '<circle cx="10" cy="23.5" r="2.1" fill="#22c55e"' +
        '  stroke="rgba(255,255,255,0.95)" stroke-width="0.9"/>'
      : '') +
    '</svg>';

  return L.divIcon({
    className:  '',
    iconSize:   [18, 30],
    iconAnchor: [9, 15],
    html: '<div style="transform:rotate(' + rot + 'deg);transform-origin:50% 50%;' +
          'filter:' + shadow + ';opacity:' + op + ';display:inline-block">' + svg + '</div>'
  });
}

function updateLiveBuses(buses) {
  var seen = {};
  buses.forEach(function(b) {
    seen[b.id] = true;
    var catchable = b.catchable !== undefined ? b.catchable : true;
    var color = b.routeColor || '#1668AD';

    // 1. Try movement bearing: compare current vs last known position
    var prev = prevPos[b.id];
    if (prev) {
      var dlat = b.lat - prev.lat;
      var dlng = b.lng - prev.lng;
      // Only update rotation if the bus actually moved (avoid noise from tiny drifts)
      if (Math.abs(dlat) > 0.000005 || Math.abs(dlng) > 0.000005) {
        busRotations[b.id] = calcBearing(prev.lat, prev.lng, b.lat, b.lng);
      }
    }
    prevPos[b.id] = { lat: b.lat, lng: b.lng };

    // 2. If no movement yet, seed from route geometry
    if (busRotations[b.id] === undefined) {
      var rll = routeLatLngs[b.routeId];
      if (rll && rll.length > 1) {
        busRotations[b.id] = routeBearing(rll, b.lat, b.lng, b.direction !== 'S');
      }
    }

    // 3. Final fallback: N/S compass string
    var bearing = busRotations[b.id] !== undefined ? busRotations[b.id] : null;

    var icon = busIcon(color, b.direction, catchable, bearing);
    if (liveMarkers[b.id]) {
      liveMarkers[b.id].setLatLng([b.lat, b.lng]);
      liveMarkers[b.id].setIcon(icon);
      liveMarkers[b.id].setZIndexOffset(catchable ? 500 : 50);
    } else {
      liveMarkers[b.id] = L.marker([b.lat, b.lng], {
        icon: icon,
        zIndexOffset: catchable ? 500 : 50
      }).addTo(map);
    }

    // Approach line: dashed colored arrow from bus → board stop
    var rseg = busRouteMap[b.routeId];
    if (rseg && catchable) {
      var apt = [[b.lat, b.lng], [rseg.boardLat, rseg.boardLng]];
      if (approachLines[b.id]) {
        approachLines[b.id].setLatLngs(apt);
      } else {
        approachLines[b.id] = L.polyline(apt, {
          color:     rseg.color,
          weight:    2.5,
          opacity:   0.6,
          dashArray: '4, 8',
          lineJoin:  'round',
        }).addTo(map);
        approachLines[b.id].bringToBack();
      }
    } else if (approachLines[b.id]) {
      map.removeLayer(approachLines[b.id]);
      delete approachLines[b.id];
    }
  });
  Object.keys(liveMarkers).forEach(function(id) {
    if (!seen[id]) {
      map.removeLayer(liveMarkers[id]);
      delete liveMarkers[id];
      delete prevPos[id];
      delete busRotations[id];
      if (approachLines[id]) {
        map.removeLayer(approachLines[id]);
        delete approachLines[id];
      }
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
    var popup = '<div style="font-family:sans-serif;padding:2px">' +
      '<b style="font-size:13px;color:#111">Ruta ' + r.code + '</b>' +
      '<br><span style="font-size:11px;color:#555">' + (r.tipo || '') + '</span>' +
      (r.interval ? '<br><span style="font-size:11px;color:#16a34a">Cada ' + r.interval + ' min · ' + r.fleet + ' buses</span>' : '') +
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

function loadStations(stations) {
  stationLayers.forEach(function(m) { map.removeLayer(m); });
  stationLayers = [];
  (stations || []).forEach(function(st) {
    if (!st.lat || !st.lng) return;
    var isCosac  = st.system === 'cosac';
    var isLinea1 = st.system === 'linea1';
    var color    = isCosac ? '#f0a500' : isLinea1 ? '#003087' : '#1668AD';
    var size     = st.demand ? Math.min(Math.max(Math.round(st.demand / 8000) + 6, 6), 16) : 8;
    var circle   = L.circleMarker([st.lat, st.lng], {
      radius: size, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.9,
    });
    circle.bindPopup(
      '<b style="font-size:13px">' + st.name + '</b>' +
      '<br><span style="font-size:11px;color:#555">' + (isCosac ? 'Metropolitano' : isLinea1 ? 'Línea 1 Metro' : 'Parada') + '</span>' +
      (st.demand ? '<br><span style="color:#888;font-size:11px">~' + Math.round(st.demand / 1000) + 'k validaciones/mes</span>' : '') +
      (st.interval ? '<br><span style="color:#16a34a;font-size:11px">Cada ' + st.interval + ' min</span>' : ''),
      { maxWidth: 200 }
    );
    circle.addTo(map);
    stationLayers.push(circle);
  });
}
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
