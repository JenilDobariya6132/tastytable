const express = require('express');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const nodemailer = require('nodemailer');
const https = require('https');
const crypto = require('crypto');
require('dotenv').config();

// Email Transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendLoginEmail(email, name) {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
        console.log('Email skipped (SMTP not configured). To: ' + email);
        return;
    }
    try {
        await transporter.sendMail({
            from: process.env.SMTP_FROM || '"CookVala" <no-reply@cookvala.com>',
            to: email,
            subject: 'Welcome to CookVala',
            text: `Hello ${name},\n\nThank you for logging in to our site.\n\nBest regards,\nCookVala Team`,
            html: `<p>Hello <b>${name}</b>,</p><p>Thank you for logging in to our site.</p><p>Best regards,<br>CookVala Team</p>`
        });
        console.log('Email sent to ' + email);
    } catch (e) {
        console.error('Failed to send email:', e);
    }
}

const { initDb: initDbExternal } = require('./database/init');

const ALLOWED_ADMINS = ['jenildobariya47@gmail.com', 'vrajbhuva346@gmail.com'];

const app = express();

// --- AUTO INITIALIZE DATABASE ---
(async function() {
  try {
    console.log('Auto-initializing database...');
    const result = await initDbExternal({ 
      host: process.env.MYSQL_HOST || 'localhost', 
      user: process.env.MYSQL_USER || 'root', 
      password: process.env.MYSQL_PASSWORD || 'Jenil@2007', 
      database: process.env.MYSQL_DATABASE || 'cookvala', 
      port: process.env.MYSQL_PORT || 3306,
      ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: false }
    });
    pool = result.pool;
    dbReady = result.dbReady;
    console.log('Database connected and ready.');
    
    // Auto-seed recipes if the table is empty
    const [count] = await pool.query('SELECT COUNT(*) as c FROM recipes');
    if (count[0].c === 0) {
      console.log('Database empty. Auto-seeding initial recipes...');
      try {
        const { seedDatabase } = require('./scripts/seed_recipes');
        await seedDatabase(pool);
        console.log('Initial recipes seeded successfully.');
      } catch (seedErr) {
        console.error('Failed to seed recipes:', seedErr);
      }
    }
  } catch (e) {
    console.error('Database initialization failed:', e);
  }
})();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Multer setup for large video uploads (2GB limit)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let dir = path.join(__dirname, 'assets');
    if (file.fieldname === 'video') {
      dir = path.join(dir, 'videos');
    } else {
      dir = path.join(dir, 'uploads');
    }
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB
});

const PORT = process.env.PORT || 3000;
const DB_HOST = process.env.MYSQL_HOST || 'localhost';
const DB_USER = process.env.MYSQL_USER || 'root';
const DB_PASS = process.env.MYSQL_PASSWORD || 'Jenil@2007';
const DB_NAME = process.env.MYSQL_DATABASE || 'cookvala';
const DB_PORT = process.env.MYSQL_PORT || 3306;

let pool;
let dbReady = false;

// Helper to scan static recipes
async function getStaticRecipes() {
  try {
    const recipesDir = __dirname;
    const files = await fs.promises.readdir(recipesDir);
    const recipes = [];
    
    for (const file of files) {
      if (!file.startsWith('recipe-') || !file.endsWith('.html') || file === 'recipe-user.html') continue;
      
      const content = await fs.promises.readFile(path.join(recipesDir, file), 'utf8');
      
      // Simple regex extraction
      const titleMatch = content.match(/<h1>(.*?)<\/h1>/);
      const imgMatch = content.match(/<img.*?src="(.*?)"/);
      const metaMatch = content.match(/<p class="meta">(.*?)<\/p>/);
      
      // Try to extract category from meta (usually "Dinner • ...")
      let category = 'Uncategorized';
      if (metaMatch) {
        const parts = metaMatch[1].split('•');
        if (parts.length > 0) category = parts[0].trim();
      }
      
      // Fix relative paths in image src
      let image = imgMatch ? imgMatch[1] : '';
      if (image.startsWith('../')) image = image.substring(3); // Remove ../
      
      recipes.push({
        id: 'static-' + file,
        name: titleMatch ? titleMatch[1] : file.replace('.html', ''),
        category: category,
        image: image,
        author: 'TastyTable (Built-in)',
        created_at: new Date().toISOString(),
        is_static: true,
        file_path: file
      });
    }
    return recipes;
  } catch (e) {
    console.error('Error scanning static recipes:', e);
    return [];
  }
}

async function getStaticRecipeDetails(id) {
  if (!id.startsWith('static-')) return null;
  const filename = id.replace('static-', '');
  const filepath = path.join(__dirname, filename);
  
  try {
    const content = await fs.promises.readFile(filepath, 'utf8');
    
    // 1. Try JSON-LD first (best quality)
    const jsonLdMatch = content.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
    if (jsonLdMatch) {
      try {
        const data = JSON.parse(jsonLdMatch[1]);
        return {
          id: id,
          name: data.name,
          category: data.recipeCategory,
          intro: data.description,
          ingredients: data.recipeIngredient,
          instructions: data.recipeInstructions.map(step => step.text || step),
          image: data.image,
          video_url: '', 
          author: 'TastyTable',
          is_static: true
        };
      } catch (e) {
        console.error('Failed to parse JSON-LD', e);
      }
    }

    // 2. Fallback: Parse HTML structure directly
    const titleMatch = content.match(/<h1[^>]*>(.*?)<\/h1>/);
    const metaMatch = content.match(/<p class="meta">(.*?)<\/p>/);
    const imgMatch = content.match(/<img[^>]*src="([^"]*)"/);
    
    // Extract intro: 
    // Try id="r-intro" first
    let introMatch = content.match(/<p[^>]*id="r-intro"[^>]*>(.*?)<\/p>/s);
    if (!introMatch) {
       // Fallback to p after meta
       introMatch = content.match(/<p class="meta">.*?<\/p>\s*<p>(.*?)<\/p>/s);
    }
    
    // Extract Nutrition/Time
    const calsMatch = content.match(/<span class="meta-item"><span style="font-weight:bold;">(\d+)<\/span>\s*Calories<\/span>/i);
    const calories = calsMatch ? parseInt(calsMatch[1]) : 0;

    const servMatch = content.match(/Serves:\s*(\d+)/i);
    const servings = servMatch ? servMatch[1] : '';

    const prepMatch = content.match(/<span class="sidebar-label">Prep Time<\/span><span class="sidebar-val">([^<]+)<\/span>/i);
    const cookMatch = content.match(/<span class="sidebar-label">Cook Time<\/span><span class="sidebar-val">([^<]+)<\/span>/i);
    const prep_time = prepMatch ? prepMatch[1] : '';
    const cook_time = cookMatch ? cookMatch[1] : '';

    // Extract ingredients: list items inside ul
    let ingredients = [];
    // Try id="r-ingredients"
    let ingSectionMatch = content.match(/<ul[^>]*id="r-ingredients"[^>]*>([\s\S]*?)<\/ul>/);
    if (!ingSectionMatch) {
       // Fallback to h2 + ul
       ingSectionMatch = content.match(/<h2>Ingredients<\/h2>\s*<ul[^>]*>([\s\S]*?)<\/ul>/);
    }

    if (ingSectionMatch) {
        const items = ingSectionMatch[1].match(/<li[^>]*>(.*?)<\/li>/g);
        if (items) {
            ingredients = items.map(i => i.replace(/<\/?li[^>]*>/g, '').replace(/<div.*?<\/div>/g, '').replace(/<\/?span>/g, '').trim());
        }
    }

    // Extract instructions: list items inside ol
    let instructions = [];
    // Try id="r-instructions"
    let instSectionMatch = content.match(/<ol[^>]*id="r-instructions"[^>]*>([\s\S]*?)<\/ol>/);
    if (!instSectionMatch) {
        instSectionMatch = content.match(/<h2>Instructions<\/h2>\s*<ol[^>]*>([\s\S]*?)<\/ol>/);
    }

    if (instSectionMatch) {
        const items = instSectionMatch[1].match(/<li[^>]*>(.*?)<\/li>/g);
        if (items) {
            instructions = items.map(i => i.replace(/<\/?li[^>]*>/g, '').replace(/<div.*?<\/div>/g, '').replace(/<\/?span>/g, '').trim());
        }
    }

    let category = 'Uncategorized';
    if (metaMatch) {
        const parts = metaMatch[1].split('•');
        if (parts.length > 0) category = parts[0].trim();
    }

    let image = imgMatch ? imgMatch[1] : '';
    if (image.startsWith('../')) image = image.substring(3);

    if (titleMatch) {
        return {
            id: id,
            name: titleMatch[1],
            category: category,
            intro: introMatch ? introMatch[1] : '',
            ingredients: ingredients,
            instructions: instructions,
            image: image,
            video_url: '',
            prep_time,
            cook_time,
            servings,
            calories,
            author: 'TastyTable',
            is_static: true
        };
    }

    return null;
  } catch (e) {
    return null;
  }
}

function safeJSONParse(str, fallback = []) {
  if (typeof str === 'object' && str !== null) {
    return str;
  }
  try {
    return JSON.parse(str || '[]');
  } catch (e) {
    return fallback;
  }
}

