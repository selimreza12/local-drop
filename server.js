const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;
const uploadDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage engine
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
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

// JSON API endpoint to list all available files
app.get('/api/files', (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) return res.status(500).json({ error: 'Cannot list files' });
    const fileData = files.map(file => {
      const stats = fs.statSync(path.join(uploadDir, file));
      return {
        name: file,
        size: (stats.size / (1024 * 1024)).toFixed(2) + ' MB',
        date: stats.mtime.toLocaleTimeString()
      };
    });
    res.json(fileData);
  });
});

// Upload Endpoint
app.post('/upload', upload.array('files'), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files provided' });
  }
  res.json({ message: 'Success', count: req.files.length });
});

// Single File Download
app.get('/download/:filename', (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send('File not found');
  }
});

// Download All Files as ZIP
app.get('/download-all', (req, res) => {
  const archive = archiver('zip', { zlib: { level: 9 } });
  res.attachment('shared-files.zip');
  archive.pipe(res);
  archive.directory(uploadDir, false);
  archive.finalize();
});

// Two-Way Mobile & Desktop Interface
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>Two-Way Quick Drop</title>
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
      padding: 24px 16px;
    }
    .container {
      width: 100%;
      max-width: 520px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .card {
      background: #172033;
      border-radius: 16px;
      padding: 22px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.6);
      border: 1px solid #1e293b;
    }
    h2 { font-size: 1.25rem; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; }
    p.subtitle { color: #94a3b8; font-size: 0.85rem; margin-bottom: 16px; }
    .drop-zone {
      border: 2px dashed #334155;
      border-radius: 12px;
      padding: 24px 16px;
      text-align: center;
      cursor: pointer;
      background: #0f172a80;
      transition: all 0.2s ease;
    }
    .drop-zone:hover { border-color: #38bdf8; }
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
    .btn-zip {
      background: #10b981;
      padding: 8px 14px;
      font-size: 0.85rem;
      border-radius: 6px;
      color: #fff;
      text-decoration: none;
      font-weight: 600;
    }
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
    .file-item:last-child { border-bottom: none; }
    .file-meta { font-size: 0.75rem; color: #64748b; margin-top: 2px; }
    .file-name { font-size: 0.9rem; color: #f1f5f9; word-break: break-all; max-width: 70%; }
    .btn-dl {
      background: #0284c7;
      color: #fff;
      text-decoration: none;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 500;
      white-space: nowrap;
    }
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- SECTION 1: UPLOAD (SEND FILES) -->
    <div class="card">
      <h2>📤 Send Files</h2>
      <p class="subtitle">Upload files to PC or mobile instantly</p>
      <div class="drop-zone" id="dropZone">
        <div style="font-size: 28px; margin-bottom: 6px;">📂</div>
        <div style="font-size: 0.9rem;">Tap to select or drop files here</div>
        <input type="file" id="fileInput" multiple style="display:none">
      </div>
      <div id="fileList" style="margin-top: 10px; font-size: 0.85rem; color: #94a3b8;"></div>
      <button class="btn" id="uploadBtn" disabled>Upload</button>

      <div class="progress-box" id="progressBox">
        <div class="progress-bar-bg"><div class="progress-bar" id="progressBar"></div></div>
        <div id="progressText" style="margin-top: 4px; font-size: 0.75rem; text-align: right; color: #94a3b8;">0%</div>
      </div>
    </div>

    <!-- SECTION 2: DOWNLOAD (RECEIVE FILES) -->
    <div class="card">
      <div class="header-row">
        <div>
          <h2>📥 Available Files</h2>
          <p class="subtitle" style="margin-bottom: 0;">Tap to download to your device</p>
        </div>
        <a href="/download-all" id="zipBtn" class="btn-zip" style="display:none;">📦 All (.zip)</a>
      </div>
      <div id="fileContainer" style="margin-top: 10px;">
        <div style="color: #64748b; text-align: center; padding: 12px; font-size: 0.85rem;">Loading files...</div>
      </div>
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
    const fileContainer = document.getElementById('fileContainer');
    const zipBtn = document.getElementById('zipBtn');

    let selectedFiles = [];

    dropZone.onclick = () => fileInput.click();
    fileInput.onchange = () => {
      selectedFiles = Array.from(fileInput.files);
      if (!selectedFiles.length) return;
      fileList.innerHTML = selectedFiles.map(f => '• ' + f.name).join('<br>');
      uploadBtn.disabled = false;
      uploadBtn.innerText = 'Upload ' + selectedFiles.length + ' file(s)';
    };

    // Load Available Files List
    async function loadFiles() {
      try {
        const res = await fetch('/api/files');
        const files = await res.json();
        if (!files.length) {
          fileContainer.innerHTML = '<div style="color: #64748b; text-align: center; padding: 12px; font-size: 0.85rem;">No files available yet.</div>';
          zipBtn.style.display = 'none';
          return;
        }
        zipBtn.style.display = 'inline-block';
        fileContainer.innerHTML = files.map(f => \`
          <div class="file-item">
            <div>
              <div class="file-name">\${f.name}</div>
              <div class="file-meta">\${f.size} • \${f.date}</div>
            </div>
            <a href="/download/\${encodeURIComponent(f.name)}" class="btn-dl">Download</a>
          </div>
        \`).join('');
      } catch (err) {
        fileContainer.innerHTML = '<div style="color: #ef4444; font-size: 0.85rem;">Error loading file list.</div>';
      }
    }

    // Handle Upload
    uploadBtn.onclick = () => {
      const formData = new FormData();
      for (const file of selectedFiles) formData.append('files', file);

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
        selectedFiles = [];
        fileList.innerHTML = '';
        uploadBtn.innerText = 'Upload';
        loadFiles(); // Refresh file list automatically!
      };
      xhr.send(formData);
    };

    // Auto-refresh file list every 6 seconds
    loadFiles();
    setInterval(loadFiles, 6000);
  </script>
</body>
</html>`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Two-way server listening on port ${PORT}`);
});
