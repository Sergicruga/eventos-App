// src/utils/imageSource.js
import { API_URL } from '../api/config';

const DEFAULT_IMAGE_URI = 'https://placehold.co/800x400?text=Evento';

const looksLikeUrl = (s) => typeof s === 'string' && /^https?:\/\//i.test(s);
const looksLikeFile = (s) => typeof s === 'string' && s.startsWith('file://');
const isRelPath    = (s) => typeof s === 'string' && s.startsWith('/');

export function toImageSource(img) {
  if (!img || (typeof img === 'string' && img.trim() === '')) {
    return { uri: DEFAULT_IMAGE_URI };
  }
  if (looksLikeFile(img)) return { uri: img };
  if (looksLikeUrl(img))  return { uri: img };
  if (isRelPath(img))     return { uri: `${API_URL}${img}` };
  if (typeof img === 'object' && img?.uri) return img;

  return { uri: DEFAULT_IMAGE_URI };
}

export const DEFAULT_IMAGE = { uri: DEFAULT_IMAGE_URI };
