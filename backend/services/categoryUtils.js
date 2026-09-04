const CATEGORY = {
  musica: { slug: "musica", name: "Música" },
  deportes: { slug: "deportes", name: "Deportes" },
  arte: { slug: "arte", name: "Arte" },
  tecnologia: { slug: "tecnologia", name: "Tecnología" },
  educacion: { slug: "educacion", name: "Educación" },
  gastronomia: { slug: "gastronomia", name: "Gastronomía" },
  cine: { slug: "cine", name: "Cine" },
  otro: { slug: "otro", name: "Otro" },
};

const SUBCATEGORY = {
  conciertos: { slug: "conciertos", name: "Conciertos" },
  festivales: { slug: "festivales", name: "Festivales" },
  djElectronica: { slug: "dj-electronica", name: "DJ / electrónica" },
  flamenco: { slug: "flamenco", name: "Flamenco" },
  jazzBlues: { slug: "jazz-blues", name: "Jazz / blues" },
  clasicaOpera: { slug: "clasica-opera", name: "Clásica / ópera" },
  musicaOtros: { slug: "musica-otros", name: "Otros música" },
  futbol: { slug: "futbol", name: "Fútbol" },
  running: { slug: "running", name: "Running / carreras" },
  fitnessYoga: { slug: "fitness-yoga", name: "Fitness / yoga" },
  senderismo: { slug: "senderismo", name: "Senderismo" },
  motor: { slug: "motor", name: "Motor" },
  baloncesto: { slug: "baloncesto", name: "Baloncesto" },
  deportesOtros: { slug: "deportes-otros", name: "Otros deportes" },
  teatro: { slug: "teatro", name: "Teatro" },
  exposiciones: { slug: "exposiciones", name: "Exposiciones" },
  danza: { slug: "danza", name: "Danza" },
  circo: { slug: "circo", name: "Circo" },
  comediaMonologos: { slug: "comedia-monologos", name: "Comedia / monólogos" },
  museosVisitas: { slug: "museos-visitas", name: "Museos / visitas" },
  arteOtros: { slug: "arte-otros", name: "Otros arte" },
  gaming: { slug: "gaming", name: "Gaming" },
  startups: { slug: "startups", name: "Startups" },
  iaSoftware: { slug: "ia-software", name: "IA / software" },
  robotica: { slug: "robotica", name: "Robótica" },
  tecnologiaOtros: { slug: "tecnologia-otros", name: "Otros tecnología" },
  talleres: { slug: "talleres", name: "Talleres" },
  charlas: { slug: "charlas", name: "Charlas" },
  cursos: { slug: "cursos", name: "Cursos" },
  infantilFamiliar: { slug: "infantil-familiar", name: "Infantil / familiar" },
  educacionOtros: { slug: "educacion-otros", name: "Otros educación" },
  feriasGastronomicas: { slug: "ferias-gastronomicas", name: "Ferias gastronómicas" },
  catas: { slug: "catas", name: "Catas" },
  mercados: { slug: "mercados", name: "Mercados" },
  talleresCocina: { slug: "talleres-cocina", name: "Talleres de cocina" },
  gastronomiaOtros: { slug: "gastronomia-otros", name: "Otros gastronomía" },
  peliculas: { slug: "peliculas", name: "Películas" },
  documentales: { slug: "documentales", name: "Documentales" },
  ciclosProyecciones: { slug: "ciclos-proyecciones", name: "Ciclos / proyecciones" },
  cineOtros: { slug: "cine-otros", name: "Otros cine" },
  fiestasPopulares: { slug: "fiestas-populares", name: "Fiestas populares" },
  ferias: { slug: "ferias", name: "Ferias" },
  mercadillos: { slug: "mercadillos", name: "Mercadillos" },
  familia: { slug: "familia", name: "Familia" },
  otros: { slug: "otros", name: "Otros" },
};

const normalizeText = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const has = (text, pattern) => pattern.test(text);

const MUSIC_RE =
  /\b(musica|musicales|concierto|concert|recital|gira|tour|dj|jazz|rock|pop|rap|hip hop|reggaeton|flamenco|opera|orquesta|banda|cantante|cantautor|coral|sinfonic|sinfonic|tributo|acustic|acustico|electronic|electronica)\b/;