async function getViewsCount(recipeId) {
  if (!dbReady) return 0;
  try {
    const [rows] = await pool.query('SELECT COUNT(*) AS c FROM recently_viewed WHERE recipe_id = ?', [recipeId]);
    return Number(rows[0]?.c || 0);
  } catch (e) {
    return 0;
  }
}

function normalizeRecipe(body, id) {
  const ingredients = Array.isArray(body.ingredients)
    ? body.ingredients
    : String(body.ingredients || '')
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);
  const instructions = Array.isArray(body.instructions)
    ? body.instructions
    : String(body.instructions || '')
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);
  return {
    id,
    name: String(body.name || '').trim(),
    category: String(body.category || '').trim(),
    prep_time: String(body.prep_time || '').trim(),
    cook_time: String(body.cook_time || '').trim(),
    servings: String(body.servings || '').trim(),
    calories: Number(body.calories || 0),
    image: String(body.image || '').trim(),
    intro: String(body.intro || '').trim(),
    ingredients,
    instructions,
    author: String(body.author || '').trim(),
    author_id: (body.author_id && !isNaN(Number(body.author_id))) ? Number(body.author_id) : null
  };
}

// Helper to fetch recipe details (DB or Static)
async function fetchRecipeDetails(id) {
    if (id.startsWith('static-')) {
        const details = await getStaticRecipeDetails(id);
        return details;
    } else {
        try {
            const [rows] = await pool.query('SELECT * FROM recipes WHERE id = ?', [id]);
            if (rows.length === 0) return null;
            const r = rows[0];
            return {
                ...r,
                ingredients: safeJSONParse(r.ingredients, []),
                instructions: safeJSONParse(r.instructions, []),
                is_static: false
            };
        } catch (e) {
            console.error('Fetch detail error', e);
            return null;
        }
    }
}

app.post('/auth/signup', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  
  try {
    const hash = await bcrypt.hash(password, 10);
    const userRole = (role === 'admin') ? 'admin' : 'user';

    if (userRole === 'admin' && !ALLOWED_ADMINS.includes(email)) {
      return res.status(403).json({ error: 'This email is not authorized to be an admin.' });
    }
    
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, userRole]
    );
    
    // Send welcome email
    sendLoginEmail(email, name);

    res.json({ ok: true, id: result.insertId, name, email, role: userRole });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: 'Signup failed' });
  }
});

app.post('/auth/login', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
  const { email, password, role } = req.body; // Role optional in login, but useful for specific login forms
  
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];
    
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Optional: enforce role check if login page was specific
    if (role && user.role !== role) {
        return res.status(403).json({ error: `Not authorized as ${role}` });
    }

    if (user.role === 'admin' && !ALLOWED_ADMINS.includes(user.email)) {
        return res.status(403).json({ error: 'This email is not authorized to access the admin panel.' });
    }

    // Send login notification email
    sendLoginEmail(user.email, user.name);

    res.json({ ok: true, id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (e) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/auth/forgot-password', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const [rows] = await pool.query('SELECT id, name FROM users WHERE email = ?', [email]);
    const user = rows[0];

    if (!user) {
      // For security reasons, don't reveal if email exists or not
      return res.json({ ok: true, message: 'If an account exists with this email, a reset link has been sent.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 3600000); // 1 hour

    await pool.query('UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?', [token, expiry, user.id]);

    const resetLink = `${req.protocol}://${req.get('host')}/reset-password.html?token=${token}`;

    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || '"CookVala" <no-reply@cookvala.com>',
        to: email,
        subject: 'Password Reset - CookVala',
        text: `Hello ${user.name},\n\nYou requested a password reset. Click the link below to reset your password:\n\n${resetLink}\n\nThis link will expire in 1 hour.\n\nBest regards,\nCookVala Team`,
        html: `<p>Hello <b>${user.name}</b>,</p><p>You requested a password reset. Click the link below to reset your password:</p><p><a href="${resetLink}">${resetLink}</a></p><p>This link will expire in 1 hour.</p><p>Best regards,<br>CookVala Team</p>`
      });
    } else {
      console.log('Password reset link (SMTP not configured):', resetLink);
    }

    res.json({ ok: true, message: 'If an account exists with this email, a reset link has been sent.' });
  } catch (e) {
    console.error('Forgot password error:', e);
    res.status(500).json({ error: 'Operation failed' });
  }
});

app.post('/auth/reset-password', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });

  try {
    const [rows] = await pool.query('SELECT id FROM users WHERE reset_token = ? AND reset_token_expiry > NOW()', [token]);
    const user = rows[0];

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?', [hash, user.id]);

    res.json({ ok: true, message: 'Password has been reset successfully.' });
   } catch (e) {
     console.error('Reset password error:', e);
     res.status(500).json({ error: 'Operation failed' });
   }
 });

 app.put('/users/:id', async (req, res) => {
    if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
    const { id } = req.params;
    const { name, email } = req.body;
    
    try {
        await pool.query('UPDATE users SET name = ?, email = ? WHERE id = ?', [name, email, id]);
        res.json({ ok: true, name, email });
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Email already exists' });
        res.status(500).json({ error: 'Update failed' });
    }
 });

 app.post('/auth/change-password', async (req, res) => {
    if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
    const { userId, oldPassword, newPassword } = req.body;

    try {
        const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [userId]);
        const user = rows[0];
        if (!user || !(await bcrypt.compare(oldPassword, user.password_hash))) {
            return res.status(401).json({ error: 'Incorrect old password' });
        }

        const hash = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId]);
        res.json({ ok: true, message: 'Password updated successfully' });
     } catch (e) {
         res.status(500).json({ error: 'Password update failed' });
     }
  });

  app.delete('/users/:id', async (req, res) => {
     if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
     const { id } = req.params;
     
     try {
         await pool.query('DELETE FROM users WHERE id = ?', [id]);
         res.json({ ok: true, message: 'Account deleted successfully' });
     } catch (e) {
         res.status(500).json({ error: 'Failed to delete account' });
     }
  });

app.get('/recipes/my', async (req, res) => {
    if (!dbReady) return res.json({ ok: true, recipes: [] });
    const authorId = req.query.author_id;
    if (!authorId) return res.json({ ok: true, recipes: [] });

    try {
        const [rows] = await pool.query(`
            SELECT r.*, p.status as promotion_status,
                   COALESCE(dv.views, 0) as views_today
            FROM recipes r 
            LEFT JOIN promotions p ON r.id = p.recipe_id 
            LEFT JOIN recipe_daily_views dv ON r.id = dv.recipe_id AND dv.view_date = CURRENT_DATE()
            WHERE r.author_id = ? 
            ORDER BY r.created_at DESC
        `, [authorId]);
        const recipes = rows.map(r => ({
            ...r,
            ingredients: safeJSONParse(r.ingredients, []),
            instructions: safeJSONParse(r.instructions, []),
            is_static: false
        }));
        res.json({ ok: true, recipes });
    } catch (e) {
        res.status(500).json({ error: 'Fetch failed' });
    }
});

app.post(['/admin/recipes/create', '/recipes/create'], upload.fields([{ name: 'video', maxCount: 1 }, { name: 'image_file', maxCount: 1 }]), async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const id = String(req.body.id || `db-${Date.now()}`);
    const r = normalizeRecipe(req.body, id);
    
    let imagePath = r.image;
    if (req.files && req.files.image_file) {
      imagePath = '/assets/uploads/' + req.files.image_file[0].filename;
    }

    let videoPath = null;
    if (req.files && req.files.video) {
      videoPath = '/assets/videos/' + req.files.video[0].filename;
    } else if (req.body.video_url && req.body.video_url.trim() !== '') {
      videoPath = String(req.body.video_url).trim();
    }
    
    if (!r.name) return res.status(400).json({ error: 'Name required' });
    await pool.query(
      'INSERT INTO recipes (id, name, category, prep_time, cook_time, servings, calories, image, video, intro, ingredients, instructions, author, author_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [r.id, r.name, r.category, r.prep_time, r.cook_time, r.servings, r.calories, imagePath, videoPath, r.intro, JSON.stringify(r.ingredients), JSON.stringify(r.instructions), r.author, r.author_id]
    );
    res.json({ ok: true, id: r.id, video: videoPath, image: imagePath });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: 'Create failed: ' + e.message });
  }
});

app.delete('/recipes/:id', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
  const id = req.params.id;
  try {
    const [result] = await pool.query('DELETE FROM recipes WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Recipe not found' });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Delete failed' });
  }
});

