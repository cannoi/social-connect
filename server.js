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

const dbFile = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbFile);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    cover_url TEXT,
    bio TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    community_id INTEGER,
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id, user_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    follower_id INTEGER NOT NULL,
    following_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(follower_id, following_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS communities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    description TEXT,
    avatar TEXT,
    cover TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS community_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    community_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(community_id, user_id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    actor_id INTEGER,
    target_id INTEGER,
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`ALTER TABLE users ADD COLUMN bio TEXT`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN cover_url TEXT`, () => {});
  db.run(`ALTER TABLE posts ADD COLUMN community_id INTEGER`, () => {});
  seedDefaults();
});

async function seedDefaults() {
  try {
    const bot = await get('SELECT id FROM users WHERE username = ?', ['connectbot']);
    if (!bot) {
      const hash = await bcrypt.hash('connectbot-internal', 10);
      await run(
        'INSERT INTO users (username, password_hash, display_name, avatar_url, bio) VALUES (?, ?, ?, ?, ?)',
        ['connectbot', hash, 'Connect Assistant', 'https://api.dicebear.com/7.x/bottts/svg?seed=connect', 'Helpful assistant. Reply in your language.']
      );
    }
    const count = await get('SELECT COUNT(*) as c FROM communities');
    if (!count || count.c === 0) {
      const seeds = [
        ['Welcome', 'welcome', 'Meet people and share your first posts.', '👋', '#dbeafe'],
        ['Photos', 'photos', 'Share everyday moments and pictures.', '📷', '#fce7f3'],
        ['Ideas', 'ideas', 'Talk about projects, hobbies, and plans.', '💡', '#fef3c7'],
        ['Local Life', 'local', 'Neighborhood tips, events, and help.', '🏡', '#dcfce7']
      ];
      for (const s of seeds) {
        await run('INSERT INTO communities (name, slug, description, avatar, cover) VALUES (?, ?, ?, ?, ?)', s);
      }
    }
  } catch (e) {
    console.error('seed error', e.message);
  }
}

function detectLang(text) {
  const t = String(text || '');
  if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(t)) return 'vi';
  if (/[áéíóúñ¿¡]/i.test(t)) return 'es';
  if (/[àâçéèêëîïôùûüÿœ]/i.test(t)) return 'fr';
  if (/[äöüß]/i.test(t)) return 'de';
  if (/[\u3040-\u30ff\u4e00-\u9faf]/.test(t)) return 'ja';
  if (/[\u0400-\u04FF]/.test(t)) return 'ru';
  if (/[\u0600-\u06FF]/.test(t)) return 'ar';
  if (/[\u0E00-\u0E7F]/.test(t)) return 'th';
  if (/[\uAC00-\uD7AF]/.test(t)) return 'ko';
  return 'en';
}

function aiReply(text) {
  const lang = detectLang(text);
  const lower = String(text || '').toLowerCase();
  const replies = {
    vi: {
      hello: 'Xin chào! Mình là Connect Assistant. Bạn muốn chia sẻ điều gì hôm nay?',
      thanks: 'Rất vui được giúp bạn. Cứ nhắn nếu cần thêm.',
      help: 'Bạn có thể đăng bài, theo dõi bạn bè, tham gia cộng đồng và nhắn tin ngay tại đây.',
      default: 'Mình đã nhận tin của bạn. Hãy kể thêm một chút để mình hỗ trợ rõ hơn nhé.'
    },
    en: {
      hello: 'Hi! I am Connect Assistant. What would you like to share today?',
      thanks: 'Happy to help. Message anytime.',
      help: 'You can post, follow people, join communities, and chat right here.',
      default: 'Got your message. Tell me a bit more and I will help.'
    },
    es: {
      hello: 'Hola! Soy Connect Assistant. Que quieres compartir hoy?',
      thanks: 'Encantado de ayudar.',
      help: 'Puedes publicar, seguir personas y unirte a comunidades.',
      default: 'Recibi tu mensaje. Cuentame un poco mas.'
    },
    fr: {
      hello: 'Bonjour ! Je suis Connect Assistant. Que voulez-vous partager ?',
      thanks: 'Avec plaisir.',
      help: 'Vous pouvez publier, suivre des amis et rejoindre des communautes.',
      default: 'Message recu. Dites-m en un peu plus.'
    },
    de: {
      hello: 'Hallo! Ich bin Connect Assistant. Was mochtest du teilen?',
      thanks: 'Gern geschehen.',
      help: 'Du kannst posten, folgen und Communities beitreten.',
      default: 'Nachricht erhalten. Erzahl mir etwas mehr.'
    },
    ja: {
      hello: 'こんにちは。Connect Assistantです。今日は何をシェアしますか？',
      thanks: 'どういたしまして。',
      help: '投稿、フォロー、コミュニティ参加ができます。',
      default: 'メッセージを受け取りました。もう少し教えてください。'
    },
    ru: {
      hello: 'Privet! Ya Connect Assistant. Chem podelitsya segodnya?',
      thanks: 'Rad pomoch.',
      help: 'Mozhno publikovat, podpisyvatsya i vstupat v soobshchestva.',
      default: 'Soobshchenie polucheno. Rasskazhite chut bolshe.'
    },
    ar: {
      hello: 'Marhaban! Ana mosaed Connect.',
      thanks: 'Saeed bialmusaeadati.',
      help: 'Yumkinuk alnashr wamutabaeat alakharin.',
      default: 'Wasalat risalatuk. Akhbirni bialmazid.'
    },
    th: {
      hello: 'Sawasdee! Chan khue Connect Assistant',
      thanks: 'Yindi chuai samoe',
      help: 'Post follow lae khao chumchon dai thi ni',
      default: 'Dai rap kho khwam laew'
    },
    ko: {
      hello: 'Annyeonghaseyo! Connect Assistant imnida.',
      thanks: 'Doumi doeeo gippeumnida.',
      help: 'Gesí, follow, community chamyeo ganeunghamnida.',
      default: 'Mesejireul badasseoyo.'
    }
  };
  const pack = replies[lang] || replies.en;
  if (/(hello|hi|hey|xin chào|chào|hola|bonjour|hallo|ciao|안녕|こんにちは)/i.test(lower)) return pack.hello;
  if (/(thanks|thank|cảm ơn|gracias|merci|danke|고마)/i.test(lower)) return pack.thanks;
  if (/(help|giúp|ayuda|aide|hilfe|ช่วย|도움)/i.test(lower)) return pack.help;
  return pack.default;
}

async function notify(userId, type, actorId, targetId) {
  if (!userId || userId === actorId) return;
  await run(
    'INSERT INTO notifications (user_id, type, actor_id, target_id) VALUES (?, ?, ?, ?)',
    [userId, type, actorId || null, targetId || null]
  );
}

function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.status(401).json({ error: 'Please sign in' });
}

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

app.post('/api/register', async (req, res) => {
  const { username, password, display_name } = req.body;
  if (!username || !password || !display_name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await run(
      'INSERT INTO users (username, password_hash, display_name, avatar_url, bio) VALUES (?, ?, ?, ?, ?)',
      [username, hash, display_name, 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(username), '']
    );
    req.session.userId = result.lastID;
    const welcome = await get('SELECT id FROM communities WHERE slug = ?', ['welcome']);
    if (welcome) {
      await run('INSERT OR IGNORE INTO community_members (community_id, user_id) VALUES (?, ?)', [welcome.id, result.lastID]);
    }
    res.json({ success: true, userId: result.lastID });
  } catch (e) {
    res.status(400).json({ error: 'Username already taken' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return res.status(400).json({ error: 'Wrong username or password' });
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(400).json({ error: 'Wrong username or password' });
    req.session.userId = user.id;
    res.json({ success: true, user: { id: user.id, username: user.username, display_name: user.display_name, avatar_url: user.avatar_url } });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', isAuthenticated, async (req, res) => {
  try {
    const user = await get(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.cover_url, u.bio, u.created_at,
        (SELECT COUNT(*) FROM follows f WHERE f.following_id = u.id) as followers,
        (SELECT COUNT(*) FROM follows f WHERE f.follower_id = u.id) as following
       FROM users u WHERE u.id = ?`,
      [req.session.userId]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/me', isAuthenticated, async (req, res) => {
  const { display_name, bio, avatar_url } = req.body;
  try {
    await run(
      'UPDATE users SET display_name = COALESCE(?, display_name), bio = COALESCE(?, bio), avatar_url = COALESCE(?, avatar_url) WHERE id = ?',
      [display_name || null, bio != null ? bio : null, avatar_url || null, req.session.userId]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Cannot update profile' });
  }
});

function postSelect(extraWhere) {
  extraWhere = extraWhere || '';
  return `
    SELECT p.*, u.username, u.display_name, u.avatar_url,
      c.name as community_name,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as likes_count,
      (SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id) as comments_count,
      (SELECT COUNT(*) FROM shares s WHERE s.post_id = p.id) as shares_count,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id AND l.user_id = ?) as user_liked
    FROM posts p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN communities c ON c.id = p.community_id
    ${extraWhere}
    ORDER BY p.created_at DESC
    LIMIT 80
  `;
}

app.get('/api/posts', isAuthenticated, async (req, res) => {
  try {
    const tab = req.query.tab === 'following' ? 'following' : 'foryou';
    let sql = postSelect();
    let params = [req.session.userId];
    if (tab === 'following') {
      sql = postSelect('WHERE p.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?)');
      params = [req.session.userId, req.session.userId];
    }
    const posts = await all(sql, params);
    res.json(posts);
  } catch (e) {
    res.status(500).json({ error: 'Cannot load posts' });
  }
});

app.post('/api/posts', isAuthenticated, async (req, res) => {
  const { content, media_url, media_type, community_id } = req.body;
  if (!content && !media_url) return res.status(400).json({ error: 'Post cannot be empty' });
  try {
    const result = await run(
      'INSERT INTO posts (user_id, content, media_url, media_type, community_id) VALUES (?, ?, ?, ?, ?)',
      [req.session.userId, content || '', media_url || null, media_type || null, community_id || null]
    );
    res.json({ success: true, postId: result.lastID });
  } catch (e) {
    res.status(500).json({ error: 'Cannot create post' });
  }
});

app.get('/api/posts/:id/comments', isAuthenticated, async (req, res) => {
  try {
    const comments = await all(
      `SELECT c.*, u.username, u.display_name, u.avatar_url
       FROM comments c JOIN users u ON c.user_id = u.id
       WHERE c.post_id = ? ORDER BY c.created_at ASC`,
      [req.params.id]
    );
    res.json(comments);
  } catch (e) {
    res.status(500).json({ error: 'Cannot load comments' });
  }
});

app.post('/api/posts/:id/comments', isAuthenticated, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Empty comment' });
  try {
    const result = await run(
      'INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)',
      [req.params.id, req.session.userId, content]
    );
    const post = await get('SELECT user_id FROM posts WHERE id = ?', [req.params.id]);
    if (post) await notify(post.user_id, 'comment', req.session.userId, Number(req.params.id));
    res.json({ success: true, commentId: result.lastID });
  } catch (e) {
    res.status(500).json({ error: 'Cannot add comment' });
  }
});

