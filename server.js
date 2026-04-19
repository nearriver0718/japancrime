const express = require('express');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

// DBがなければseed.dbからコピー（初回起動時、または永続ディスクが空の場合）
const dbPath = process.env.DB_PATH || path.join(__dirname, 'forum.db');
const seedPath = path.join(__dirname, 'seed.db');
if (!fs.existsSync(dbPath) && fs.existsSync(seedPath)) {
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(seedPath, dbPath);
  console.log(`[init] Seeded database from ${seedPath} to ${dbPath}`);
}

const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const postLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: '投稿が多すぎます。しばらく待ってから再度お試しください。' }
});

// ============ SEO ============

// robots.txt（SEO・クローラー対応）
app.get('/robots.txt', (req, res) => {
  const siteUrl = process.env.SITE_URL || 'https://japancrime.com';
  res.type('text/plain').send(`User-agent: *
Allow: /
Sitemap: ${siteUrl}/sitemap.xml

User-agent: Googlebot
Allow: /

User-agent: Mediapartners-Google
Allow: /
`);
});

// sitemap.xml（SEO・検索エンジン対応）
app.get('/sitemap.xml', (req, res) => {
  const cases = db.prepare('SELECT slug, updated_at FROM cases ORDER BY updated_at DESC').all();
  const baseUrl = process.env.SITE_URL || 'https://japancrime.com';
  const today = new Date().toISOString().split('T')[0];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${baseUrl}/about</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${baseUrl}/privacy</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>${baseUrl}/rules</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>${baseUrl}/contact</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>`;

  for (const c of cases) {
    const lastmod = c.updated_at ? c.updated_at.split(' ')[0] : today;
    xml += `
  <url>
    <loc>${baseUrl}/case/${c.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
  }

  xml += '\n</urlset>';
  res.type('application/xml').send(xml);
});

// ============ API ============

// 事件一覧（ページネーション、検索、タグ絞り込み対応）
app.get('/api/cases', (req, res) => {
  const { page = 1, limit = 30, search, tag, year, sort = 'updated' } = req.query;
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];

  if (search) {
    conditions.push('(c.title LIKE ? OR c.summary LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term);
  }
  if (tag) {
    conditions.push('c.tags LIKE ?');
    params.push(`%${tag}%`);
  }
  if (year) {
    conditions.push('c.year = ?');
    params.push(Number(year));
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const orderMap = {
    updated: 'c.updated_at DESC',
    year_asc: 'c.year ASC, c.title ASC',
    year_desc: 'c.year DESC, c.title ASC',
    views: 'c.view_count DESC',
    posts: 'c.post_count_cache DESC',
  };
  const order = orderMap[sort] || orderMap.updated;

  const cases = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM posts WHERE case_id = c.id) as post_count
    FROM cases c
    ${where}
    ORDER BY ${order}
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), Number(offset));

  const countResult = db.prepare(`
    SELECT COUNT(*) as total FROM cases c ${where}
  `).get(...params);

  res.json({
    cases,
    total: countResult.total,
    page: Number(page),
    totalPages: Math.ceil(countResult.total / limit)
  });
});

// 全タグ一覧（フィルター用）
app.get('/api/tags', (req, res) => {
  const rows = db.prepare('SELECT tags FROM cases WHERE tags IS NOT NULL').all();
  const tagCount = {};
  for (const row of rows) {
    for (const tag of row.tags.split(',')) {
      const t = tag.trim();
      if (t) tagCount[t] = (tagCount[t] || 0) + 1;
    }
  }
  const tags = Object.entries(tagCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  res.json(tags);
});

// 年代一覧（フィルター用）
app.get('/api/years', (req, res) => {
  const rows = db.prepare('SELECT DISTINCT year FROM cases WHERE year IS NOT NULL ORDER BY year DESC').all();
  res.json(rows.map(r => r.year));
});

// 事件詳細
app.get('/api/cases/:slug', (req, res) => {
  const c = db.prepare('SELECT * FROM cases WHERE slug = ?').get(req.params.slug);
  if (!c) return res.status(404).json({ error: '事件が見つかりません' });

  db.prepare('UPDATE cases SET view_count = view_count + 1 WHERE id = ?').run(c.id);

  const posts = db.prepare('SELECT * FROM posts WHERE case_id = ? ORDER BY created_at ASC').all(c.id);
  res.json({ case: c, posts });
});

// 投稿
app.post('/api/cases/:slug/posts', postLimiter, (req, res) => {
  const { author_name, content } = req.body;
  const c = db.prepare('SELECT id FROM cases WHERE slug = ?').get(req.params.slug);
  if (!c) return res.status(404).json({ error: '事件が見つかりません' });
  if (!content || !content.trim()) return res.status(400).json({ error: '本文は必須です' });
  if (content.length > 5000) return res.status(400).json({ error: '本文は5000文字以内にしてください' });

  const name = (author_name || '').trim() || '名無しの探偵';
  db.prepare('INSERT INTO posts (case_id, author_name, content) VALUES (?, ?, ?)').run(c.id, name, content.trim());
  db.prepare('UPDATE cases SET updated_at = CURRENT_TIMESTAMP, post_count_cache = (SELECT COUNT(*) FROM posts WHERE case_id = ?) WHERE id = ?').run(c.id, c.id);

  res.json({ success: true });
});

// 統計
app.get('/api/stats', (req, res) => {
  const caseCount = db.prepare('SELECT COUNT(*) as count FROM cases').get().count;
  const postCount = db.prepare('SELECT COUNT(*) as count FROM posts').get().count;
  res.json({ caseCount, postCount });
});

// 管理用：事件の説明文を一括更新
app.post('/api/admin/update-cases', (req, res) => {
  const { updates } = req.body;
  if (!Array.isArray(updates)) return res.status(400).json({ error: 'updates array required' });
  const stmt = db.prepare('UPDATE cases SET summary = ?, title = COALESCE(?, title), tags = COALESCE(?, tags), year = COALESCE(?, year) WHERE slug = ?');
  const updateMany = db.transaction((items) => {
    let count = 0;
    for (const u of items) {
      if (u.slug && u.summary) {
        stmt.run(u.summary, u.title || null, u.tags || null, u.year || null, u.slug);
        count++;
      }
    }
    return count;
  });
  const count = updateMany(updates);
  res.json({ updated: count });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Japan Crime Forum is running at http://localhost:${PORT}`);
});
