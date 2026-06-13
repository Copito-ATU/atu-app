import { useState, useEffect, useRef } from 'react';
import { SERVER_URL } from '../constants';

// Usa REST polling en lugar de socket.io (evita conflictos ESM con Metro)
export function useSimulator() {
  const [buses, setBuses]         = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [routes, setRoutes]       = useState([]);
  const [connected, setConnected] = useState(false);

  const initDone = useRef(false);

  // Carga rutas y paradas una sola vez
  useEffect(() => {
    fetch(`${SERVER_URL}/api/routes`)
      .then(r => r.json())
      .then(data => { setRoutes(data); setConnected(true); initDone.current = true; })
      .catch(() => setConnected(false));
  }, []);

  // Actualiza buses cada 1 segundo
  useEffect(() => {
    const t = setInterval(() => {
      fetch(`${SERVER_URL}/api/buses`)
        .then(r => r.json())
        .then(data => { setBuses(data); setConnected(true); })
        .catch(() => setConnected(false));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Actualiza incidentes cada 15 segundos
  useEffect(() => {
    const fetchInc = () =>
      fetch(`${SERVER_URL}/api/incidents`)
        .then(r => r.json())
        .then(setIncidents)
        .catch(() => {});
    fetchInc();
    const t = setInterval(fetchInc, 15000);
    return () => clearInterval(t);
  }, []);

  return { buses, incidents, routes, connected };
}
