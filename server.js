const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'social-connect-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Database setup
const dbFile = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbFile);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    content TEXT,
    media_url TEXT,
    media_type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(post_id) REFERENCES posts(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id, user_id),
    FOREIGN KEY(post_id) REFERENCES posts(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
});

// Health endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Auth middleware
function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

// API Routes
app.post('/api/register', async (req, res) => {
  const { username, password, display_name } = req.body;
  if (!username || !password || !display_name) {
    return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    db.run(
      'INSERT INTO users (username, password_hash, display_name, avatar_url) VALUES (?, ?, ?, ?)',
      [username, hash, display_name, `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username)}`],
      function(err) {
        if (err) {
          return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });
        }
        req.session.userId = this.lastID;
        res.json({ success: true, userId: this.lastID });
      }
    );
  } catch (e) {
    res.status(500).json({ error: 'Lỗi server' });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err || !user) {
      return res.status(400).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
    }
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(400).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
    }
    req.session.userId = user.id;
    res.json({ success: true, user: { id: user.id, username: user.username, display_name: user.display_name, avatar_url: user.avatar_url } });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', isAuthenticated, (req, res) => {
  db.get('SELECT id, username, display_name, avatar_url, created_at FROM users WHERE id = ?', [req.session.userId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    res.json(user);
  });
});

// Posts
app.get('/api/posts', isAuthenticated, (req, res) => {
  const query = `
    SELECT p.*, u.username, u.display_name, u.avatar_url,
    (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as likes_count,
    (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id AND l.user_id = ?) as user_liked
    FROM posts p
    JOIN users u ON p.user_id = u.id
    ORDER BY p.created_at DESC
  `;
  db.all(query, [req.session.userId], (err, posts) => {
    if (err) return res.status(500).json({ error: 'Lỗi tải bài viết' });
    res.json(posts);
  });
});

app.post('/api/posts', isAuthenticated, (req, res) => {
  const { content, media_url, media_type } = req.body;
  if (!content && !media_url) {
    return res.status(400).json({ error: 'Bài viết không được để trống' });
  }
  db.run(
    'INSERT INTO posts (user_id, content, media_url, media_type) VALUES (?, ?, ?, ?)',
    [req.session.userId, content || '', media_url || null, media_type || null],
    function(err) {
      if (err) return res.status(500).json({ error: 'Không thể tạo bài viết' });
      res.json({ success: true, postId: this.lastID });
    }
  );
});

// Comments
app.get('/api/posts/:id/comments', isAuthenticated, (req, res) => {
  const query = `
    SELECT c.*, u.username, u.display_name, u.avatar_url
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `;
  db.all(query, [req.params.id], (err, comments) => {
    if (err) return res.status(500).json({ error: 'Lỗi tải bình luận' });
    res.json(comments);
  });
});

app.post('/api/posts/:id/comments', isAuthenticated, (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Bình luận trống' });
  db.run(
    'INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)',
    [req.params.id, req.session.userId, content],
    function(err) {
      if (err) return res.status(500).json({ error: 'Không thể thêm bình luận' });
      res.json({ success: true, commentId: this.lastID });
    }
  );
});

// Likes
app.post('/api/posts/:id/like', isAuthenticated, (req, res) => {
  const postId = req.params.id;
  const userId = req.session.userId;
  db.get('SELECT id FROM likes WHERE post_id = ? AND user_id = ?', [postId, userId], (err, row) => {
    if (row) {
      db.run('DELETE FROM likes WHERE post_id = ? AND user_id = ?', [postId, userId], () => {
        res.json({ success: true, liked: false });
      });
    } else {
      db.run('INSERT INTO likes (post_id, user_id) VALUES (?, ?)', [postId, userId], () => {
        res.json({ success: true, liked: true });
      });
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SocialConnect running on port ${PORT}`);
});