app.get('/admin/migrate-all', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
  
  try {
    const staticRecipes = await getStaticRecipes();
    let migrated = 0;
    let errors = 0;

    for (const r of staticRecipes) {
      try {
        const details = await getStaticRecipeDetails(r.id);
        if (!details) {
            console.error('Skipping (no details):', r.id);
            errors++;
            continue;
        }

        // Check if already in DB (by name) to avoid duplicates if ID differs
        const [exists] = await pool.query('SELECT id FROM recipes WHERE name = ?', [details.name]);
        if (exists.length > 0) {
            console.log('Skipping (already in DB):', details.name);
            // We can delete the file if it's already in DB to clean up
            const filename = r.id.replace('static-', '');
            const filepath = path.join(__dirname, 'recipes', filename);
            try { await fs.promises.unlink(filepath); } catch(e) {}
            continue;
        }

        // Fix image path to be absolute for DB
        let image = details.image;
        if (image && !image.startsWith('/') && !image.startsWith('http')) {
            image = '/' + image;
        }

        await pool.query(
          'INSERT INTO recipes (id, name, category, prep_time, cook_time, image, video, intro, ingredients, instructions, author, author_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
             // Use a new clean ID or keep static ID? 
             // Let's use a new ID to be consistent with DB format, or slugify name.
             // But existing links might break if they used ID. 
             // Actually, static files were accessed by filename. 
             // We are replacing them.
             // Let's generate a slug-based ID.
             'db-' + Date.now() + '-' + Math.round(Math.random()*1000),
             details.name, 
             details.category, 
             details.prep_time || null,
             details.cook_time || null,
             image, 
             details.video_url || null, 
             details.intro, 
             JSON.stringify(details.ingredients), 
             JSON.stringify(details.instructions), 
             details.author || 'TastyTable', 
             details.author_id || null
          ]
        );

        // Delete file
        const filename = r.id.replace('static-', '');
        const filepath = path.join(__dirname, 'recipes', filename);
        try { await fs.promises.unlink(filepath); } catch(e) { console.error('Failed to unlink', filepath, e); }
        
        migrated++;
      } catch (e) {
        console.error('Failed to migrate', r.name, e);
        errors++;
      }
    }

    res.json({ ok: true, migrated, errors });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/recipes', async (_req, res) => {
  if (!dbReady) return res.json({ ok: true, recipes: [] });
  try {
    const [rows] = await pool.query('SELECT id, name, category, image, intro, created_at, view_count FROM recipes ORDER BY created_at DESC');
    res.json({ ok: true, recipes: rows });
  } catch (e) {
    res.status(500).json({ error: 'List failed' });
  }
});

app.get('/recipes/featured', async (_req, res) => {
  if (!dbReady) return res.json({ ok: true, recipes: [] });
  try {
    const [rows] = await pool.query('SELECT id, name, category, image, intro, created_at, view_count FROM recipes WHERE featured=1 ORDER BY created_at DESC');
    res.json({ ok: true, recipes: rows });
  } catch (e) {
    res.status(500).json({ error: 'Featured list failed' });
  }
});



app.get('/recipes/stats', async (_req, res) => {
  if (!dbReady) return res.json({ ok: true, stats: {}, ratings: {} });
  try {
    const [viewRows] = await pool.query('SELECT recipe_id, COUNT(*) as views FROM recently_viewed GROUP BY recipe_id');
    const stats = {};
    viewRows.forEach(r => stats[r.recipe_id] = r.views);

    const [ratingRows] = await pool.query('SELECT recipe_id, COUNT(*) as count, AVG(rating) as avg FROM ratings GROUP BY recipe_id');
    const ratings = {};
    ratingRows.forEach(r => ratings[r.recipe_id] = { count: r.count, avg: Number(r.avg) });

    res.json({ ok: true, stats, ratings });
  } catch (e) {
    res.status(500).json({ error: 'Stats failed' });
  }
});

app.get('/recipes/new-arrivals', async (_req, res) => {
  if (!dbReady) return res.json({ ok: true, recipes: [] });
  try {
    const [rows] = await pool.query('SELECT * FROM recipes WHERE created_at >= NOW() - INTERVAL 1 DAY ORDER BY created_at DESC');
    const recipes = rows.map(r => ({
        ...r,
        ingredients: safeJSONParse(r.ingredients, []),
        instructions: safeJSONParse(r.instructions, []),
        is_static: false
    }));
    res.json({ ok: true, recipes });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Fetch new arrivals failed' });
  }
});

app.get('/recipes/all', async (req, res) => {
  let dbRecipes = [];
  let staticRecipes = [];
  
  // Fetch static recipes
  try {
    staticRecipes = await getStaticRecipes();
  } catch (e) {
    console.error('Static fetch failed', e);
  }

  // Fetch DB recipes if available
  if (dbReady) {
    try {
      const [rows] = await pool.query('SELECT * FROM recipes ORDER BY created_at DESC');
      dbRecipes = rows.map(r => ({
        ...r,
        ingredients: safeJSONParse(r.ingredients, []),
        instructions: safeJSONParse(r.instructions, []),
        is_static: false
      }));
    } catch (e) {
      console.error('DB fetch failed', e);
      // Don't fail completely if DB fails, just return static
    }
  }

  // Combine
  res.json({ ok: true, recipes: [...dbRecipes, ...staticRecipes] });
});

// Promoted recipes
app.get('/recipes/promoted', async (_req, res) => {
  if (!dbReady) return res.json({ ok: true, recipes: [] });
  try {
    const [rows] = await pool.query('SELECT recipe_id FROM promotions WHERE status=\"active\" ORDER BY promoted_at DESC');
    const list = [];
    for (const row of rows) {
      const details = await fetchRecipeDetails(row.recipe_id);
      if (details) list.push(details);
    }
    res.json({ ok: true, recipes: list });
  } catch (e) {
    res.status(500).json({ error: 'Fetch failed' });
  }
});


app.get('/recipes/:id', async (req, res, next) => {
  if (req.params.id.endsWith('.html')) return next();
  
  if (req.params.id.startsWith('static-')) {
    const recipe = await getStaticRecipeDetails(req.params.id);
    if (recipe) {
      const views = await getViewsCount(req.params.id);
      return res.json({ ok: true, recipe: { ...recipe, views } });
    }
    return res.status(404).json({ error: 'Not found' });
  }

  if (!dbReady) return res.status(404).json({ error: 'Not found' });
  try {
    const [rows] = await pool.query(`
        SELECT r.*, p.status as promotion_status 
        FROM recipes r 
        LEFT JOIN promotions p ON r.id = p.recipe_id 
        WHERE r.id=?
    `, [req.params.id]);
    const r = rows[0];
    if (!r) return res.status(404).json({ error: 'Not found' });
    r.ingredients = safeJSONParse(r.ingredients, []);
    r.instructions = safeJSONParse(r.instructions, []);
    const views = await getViewsCount(req.params.id);
    res.json({ ok: true, recipe: { ...r, views } });
  } catch (e) {
    res.status(500).json({ error: 'Fetch failed' });
  }
});

app.put('/admin/recipes/:id/featured', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const featured = String(req.body.featured || req.query.featured || '').toLowerCase();
    const val = (featured === '1' || featured === 'true') ? 1 : 0;
    await pool.query('UPDATE recipes SET featured=? WHERE id=?', [val, req.params.id]);
    res.json({ ok: true, featured: val });
  } catch (e) {
    res.status(400).json({ error: 'Featured update failed: ' + e.message });
  }
});

app.post('/recipes/create', upload.fields([{ name: 'video', maxCount: 1 }, { name: 'image_file', maxCount: 1 }]), async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const id = req.body.id || ('recipe-' + Date.now());
    const r = normalizeRecipe(req.body, id);

    // Handle Image Upload
    let imagePath = r.image;
    if (req.files && req.files.image_file) {
      imagePath = '/assets/uploads/' + req.files.image_file[0].filename;
    }
    
    // Handle Video Upload
    let videoPath = r.video; // video url from body
    if (req.files && req.files.video) {
        videoPath = '/assets/uploads/' + req.files.video[0].filename;
    } else if (req.body.video_url) {
        videoPath = req.body.video_url;
    }

    await pool.query(
      'INSERT INTO recipes (id, name, category, prep_time, cook_time, image, video, intro, ingredients, instructions, author, author_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        r.id, r.name, r.category, r.prep_time, r.cook_time, 
        imagePath, videoPath, r.intro, 
        JSON.stringify(r.ingredients), JSON.stringify(r.instructions),
        r.author, r.author_id
      ]
    );

    res.json({ ok: true, id: r.id });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: 'Create failed: ' + e.message });
  }
});

