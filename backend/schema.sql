-- USERS
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  photo TEXT
);

-- EVENT CATEGORIES
CREATE TABLE IF NOT EXISTS event_categories (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT
);

-- Insert default categories
INSERT INTO event_categories (slug, name, icon, color) VALUES
  ('musica', 'Música', 'musical-notes', '#FF6B6B'),
  ('deportes', 'Deportes', 'football', '#4ECDC4'),
  ('arte', 'Arte', 'brush', '#FFE66D'),
  ('tecnologia', 'Tecnología', 'laptop', '#95E1D3'),
  ('educacion', 'Educación', 'school', '#A8E6CF'),
  ('gastronomia', 'Gastronomía', 'restaurant', '#FF8C94'),
  ('cine', 'Cine', 'film', '#A29BFE'),
  ('otro', 'Otro', 'star', '#DDA0DD')
ON CONFLICT (slug) DO NOTHING;

-- EVENTS
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  event_at DATE NOT NULL,
  location TEXT,
  type TEXT,
  category_id INTEGER REFERENCES event_categories(id) ON DELETE SET NULL,
  image TEXT,
  latitude FLOAT,
  longitude FLOAT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- FRIENDS (amistad unidireccional, puedes duplicar para bidireccional)
CREATE TABLE IF NOT EXISTS friends (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  friend_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, friend_id)
);

-- EVENT ATTENDEES (usuarios apuntados a eventos)
CREATE TABLE IF NOT EXISTS event_attendees (
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, user_id)
);

-- EVENT COMMENTS
CREATE TABLE IF NOT EXISTS event_comments (
  id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- EVENT COMMENTS
CREATE TABLE IF NOT EXISTS event_comments (
  id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices útiles
CREATE INDEX IF NOT EXISTS idx_event_attendees_user ON event_attendees(user_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_event ON event_attendees(event_id);
CREATE INDEX IF NOT EXISTS idx_event_comments_event ON event_comments(event_id);
CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend ON friends(friend_id);