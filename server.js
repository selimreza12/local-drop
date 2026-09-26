const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;
const uploadDir = path.join(__dirname, 'uploads');
const sharedMetaFile = path.join(__dirname, 'shared.json');

const ADMIN_PIN = process.env.ADMIN_PIN || '8492';

app.use(express.json());

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Favicon
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#2563eb"/>
  <path d="M50 20 L74 46 H58 V74 H42 V46 H26 Z" fill="#ffffff"/>
  <rect x="24" y="80" width="52" height="6" rx="3" fill="#60a5fa"/>
</svg>`;

app.get('/favicon.ico', (req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(faviconSvg);
});

function getSharedFiles() {
  try {
    if (fs.existsSync(sharedMetaFile)) {
      return JSON.parse(fs.readFileSync(sharedMetaFile, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function saveSharedFiles(list) {
  fs.writeFileSync(sharedMetaFile, JSON.stringify(list, null, 2));
}

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(originalName);
    const base = path.basename(originalName, ext);
    let finalPath = path.join(uploadDir, originalName);
    let counter = 1;
    let finalName = originalName;

    while (fs.existsSync(finalPath)) {
      finalName = `${base}_${counter}${ext}`;
      finalPath = path.join(uploadDir, finalName);
      counter++;
    }
    cb(null, finalName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }
});

function checkAuth(req, res, next) {
  const pin = req.headers['x-admin-pin'] || req.query.pin;
  if (pin && pin === ADMIN_PIN) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// 1. PUBLIC: Upload
app.post('/upload', upload.array('files'), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files provided' });
  }
  res.json({ message: 'Success' });
});

// 2. PUBLIC: Get Shared Files
app.get('/api/public/shared', (req, res) => {
  const sharedList = getSharedFiles();
  const validFiles = [];

  for (const name of sharedList) {
    const filePath = path.join(uploadDir, name);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      validFiles.push({
        name,
        size: (stats.size / (1024 * 1024)).toFixed(2) + ' MB'
      });
    }
  }
  res.json(validFiles);
});

// 3. ADMIN: List all files
app.get('/api/admin/files', checkAuth, (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) return res.status(500).json({ error: 'Cannot read files' });
    const sharedList = getSharedFiles();
    const data = files.map(file => {
      const stats = fs.statSync(path.join(uploadDir, file));
      return {
        name: file,
        size: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
        date: stats.mtime.toLocaleTimeString(),
        isShared: sharedList.includes(file)
      };
    });
    res.json(data);
  });
});

// 4. ADMIN: Toggle Sharing
app.post('/api/admin/toggle-share', checkAuth, (req, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: 'Missing filename' });

  let sharedList = getSharedFiles();
  if (sharedList.includes(filename)) {
    sharedList = sharedList.filter(f => f !== filename);
  } else {
    sharedList.push(filename);
  }
  saveSharedFiles(sharedList);
  res.json({ success: true, sharedList });
});

// 5. ADMIN: Delete File
app.delete('/api/files/:filename', checkAuth, (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(uploadDir, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    let sharedList = getSharedFiles().filter(f => f !== filename);
    saveSharedFiles(sharedList);
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'File not found' });
});

// 6. ADMIN: Clear All
app.post('/api/clear-all', checkAuth, (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) return res.status(500).json({ error: 'Error clearing' });
    for (const f of files) fs.unlinkSync(path.join(uploadDir, f));
    saveSharedFiles([]);
    res.json({ success: true });
  });
});

// 7. Download File
app.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const sharedList = getSharedFiles();
  const pin = req.query.pin;

  if (sharedList.includes(filename) || pin === ADMIN_PIN) {
    const filePath = path.join(uploadDir, filename);
    if (fs.existsSync(filePath)) {
      return res.download(filePath);
    }
    return res.status(404).send('File not found');
  }
  return res.status(403).send('Access denied');
});

// 8. ADMIN: Download All as ZIP
app.get('/download-all', checkAuth, (req, res) => {
  const archive = archiver('zip', { zlib: { level: 9 } });
  res.attachment('all-files.zip');
  archive.pipe(res);
  archive.directory(uploadDir, false);
  archive.finalize();
});

// Common Brand Header Component
const brandHeaderHtml = `
<div class="brand-header">
  <div class="shop-badge">💻 কম্পিউটার ও ডিজিটাল সেবা</div>
  <h1 class="brand-title">আক্তার কসমেটিকস এন্ড কম্পিউটার সার্ভিস</h1>
  <div class="brand-address">
    <svg viewBox="0 0 24 24" class="icon-pin"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>
    আপাবাজার, বাংগাবাড়ী, গোমস্তাপুর, চাঁপাইনবাবগঞ্জ
  </div>
