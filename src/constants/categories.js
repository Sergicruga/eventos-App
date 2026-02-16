/**
 * Shared event categories used across the entire app
 * These should match the database event_categories table
 */
export const EVENT_CATEGORIES = [
  {
    id: 'musica',
    slug: 'musica',
    name: 'Música',
    label: 'Música',
    icon: 'musical-notes',
    color: '#FF6B6B',
  },
  {
    id: 'deportes',
    slug: 'deportes',
    name: 'Deportes',
    label: 'Deportes',
    icon: 'football',
    color: '#4ECDC4',
  },
  {
    id: 'arte',
    slug: 'arte',
    name: 'Arte',
    label: 'Arte',
    icon: 'brush',
    color: '#FFE66D',
  },
  {
    id: 'tecnologia',
    slug: 'tecnologia',
    name: 'Tecnología',
    label: 'Tecnología',
    icon: 'laptop',
    color: '#95E1D3',
  },
  {
    id: 'educacion',
    slug: 'educacion',
    name: 'Educación',
    label: 'Educación',
    icon: 'school',
    color: '#A8E6CF',
  },
  {
    id: 'gastronomia',
    slug: 'gastronomia',
    name: 'Gastronomía',
    label: 'Gastronomía',
    icon: 'restaurant',
    color: '#FF8C94',
  },
  {
    id: 'cine',
    slug: 'cine',
    name: 'Cine',
    label: 'Cine',
    icon: 'film',
    color: '#A29BFE',
  },
  {
    id: 'otro',
    slug: 'otro',
    name: 'Otro',
    label: 'Otro',
    icon: 'star',
    color: '#DDA0DD',
  },
];

/**
 * Find a category by slug or name
 */
export const findCategoryBySlug = (slug) => {
  if (!slug) return null;
  const normalized = slug.toLowerCase().trim();
  return EVENT_CATEGORIES.find(cat => 
    cat.slug === normalized || cat.id === normalized || cat.name.toLowerCase() === normalized
  );
};

/**
 * Normalize event type/category to our standard format
 */
export const normalizeEventCategory = (eventType) => {
  if (!eventType) return EVENT_CATEGORIES.find(c => c.slug === 'otro');
  
  const category = findCategoryBySlug(eventType);
  return category || EVENT_CATEGORIES.find(c => c.slug === 'otro');
};

/**
 * Check if event matches a specific category
 */
export const eventMatchesCategory = (event, categorySlug) => {
  if (!event || !categorySlug) return false;
  
  // Check multiple possible type fields
  const eventType = event.type_evento || event.category || event.type || event.categorySlug || '';
  const category = normalizeEventCategory(eventType);
  
  return category?.slug === categorySlug.toLowerCase();
};