const ARTS_RE =
  /\b(exposicion|exposicio|exhibition|museo|museu|galeria|arte|art|pintura|escultura|fotografia|teatro|teatre|theatre|theater|danza|dansa|dance|comedia|circ|circo|literatura|poesia|patrimoni|patrimonio|cultura|cultural|visita guiada|espectaculo|espectacle|performance|magia|monologo|zarzuela|cabaret)\b/;

const SPORTS_RE =
  /\b(deporte|deportivo|esport|carrera|cursa|running|futbol|football|soccer|basket|basquet|baloncesto|tenis|tennis|yoga|senderismo|sendero|motor|caballo|padel|natacion)\b/;

const CINEMA_RE =
  /\b(cine|cinema|pelicula|pelicula|film|movie|documental|audiovisual|proyeccion|projeccio)\b/;

const EDUCATION_RE =
  /\b(taller|curso|curs|charla|xerrada|conferencia|formacion|formacio|educa|jornada|seminario|biblioteca|lectura|infantil|familia)\b/;

const FOOD_RE =
  /\b(gastronom|mercado|mercat|comida|menjar|food|vino|vi\b|tapa|cata|cuina|cocina|producto)\b/;

const TECH_RE =
  /\b(tecnologia|technology|digital|robot|inteligencia artificial|software|startup|videojuego|gaming)\b/;

const matchSubcategory = (categorySlug, text) => {
  if (categorySlug === "musica") {
    if (/\b(festival|festivales|fest|primavera sound|cruilla|sonar|sónar)\b/.test(text)) return SUBCATEGORY.festivales;
    if (/\b(dj|electronic|electronica|electrónica|techno|house|dance)\b/.test(text)) return SUBCATEGORY.djElectronica;
    if (/\b(flamenco|sevillanas|rumba)\b/.test(text)) return SUBCATEGORY.flamenco;
    if (/\b(jazz|blues|swing|soul)\b/.test(text)) return SUBCATEGORY.jazzBlues;
    if (/\b(clasica|clásica|opera|ópera|orquesta|sinfonic|sinfónic|sinfonica|sinfónica|zarzuela)\b/.test(text)) return SUBCATEGORY.clasicaOpera;
    if (/\b(concierto|concert|recital|gira|tour|banda|cantante|cantautor|tributo|acustic|acústic)\b/.test(text)) return SUBCATEGORY.conciertos;
    return SUBCATEGORY.musicaOtros;
  }

  if (categorySlug === "deportes") {
    if (/\b(futbol|fútbol|football|soccer)\b/.test(text)) return SUBCATEGORY.futbol;
    if (/\b(running|carrera|carreras|cursa|maraton|maratón|trail)\b/.test(text)) return SUBCATEGORY.running;
    if (/\b(yoga|fitness|pilates|gimnasio|zumba)\b/.test(text)) return SUBCATEGORY.fitnessYoga;
    if (/\b(senderismo|sendero|trekking|montaña|montana|ruta)\b/.test(text)) return SUBCATEGORY.senderismo;
    if (/\b(motor|moto|motocicl|kart|rally|formula|fórmula)\b/.test(text)) return SUBCATEGORY.motor;
    if (/\b(basket|basquet|bàsquet|baloncesto)\b/.test(text)) return SUBCATEGORY.baloncesto;
    return SUBCATEGORY.deportesOtros;
  }

  if (categorySlug === "arte") {
    if (/\b(circo|circ|clown|malabares|acrobacia)\b/.test(text)) return SUBCATEGORY.circo;
    if (/\b(teatro|teatre|theatre|theater|escenicas|escénicas)\b/.test(text)) return SUBCATEGORY.teatro;
    if (/\b(exposicion|exposición|exposicio|exhibition|galeria|galería|pintura|escultura|fotografia|fotografía)\b/.test(text)) return SUBCATEGORY.exposiciones;
    if (/\b(danza|dansa|dance|ballet)\b/.test(text)) return SUBCATEGORY.danza;
    if (/\b(comedia|monologo|monólogo|humor|stand up)\b/.test(text)) return SUBCATEGORY.comediaMonologos;
    if (/\b(museo|museu|visita guiada|patrimonio|patrimoni|archivo)\b/.test(text)) return SUBCATEGORY.museosVisitas;
    return SUBCATEGORY.arteOtros;
  }

  if (categorySlug === "tecnologia") {
    if (/\b(gaming|videojuego|esports|e-sports)\b/.test(text)) return SUBCATEGORY.gaming;
    if (/\b(startup|emprend|empresa|networking)\b/.test(text)) return SUBCATEGORY.startups;
    if (/\b(ia|inteligencia artificial|software|programacion|programación|digital)\b/.test(text)) return SUBCATEGORY.iaSoftware;
    if (/\b(robot|robotica|robótica)\b/.test(text)) return SUBCATEGORY.robotica;
    return SUBCATEGORY.tecnologiaOtros;
  }

  if (categorySlug === "educacion") {
    if (/\b(taller|workshop)\b/.test(text)) return SUBCATEGORY.talleres;
    if (/\b(charla|xerrada|conferencia|coloquio)\b/.test(text)) return SUBCATEGORY.charlas;
    if (/\b(curso|curs|formacion|formación|seminario)\b/.test(text)) return SUBCATEGORY.cursos;
    if (/\b(infantil|familia|familiar|niños|ninos|kids)\b/.test(text)) return SUBCATEGORY.infantilFamiliar;
    return SUBCATEGORY.educacionOtros;
  }

  if (categorySlug === "gastronomia") {
    if (/\b(feria gastronom|fira gastronom|festival gastronom)\b/.test(text)) return SUBCATEGORY.feriasGastronomicas;
    if (/\b(cata|vino|vi\b|degustacion|degustación)\b/.test(text)) return SUBCATEGORY.catas;
    if (/\b(mercado|mercat|market)\b/.test(text)) return SUBCATEGORY.mercados;
    if (/\b(taller.*cocina|cocina|cuina|showcooking)\b/.test(text)) return SUBCATEGORY.talleresCocina;
    return SUBCATEGORY.gastronomiaOtros;
  }

  if (categorySlug === "cine") {
    if (/\b(documental|documentary)\b/.test(text)) return SUBCATEGORY.documentales;
    if (/\b(ciclo|proyeccion|proyección|projeccio|filmoteca)\b/.test(text)) return SUBCATEGORY.ciclosProyecciones;
    if (/\b(pelicula|película|film|movie|cine|cinema)\b/.test(text)) return SUBCATEGORY.peliculas;
    return SUBCATEGORY.cineOtros;
  }

  if (/\b(fiesta|festes|festa|fiestas populares|verbena|romeria|romería)\b/.test(text)) return SUBCATEGORY.fiestasPopulares;
  if (/\b(feria|fira|salon|salón)\b/.test(text)) return SUBCATEGORY.ferias;
  if (/\b(mercadillo|rastro|market|mercado)\b/.test(text)) return SUBCATEGORY.mercadillos;
  if (/\b(familia|familiar|infantil|niños|ninos|kids)\b/.test(text)) return SUBCATEGORY.familia;
  return SUBCATEGORY.otros;
};