</div>
`;

// Common CSS Styles (Modern Light Theme)
const commonStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
    background: #f1f5f9;
    color: #1e293b;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 32px 16px;
  }
  .container { width: 100%; max-width: 580px; display: flex; flex-direction: column; gap: 20px; }

  /* Animated Bengali Brand Header */
  .brand-header {
    text-align: center;
    margin-bottom: 8px;
    animation: fadeInDown 0.6s ease-out;
  }
  .shop-badge {
    display: inline-block;
    background: #dbeafe;
    color: #1d4ed8;
    font-size: 0.8rem;
    font-weight: 600;
    padding: 4px 12px;
    border-radius: 999px;
    margin-bottom: 10px;
    letter-spacing: 0.3px;
  }
  .brand-title {
    font-size: 1.6rem;
    font-weight: 800;
    line-height: 1.35;
    background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #0284c7 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 8px;
  }
  .brand-address {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 0.9rem;
    color: #64748b;
    font-weight: 500;
  }
  .icon-pin { width: 16px; height: 16px; fill: #ef4444; flex-shrink: 0; }

  /* Cards */
  .card {
    background: #ffffff;
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.03);
    border: 1px solid #e2e8f0;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
  .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  h2 { font-size: 1.25rem; font-weight: 700; color: #0f172a; }
  p.subtitle { color: #64748b; font-size: 0.875rem; margin-bottom: 18px; }

  /* Upload Drop Zone */
  .drop-zone {
    border: 2px dashed #cbd5e1;
    border-radius: 12px;
    padding: 32px 16px;
    text-align: center;
    cursor: pointer;
    background: #f8fafc;
    transition: all 0.2s ease;
  }
  .drop-zone:hover {
    border-color: #2563eb;
    background: #eff6ff;
  }
  .drop-zone-icon {
    width: 48px;
    height: 48px;
    fill: #2563eb;
    margin-bottom: 10px;
    transition: transform 0.2s;
  }
  .drop-zone:hover .drop-zone-icon { transform: translateY(-3px); }
  .drop-text { font-size: 0.95rem; font-weight: 600; color: #334155; }
  .drop-subtext { font-size: 0.8rem; color: #94a3b8; margin-top: 4px; }

  /* Buttons */
  .btn {
    background: #2563eb;
    color: #fff;
    border: none;
    padding: 12px;
    font-size: 0.95rem;
    font-weight: 600;
    border-radius: 10px;
    width: 100%;
    cursor: pointer;
    margin-top: 16px;
    transition: background 0.15s ease, transform 0.1s ease;
  }
  .btn:hover { background: #1d4ed8; }
  .btn:active { transform: scale(0.98); }
  .btn:disabled { background: #cbd5e1; cursor: not-allowed; transform: none; }

  .btn-action {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 0.8rem;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    border: none;
    transition: all 0.15s;
  }
  .btn-download { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
  .btn-download:hover { background: #dbeafe; }
  .btn-toggle { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }
  .btn-toggle.active { background: #ecfdf5; color: #047857; border-color: #a7f3d0; }
  .btn-danger { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
  .btn-danger:hover { background: #fee2e2; }
  .btn-zip { background: #059669; color: white; }
  .btn-zip:hover { background: #047857; }

  /* File Rows */
  .file-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    border-radius: 10px;
    background: #f8fafc;
    margin-bottom: 8px;
    border: 1px solid #edf2f7;
  }
  .file-info { max-width: 55%; }
  .file-name { font-size: 0.9rem; font-weight: 600; color: #1e293b; word-break: break-all; }
  .file-meta { font-size: 0.75rem; color: #64748b; margin-top: 2px; }
  .file-actions { display: flex; gap: 6px; align-items: center; }

  /* Progress Bar */
  .progress-box { margin-top: 16px; display: none; }
  .progress-bar-bg { background: #e2e8f0; height: 8px; border-radius: 99px; overflow: hidden; }
  .progress-bar { width: 0%; height: 100%; background: #2563eb; transition: width 0.1s; }

  /* Auth / Inputs */
  .input-pin {
    background: #f8fafc;
    border: 1.5px solid #cbd5e1;
    color: #0f172a;
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: 2px;
    width: 140px;
    outline: none;
  }
  .input-pin:focus { border-color: #2563eb; }

  @keyframes fadeInDown {
    from { opacity: 0; transform: translateY(-12px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

// ==========================================
// 1. PUBLIC ROUTE ('/'): Mobile / Visitor Page
// ==========================================
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <link rel="icon" type="image/svg+xml" href="/favicon.ico">
  <title>আক্তার কসমেটিকস এন্ড কম্পিউটার সার্ভিস - ফাইল আদান-প্রদান</title>
  <style>${commonStyles}</style>
</head>
<body>
  <div class="container">
    ${brandHeaderHtml}

    <!-- SENDER UPLOAD CARD -->
    <div class="card">
      <div class="card-header">
        <h2>📤 কম্পিউটারে ফাইল পাঠান</h2>
      </div>
      <p class="subtitle">আপনার ছবি, ডকুমেন্ট বা ভিডিও সরাসরি আমাদের কম্পিউটারে জমা দিন।</p>
      
      <div class="drop-zone" id="dropZone">
        <svg class="drop-zone-icon" viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>
        <div class="drop-text">ফাইল বাছাই করতে এখানে স্পর্শ করুন</div>
        <div class="drop-subtext">ছবি, ভিডিও, পিডিএফ বা যেকোনো ফাইল সাপোর্ট করে</div>
        <input type="file" id="fileInput" multiple style="display:none">
      </div>

      <div id="fileList" style="margin-top: 12px; font-size: 0.85rem; color: #475569; font-weight: 500;"></div>
      <button class="btn" id="uploadBtn" disabled>ফাইল আপলোড করুন</button>

      <div class="progress-box" id="progressBox">
        <div class="progress-bar-bg"><div class="progress-bar" id="progressBar"></div></div>
        <div id="progressText" style="margin-top: 6px; font-size: 0.8rem; text-align: right; color: #64748b; font-weight: 600;">0%</div>
      </div>
      <div id="sessionConfirm" style="margin-top: 14px; padding: 12px; border-radius: 8px; background: #ecfdf5; border: 1px solid #a7f3d0; font-size: 0.9rem; color: #047857; font-weight: 600; display: none; text-align: center;"></div>
    </div>

    <!-- PUBLIC DOWNLOADS CARD (Shared by Shopkeeper/PC) -->
    <div class="card" id="publicDownloadsCard" style="display:none;">
      <div class="card-header">
        <h2>📥 দোকান থেকে ডাউনলোড করুন</h2>
      </div>
      <p class="subtitle">কম্পিউটার থেকে আপনার জন্য পাঠানো ফাইলসমূহ:</p>
      <div id="publicList"></div>
    </div>
  </div>

  <script>
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const uploadBtn = document.getElementById('uploadBtn');
    const fileList = document.getElementById('fileList');
    const progressBox = document.getElementById('progressBox');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const sessionConfirm = document.getElementById('sessionConfirm');
    const publicDownloadsCard = document.getElementById('publicDownloadsCard');
    const publicList = document.getElementById('publicList');

    async function loadPublicFiles() {
      try {
        const res = await fetch('/api/public/shared');
        const files = await res.json();
        if (files.length > 0) {
          publicDownloadsCard.style.display = 'block';
          publicList.innerHTML = files.map(f => \`
            <div class="file-item">
              <div class="file-info">
                <div class="file-name">\${f.name}</div>
                <div class="file-meta">\${f.size}</div>
              </div>
              <a href="/download/\${encodeURIComponent(f.name)}" class="btn-action btn-download" download>
                ⬇️ ডাউনলোড
              </a>
            </div>
          \`).join('');
        } else {
          publicDownloadsCard.style.display = 'none';
        }
      } catch (e) {}
    }
    loadPublicFiles();

    dropZone.onclick = () => fileInput.click();
    fileInput.onchange = () => {
      const files = Array.from(fileInput.files);
      if (!files.length) return;
      fileList.innerHTML = files.map(f => '📄 ' + f.name).join('<br>');
      uploadBtn.disabled = false;
      uploadBtn.innerText = files.length + ' টি ফাইল আপলোড করুন';
      sessionConfirm.style.display = 'none';
    };

    uploadBtn.onclick = () => {
      const formData = new FormData();
      for (const file of fileInput.files) formData.append('files', file);

      uploadBtn.disabled = true;
      progressBox.style.display = 'block';

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/upload', true);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          progressBar.style.width = pct + '%';
          progressText.innerText = pct + '%';
        }
      };
      xhr.onload = () => {
        progressBox.style.display = 'none';
        fileInput.value = '';
        fileList.innerHTML = '';
        uploadBtn.innerText = 'ফাইল আপলোড করুন';
        sessionConfirm.style.display = 'block';
        sessionConfirm.innerText = '✅ ফাইলটি সফলভাবে কম্পিউটারে পৌঁছেছে!';
      };
      xhr.send(formData);
    };
  </script>
</body>
</html>`);
});

