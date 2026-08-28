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
  /\b(tecnologia|technology|digital|robot|ia|inteligencia artificial|programacion|software|startup|videojuego|gaming)\b/;

function categoryFromText(...parts) {
  const text = normalizeText(parts.filter(Boolean).join(" "));

  if (!text) return CATEGORY.otro;
  if (has(text, SPORTS_RE)) return CATEGORY.deportes;
  if (has(text, CINEMA_RE)) return CATEGORY.cine;
  if (has(text, TECH_RE)) return CATEGORY.tecnologia;
  if (has(text, FOOD_RE)) return CATEGORY.gastronomia;
  if (has(text, EDUCATION_RE)) return CATEGORY.educacion;

  const isClearlyMusic = has(text, MUSIC_RE);
  const isClearlyArt = has(text, ARTS_RE);

  if (isClearlyArt && !isClearlyMusic) return CATEGORY.arte;
  if (isClearlyMusic && !isClearlyArt) return CATEGORY.musica;

  if (isClearlyArt && isClearlyMusic) {
    const title = normalizeText(parts[0] || "");
    return has(title, MUSIC_RE) && !has(title, ARTS_RE)
      ? CATEGORY.musica
      : CATEGORY.arte;
  }

  return CATEGORY.otro;
}

export { categoryFromText };
