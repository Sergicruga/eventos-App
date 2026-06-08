/**
 * Shared event categories used across the entire app
 * These should match the database event_categories table
 */
export const EVENT_CATEGORIES = [
  { id: 'musica', slug: 'musica', name: 'Música', label: 'Música', icon: 'musical-notes', color: '#FF6B6B' },
  { id: 'deportes', slug: 'deportes', name: 'Deportes', label: 'Deportes', icon: 'football', color: '#4ECDC4' },
  { id: 'arte', slug: 'arte', name: 'Arte', label: 'Arte', icon: 'brush', color: '#FFE66D' },
  { id: 'tecnologia', slug: 'tecnologia', name: 'Tecnología', label: 'Tecnología', icon: 'laptop', color: '#95E1D3' },
  { id: 'educacion', slug: 'educacion', name: 'Educación', label: 'Educación', icon: 'school', color: '#A8E6CF' },
  { id: 'gastronomia', slug: 'gastronomia', name: 'Gastronomía', label: 'Gastronomía', icon: 'restaurant', color: '#FF8C94' },
  { id: 'cine', slug: 'cine', name: 'Cine', label: 'Cine', icon: 'film', color: '#A29BFE' },
  { id: 'otro', slug: 'otro', name: 'Otro', label: 'Otro', icon: 'star', color: '#DDA0DD' },
];

export const findCategoryBySlug = (slug) => {
  if (!slug) return null;

  const normalized = String(slug).toLowerCase().trim();

  return EVENT_CATEGORIES.find(cat =>
    cat.slug === normalized ||
    cat.id === normalized ||
    cat.name.toLowerCase() === normalized
  );
};

export const normalizeEventCategory = (eventType) => {
  if (!eventType) return null;

  const category = findCategoryBySlug(eventType);
  return category || null;
};

export const eventMatchesCategory = (event, categorySlug) => {
  if (!event || !categorySlug) return false;

  const wanted = String(categorySlug).toLowerCase().trim();

  if (event.category_slug) {
    return String(event.category_slug).toLowerCase().trim() === wanted;
  }

  const eventType =
    event.type_evento ||
    event.category ||
    event.categorySlug ||
    event.event_category ||
    event.genre ||
    event.classification ||
    '';

  const category = normalizeEventCategory(eventType);

  if (category) {
    return category.slug === wanted;
  }

  const text = `${event.title || ''} ${event.description || ''}`.toLowerCase();

  const musicWords = [
    'music',
    'música',
    'musica',
    'concert',
    'concierto',
    'festival',
    'dj',
    'rock',
    'pop',
    'rap',
    'hip hop',
    'reggaeton',
    'flamenco',
    'jazz',
  ];

  if (wanted === 'musica') {
    return musicWords.some(word => text.includes(word));
  }

  if (wanted === 'otro') {
    return false;
  }

  return false;
};