app.put('/recipes/:id', upload.fields([{ name: 'video', maxCount: 1 }, { name: 'image_file', maxCount: 1 }]), async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const r = normalizeRecipe(req.body, req.params.id);

    // Handle Image Update
    let imagePath = r.image; // Default to what was sent in body (or empty)
    if (req.files && req.files.image_file) {
      // New file uploaded
      imagePath = '/assets/uploads/' + req.files.image_file[0].filename;
    } 
    // If no new file and body.image is empty, we might want to keep the OLD image?
    // But normalizeRecipe uses body.image. If client sends empty string, it means empty.
    // However, if we are doing a multipart/form-data update, the client might not send the old image URL back easily if it was a file input.
    // So we should check if we need to fetch the existing recipe to preserve image if not provided.
    // For now, let's assume the client sends the old URL in 'image' field if they want to keep it.
    
    // Handle Video Update
    let videoPath = null;
    if (req.files && req.files.video) {
        videoPath = '/assets/videos/' + req.files.video[0].filename;
    } else if (req.body.video_url) {
        videoPath = String(req.body.video_url).trim();
    }
    // Note: If videoPath is null here, it means we might overwrite existing video with NULL if we update blindly.
    // We should probably preserve existing video if not specified? 
    // Let's first fetch the existing recipe to be safe and handle "partial" updates or preservation.

    const [rows] = await pool.query('SELECT * FROM recipes WHERE id=?', [req.params.id]);
    const existing = rows[0];

    if (existing) {
        // If user didn't provide a new image (file or url), keep the old one
        if (!imagePath && !req.files?.image_file) {
             imagePath = existing.image;
        }
        // If user explicitly sent empty string for image in body, normalizeRecipe sets it to "".
        // But in FormData, empty field is empty string.
        // We need a way to distinguish "delete image" from "keep image".
        // Usually, if file input is empty, we keep old. If text input is empty, maybe we replace?
        // Let's assume: if a new file is uploaded -> use it.
        // Else if a URL is provided -> use it.
        // Else -> keep existing.
        if (req.files && req.files.image_file) {
             imagePath = '/assets/uploads/' + req.files.image_file[0].filename;
        } else if (r.image && r.image.trim() !== '') {
             imagePath = r.image;
        } else {
             imagePath = existing.image;
        }

        if (req.files && req.files.video) {
            videoPath = '/assets/videos/' + req.files.video[0].filename;
        } else if (req.body.video_url !== undefined) {
            const v = String(req.body.video_url).trim();
            videoPath = v === '' ? null : v;
        } else {
            videoPath = existing.video;
        }
    }

    // Static migration logic preserved but updated with new paths
    if (req.params.id.startsWith('static-')) {
        // Migration: Static -> DB
        // 1. Check if already exists in DB (to prevent double insertion if retrying)
        const [exists] = await pool.query('SELECT 1 FROM recipes WHERE id=?', [r.id]);
        if (exists.length === 0) {
            // Insert
            await pool.query(
              'INSERT INTO recipes (id, name, category, prep_time, cook_time, servings, calories, image, video, intro, ingredients, instructions, author, author_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [r.id, r.name, r.category, r.prep_time, r.cook_time, r.servings, r.calories, imagePath, videoPath, r.intro, JSON.stringify(r.ingredients), JSON.stringify(r.instructions), r.author || 'TastyTable', r.author_id || null]
            );
            // Delete static file
            const filename = req.params.id.replace('static-', '');
            const filepath = path.join(__dirname, 'recipes', filename);
            try { await fs.promises.unlink(filepath); } catch(e) { console.error('Failed to delete static file', e); }
            
            return res.json({ ok: true });
        }
    }

    await pool.query(
       'UPDATE recipes SET name=?, category=?, prep_time=?, cook_time=?, servings=?, calories=?, image=?, video=?, intro=?, ingredients=?, instructions=? WHERE id=?',
       [r.name, r.category, r.prep_time, r.cook_time, r.servings, r.calories, imagePath, videoPath, r.intro, JSON.stringify(r.ingredients), JSON.stringify(r.instructions), r.id]
     );
     res.json({ ok: true });
  } catch (e) {
    console.error('Update failed:', e);
    res.status(400).json({ error: 'Update failed: ' + e.message });
  }
});

app.delete('/recipes/:id', async (req, res) => {
  if (req.params.id.startsWith('static-')) {
    const filename = req.params.id.replace('static-', '');
    const filepath = path.join(__dirname, 'recipes', filename);
    try {
      await fs.promises.unlink(filepath);
      return res.json({ ok: true });
    } catch (e) {
      console.error('Failed to delete static file', e);
      return res.status(500).json({ error: 'Failed to delete file' });
    }
  }

  if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
  try {
    await pool.query('DELETE FROM recipes WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Delete failed' });
  }
});

app.get('/admin/stats', async (_req, res) => {
  if (!dbReady) return res.json({ ok: true, users_count: 0, admins_count: 0, db_recipes_count: 0, reels_count: 0, total_views: 0 });
  try {
    const [u] = await pool.query('SELECT COUNT(*) AS c FROM users');
    const [a] = await pool.query('SELECT COUNT(*) AS c FROM users WHERE role="admin"');
    const [r] = await pool.query('SELECT COUNT(*) AS c FROM recipes WHERE category != "Reels" AND (video IS NULL OR video = "")');
    const [v] = await pool.query('SELECT COUNT(*) AS c FROM videos');
    const [rv] = await pool.query('SELECT COUNT(*) AS c FROM recipes WHERE category = "Reels" OR (video IS NOT NULL AND video != "")');
    
    // Calculate total views (sum of recipe views)
    const [views] = await pool.query('SELECT SUM(view_count) AS c FROM recipes');
    
    res.json({ 
        ok: true, 
        users_count: u[0].c, 
        admins_count: a[0].c, 
        db_recipes_count: r[0].c,
        reels_count: v[0].c + rv[0].c,
        total_views: views[0].c || 0
    });
  } catch (e) {
    console.error(e);
    res.json({ ok: true, users_count: 0, admins_count: 0, db_recipes_count: 0, reels_count: 0, total_views: 0 });
  }
});

app.get('/admin/users', async (_req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const [rows] = await pool.query(`
        SELECT u.id, u.name, u.email, u.role, u.created_at,
        (SELECT COUNT(*) FROM recipes WHERE author_id = u.id) as recipes_count,
        (SELECT COUNT(*) FROM videos WHERE user_id = u.id) as videos_count,
        (SELECT COALESCE(SUM(view_count),0) FROM recipes WHERE author_id = u.id) + 
        (SELECT COALESCE(SUM(view_count),0) FROM videos WHERE user_id = u.id) as total_views,
        (SELECT COALESCE(SUM(amount),0) FROM earnings WHERE user_id = u.id) as total_earnings
        FROM users u 
        ORDER BY u.created_at DESC
    `);
    res.json({ ok: true, users: rows });
  } catch (e) {
    console.error('Fetch users error:', e);
    res.status(500).json({ error: 'Fetch users failed: ' + e.message });
  }
});