app.post('/api/posts/:id/like', isAuthenticated, async (req, res) => {
  const postId = req.params.id;
  const userId = req.session.userId;
  try {
    const row = await get('SELECT id FROM likes WHERE post_id = ? AND user_id = ?', [postId, userId]);
    if (row) {
      await run('DELETE FROM likes WHERE post_id = ? AND user_id = ?', [postId, userId]);
      return res.json({ success: true, liked: false });
    }
    await run('INSERT INTO likes (post_id, user_id) VALUES (?, ?)', [postId, userId]);
    const post = await get('SELECT user_id FROM posts WHERE id = ?', [postId]);
    if (post) await notify(post.user_id, 'like', userId, Number(postId));
    res.json({ success: true, liked: true });
  } catch (e) {
    res.status(500).json({ error: 'Cannot like post' });
  }
});

app.post('/api/posts/:id/share', isAuthenticated, async (req, res) => {
  try {
    await run('INSERT INTO shares (post_id, user_id) VALUES (?, ?)', [req.params.id, req.session.userId]);
    const post = await get('SELECT user_id FROM posts WHERE id = ?', [req.params.id]);
    if (post) await notify(post.user_id, 'share', req.session.userId, Number(req.params.id));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Cannot share' });
  }
});

app.get('/api/people', isAuthenticated, async (req, res) => {
  try {
    const people = await all(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.bio,
        (SELECT COUNT(*) FROM follows f WHERE f.following_id = u.id) as followers,
        EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.following_id = u.id) as is_following
       FROM users u
       WHERE u.id != ? AND u.username != 'connectbot'
       ORDER BY followers DESC, u.created_at DESC
       LIMIT 40`,
      [req.session.userId, req.session.userId]
    );
    res.json(people);
  } catch (e) {
    res.status(500).json({ error: 'Cannot load people' });
  }
});

app.post('/api/follow/:id', isAuthenticated, async (req, res) => {
  const target = Number(req.params.id);
  if (target === req.session.userId) return res.status(400).json({ error: 'Cannot follow yourself' });
  try {
    const row = await get('SELECT id FROM follows WHERE follower_id = ? AND following_id = ?', [req.session.userId, target]);
    if (row) {
      await run('DELETE FROM follows WHERE follower_id = ? AND following_id = ?', [req.session.userId, target]);
      return res.json({ success: true, following: false });
    }
    await run('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)', [req.session.userId, target]);
    await notify(target, 'follow', req.session.userId, target);
    res.json({ success: true, following: true });
  } catch (e) {
    res.status(500).json({ error: 'Cannot follow' });
  }
});

app.get('/api/communities', isAuthenticated, async (req, res) => {
  try {
    const rows = await all(
      `SELECT c.*,
        (SELECT COUNT(*) FROM community_members m WHERE m.community_id = c.id) as members,
        EXISTS(SELECT 1 FROM community_members m WHERE m.community_id = c.id AND m.user_id = ?) as joined
       FROM communities c ORDER BY members DESC, c.id ASC`,
      [req.session.userId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Cannot load communities' });
  }
});

app.post('/api/communities/:id/join', isAuthenticated, async (req, res) => {
  try {
    const row = await get('SELECT id FROM community_members WHERE community_id = ? AND user_id = ?', [req.params.id, req.session.userId]);
    if (row) {
      await run('DELETE FROM community_members WHERE community_id = ? AND user_id = ?', [req.params.id, req.session.userId]);
      return res.json({ success: true, joined: false });
    }
    await run('INSERT INTO community_members (community_id, user_id) VALUES (?, ?)', [req.params.id, req.session.userId]);
    res.json({ success: true, joined: true });
  } catch (e) {
    res.status(500).json({ error: 'Cannot join' });
  }
});

app.get('/api/communities/:id/posts', isAuthenticated, async (req, res) => {
  try {
    const posts = await all(postSelect('WHERE p.community_id = ?'), [req.session.userId, req.params.id]);
    res.json(posts);
  } catch (e) {
    res.status(500).json({ error: 'Cannot load community posts' });
  }
});

app.get('/api/conversations', isAuthenticated, async (req, res) => {
  try {
    const uid = req.session.userId;
    const rows = await all(
      `SELECT u.id, u.username, u.display_name, u.avatar_url,
        (SELECT content FROM messages m WHERE (m.sender_id = u.id AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = u.id)
         ORDER BY m.created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages m WHERE (m.sender_id = u.id AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = u.id)
         ORDER BY m.created_at DESC LIMIT 1) as last_at
       FROM users u
       WHERE u.id != ? AND (
         EXISTS(SELECT 1 FROM messages m WHERE (m.sender_id = u.id AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = u.id))
         OR u.username = 'connectbot'
       )
       ORDER BY last_at DESC`,
      [uid, uid, uid, uid, uid, uid, uid]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Cannot load conversations' });
  }
});

app.get('/api/messages/:userId', isAuthenticated, async (req, res) => {
  try {
    const rows = await all(
      `SELECT m.*, u.display_name, u.avatar_url FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE (m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)
       ORDER BY m.created_at ASC`,
      [req.session.userId, req.params.userId, req.params.userId, req.session.userId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Cannot load messages' });
  }
});

app.post('/api/messages/:userId', isAuthenticated, async (req, res) => {
  const content = (req.body.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Empty message' });
  try {
    const target = await get('SELECT id, username FROM users WHERE id = ?', [req.params.userId]);
    if (!target) return res.status(404).json({ error: 'User not found' });
    const result = await run(
      'INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)',
      [req.session.userId, target.id, content]
    );
    await notify(target.id, 'message', req.session.userId, result.lastID);
    let botMessage = null;
    if (target.username === 'connectbot') {
      const reply = aiReply(content);
      const botRes = await run(
        'INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)',
        [target.id, req.session.userId, reply]
      );
      botMessage = { id: botRes.lastID, sender_id: target.id, receiver_id: req.session.userId, content: reply };
    }
    res.json({ success: true, id: result.lastID, botMessage });
  } catch (e) {
    res.status(500).json({ error: 'Cannot send message' });
  }
});

app.get('/api/notifications', isAuthenticated, async (req, res) => {
  try {
    const rows = await all(
      `SELECT n.*, a.display_name as actor_name, a.avatar_url as actor_avatar
       FROM notifications n
       LEFT JOIN users a ON a.id = n.actor_id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC LIMIT 50`,
      [req.session.userId]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Cannot load notifications' });
  }
});

app.post('/api/notifications/read', isAuthenticated, async (req, res) => {
  await run('UPDATE notifications SET read = 1 WHERE user_id = ?', [req.session.userId]);
  res.json({ success: true });
});

app.get('/api/extensions', isAuthenticated, (req, res) => {
  res.json([
    { id: 'files', name: 'Files', description: 'Keep photos and documents in your space.', icon: '📁', category: 'space' },
    { id: 'blog', name: 'Notes', description: 'Longer writing when a post is not enough.', icon: '✍️', category: 'create' },
    { id: 'games', name: 'Games', description: 'Light games with friends.', icon: '🎮', category: 'fun' },
    { id: 'assistant', name: 'Assistant', description: 'Ask for help in your language.', icon: '✨', category: 'help' },
    { id: 'calendar', name: 'Calendar', description: 'Remember plans and events.', icon: '📅', category: 'life' }
  ]);
});

app.get('/api/space', isAuthenticated, async (req, res) => {
  try {
    const posts = await all(postSelect('WHERE p.user_id = ?'), [req.session.userId, req.session.userId]);
    const photos = posts.filter(p => p.media_url);
    const communities = await all(
      `SELECT c.* FROM communities c
       JOIN community_members m ON m.community_id = c.id
       WHERE m.user_id = ?`,
      [req.session.userId]
    );
    res.json({ posts, photos, communities });
  } catch (e) {
    res.status(500).json({ error: 'Cannot load space' });
  }
});

app.get('/api/trending', isAuthenticated, async (req, res) => {
  try {
    const posts = await all(
      `SELECT p.id, p.content, (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as likes_count
       FROM posts p ORDER BY likes_count DESC, p.created_at DESC LIMIT 5`
    );
    res.json(posts);
  } catch (e) {
    res.json([]);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SocialConnect running on port ${PORT}`);
});
