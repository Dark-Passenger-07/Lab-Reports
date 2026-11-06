// Lab 3: REST API, query parameters, validation, and debugging
const express = require('express');
const path = require('path');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');

const app = express();
app.use(express.json()); // Parse incoming JSON request bodies

const dbPath = path.join(__dirname, 'books.db');
const PORT = process.env.PORT || 3000;
let db = null;

// Initialize database first, then start listening on PORT
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    console.log(`Database connected successfully at: ${dbPath}`);

    app.listen(PORT, (err) => {
      if (err) {
        if (err.code === 'EADDRINUSE') {
          console.error(`Port ${PORT} is already in use. Stop the other process or set PORT=3001 npm start`);
        } else {
          console.error(`Could not start server: ${err.message}`);
        }
        process.exit(1);
      }
      console.log(`Server running at http://localhost:${PORT}/`);
    });
  } catch (e) {
    console.error(`DB Initialization Error: ${e.message}`);
    process.exit(1);
  }
};

// Validation helper for POST and PUT request bodies
const validateBookBody = (body) => {
  if (!body || typeof body !== 'object') {
    return false;
  }
  const { title, author, price, pages } = body;
  if (
    typeof title !== 'string' || title.trim() === '' ||
    typeof author !== 'string' || author.trim() === '' ||
    typeof price !== 'number' || Number.isNaN(price) || price < 0 ||
    typeof pages !== 'number' || !Number.isInteger(pages) || pages <= 0
  ) {
    return false;
  }
  return true;
};

// Helper to validate numeric ID path parameters
const isValidId = (id) => {
  const num = Number(id);
  return Number.isInteger(num) && num > 0 && String(num) === String(id).trim();
};

// Root route: redirect to /books/
app.get('/', (req, res) => {
  res.redirect('/books/');
});