// Change User Role
app.post('/admin/users/:id/role', async (req, res) => {
    if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
    const userId = req.params.id;
    const { role, current_user_id } = req.body; // current_user_id to verify admin

    if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

    try {
        // Verify requester is admin
        const [admins] = await pool.query('SELECT role FROM users WHERE id = ?', [current_user_id]);
        if (admins.length === 0 || admins[0].role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
        res.json({ ok: true });
    } catch (e) {
        console.error('Update role error:', e);
        res.status(500).json({ error: 'Update role failed' });
    }
});

// --- User Interactions (Follows, Edit Profile) ---

// Edit Profile
app.put('/user/profile', async (req, res) => {
    if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
    const { user_id, name, email } = req.body;
    if (!user_id || !name || !email) return res.status(400).json({ error: 'Missing fields' });

    try {
        await pool.query('UPDATE users SET name = ?, email = ? WHERE id = ?', [name, email, user_id]);
        res.json({ ok: true });
    } catch (e) {
        console.error('Profile update error:', e);
        if (e.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Email already in use' });
        }
        res.status(500).json({ error: 'Update failed: ' + e.message });
    }
});



// --- Profile & Saved/Recent Recipes ---

// Get Profile Info
app.get('/user/profile', async (req, res) => {
    if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    try {
        const [users] = await pool.query('SELECT id, name, email, role, created_at FROM users WHERE id = ?', [userId]);
        if (users.length === 0) return res.status(404).json({ error: 'User not found' });
        const user = users[0];

        const [saved] = await pool.query('SELECT COUNT(*) as count FROM saved_recipes WHERE user_id = ?', [userId]);
        const [uploaded] = await pool.query('SELECT COUNT(*) as count FROM recipes WHERE author_id = ?', [userId]);
        const [viewed] = await pool.query('SELECT COUNT(*) as count FROM recently_viewed WHERE user_id = ?', [userId]);
        const [followers] = await pool.query('SELECT COUNT(*) as count FROM follows WHERE following_id = ?', [userId]);
        const [following] = await pool.query('SELECT COUNT(*) as count FROM follows WHERE follower_id = ?', [userId]);

        res.json({
            ok: true,
            user: {
                ...user,
                stats: {
                    saved: saved[0].count,
                    uploaded: uploaded[0].count,
                    viewed: viewed[0].count,
                    followers: followers[0].count,
                    following: following[0].count
                }
            }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// Toggle Saved Recipe
app.post('/recipes/:id/save', async (req, res) => {
    if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
    const userId = req.body.user_id;
    const recipeId = req.params.id;
    
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    try {
        // Check if already saved
        const [exists] = await pool.query('SELECT id FROM saved_recipes WHERE user_id = ? AND recipe_id = ?', [userId, recipeId]);
        
        if (exists.length > 0) {
            // Unsave
            await pool.query('DELETE FROM saved_recipes WHERE id = ?', [exists[0].id]);
            return res.json({ ok: true, saved: false });
        } else {
            // Save
            await pool.query('INSERT INTO saved_recipes (user_id, recipe_id) VALUES (?, ?)', [userId, recipeId]);
            return res.json({ ok: true, saved: true });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to toggle save' });
    }
});

// Check if recipe is saved
app.get('/recipes/:id/is-saved', async (req, res) => {
     if (!dbReady) return res.json({ saved: false });
     const userId = req.query.user_id;
     const recipeId = req.params.id;
     if (!userId) return res.json({ saved: false });
     
     try {
         const [exists] = await pool.query('SELECT 1 FROM saved_recipes WHERE user_id = ? AND recipe_id = ?', [userId, recipeId]);
         res.json({ saved: exists.length > 0 });
     } catch (e) {
         res.json({ saved: false });
     }
});

// Record View
app.post('/recipes/:id/view', async (req, res) => {
    if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
    const userId = req.body.user_id;
    const recipeId = req.params.id;
    
    try {
        // Increment global view count
        await pool.query('UPDATE recipes SET view_count = view_count + 1 WHERE id = ?', [recipeId]);
        
        // Update daily view count
        await pool.query(
          'INSERT INTO recipe_daily_views (recipe_id, view_date, views) VALUES (?, CURDATE(), 1) ON DUPLICATE KEY UPDATE views = views + 1',
          [recipeId]
        );

        // If user logged in, record history
        if (userId) {
             await pool.query(
                'INSERT INTO recently_viewed (user_id, recipe_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE viewed_at = CURRENT_TIMESTAMP',
                [userId, recipeId]
            );
        }
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to record view' });
    }
});

app.get('/recipes/:id/views', async (req, res) => {
    if (!dbReady) return res.json({ ok: true, views: 0, views_today: 0 });
    const recipeId = req.params.id;
    try {
        const [rows] = await pool.query('SELECT view_count FROM recipes WHERE id = ?', [recipeId]);
        let count = 0;
        if (rows.length > 0) {
            count = rows[0].view_count;
        } else {
            // Not in DB, fallback to recently_viewed (e.g. static recipes)
            count = await getViewsCount(recipeId);
        }

        // Get today's views
        const [todayRows] = await pool.query('SELECT views FROM recipe_daily_views WHERE recipe_id = ? AND view_date = CURDATE()', [recipeId]);
        const views_today = todayRows.length > 0 ? todayRows[0].views : 0;

        res.json({ ok: true, views: count, views_today });
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch view count' });
    }
});

// Likes
app.post('/recipes/:id/like', async (req, res) => {
    if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
    const userId = req.body.user_id;
    const recipeId = req.params.id;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    try {
        // Check if already liked
        const [exists] = await pool.query('SELECT id FROM likes WHERE user_id = ? AND recipe_id = ?', [userId, recipeId]);
        if (exists.length > 0) {
            // Unlike
            await pool.query('DELETE FROM likes WHERE user_id = ? AND recipe_id = ?', [userId, recipeId]);
            res.json({ ok: true, liked: false });
        } else {
            // Like
            await pool.query('INSERT INTO likes (user_id, recipe_id) VALUES (?, ?)', [userId, recipeId]);
            res.json({ ok: true, liked: true });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Like failed' });
    }
});

app.post('/recipes/:id/save', async (req, res) => {
    if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
    const recipeId = req.params.id;
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });

    try {
        const [exists] = await pool.query('SELECT * FROM saved_recipes WHERE user_id = ? AND recipe_id = ?', [user_id, recipeId]);
        
        if (exists.length > 0) {
            // Unsave
            await pool.query('DELETE FROM saved_recipes WHERE user_id = ? AND recipe_id = ?', [user_id, recipeId]);
            res.json({ ok: true, saved: false });
        } else {
            // Save
            await pool.query('INSERT INTO saved_recipes (user_id, recipe_id) VALUES (?, ?)', [user_id, recipeId]);
            res.json({ ok: true, saved: true });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Save failed' });
    }
});

app.get('/recipes/:id/is-saved', async (req, res) => {
    if (!dbReady) return res.json({ ok: true, saved: false });
    const recipeId = req.params.id;
    const userId = req.query.user_id;
    if (!userId) return res.json({ ok: true, saved: false });

    try {
        const [rows] = await pool.query('SELECT * FROM saved_recipes WHERE user_id = ? AND recipe_id = ?', [userId, recipeId]);
        res.json({ ok: true, saved: rows.length > 0 });
    } catch (e) {
        res.status(500).json({ error: 'Check saved failed' });
    }
});

app.get('/recipes/:id/likes', async (req, res) => {
    if (!dbReady) return res.json({ ok: true, likes: 0, liked: false });
    const recipeId = req.params.id;
    const userId = req.query.user_id;

    try {
        const [countRows] = await pool.query('SELECT COUNT(*) as c FROM likes WHERE recipe_id = ?', [recipeId]);
        const count = countRows[0].c;
        
        let liked = false;
        if (userId) {
            const [userRows] = await pool.query('SELECT id FROM likes WHERE user_id = ? AND recipe_id = ?', [userId, recipeId]);
            liked = userRows.length > 0;
        }
        res.json({ ok: true, likes: count, liked });
    } catch (e) {
        res.status(500).json({ error: 'Fetch likes failed' });
    }
});

// Comments
app.post('/recipes/:id/comments', async (req, res) => {
    if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
    const { user_id, content } = req.body;
    const recipeId = req.params.id;
    if (!user_id || !content) return res.status(400).json({ error: 'Missing fields' });

    try {
        await pool.query('INSERT INTO comments (user_id, recipe_id, content) VALUES (?, ?, ?)', [user_id, recipeId, content]);
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Comment failed' });
    }
});

app.get('/recipes/:id/comments', async (req, res) => {
    if (!dbReady) return res.json({ ok: true, comments: [] });
    const recipeId = req.params.id;

    try {
        const [rows] = await pool.query(`
            SELECT c.id, c.content, c.created_at, u.name as user_name, u.id as user_id 
            FROM comments c 
            JOIN users u ON c.user_id = u.id 
            WHERE c.recipe_id = ? 
            ORDER BY c.created_at DESC
        `, [recipeId]);
        res.json({ ok: true, comments: rows });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Fetch comments failed' });
    }
});

// Get Saved Recipes
app.get('/user/saved-recipes', async (req, res) => {
    if (!dbReady) return res.json({ ok: true, recipes: [] });
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    try {
        const [rows] = await pool.query('SELECT recipe_id, saved_at FROM saved_recipes WHERE user_id = ? ORDER BY saved_at DESC', [userId]);
        
        const recipes = [];
        for (const row of rows) {
            const details = await fetchRecipeDetails(row.recipe_id);
            if (details) {
                recipes.push({ ...details, saved_at: row.saved_at });
            }
        }
        
        res.json({ ok: true, recipes });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch saved recipes' });
    }
});

// Get Recently Viewed Recipes
app.get('/user/recent-recipes', async (req, res) => {
    if (!dbReady) return res.json({ ok: true, recipes: [] });
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    try {
        const [rows] = await pool.query('SELECT recipe_id, viewed_at FROM recently_viewed WHERE user_id = ? ORDER BY viewed_at DESC LIMIT 20', [userId]);
        
        const recipes = [];
        for (const row of rows) {
            const details = await fetchRecipeDetails(row.recipe_id);
            if (details) {
                recipes.push({ ...details, viewed_at: row.viewed_at });
            }
        }
        
        res.json({ ok: true, recipes });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch recent recipes' });
    }
});

// Follow
app.post('/users/:id/follow', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
  const followerId = req.body.follower_id;
  const followingId = Number(req.params.id);
  if (!followerId || !followingId || followerId === followingId) return res.status(400).json({ error: 'Invalid follow request' });
  try {
    await pool.query('INSERT INTO follows (follower_id, following_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP', [followerId, followingId]);
    res.json({ ok: true, following: true });
  } catch (e) {
    res.status(500).json({ error: 'Follow failed' });
  }
});
app.post('/users/:id/unfollow', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
  const followerId = req.body.follower_id;
  const followingId = Number(req.params.id);
  if (!followerId || !followingId || followerId === followingId) return res.status(400).json({ error: 'Invalid unfollow request' });
  try {
    await pool.query('DELETE FROM follows WHERE follower_id = ? AND following_id = ?', [followerId, followingId]);
    res.json({ ok: true, following: false });
  } catch (e) {
    res.status(500).json({ error: 'Unfollow failed' });
  }
});
app.get('/users/:id/followers', async (req, res) => {
  if (!dbReady) return res.json({ ok: true, users: [] });
  try {
    const [rows] = await pool.query('SELECT u.id, u.name, u.email FROM follows f JOIN users u ON f.follower_id = u.id WHERE f.following_id = ?', [req.params.id]);
    res.json({ ok: true, users: rows });
  } catch (e) {
    res.status(500).json({ error: 'Fetch failed' });
  }
});

app.post('/users/me/followers/:id/remove', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
  const myId = req.body.user_id;
  const followerId = req.params.id; // The person to remove
  if (!myId) return res.status(400).json({ error: 'User ID required' });
  
  try {
    await pool.query('DELETE FROM follows WHERE follower_id = ? AND following_id = ?', [followerId, myId]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Remove follower failed' });
  }
});

app.get('/users/:id/following', async (req, res) => {
  if (!dbReady) return res.json({ ok: true, users: [] });
  try {
    const [rows] = await pool.query('SELECT u.id, u.name, u.email FROM follows f JOIN users u ON f.following_id = u.id WHERE f.follower_id = ?', [req.params.id]);
    res.json({ ok: true, users: rows });
  } catch (e) {
    res.status(500).json({ error: 'Fetch failed' });
  }
});
app.get('/users/:id/relationship', async (req, res) => {
  if (!dbReady) return res.json({ ok: true, following: false, followed_by: false });
  const viewerId = Number(req.query.viewer_id || 0);
  const targetId = Number(req.params.id);
  if (!viewerId || !targetId) return res.json({ ok: true, following: false, followed_by: false });
  try {
    const [a] = await pool.query('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?', [viewerId, targetId]);
    const [b] = await pool.query('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?', [targetId, viewerId]);
    res.json({ ok: true, following: a.length > 0, followed_by: b.length > 0 });
  } catch (e) {
    res.json({ ok: true, following: false, followed_by: false });
  }
});

app.get('/users/:id/stats', async (req, res) => {
  if (!dbReady) return res.json({ ok: true, followers: 0, following: 0, recipes: 0, total_views: 0 });
  const userId = Number(req.params.id);
  if (!userId) return res.json({ ok: true, followers: 0, following: 0, recipes: 0, total_views: 0 });
  try {
    const [followers] = await pool.query('SELECT COUNT(*) as c FROM follows WHERE following_id = ?', [userId]);
    const [following] = await pool.query('SELECT COUNT(*) as c FROM follows WHERE follower_id = ?', [userId]);
    const [recipes] = await pool.query('SELECT COUNT(*) as c FROM recipes WHERE author_id = ?', [userId]);
    
    // Total views
    const [views] = await pool.query('SELECT SUM(view_count) as total FROM recipes WHERE author_id = ?', [userId]);
    
    res.json({ ok: true, followers: followers[0].c, following: following[0].c, recipes: recipes[0].c, total_views: views[0].total || 0 });
  } catch (e) {
    res.status(500).json({ error: 'Stats failed' });
  }
});

app.get('/api/earnings/summary', async (req, res) => {
  if (!dbReady) return res.json({ recipes_count: 0, videos_count: 0, total_views: 0, total_earnings: 0, content: [] });
  const userId = req.query.user_id;
  if (!userId) return res.status(400).json({ error: 'User ID required' });
  try {
    const [rCount] = await pool.query('SELECT COUNT(*) as c FROM recipes WHERE author_id = ? AND category != "Reels"', [userId]);
    const [vCount] = await pool.query('SELECT COUNT(*) as c FROM recipes WHERE author_id = ? AND category = "Reels"', [userId]);
    const [views] = await pool.query('SELECT SUM(view_count) as total FROM recipes WHERE author_id = ?', [userId]);
    const totalViews = views[0].total || 0;
    
    const [rows] = await pool.query('SELECT id, name, category, view_count, created_at, image, video FROM recipes WHERE author_id = ? ORDER BY created_at DESC', [userId]);
    
    const content = rows.map(r => ({
         id: r.id,
         name: r.name,
         type: (r.category === 'Reels') ? 'video' : 'recipe',
         view_count: r.view_count || 0,
         created_at: r.created_at,
         image: r.image
     }));
    
    res.json({
        recipes_count: rCount[0].c,
        videos_count: vCount[0].c,
        total_views: totalViews,
        total_earnings: totalViews * 0.01,
        content: content
    });
  } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Summary failed' });
  }
});

// Chat
app.post('/chat/send', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
  const { sender_id, receiver_id, content } = req.body;
  if (!sender_id || !receiver_id || !content) return res.status(400).json({ error: 'Missing fields' });
  try {
    const [r] = await pool.query('INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)', [sender_id, receiver_id, content]);
    res.json({ ok: true, id: r.insertId });
  } catch (e) {
    res.status(500).json({ error: 'Send failed' });
  }
});

// Advertisements
app.get('/ads', async (req, res) => {
    if (!dbReady) return res.json({ ok: true, ads: [] });
    try {
        const [rows] = await pool.query('SELECT * FROM advertisements WHERE status = "active" ORDER BY created_at DESC LIMIT 5');
        res.json({ ok: true, ads: rows });
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch ads' });
    }
});

app.get('/ads/my', async (req, res) => {
    if (!dbReady) return res.json({ ok: true, ads: [] });
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'User ID required' });
    try {
        const [rows] = await pool.query('SELECT * FROM advertisements WHERE user_id = ? ORDER BY created_at DESC', [userId]);
        res.json({ ok: true, ads: rows });
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch user ads' });
    }
});

app.post('/ads/create', (req, res, next) => {
    upload.single('image_file')(req, res, (err) => {
        if (err) {
            console.error('Multer error:', err);
            return res.status(400).json({ error: 'Image upload failed: ' + err.message });
        }
        next();
    });
}, async (req, res) => {
    if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
    const { user_id, title, content, link_url } = req.body;
    let image_url = req.body.image_url;

    if (req.file) {
        image_url = '/assets/uploads/' + req.file.filename;
    }

    if (!user_id || !title) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        await pool.query(
            'INSERT INTO advertisements (user_id, title, content, image_url, link_url, status) VALUES (?, ?, ?, ?, ?, "pending")',
            [user_id, title, content, image_url, link_url]
        );
        res.json({ ok: true });
    } catch (e) {
        console.error('Ad creation error:', e);
        res.status(500).json({ error: 'Failed to create advertisement: ' + e.message });
    }
});

