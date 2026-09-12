import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArpaBadge } from '../../components/arpa/index.js';
import {
  OTTAWA_MAP_CENTER,
  OTTAWA_MAP_ZOOM,
  geocodedListings,
  listingCanonicalId,
  selectedGeocodedListing,
} from './listingMapModel.js';
import { OPEN_FREE_MAP_STYLE, loadMapLibre } from './maplibreRuntime.js';
import './ListingMap.less';

const markerLabel = (listing) =>
  listing.title || listing.address || 'Rental listing';

export default function ListingMap({
  listings,
  selectedListingId,
  onSelectListing,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const maplibreRef = useRef(null);
  const markersRef = useRef(new Map());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  const points = useMemo(() => geocodedListings(listings), [listings]);

  useEffect(() => {
    let cancelled = false;

    loadMapLibre()
      .then((maplibregl) => {
        if (cancelled || !containerRef.current || mapRef.current) return;

        maplibreRef.current = maplibregl;
        const map = new maplibregl.Map({
          container: containerRef.current,
          style: OPEN_FREE_MAP_STYLE,
          center: OTTAWA_MAP_CENTER,
          zoom: OTTAWA_MAP_ZOOM,
          attributionControl: true,
        });
        mapRef.current = map;

        if (typeof maplibregl.NavigationControl === 'function') {
          map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        }

        map.on('load', () => {
          if (!cancelled) setReady(true);
        });
        map.on('error', (event) => {
          if (!cancelled && event?.error) setError(event.error.message ?? 'Map failed to load');
        });
      })
      .catch((cause) => {
        if (!cancelled) setError(cause?.message ?? 'Map failed to load');
      });

    return () => {
      cancelled = true;
      for (const { marker } of markersRef.current.values()) marker.remove();
      markersRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
      maplibreRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = maplibreRef.current;
    if (!ready || !map || !maplibregl) return undefined;

    for (const { marker } of markersRef.current.values()) marker.remove();
    markersRef.current.clear();

    for (const listing of points) {
      const id = listingCanonicalId(listing);
      if (!id) continue;

      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'listingMap__marker';
      element.setAttribute('aria-label', `Select ${markerLabel(listing)}`);
      element.title = markerLabel(listing);
      element.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelectListing?.(id);
      });

      const marker = new maplibregl.Marker({ element, anchor: 'center' })
        .setLngLat([listing.longitude, listing.latitude])
        .addTo(map);
      markersRef.current.set(id, { marker, element, listing });
    }

    if (points.length === 1) {
      map.easeTo({
        center: [points[0].longitude, points[0].latitude],
        zoom: 13,
        duration: 0,
      });
    } else if (points.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      for (const listing of points) bounds.extend([listing.longitude, listing.latitude]);
      map.fitBounds(bounds, {
        padding: 56,
        maxZoom: 13,
        duration: 0,
      });
    } else {
      map.easeTo({ center: OTTAWA_MAP_CENTER, zoom: OTTAWA_MAP_ZOOM, duration: 0 });
    }

    return () => {
      for (const { marker } of markersRef.current.values()) marker.remove();
      markersRef.current.clear();
    };
  }, [points, ready, onSelectListing]);

  useEffect(() => {
    for (const [id, entry] of markersRef.current.entries()) {
      entry.element.classList.toggle('listingMap__marker--selected', id === selectedListingId);
    }

    const listing = selectedGeocodedListing(points, selectedListingId);
    const map = mapRef.current;
    if (listing && map) {
      const zoom = typeof map.getZoom === 'function' ? Math.max(map.getZoom(), 13) : 13;
      map.easeTo({
        center: [listing.longitude, listing.latitude],
        zoom,
        duration: 350,
      });
    }
  }, [points, selectedListingId]);

  return (
    <section className="listingMap" aria-label="Rental listings map">
      <div className="listingMap__header">
        <span>MAP</span>
        <ArpaBadge>{points.length} geocoded</ArpaBadge>
      </div>
      <div className="listingMap__canvas" ref={containerRef} />
      {points.length === 0 && !error ? (
        <div className="listingMap__overlay">No geocoded listings to map yet.</div>
      ) : null}
      {error ? (
        <div className="listingMap__overlay listingMap__overlay--error">{error}</div>
      ) : null}
    </section>
  );
}
