const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;
const uploadDir = path.join(__dirname, 'uploads');
const sharedMetaFile = path.join(__dirname, 'shared.json');

const ADMIN_PIN = process.env.ADMIN_PIN || '1234';

app.use(express.json());

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Helpers to track which files are marked "Shared to Senders"
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

// Multer setup
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
  if (pin === ADMIN_PIN) return next();
  return res.status(401).json({ error: 'Unauthorized: Invalid Admin PIN' });
}

// 1. PUBLIC: Upload to PC (Always private)
app.post('/upload', upload.array('files'), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files provided' });
  }
  res.json({ message: 'Success' });
});

// 2. PUBLIC: Get ONLY files marked by PC owner as "Shared"
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

// 3. ADMIN: Get ALL files + their share status
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

// 4. ADMIN: Toggle "Share to Senders"
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

// 5. ADMIN: Delete a file
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

// 6. ADMIN: Clear all
app.post('/api/clear-all', checkAuth, (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) return res.status(500).json({ error: 'Error clearing' });
    for (const f of files) fs.unlinkSync(path.join(uploadDir, f));
    saveSharedFiles([]);
    res.json({ success: true });
  });
});

// 7. Download file
app.get('/download/:filename', (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send('File not found');
  }
});

// 8. ADMIN: Download all as ZIP
app.get('/download-all', checkAuth, (req, res) => {
  const archive = archiver('zip', { zlib: { level: 9 } });
  res.attachment('all-files.zip');
  archive.pipe(res);
  archive.directory(uploadDir, false);
  archive.finalize();
});