function categoryFromText(...parts) {
  const text = normalizeText(parts.filter(Boolean).join(" "));

  if (!text) {
    return {
      ...CATEGORY.otro,
      subcategory_slug: SUBCATEGORY.otros.slug,
      subcategory_name: SUBCATEGORY.otros.name,
    };
  }

  const withSubcategory = (category) => {
    const subcategory = matchSubcategory(category.slug, text);
    return {
      ...category,
      subcategory_slug: subcategory.slug,
      subcategory_name: subcategory.name,
    };
  };

  if (has(text, SPORTS_RE)) return withSubcategory(CATEGORY.deportes);
  if (has(text, CINEMA_RE)) return withSubcategory(CATEGORY.cine);
  if (has(text, TECH_RE)) return withSubcategory(CATEGORY.tecnologia);
  if (has(text, FOOD_RE)) return withSubcategory(CATEGORY.gastronomia);
  if (has(text, EDUCATION_RE)) return withSubcategory(CATEGORY.educacion);

  const isClearlyMusic = has(text, MUSIC_RE);
  const isClearlyArt = has(text, ARTS_RE);

  if (isClearlyArt && !isClearlyMusic) return withSubcategory(CATEGORY.arte);
  if (isClearlyMusic && !isClearlyArt) return withSubcategory(CATEGORY.musica);

  if (isClearlyArt && isClearlyMusic) {
    const title = normalizeText(parts[0] || "");
    return has(title, MUSIC_RE) && !has(title, ARTS_RE)
      ? withSubcategory(CATEGORY.musica)
      : withSubcategory(CATEGORY.arte);
  }

  return withSubcategory(CATEGORY.otro);
}

export { categoryFromText };