// GET /books/ - List books with search, filter, sort, and pagination
app.get('/books/', async (req, res) => {
  try {
    const {
      search_q = '',
      order_by,
      order,
      limit,
      offset,
      min_price,
      max_price,
    } = req.query;

    // 1. Strict allowlist validation for ORDER BY column
    const allowedColumns = ['id', 'title', 'author', 'price', 'pages'];
    let sanitizedOrderBy = 'id';
    if (order_by !== undefined) {
      const lowerOrderBy = String(order_by).toLowerCase();
      if (!allowedColumns.includes(lowerOrderBy)) {
        return res.status(400).json({
          message: `Invalid order_by column '${order_by}'. Allowed columns: ${allowedColumns.join(', ')}`,
        });
      }
      sanitizedOrderBy = lowerOrderBy;
    }

    // 2. Strict validation for sort direction (ASC or DESC)
    let sanitizedOrder = 'ASC';
    if (order !== undefined) {
      const upperOrder = String(order).toUpperCase();
      if (upperOrder !== 'ASC' && upperOrder !== 'DESC') {
        return res.status(400).json({
          message: `Invalid order direction '${order}'. Allowed values: ASC, DESC`,
        });
      }
      sanitizedOrder = upperOrder;
    }

    // 3. Strict validation for pagination (limit & offset)
    let parsedLimit = 10;
    if (limit !== undefined) {
      const numLimit = Number(limit);
      if (!Number.isInteger(numLimit) || numLimit <= 0) {
        return res.status(400).json({
          message: "Invalid limit. Must be a positive integer",
        });
      }
      parsedLimit = numLimit;
    }

    let parsedOffset = 0;
    if (offset !== undefined) {
      const numOffset = Number(offset);
      if (!Number.isInteger(numOffset) || numOffset < 0) {
        return res.status(400).json({
          message: "Invalid offset. Must be a non-negative integer",
        });
      }
      parsedOffset = numOffset;
    }

    // 4. Strict validation for price-range filters (min_price & max_price)
    let numMinPrice;
    if (min_price !== undefined) {
      numMinPrice = Number(min_price);
      if (Number.isNaN(numMinPrice) || numMinPrice < 0) {
        return res.status(400).json({
          message: "Invalid min_price. Must be a non-negative number",
        });
      }
    }

    let numMaxPrice;
    if (max_price !== undefined) {
      numMaxPrice = Number(max_price);
      if (Number.isNaN(numMaxPrice) || numMaxPrice < 0) {
        return res.status(400).json({
          message: "Invalid max_price. Must be a non-negative number",
        });
      }
    }

    if (numMinPrice !== undefined && numMaxPrice !== undefined && numMinPrice > numMaxPrice) {
      return res.status(400).json({
        message: "Invalid price range: min_price cannot be greater than max_price",
      });
    }

    // 5. Build dynamic SQL query with parameterized values
    const conditions = ['title LIKE ?'];
    const queryParams = [`%${search_q}%`];

    if (numMinPrice !== undefined && numMaxPrice !== undefined) {
      conditions.push('price BETWEEN ? AND ?');
      queryParams.push(numMinPrice, numMaxPrice);
    } else if (numMinPrice !== undefined) {
      conditions.push('price >= ?');
      queryParams.push(numMinPrice);
    } else if (numMaxPrice !== undefined) {
      conditions.push('price <= ?');
      queryParams.push(numMaxPrice);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const sqlQuery = `
      SELECT * FROM book
      ${whereClause}
      ORDER BY ${sanitizedOrderBy} ${sanitizedOrder}
      LIMIT ? OFFSET ?;
    `;

    queryParams.push(parsedLimit, parsedOffset);

    const books = await db.all(sqlQuery, queryParams);
    res.status(200).json(books);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /books/:bookId/ - Retrieve a single book
app.get('/books/:bookId/', async (req, res) => {
  try {
    const { bookId } = req.params;
    if (!isValidId(bookId)) {
      return res.status(400).json({ message: 'Invalid book ID. Must be a positive integer' });
    }

    const book = await db.get('SELECT * FROM book WHERE id = ?;', [bookId]);
    if (!book) {
      return res.status(404).json({ message: 'Book not found' });
    }

    res.status(200).json(book);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /books/ - Create a new book
app.post('/books/', async (req, res) => {
  try {
    if (!validateBookBody(req.body)) {
      return res.status(400).json({
        message: 'Invalid input: title, author, non-negative price, and positive pages are required',
      });
    }

    const { title, author, price, pages } = req.body;
    const result = await db.run(
      'INSERT INTO book (title, author, price, pages) VALUES (?, ?, ?, ?);',
      [title.trim(), author.trim(), price, pages]
    );

    res.status(201).json({
      message: 'Book added successfully',
      bookId: result.lastID,
    });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /books/:bookId/ - Update an existing book
app.put('/books/:bookId/', async (req, res) => {
  try {
    const { bookId } = req.params;
    if (!isValidId(bookId)) {
      return res.status(400).json({ message: 'Invalid book ID. Must be a positive integer' });
    }

    if (!validateBookBody(req.body)) {
      return res.status(400).json({
        message: 'Invalid input: title, author, non-negative price, and positive pages are required',
      });
    }

    const { title, author, price, pages } = req.body;
    const result = await db.run(
      'UPDATE book SET title = ?, author = ?, price = ?, pages = ? WHERE id = ?;',
      [title.trim(), author.trim(), price, pages, bookId]
    );

    if (result.changes === 0) {
      return res.status(404).json({ message: 'Book not found' });
    }

    res.status(200).json({ message: 'Book updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /books/:bookId/ - Delete a book
app.delete('/books/:bookId/', async (req, res) => {
  try {
    const { bookId } = req.params;
    if (!isValidId(bookId)) {
      return res.status(400).json({ message: 'Invalid book ID. Must be a positive integer' });
    }

    const result = await db.run('DELETE FROM book WHERE id = ?;', [bookId]);
    if (result.changes === 0) {
      return res.status(404).json({ message: 'Book not found' });
    }

    res.status(200).json({ message: 'Book deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Catch-all 404 for any unregistered endpoint
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Global error handler (handles malformed JSON body)
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON body' });
  }
  console.error(err.message);
  res.status(500).json({ message: 'Internal server error' });
});

// Start server if executed directly
if (require.main === module) {
  initializeDBAndServer();
}

module.exports = { app, initializeDBAndServer };
