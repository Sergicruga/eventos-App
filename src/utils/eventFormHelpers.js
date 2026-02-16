/**
 * Shared utilities for event form screens (Create/Edit)
 */

import * as Location from 'expo-location';

export const formatAddress = (a) => {
  const line1Parts = [];
  if (a.street) line1Parts.push(a.street);
  if (a.streetNumber) line1Parts.push(String(a.streetNumber));
  if (!a.street && a.name) line1Parts.push(String(a.name));
  const line1 = line1Parts.join(' ').trim();

  const city = a.city || a.subregion;
  const line2Parts = [city, a.region].filter(Boolean);

  const parts = [line1, ...line2Parts, a.postalCode, a.country].filter(Boolean);
  const seen = new Set();
  const dedup = parts.filter(p => {
    const key = p.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return dedup.join(', ').trim() || [a.name, a.country].filter(Boolean).join(', ');
};

export const normalizeDate = (d) => 
  d instanceof Date ? d.toISOString().slice(0, 10) : String(d);

export const normalizeTimeString = (time) => {
  if (!time) return null;
  const str = String(time).trim();
  const m = str.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return `${m[1]}:${m[2]}`;
};

export const reverseGeocodeCoords = async (latitude, longitude) => {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    return results?.length ? formatAddress(results[0]) : null;
  } catch {
    return null;
  }
};

export const toAbsoluteUrl = (uri, API_URL) => {
  if (!uri) return null;
  if (typeof uri !== 'string') uri = String(uri);

  if (uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('file://')) {
    return uri;
  }

  const base = API_URL?.replace(/\/+$/, '') || '';
  if (uri.startsWith('/')) return `${base}${uri}`;
  return `${base}/${uri}`;
};
