// src/utils/imageSource.js
let API_URL = 'https://eventos-app-oy65.onrender.com';

try {
  const config = require('../config');
  if (config?.API_URL) API_URL = config.API_URL;
} catch {}

const DEFAULT_IMAGE_URI = 'https://placehold.co/800x400?text=Evento';

const looksLikeUrl = (s) => typeof s === 'string' && /^(https?:\/\/|data:|file:\/\/)/i.test(s);
const isObjectWithUri = (img) => !!img && typeof img === 'object' && typeof img.uri === 'string';

function normalizeBaseUrl(baseUrl = API_URL) {
  return (baseUrl || '').replace(/\/+$/, '');
}

function resolveImageUrl(img, { baseUrl = API_URL } = {}) {
  if (!img || typeof img !== 'string') return null;

  const trimmed = img.trim();
  if (!trimmed) return null;
  if (looksLikeUrl(trimmed)) return trimmed;

  const normalizedBase = normalizeBaseUrl(baseUrl);
  const normalizedPath = trimmed.replace(/^\/+/, '');
  if (!normalizedPath) return normalizedBase || null;

  return `${normalizedBase}/${normalizedPath}`;
}

function toImageSource(img, opts = {}) {
  if (!img || (typeof img === 'string' && img.trim() === '')) {
    return { uri: DEFAULT_IMAGE_URI };
  }
  if (isObjectWithUri(img)) return img;
  const uri = resolveImageUrl(img, opts);
  return uri ? { uri } : { uri: DEFAULT_IMAGE_URI };
}

function getEventImageSource(imagePath) {
  if (!imagePath || (typeof imagePath === 'string' && imagePath.trim() === '')) {
    return require('../../assets/iconoApp.png');
  }
  if (isObjectWithUri(imagePath)) return imagePath;
  if (typeof imagePath === 'string' && looksLikeUrl(imagePath)) {
    return { uri: imagePath };
  }
  const uri = resolveImageUrl(imagePath);
  return uri ? { uri } : require('../../assets/iconoApp.png');
}

module.exports = {
  DEFAULT_IMAGE_URI,
  DEFAULT_IMAGE: { uri: DEFAULT_IMAGE_URI },
  resolveImageUrl,
  toImageSource,
  getEventImageSource,
};