// ==========================================
// 2. ADMIN ROUTE ('/admin'): PC Owner Only
// ==========================================
app.get('/admin', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/svg+xml" href="/favicon.ico">
  <title>Admin Panel - আক্তার কসমেটিকস এন্ড কম্পিউটার সার্ভিস</title>
  <style>${commonStyles}</style>
</head>
<body>
  <div class="container">
    ${brandHeaderHtml}

    <div class="card">
      <div class="card-header">
        <h2>🛡️ কম্পিউটার কন্ট্রোল প্যানেল</h2>
        <div id="adminActions" style="display:none; gap:6px;">
          <a id="zipBtn" href="#" class="btn-action btn-zip">📦 All ZIP</a>
          <button id="clearAllBtn" class="btn-action btn-danger">🧹 Clear All</button>
        </div>
      </div>
      <p class="subtitle">এখানে গ্রাহকদের পাঠানো সকল ফাইল জমা হয়। ডাউনলোড বা ডিলিট করুন।</p>

      <div id="authSection" style="display:flex; gap:10px; margin-top: 10px;">
        <input type="password" id="pinInput" class="input-pin" placeholder="PIN দিন">
        <button class="btn" id="unlockBtn" style="margin-top:0; width:auto; padding:10px 20px;">লগইন</button>
      </div>

      <div id="adminContainer" style="margin-top: 16px; display:none;"></div>
    </div>
  </div>

  <script>
    let adminPin = localStorage.getItem('drop_admin_pin') || '';
    const pinInput = document.getElementById('pinInput');
    const unlockBtn = document.getElementById('unlockBtn');
    const authSection = document.getElementById('authSection');
    const adminActions = document.getElementById('adminActions');
    const adminContainer = document.getElementById('adminContainer');
    const zipBtn = document.getElementById('zipBtn');
    const clearAllBtn = document.getElementById('clearAllBtn');

    unlockBtn.onclick = () => {
      adminPin = pinInput.value.trim();
      localStorage.setItem('drop_admin_pin', adminPin);
      loadAdminFiles();
    };

    async function loadAdminFiles() {
      try {
        const res = await fetch('/api/admin/files', {
          headers: { 'x-admin-pin': adminPin }
        });
        if (!res.ok) {
          alert('ভুল পিন (Invalid PIN)');
          localStorage.removeItem('drop_admin_pin');
          adminPin = '';
          return;
        }

        const files = await res.json();
        authSection.style.display = 'none';
        adminActions.style.display = 'flex';
        adminContainer.style.display = 'block';
        zipBtn.href = '/download-all?pin=' + encodeURIComponent(adminPin);

        if (!files.length) {
          adminContainer.innerHTML = '<div style="color:#94a3b8; text-align:center; padding:24px; font-weight:500;">কোনো ফাইল জমা নেই (Storage is empty)</div>';
          return;
        }

        adminContainer.innerHTML = files.map(f => \`
          <div class="file-item">
            <div class="file-info">
              <div class="file-name">\${f.name}</div>
              <div class="file-meta">\${f.size} • সময়: \${f.date}</div>
            </div>
            <div class="file-actions">
              <!-- Individual Download Button -->
              <a href="/download/\${encodeURIComponent(f.name)}?pin=\${encodeURIComponent(adminPin)}" class="btn-action btn-download" download>
                ⬇️ Download
              </a>
              <!-- Share to customer toggle -->
              <button class="btn-action btn-toggle \${f.isShared ? 'active' : ''}" onclick="toggleShare('\${encodeURIComponent(f.name)}')">
                \${f.isShared ? '📢 গ্রাহককে দেওয়া' : '🔒 গোপন'}
              </button>
              <!-- Delete button -->
              <button class="btn-action btn-danger" onclick="deleteFile('\${encodeURIComponent(f.name)}')">
                🗑️
              </button>
            </div>
          </div>
        \`).join('');
      } catch (e) {
        alert('সার্ভারে যোগাযোগ করা সম্ভব হচ্ছে না');
      }
    }

    window.toggleShare = async (name) => {
      await fetch('/api/admin/toggle-share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
        body: JSON.stringify({ filename: decodeURIComponent(name) })
      });
      loadAdminFiles();
    };

    window.deleteFile = async (name) => {
      if (!confirm('ফাইলটি স্থায়ীভাবে মুছে ফেলতে চান?')) return;
      await fetch('/api/files/' + name, {
        method: 'DELETE',
        headers: { 'x-admin-pin': adminPin }
      });
      loadAdminFiles();
    };

    clearAllBtn.onclick = async () => {
      if (!confirm('সকল ফাইল ডিলিট করে দিতে চান?')) return;
      await fetch('/api/clear-all', {
        method: 'POST',
        headers: { 'x-admin-pin': adminPin }
      });
      loadAdminFiles();
    };

    if (adminPin) {
      loadAdminFiles();
    }
  </script>
</body>
</html>`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
