export const MAPLIBRE_VERSION = '6.9.0';
export const MAPLIBRE_SCRIPT_URL =
  'https://unpkg.com/maplibre-gl@6.9.0/dist/maplibre-gl.js';
export const MAPLIBRE_CSS_URL =
  'https://unpkg.com/maplibre-gl@6.9.0/dist/maplibre-gl.css';
export const OPEN_FREE_MAP_STYLE =
  'https://tiles.openfreemap.org/styles/liberty';

const SCRIPT_ID = 'arpa-maplibre-runtime';
const STYLE_ID = 'arpa-maplibre-styles';
let pending = null;

const ensureStyles = () => {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = MAPLIBRE_CSS_URL;
  document.head.appendChild(link);
};

export const loadMapLibre = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('MapLibre can only load in a browser'));
  }
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (pending) return pending;

  ensureStyles();

  pending = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    const complete = () => {
      if (window.maplibregl) resolve(window.maplibregl);
      else reject(new Error('MapLibre runtime loaded without exposing window.maplibregl'));
    };

    if (existing) {
      existing.addEventListener('load', complete, { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Could not load the MapLibre runtime')),
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = MAPLIBRE_SCRIPT_URL;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.addEventListener('load', complete, { once: true });
    script.addEventListener(
      'error',
      () => reject(new Error('Could not load the MapLibre runtime')),
      { once: true },
    );
    document.head.appendChild(script);
  }).catch((error) => {
    pending = null;
    throw error;
  });

  return pending;
};
