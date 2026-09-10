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

const normalizeTextForMatch = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export const inferEventSubcategorySlug = (event, categorySlug) => {
  if (!event) return null;

  const explicit = String(event.subcategory_slug || event.subcategorySlug || '')
    .toLowerCase()
    .trim();

  if (explicit && findSubcategoryBySlug(explicit)) return explicit;

  const category =
    categorySlug ||
    event.category_slug ||
    event.categorySlug ||
    normalizeEventCategory(event.type || event.type_evento || event.category)?.slug ||
    null;

  const text = normalizeTextForMatch(
    [
      event.title,
      event.name,
      event.description,
      event.location,
      event.venue_name,
      event.venueName,
      event.genre,
      event.classification,
      event.type,
    ]
      .filter(Boolean)
      .join(' ')
  );

  if (category === 'musica') {
    if (/\b(festival|festivales|fest|primavera sound|cruilla|sonar)\b/.test(text)) return 'festivales';
    if (/\b(dj|electronic|electronica|techno|house|dance)\b/.test(text)) return 'dj-electronica';
    if (/\b(flamenco|sevillanas|rumba)\b/.test(text)) return 'flamenco';
    if (/\b(jazz|blues|swing|soul)\b/.test(text)) return 'jazz-blues';
    if (/\b(clasica|opera|orquesta|sinfonic|sinfonica|zarzuela)\b/.test(text)) return 'clasica-opera';

    // Ticketmaster y otras fuentes a menudo solo informan "Music" y una sala.
    // Si ya está dentro de Música, lo más útil para el usuario es tratarlo como concierto.
    return 'conciertos';
  }

  if (category === 'arte') {
    if (/\b(circo|circ|clown|malabares|acrobacia)\b/.test(text)) return 'circo';
    if (/\b(teatro|teatre|theatre|theater|escenicas)\b/.test(text)) return 'teatro';
    if (/\b(exposicion|exposicio|exhibition|galeria|pintura|escultura|fotografia)\b/.test(text)) return 'exposiciones';
    if (/\b(danza|dansa|dance|ballet)\b/.test(text)) return 'danza';
    if (/\b(comedia|monologo|humor|stand up)\b/.test(text)) return 'comedia-monologos';
    if (/\b(museo|museu|visita guiada|patrimonio|patrimoni|archivo)\b/.test(text)) return 'museos-visitas';
    return 'arte-otros';
  }

  return null;
};

export const eventMatchesSubcategory = (event, subcategorySlug, categorySlug = null) => {
  if (!event || !subcategorySlug || subcategorySlug === 'todos') return true;

  const wanted = String(subcategorySlug).toLowerCase().trim();
  return inferEventSubcategorySlug(event, categorySlug) === wanted;
};