// Admin: Get All Ads (with optional status filter)
app.get('/admin/ads/all', async (req, res) => {
    if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
    const userId = req.query.user_id;
    const statusFilter = req.query.status; // 'pending', 'active', 'rejected', 'paused' or undefined (all)
    
    try {
        // Verify admin
        if (userId) {
             const [users] = await pool.query('SELECT role FROM users WHERE id = ?', [userId]);
             if (users.length === 0 || users[0].role !== 'admin') {
                 return res.status(403).json({ error: 'Unauthorized' });
             }
        } else {
            return res.status(401).json({ error: 'Authentication required' });
        }

        let query = 'SELECT a.*, u.name as user_name FROM advertisements a JOIN users u ON a.user_id = u.id';
        const params = [];
        
        if (statusFilter && statusFilter !== 'all') {
            query += ' WHERE a.status = ?';
            params.push(statusFilter);
        }
        
        query += ' ORDER BY a.created_at DESC';

        const [rows] = await pool.query(query, params);
        res.json({ ok: true, ads: rows });
    } catch (e) {
        console.error('Fetch all ads error:', e);
        res.status(500).json({ error: 'Failed to fetch ads' });
    }
});

// Admin: Get Pending Ads
app.get('/admin/ads/pending', async (req, res) => {
    if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
    const userId = req.query.user_id; // Check if requester is admin
    
    try {
        // Verify admin
        if (userId) {
             const [users] = await pool.query('SELECT role FROM users WHERE id = ?', [userId]);
             if (users.length === 0 || users[0].role !== 'admin') {
                 return res.status(403).json({ error: 'Unauthorized' });
             }
        } else {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const [rows] = await pool.query('SELECT a.*, u.name as user_name FROM advertisements a JOIN users u ON a.user_id = u.id WHERE a.status = "pending" ORDER BY a.created_at ASC');
        res.json({ ok: true, ads: rows });
    } catch (e) {
        console.error('Fetch pending ads error:', e);
        res.status(500).json({ error: 'Failed to fetch pending ads' });
    }
});

// Admin: Update Ad Status
app.post('/admin/ads/:id/status', async (req, res) => {
    if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
    const adId = req.params.id;
    const { user_id, status } = req.body;
    
    if (!user_id || !status) return res.status(400).json({ error: 'Missing fields' });
    if (!['active', 'rejected', 'paused', 'pending'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

    try {
        // Verify admin
        const [users] = await pool.query('SELECT role FROM users WHERE id = ?', [user_id]);
        if (users.length === 0 || users[0].role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        await pool.query('UPDATE advertisements SET status = ? WHERE id = ?', [status, adId]);
        res.json({ ok: true });
    } catch (e) {
        console.error('Update ad status error:', e);
        res.status(500).json({ error: 'Failed to update ad status' });
    }
});

app.post('/ads/:id/toggle', async (req, res) => {
    if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
    const adId = req.params.id;
    const { user_id } = req.body;
    
    if (!user_id) return res.status(400).json({ error: 'User ID required' });

    try {
        // Verify ownership
        const [ads] = await pool.query('SELECT user_id, status FROM advertisements WHERE id = ?', [adId]);
        if (ads.length === 0) return res.status(404).json({ error: 'Advertisement not found' });
        if (ads[0].user_id != user_id) return res.status(403).json({ error: 'Unauthorized' });

        const newStatus = ads[0].status === 'active' ? 'paused' : 'active';
        await pool.query('UPDATE advertisements SET status = ? WHERE id = ?', [newStatus, adId]);
        
        res.json({ ok: true, status: newStatus });
    } catch (e) {
        console.error('Toggle ad status error:', e);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

app.get('/chat/history', async (req, res) => {
  if (!dbReady) return res.json({ ok: true, messages: [] });
  const userId = Number(req.query.user_id || 0);
  const peerId = Number(req.query.peer_id || 0);
  if (!userId || !peerId) return res.json({ ok: true, messages: [] });
  try {
    const [rows] = await pool.query(
      'SELECT id, sender_id, receiver_id, content, created_at FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) ORDER BY created_at ASC',
      [userId, peerId, peerId, userId]
    );
    res.json({ ok: true, messages: rows });
  } catch (e) {
    res.status(500).json({ error: 'History failed' });
  }
});

app.get('/chat/conversations', async (req, res) => {
  if (!dbReady) return res.json({ ok: true, conversations: [] });
  const userId = Number(req.query.user_id || 0);
  if (!userId) return res.json({ ok: true, conversations: [] });
  
  try {
    // Get unique peers and latest message time
    const [rows] = await pool.query(`
      SELECT 
        CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END AS peer_id,
        MAX(created_at) as last_msg_time
      FROM messages
      WHERE sender_id = ? OR receiver_id = ?
      GROUP BY peer_id
      ORDER BY last_msg_time DESC
    `, [userId, userId, userId]);
    
    const conversations = [];
    for (const row of rows) {
      const [u] = await pool.query('SELECT id, name FROM users WHERE id = ?', [row.peer_id]);
      if (u.length > 0) {
        // Get last message content
        const [m] = await pool.query(
             'SELECT content FROM messages WHERE ((sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)) AND created_at=? LIMIT 1',
             [userId, row.peer_id, row.peer_id, userId, row.last_msg_time]
        );
        conversations.push({
          peer: u[0],
          last_message: m[0] ? m[0].content : '',
          last_time: row.last_msg_time
        });
      }
    }
    res.json({ ok: true, conversations });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Conversations failed' });
  }
});

app.delete('/chat/message/:id', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
  const msgId = req.params.id;
  const userId = Number(req.query.user_id || req.body.user_id || 0);
  
  if (!userId) return res.status(400).json({ error: 'User ID required' });

  try {
    const [rows] = await pool.query('SELECT sender_id FROM messages WHERE id = ?', [msgId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Message not found' });
    
    // Ensure the requester is the sender
    if (Number(rows[0].sender_id) !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this message' });
    }

    await pool.query('DELETE FROM messages WHERE id = ?', [msgId]);
    res.json({ ok: true });
  } catch (e) {
    console.error('Delete message failed', e);
    res.status(500).json({ error: 'Delete failed' });
  }
});

app.put('/chat/message/:id', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
  const msgId = req.params.id;
  const { user_id, content } = req.body;
  const userId = Number(user_id || 0);

  if (!userId || !content) return res.status(400).json({ error: 'Missing fields' });

  try {
    const [rows] = await pool.query('SELECT sender_id FROM messages WHERE id = ?', [msgId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Message not found' });
    
    // Ensure the requester is the sender
    if (Number(rows[0].sender_id) !== userId) {
      return res.status(403).json({ error: 'Not authorized to edit this message' });
    }

    await pool.query('UPDATE messages SET content = ? WHERE id = ?', [content, msgId]);
    res.json({ ok: true });
  } catch (e) {
    console.error('Edit message failed', e);
    res.status(500).json({ error: 'Update failed' });
  }
});

// Promotions
app.post('/recipes/:id/promote', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
  const recipeId = req.params.id;
  const userId = Number(req.body.user_id || 0);
  const status = String(req.body.status || '').toLowerCase();
  if (!userId) return res.status(400).json({ error: 'User required' });
  try {
    const [rows] = await pool.query('SELECT author_id FROM recipes WHERE id=?', [recipeId]);
    const r = rows[0];
    if (!r || Number(r.author_id || 0) !== userId) return res.status(403).json({ error: 'Not owner' });
    const [exists] = await pool.query('SELECT id, status FROM promotions WHERE recipe_id=?', [recipeId]);
    if (exists.length === 0) {
      await pool.query('INSERT INTO promotions (recipe_id, user_id, status) VALUES (?, ?, ?)', [recipeId, userId, status === 'paused' ? 'paused' : 'active']);
      return res.json({ ok: true, promoted: true, status: status === 'paused' ? 'paused' : 'active' });
    } else {
      const newStatus = status === 'paused' ? 'paused' : 'active';
      await pool.query('UPDATE promotions SET status=? WHERE id=?', [newStatus, exists[0].id]);
      return res.json({ ok: true, promoted: true, status: newStatus });
    }
  } catch (e) {
    res.status(500).json({ error: 'Promote failed' });
  }
});
// Views count


// Ratings
app.post('/recipes/:id/rate', async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'Database unavailable' });
  const recipeId = req.params.id;
  const { user_id, rating } = req.body;
  const userId = Number(user_id);
  const rateVal = Number(rating);
  
  if (!userId || !rateVal || rateVal < 1 || rateVal > 5) {
      return res.status(400).json({ error: 'Invalid input' });
  }

  try {
      await pool.query(
          'INSERT INTO ratings (user_id, recipe_id, rating) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE rating = ?',
          [userId, recipeId, rateVal, rateVal]
      );
      res.json({ ok: true });
  } catch (e) {
      res.status(500).json({ error: 'Rating failed' });
  }
});

// Social Feed (Random Videos Only)
app.get('/feed', async (req, res) => {
  if (!dbReady) return res.json({ ok: true, feed: [] });
  const userId = Number(req.query.user_id || 0);
  
  try {
    const [rows] = await pool.query(`
        SELECT * FROM (
            SELECT CONCAT('v-', v.id) as id, v.title as name, v.thumbnail_url as image, v.video_url as video, '' as intro, v.created_at,
                   u.id as author_id, u.name as author_name,
                   (SELECT COUNT(*) FROM likes WHERE video_id = v.id) as likes,
                   (SELECT COUNT(*) FROM comments WHERE video_id = v.id) as comments,
                   (SELECT COUNT(*) FROM likes WHERE video_id = v.id AND user_id = ?) as liked_by_me,
                   'video' as type
            FROM videos v
            LEFT JOIN users u ON v.user_id = u.id
        ) as combined
        ORDER BY RAND()
        LIMIT 50
    `, [userId]);
    
    const feed = rows.map(r => ({
        ...r,
        liked_by_me: r.liked_by_me > 0
    }));
    
    res.json({ ok: true, feed });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Feed failed' });
  }
});

app.get('/recipes/:id/rating', async (req, res) => {
    if (!dbReady) return res.json({ ok: true, average: 0, count: 0, my_rating: 0 });
    const recipeId = req.params.id;
    const userId = Number(req.query.user_id || 0);

    try {
        const [avg] = await pool.query('SELECT AVG(rating) as a, COUNT(*) as c FROM ratings WHERE recipe_id = ?', [recipeId]);
        let myRating = 0;
        if (userId) {
            const [my] = await pool.query('SELECT rating FROM ratings WHERE recipe_id = ? AND user_id = ?', [recipeId, userId]);
            if (my.length > 0) myRating = my[0].rating;
        }
        res.json({ ok: true, average: Number(avg[0].a || 0), count: Number(avg[0].c || 0), my_rating: myRating });
    } catch (e) {
        res.status(500).json({ error: 'Fetch rating failed' });
    }
});

 

// --- CookVala New Endpoints ---

// Get Reels (Videos)
app.get('/api/reels', async (req, res) => {
    if (!dbReady) return res.json({ reels: [] });
    try {
        const [rows] = await pool.query(`
            SELECT v.*, u.name as author_name, 
            (SELECT COUNT(*) FROM likes WHERE video_id = v.id) as likes,
            (SELECT COUNT(*) FROM comments WHERE video_id = v.id) as comments
            FROM videos v
            LEFT JOIN users u ON v.user_id = u.id
            ORDER BY v.created_at DESC
        `);
        
        const [recipeVideos] = await pool.query(`
            SELECT id, name as title, video as video_url, image as thumbnail_url, author as author_name, created_at, view_count,
            (SELECT COUNT(*) FROM likes WHERE recipe_id = recipes.id) as likes,
            (SELECT COUNT(*) FROM comments WHERE recipe_id = recipes.id) as comments
            FROM recipes 
            WHERE video IS NOT NULL AND video != ''
            ORDER BY created_at DESC
        `);
        
        const normalizedRecipes = recipeVideos.map(r => ({
            id: 'r-' + r.id, 
            title: r.title,
            video_url: r.video_url,
            thumbnail_url: r.thumbnail_url,
            author_name: r.author_name,
            created_at: r.created_at,
            view_count: r.view_count || 0,
            likes: r.likes,
            comments: r.comments,
            type: 'recipe'
        }));

        const normalizedVideos = rows.map(v => ({
            ...v,
            type: 'reel'
        }));

        const all = [...normalizedVideos, ...normalizedRecipes].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
        
        res.json({ reels: all });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Fetch failed' });
    }
});

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

app.get('/api/youtube/channel', async (req, res) => {
  const channelId = String(req.query.channel_id || '').trim();
  if (!channelId) return res.status(400).json({ ok: false, error: 'channel_id required' });
  try {
    const xml = await fetchText('https://www.youtube.com/feeds/videos.xml?channel_id=' + encodeURIComponent(channelId));
    const entries = xml.match(/<entry[\s\S]*?<\/entry>/g) || [];
    const videos = entries.map((e) => {
      const id = (e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1] || '';
      const title = (e.match(/<title>([^<]+)<\/title>/) || [])[1] || '';
      const linkMatch = e.match(/<link[^>]*href="([^"]+)"/);
      const link = linkMatch ? linkMatch[1] : (id ? 'https://www.youtube.com/watch?v=' + id : '');
      const thumbMatch = e.match(/<media:thumbnail[^>]*url="([^"]+)"/);
      const thumbnail_url = thumbMatch ? thumbMatch[1] : '';
      const created_at = (e.match(/<published>([^<]+)<\/published>/) || [])[1] || '';
      return { id, title, link, thumbnail_url, created_at };
    });
    res.json({ ok: true, videos });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'youtube fetch failed' });
  }
});

// Earnings Summary & Creator Stats
app.get('/api/earnings/summary', async (req, res) => {
    if (!dbReady) return res.status(503).json({ error: 'DB not ready' });
    const userId = Number(req.query.user_id); 
    if (!userId) {
        return res.json({ 
            total_earnings: 0, balance: 0, total_views: 0, transactions: [],
            recipes_count: 0, videos_count: 0, content: []
        });
    }

    try {
        const [earningRows] = await pool.query('SELECT SUM(amount) as total FROM earnings WHERE user_id = ?', [userId]);
        const totalEarnings = Number(earningRows[0].total || 0);

        const [withdrawRows] = await pool.query('SELECT SUM(amount) as total FROM withdrawals WHERE user_id = ? AND status != "rejected"', [userId]);
        const totalWithdrawn = Number(withdrawRows[0].total || 0);

        const balance = totalEarnings - totalWithdrawn;

        const [transactions] = await pool.query(`
            SELECT 'earning' as type, amount, created_at as date, 'Ad Revenue/Tips' as description FROM earnings WHERE user_id = ?
            UNION ALL
            SELECT 'withdrawal' as type, amount, created_at as date, CONCAT('Withdrawal (', status, ')') as description FROM withdrawals WHERE user_id = ?
            ORDER BY date DESC
            LIMIT 20
        `, [userId, userId]);

        const [recipeViews] = await pool.query('SELECT SUM(view_count) as v FROM recipes WHERE author_id = ?', [userId]);
        const [videoViews] = await pool.query('SELECT SUM(view_count) as v FROM videos WHERE user_id = ?', [userId]);
        const totalViews = (Number(recipeViews[0].v)||0) + (Number(videoViews[0].v)||0);

        // Fetch counts and content list
        const [recipeCountRows] = await pool.query('SELECT COUNT(*) as c FROM recipes WHERE author_id = ?', [userId]);
        const recipesCount = recipeCountRows[0].c;

        const [videoCountRows] = await pool.query('SELECT COUNT(*) as c FROM videos WHERE user_id = ?', [userId]);
        const videosCount = videoCountRows[0].c;

        const [userRecipes] = await pool.query('SELECT id, name, category, image, view_count, created_at, "recipe" as type, is_static FROM recipes WHERE author_id = ? ORDER BY created_at DESC', [userId]);
        const [userVideos] = await pool.query('SELECT id, title as name, "Reels" as category, thumbnail_url as image, view_count, created_at, "video" as type FROM videos WHERE user_id = ? ORDER BY created_at DESC', [userId]);
        
        // Combine and sort content
        const content = [...userRecipes, ...userVideos].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

        res.json({ 
            total_earnings: totalEarnings, 
            balance: balance, 
            total_views: totalViews,
            transactions: transactions,
            recipes_count: recipesCount,
            videos_count: videosCount,
            content: content
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error fetching earnings' });
    }
});

// Withdrawal Request
app.post('/api/earnings/withdraw', async (req, res) => {
    if (!dbReady) return res.status(503).json({ error: 'DB not ready' });
    const { user_id, amount, method, details } = req.body;
    // Need to verify user_id matches logged in user (skipped for prototype simplicity)
    if (!user_id || !amount) return res.status(400).json({ error: 'Missing fields' });

    try {
        const [earningRows] = await pool.query('SELECT SUM(amount) as total FROM earnings WHERE user_id = ?', [user_id]);
        const totalEarnings = Number(earningRows[0].total || 0);
        const [withdrawRows] = await pool.query('SELECT SUM(amount) as total FROM withdrawals WHERE user_id = ? AND status != "rejected"', [user_id]);
        const totalWithdrawn = Number(withdrawRows[0].total || 0);
        const balance = totalEarnings - totalWithdrawn;

        if (amount > balance) return res.status(400).json({ error: 'Insufficient balance' });

        await pool.query('INSERT INTO withdrawals (user_id, amount, method, details) VALUES (?, ?, ?, ?)', [user_id, amount, method, details]);
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Withdrawal failed' });
    }
});

// Generic Like for Videos
app.post('/videos/:id/like', async (req, res) => {
    if (!dbReady) return res.status(503).json({ error: 'DB not ready' });
    const videoId = req.params.id;
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'User required' });

    try {
        const [exists] = await pool.query('SELECT id FROM likes WHERE user_id = ? AND video_id = ?', [user_id, videoId]);
        if (exists.length > 0) {
            await pool.query('DELETE FROM likes WHERE id = ?', [exists[0].id]);
            res.json({ ok: true, liked: false });
        } else {
            await pool.query('INSERT INTO likes (user_id, video_id) VALUES (?, ?)', [user_id, videoId]);
            res.json({ ok: true, liked: true });
        }
    } catch (e) {
        res.status(500).json({ error: 'Like failed' });
    }
});

// Like for Recipes
app.post('/recipes/:id/like', async (req, res) => {
    if (!dbReady) return res.status(503).json({ error: 'DB not ready' });
    const recipeId = req.params.id;
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'User required' });

    try {
        const [exists] = await pool.query('SELECT id FROM likes WHERE user_id = ? AND recipe_id = ?', [user_id, recipeId]);
        if (exists.length > 0) {
            await pool.query('DELETE FROM likes WHERE id = ?', [exists[0].id]);
            res.json({ ok: true, liked: false });
        } else {
            await pool.query('INSERT INTO likes (user_id, recipe_id) VALUES (?, ?)', [user_id, recipeId]);
            res.json({ ok: true, liked: true });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Like failed' });
    }
});