// User Interface
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>Drop & Share</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #090d16;
      color: #f8fafc;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px 16px;
    }
    .container { width: 100%; max-width: 520px; display: flex; flex-direction: column; gap: 20px; }
    .card {
      background: #172033;
      border-radius: 16px;
      padding: 22px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.6);
      border: 1px solid #1e293b;
    }
    h2 { font-size: 1.2rem; margin-bottom: 6px; }
    p.subtitle { color: #94a3b8; font-size: 0.85rem; margin-bottom: 16px; }
    .drop-zone {
      border: 2px dashed #334155;
      border-radius: 12px;
      padding: 24px 16px;
      text-align: center;
      cursor: pointer;
      background: #0f172a80;
    }
    .btn {
      background: #0284c7;
      color: #fff;
      border: none;
      padding: 12px;
      font-size: 0.95rem;
      font-weight: 600;
      border-radius: 8px;
      width: 100%;
      cursor: pointer;
      margin-top: 14px;
    }
    .btn:disabled { background: #334155; cursor: not-allowed; }
    .btn-toggle {
      background: #334155;
      color: #cbd5e1;
      border: none;
      padding: 5px 8px;
      border-radius: 6px;
      font-size: 0.75rem;
      cursor: pointer;
      margin-right: 6px;
    }
    .btn-toggle.active {
      background: #10b981;
      color: #fff;
    }
    .btn-danger { background: #ef4444; padding: 5px 8px; font-size: 0.75rem; border-radius: 6px; cursor: pointer; border:none; color:white; }
    .btn-dl { background: #0284c7; color: #fff; text-decoration: none; padding: 6px 12px; border-radius: 6px; font-size: 0.8rem; }
    .progress-box { margin-top: 14px; display: none; }
    .progress-bar-bg { background: #334155; height: 8px; border-radius: 4px; overflow: hidden; }
    .progress-bar { width: 0%; height: 100%; background: #38bdf8; }
    .file-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid #243049;
    }
    .file-name { font-size: 0.9rem; color: #f1f5f9; word-break: break-all; max-width: 55%; }
    .file-meta { font-size: 0.75rem; color: #64748b; margin-top: 2px; }
    .input-pin {
      background: #0f172a;
      border: 1px solid #334155;
      color: #fff;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 0.9rem;
      width: 120px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- 1. SENDER UPLOAD -->
    <div class="card">
      <h2>📤 Send Files to PC</h2>
      <p class="subtitle">Uploaded files are completely private and seen only by the PC.</p>
      <div class="drop-zone" id="dropZone">
        <div style="font-size: 30px; margin-bottom: 6px;">🔒</div>
        <div style="font-size: 0.9rem;">Tap to select files</div>
        <input type="file" id="fileInput" multiple style="display:none">
      </div>
      <div id="fileList" style="margin-top: 10px; font-size: 0.85rem; color: #94a3b8;"></div>
      <button class="btn" id="uploadBtn" disabled>Upload</button>

      <div class="progress-box" id="progressBox">
        <div class="progress-bar-bg"><div class="progress-bar" id="progressBar"></div></div>
        <div id="progressText" style="margin-top: 4px; font-size: 0.75rem; text-align: right; color: #94a3b8;">0%</div>
      </div>
      <div id="sessionConfirm" style="margin-top:14px; font-size:0.85rem; color:#34d399; display:none;"></div>
    </div>

    <!-- 2. PUBLIC DOWNLOADS (Shared by PC Owner) -->
    <div class="card" id="publicDownloadsCard" style="display:none;">
      <h2>📥 Download from PC</h2>
      <p class="subtitle">Files the PC owner has shared with you:</p>
      <div id="publicList"></div>
    </div>

    <!-- 3. PC OWNER / ADMIN CONTROLS -->
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h2>🛡️ PC Admin Panel</h2>
        <div id="adminActions" style="display:none; gap:6px;">
          <a id="zipBtn" href="#" style="background:#10b981; color:#fff; text-decoration:none; padding:5px 10px; font-size:0.75rem; border-radius:6px;">📦 ZIP</a>
          <button id="clearAllBtn" class="btn-danger">🧹 Clear</button>
        </div>
      </div>
      <p class="subtitle">Manage storage, delete files, or share files with visitors.</p>

      <div id="authSection" style="display:flex; gap:8px;">
        <input type="password" id="pinInput" class="input-pin" placeholder="PIN (1234)">
        <button class="btn" id="unlockBtn" style="margin-top:0; width:auto; padding:8px 16px;">Unlock</button>
      </div>

      <div id="adminContainer" style="margin-top: 14px; display:none;"></div>
    </div>
  </div>

  <script>
    let adminPin = localStorage.getItem('drop_admin_pin') || '';

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

    const pinInput = document.getElementById('pinInput');
    const unlockBtn = document.getElementById('unlockBtn');
    const authSection = document.getElementById('authSection');
    const adminActions = document.getElementById('adminActions');
    const adminContainer = document.getElementById('adminContainer');
    const zipBtn = document.getElementById('zipBtn');
    const clearAllBtn = document.getElementById('clearAllBtn');

    // Load Public Shared Files (For anyone scanning)
    async function loadPublicFiles() {
      try {
        const res = await fetch('/api/public/shared');
        const files = await res.json();
        if (files.length > 0) {
          publicDownloadsCard.style.display = 'block';
          publicList.innerHTML = files.map(f => \`
            <div class="file-item">
              <div>
                <div class="file-name">\${f.name}</div>
                <div class="file-meta">\${f.size}</div>
              </div>
              <a href="/download/\${encodeURIComponent(f.name)}" class="btn-dl">Download</a>
            </div>
          \`).join('');
        } else {
          publicDownloadsCard.style.display = 'none';
        }
      } catch (e) {}
    }
    loadPublicFiles();

    // Upload Files
    dropZone.onclick = () => fileInput.click();
    fileInput.onchange = () => {
      const files = Array.from(fileInput.files);
      if (!files.length) return;
      fileList.innerHTML = files.map(f => '• ' + f.name).join('<br>');
      uploadBtn.disabled = false;
      uploadBtn.innerText = 'Upload ' + files.length + ' file(s)';
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
        uploadBtn.innerText = 'Upload';
        sessionConfirm.style.display = 'block';
        sessionConfirm.innerText = '✅ Files safely uploaded to PC!';
        if (adminPin) loadAdminFiles();
      };
      xhr.send(formData);
    };

    // Admin Auth
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
          alert('Incorrect PIN');
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
          adminContainer.innerHTML = '<div style="color:#64748b; text-align:center; padding:12px; font-size:0.85rem;">Storage is empty.</div>';
          return;
        }

        adminContainer.innerHTML = files.map(f => \`
          <div class="file-item">
            <div>
              <div class="file-name">\${f.name}</div>
              <div class="file-meta">\${f.size} • \${f.date}</div>
            </div>
            <div style="display:flex; align-items:center;">
              <button class="btn-toggle \${f.isShared ? 'active' : ''}" onclick="toggleShare('\${encodeURIComponent(f.name)}')">
                \${f.isShared ? '📢 Shared' : '🔒 Private'}
              </button>
              <button class="btn-danger" onclick="deleteFile('\${encodeURIComponent(f.name)}')">🗑️</button>
            </div>
          </div>
        \`).join('');
      } catch (e) {}
    }

    window.toggleShare = async (name) => {
      await fetch('/api/admin/toggle-share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
        body: JSON.stringify({ filename: decodeURIComponent(name) })
      });
      loadAdminFiles();
      loadPublicFiles();
    };

    window.deleteFile = async (name) => {
      if (!confirm('Permanently delete this file?')) return;
      await fetch('/api/files/' + name, {
        method: 'DELETE',
        headers: { 'x-admin-pin': adminPin }
      });
      loadAdminFiles();
      loadPublicFiles();
    };

    clearAllBtn.onclick = async () => {
      if (!confirm('Delete all files?')) return;
      await fetch('/api/clear-all', {
        method: 'POST',
        headers: { 'x-admin-pin': adminPin }
      });
      loadAdminFiles();
      loadPublicFiles();
    };

    if (adminPin) {
      pinInput.value = adminPin;
      loadAdminFiles();
    }
  </script>
</body>
</html>`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
