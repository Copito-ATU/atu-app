import { TOMTOM_KEY } from '../constants';

const BBOX = '-77.25,-12.38,-76.75,-11.65';

const FIELDS =
  '{incidents{type,geometry{type,coordinates},' +
  'properties{id,iconCategory,magnitudeOfDelay,' +
  'events{description,code},startTime,from,to,length,delay,roadNumbers}}}';

const CATEGORIES = {
  1:  { type: 'Accidente de tránsito',       severity: 'high',   icon: '🚨' },
  3:  { type: 'Condiciones peligrosas',       severity: 'medium', icon: '⚠️'  },
  6:  { type: 'Tráfico intenso',              severity: 'medium', icon: '🚗'  },
  7:  { type: 'Carril cerrado',               severity: 'medium', icon: '🚧'  },
  8:  { type: 'Vía cerrada',                  severity: 'high',   icon: '🔴'  },
  9:  { type: 'Obras viales',                 severity: 'low',    icon: 'ℹ️'  },
  14: { type: 'Vehículo averiado en vía',     severity: 'low',    icon: '🔧'  },
};

// Traduce los event descriptions que vienen en inglés de TomTom
const EVENT_ES = {
  'slow traffic':             'Tráfico lento',
  'stationary traffic':       'Tráfico detenido',
  'closed':                   'Vía cerrada al tránsito',
  'roadworks':                'Obras en la vía',
  'new roadworks layout':     'Nuevo esquema por obras',
  'accident':                 'Accidente registrado',
  'broken down vehicle':      'Vehículo averiado',
  'dangerous conditions':     'Condiciones peligrosas',
  'lane closed':              'Carril cerrado',
  'road closed':              'Vía cerrada',
  'flooding':                 'Inundación en vía',
};

function translateEvent(desc) {
  if (!desc) return null;
  return EVENT_ES[desc.toLowerCase()] || desc;
}

function buildDescription(props) {
  const from   = props.from  || '';
  const to     = props.to    || '';
  const roads  = (props.roadNumbers || []).join(', ');
  const events = (props.events || [])
    .map(e => translateEvent(e.description))
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i) // dedup
    .slice(0, 2)
    .join('. ');

  const delay = props.delay && props.delay > 0
    ? ` Demora aprox. ${Math.round(props.delay / 60)} min.`
    : '';

  if (from && to)  return `${events ? events + '. ' : ''}De ${from} hacia ${to}.${delay}`;
  if (roads)       return `${events ? events + '. ' : ''}En ${roads}.${delay}`;
  if (events)      return events + '.' + delay;
  return 'Incidencia reportada en Lima.' + delay;
}

export async function getTrafficAlerts() {
  if (!TOMTOM_KEY) return null;

  const fieldsEnc = encodeURIComponent(FIELDS);
  const url =
    `https://api.tomtom.com/traffic/services/5/incidentDetails` +
    `?key=${TOMTOM_KEY}` +
    `&bbox=${BBOX}` +
    `&language=en-GB` +
    `&fields=${fieldsEnc}` +
    `&categoryFilter=1,3,6,7,8,9,14` +
    `&timeValidityFilter=present`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`TomTom ${res.status}`);
  const data = await res.json();

  const incidents = (data.incidents || [])
    .filter(f => CATEGORIES[f.properties?.iconCategory])
    .map((f, i) => {
      const p   = f.properties || {};
      const cat = CATEGORIES[p.iconCategory];
      const coords = f.geometry?.coordinates?.[0] || [];
      return {
        id:             p.id || `tt_${i}`,
        type:           cat.type,
        severity:       cat.severity,
        description:    buildDescription(p),
        affectedRoutes: [],
        active:         true,
        delay:          p.delay ? Math.round(p.delay / 60) : 0,
        lat:            coords[1],
        lng:            coords[0],
        _mag:           p.magnitudeOfDelay || 0,
      };
    });

  // Ordena: mayor magnitud primero, luego mayor demora
  incidents.sort((a, b) => {
    const sevOrder = { high: 0, medium: 1, low: 2 };
    const sd = sevOrder[a.severity] - sevOrder[b.severity];
    if (sd !== 0) return sd;
    if (b._mag !== a._mag) return b._mag - a._mag;
    return b.delay - a.delay;
  });

  return incidents.slice(0, 8);
}