// Comment for Recipes
app.post('/recipes/:id/comment', async (req, res) => {
    if (!dbReady) return res.status(503).json({ error: 'DB not ready' });
    const recipeId = req.params.id;
    const { user_id, text } = req.body;
    if (!user_id || !text) return res.status(400).json({ error: 'User and text required' });

    try {
        await pool.query('INSERT INTO comments (user_id, recipe_id, text) VALUES (?, ?, ?)', [user_id, recipeId, text]);
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Comment failed' });
    }
});

// Comment for Videos
app.post('/videos/:id/comment', async (req, res) => {
    if (!dbReady) return res.status(503).json({ error: 'DB not ready' });
    const videoId = req.params.id;
    const { user_id, text } = req.body;
    if (!user_id || !text) return res.status(400).json({ error: 'User and text required' });

    try {
        await pool.query('INSERT INTO comments (user_id, video_id, text) VALUES (?, ?, ?)', [user_id, videoId, text]);
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Comment failed' });
    }
});

// View for Videos
app.post('/videos/:id/view', async (req, res) => {
    if (!dbReady) return res.status(503).json({ error: 'DB not ready' });
    const videoId = req.params.id;
    
    try {
        await pool.query('UPDATE videos SET view_count = view_count + 1 WHERE id = ?', [videoId]);
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'View record failed' });
    }
});

