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
    subcategories: [
      { slug: 'conciertos', name: 'Conciertos' },
      { slug: 'festivales', name: 'Festivales' },
      { slug: 'dj-electronica', name: 'DJ / electrónica' },
      { slug: 'flamenco', name: 'Flamenco' },
      { slug: 'jazz-blues', name: 'Jazz / blues' },
      { slug: 'clasica-opera', name: 'Clásica / ópera' },
      { slug: 'musica-otros', name: 'Otros música' },
    ],
  },
  {
    id: 'deportes',
    slug: 'deportes',
    name: 'Deportes',
    label: 'Deportes',
    icon: 'football',
    color: '#4ECDC4',
    subcategories: [
      { slug: 'futbol', name: 'Fútbol' },
      { slug: 'running', name: 'Running / carreras' },
      { slug: 'fitness-yoga', name: 'Fitness / yoga' },
      { slug: 'senderismo', name: 'Senderismo' },
      { slug: 'motor', name: 'Motor' },
      { slug: 'baloncesto', name: 'Baloncesto' },
      { slug: 'deportes-otros', name: 'Otros deportes' },
    ],
  },
  {
    id: 'arte',
    slug: 'arte',
    name: 'Arte',
    label: 'Arte',
    icon: 'brush',
    color: '#FFE66D',
    subcategories: [
      { slug: 'teatro', name: 'Teatro' },
      { slug: 'exposiciones', name: 'Exposiciones' },
      { slug: 'danza', name: 'Danza' },
      { slug: 'circo', name: 'Circo' },
      { slug: 'comedia-monologos', name: 'Comedia / monólogos' },
      { slug: 'museos-visitas', name: 'Museos / visitas' },
      { slug: 'arte-otros', name: 'Otros arte' },
    ],
  },
  {
    id: 'tecnologia',
    slug: 'tecnologia',
    name: 'Tecnología',
    label: 'Tecnología',
    icon: 'laptop',
    color: '#95E1D3',
    subcategories: [
      { slug: 'gaming', name: 'Gaming' },
      { slug: 'startups', name: 'Startups' },
      { slug: 'ia-software', name: 'IA / software' },
      { slug: 'robotica', name: 'Robótica' },
      { slug: 'tecnologia-otros', name: 'Otros tecnología' },
    ],
  },
  {
    id: 'educacion',
    slug: 'educacion',
    name: 'Educación',
    label: 'Educación',
    icon: 'school',
    color: '#A8E6CF',
    subcategories: [
      { slug: 'talleres', name: 'Talleres' },
      { slug: 'charlas', name: 'Charlas' },
      { slug: 'cursos', name: 'Cursos' },
      { slug: 'infantil-familiar', name: 'Infantil / familiar' },
      { slug: 'educacion-otros', name: 'Otros educación' },
    ],
  },
  {
    id: 'gastronomia',
    slug: 'gastronomia',
    name: 'Gastronomía',
    label: 'Gastronomía',
    icon: 'restaurant',
    color: '#FF8C94',
    subcategories: [
      { slug: 'ferias-gastronomicas', name: 'Ferias gastronómicas' },
      { slug: 'catas', name: 'Catas' },
      { slug: 'mercados', name: 'Mercados' },
      { slug: 'talleres-cocina', name: 'Talleres de cocina' },
      { slug: 'gastronomia-otros', name: 'Otros gastronomía' },
    ],
  },
  {
    id: 'cine',
    slug: 'cine',
    name: 'Cine',
    label: 'Cine',
    icon: 'film',
    color: '#A29BFE',
    subcategories: [
      { slug: 'peliculas', name: 'Películas' },
      { slug: 'documentales', name: 'Documentales' },
      { slug: 'ciclos-proyecciones', name: 'Ciclos / proyecciones' },
      { slug: 'cine-otros', name: 'Otros cine' },
    ],
  },
  {
    id: 'otro',
    slug: 'otro',
    name: 'Otro',
    label: 'Otro',
    icon: 'star',
    color: '#DDA0DD',
    subcategories: [
      { slug: 'fiestas-populares', name: 'Fiestas populares' },
      { slug: 'ferias', name: 'Ferias' },
      { slug: 'mercadillos', name: 'Mercadillos' },
      { slug: 'familia', name: 'Familia' },
      { slug: 'otros', name: 'Otros' },
    ],
  },
];

export const EVENT_SUBCATEGORIES = EVENT_CATEGORIES.flatMap((category) =>
  (category.subcategories || []).map((subcategory) => ({
    ...subcategory,
    categorySlug: category.slug,
    categoryName: category.name,
  }))
);

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
    ' music ',
    'música',
    'musica',
    'concert',
    'concierto',
    'dj',
    'rock',
    'pop',
    'rap',
    'hip hop',
    'reggaeton',
    'flamenco',
    'jazz',
  ];

  const artWords = [
    'exposición',
    'exposicion',
    'exposici',
    'museo',
    'museu',
    'arte',
    'teatro',
    'teatre',
    'danza',
    'dansa',
    'literatura',
    'poesia',
    'poesía',
    'galería',
    'galeria',
    'cultural',
  ];

  if (wanted === 'musica') {
    if (artWords.some(word => text.includes(word))) {
      return false;
    }
    return musicWords.some(word => text.includes(word));
  }

  if (wanted === 'arte') {
    return artWords.some(word => text.includes(word));
  }

  if (wanted === 'otro') {
    return false;
  }

  return false;
};

export const getSubcategoriesForCategory = (categorySlug) =>
  findCategoryBySlug(categorySlug)?.subcategories || [];

export const findSubcategoryBySlug = (slug) => {
  if (!slug) return null;

  const normalized = String(slug).toLowerCase().trim();
  return EVENT_SUBCATEGORIES.find((sub) => sub.slug === normalized) || null;
};

export const eventMatchesSubcategory = (event, subcategorySlug) => {
  if (!event || !subcategorySlug || subcategorySlug === 'todos') return true;

  const wanted = String(subcategorySlug).toLowerCase().trim();
  return (
    String(event.subcategory_slug || event.subcategorySlug || '')
      .toLowerCase()
      .trim() === wanted
  );
};
