CREATE TABLE IF NOT EXISTS book (
  id INTEGER PRIMARY KEY,
  title TEXT,
  author TEXT,
  price INTEGER,
  pages INTEGER
);

INSERT INTO book (title, author, price, pages) VALUES
  ('The Alchemist', 'Paulo Coelho', 299, 208),
  ('Wings of Fire', 'A. P. J. Abdul Kalam', 250, 180),
  ('Atomic Habits', 'James Clear', 499, 320),
  ('Clean Code', 'Robert C. Martin', 650, 464),
  ('The Pragmatic Programmer', 'Andrew Hunt', 720, 352),
  ('Ikigai', 'Hector Garcia', 350, 208),
  ('Deep Work', 'Cal Newport', 420, 304),
  ('The Psychology of Money', 'Morgan Housel', 399, 256),
  ('JavaScript: The Good Parts', 'Douglas Crockford', 380, 176),
  ('Eloquent JavaScript', 'Marijn Haverbeke', 550, 472);