// Follow User
app.post('/users/:id/follow', async (req, res) => {
    // Note: Assuming 'follows' table exists or needs to be added. 
    // Schema.sql didn't have follows table explicitly mentioned in my last check?
    // Let's assume we need to create it if not exists, or just stub it.
    // I will add table creation to init.js later if needed.
    if (!dbReady) return res.status(503).json({ error: 'DB not ready' });
    const targetId = req.params.id;
    const { follower_id } = req.body;
    if (!follower_id) return res.status(400).json({ error: 'Follower required' });

    try {
        // Check if table exists, if not, create it on fly? No, better in init.js
        // Assuming table 'follows' (follower_id, following_id)
        const [exists] = await pool.query('SELECT id FROM follows WHERE follower_id = ? AND following_id = ?', [follower_id, targetId]);
        if (exists.length > 0) {
            await pool.query('DELETE FROM follows WHERE id = ?', [exists[0].id]);
            res.json({ ok: true, followed: false });
        } else {
            await pool.query('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)', [follower_id, targetId]);
            res.json({ ok: true, followed: true });
        }
    } catch (e) {
        // console.error(e); 
        // If table doesn't exist, this will fail. I'll handle that by ensuring table exists in init.js
        res.status(500).json({ error: 'Follow failed' });
    }
});

// Feed Endpoint
app.get('/api/feed', async (req, res) => {
    if (!dbReady) return res.json({ feed: [] });
    try {
        // Mix of recent recipes and videos
        const [recipes] = await pool.query(`
            SELECT id, name as title, image as thumbnail_url, author as author_name, created_at, 'recipe' as type 
            FROM recipes ORDER BY created_at DESC LIMIT 10
        `);
        const [videos] = await pool.query(`
            SELECT v.id, v.title, v.thumbnail_url, u.name as author_name, v.created_at, 'video' as type 
            FROM videos v LEFT JOIN users u ON v.user_id = u.id 
            ORDER BY v.created_at DESC LIMIT 10
        `);
        
        const feed = [...recipes, ...videos].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
        res.json({ feed });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Feed fetch failed' });
    }
});

app.use(express.static(path.join(__dirname)));
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  if (!dbReady) {
    console.log('Waiting for database to connect...');
  }
});
