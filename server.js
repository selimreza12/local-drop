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

// Multer storage: keep original names and handle duplicates
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
  limits: { fileSize: 10 * 1024 * 1024 * 1024 }
});

// Upload endpoint
app.post('/upload', upload.array('files'), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files provided' });
  }
  res.json({ message: 'Upload successful!', count: req.files.length });
});

// Download individual file
app.get('/download/:filename', (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send('File not found');
  }
});

// Download all uploads as a ZIP file to your PC
app.get('/download-all', (req, res) => {
  const archive = archiver('zip', { zlib: { level: 9 } });
  res.attachment('all-uploads.zip');

  archive.pipe(res);
  archive.directory(uploadDir, false);
  archive.finalize();
});

// Receiver Dashboard: View all uploaded files
app.get('/files', (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    const fileListHtml = files && files.length
      ? files.map(f => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #334155;">
            <span style="color:#e2e8f0; word-break:break-all;">${f}</span>
            <a href="/download/${encodeURIComponent(f)}" style="background:#0284c7; color:#fff; text-decoration:none; padding:6px 12px; border-radius:6px; font-size:13px;">Download</a>
          </div>
        `).join('')
      : '<p style="color:#94a3b8; text-align:center; padding:20px;">No files uploaded yet.</p>';

    res.send(`<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Received Files</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background:#0f172a; color:#f8fafc; padding:20px; }
        .card { max-width:600px; margin:auto; background:#1e293b; border-radius:12px; padding:20px; box-shadow:0 10px 25px rgba(0,0,0,0.4); }
        .btn-all { display:block; text-align:center; background:#10b981; color:#fff; padding:12px; border-radius:8px; text-decoration:none; font-weight:600; margin-bottom:16px; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2 style="margin-bottom:16px; text-align:center;">Inbox / Received Files</h2>
        ${files && files.length ? '<a href="/download-all" class="btn-all">📦 Download All as ZIP</a>' : ''}
        ${fileListHtml}
      </div>
    </body>
    </html>`);
  });
});

// Sender UI: Mobile Upload Page
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>Send Files</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px; }
    .card { background: #1e293b; width: 100%; max-width: 480px; border-radius: 16px; padding: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    h1 { font-size: 1.5rem; margin-bottom: 8px; text-align: center; }
    p.subtitle { color: #94a3b8; font-size: 0.875rem; text-align: center; margin-bottom: 24px; }
    .drop-zone { border: 2px dashed #475569; border-radius: 12px; padding: 32px 16px; text-align: center; cursor: pointer; background: #0f172a80; }
    .btn { background: #0284c7; color: #fff; border: none; padding: 12px 24px; font-size: 1rem; font-weight: 600; border-radius: 8px; width: 100%; cursor: pointer; margin-top: 16px; }
    .btn:disabled { background: #475569; cursor: not-allowed; }
    .progress-box { margin-top: 20px; display: none; }
    .progress-bar-bg { background: #334155; height: 10px; border-radius: 5px; overflow: hidden; }
    .progress-bar { width: 0%; height: 100%; background: #38bdf8; }
    .status { margin-top: 16px; padding: 12px; border-radius: 8px; font-size: 0.9rem; display: none; text-align: center; }
    .status.success { background: #064e3b; color: #6ee7b7; }
    .status.error { background: #7f1d1d; color: #fca5a5; }
    .file-list { margin-top: 12px; font-size: 0.85rem; color: #cbd5e1; max-height: 100px; overflow-y: auto; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Send Files</h1>
    <p class="subtitle">Upload photos, videos, or documents directly</p>
    <div class="drop-zone" id="dropZone">
      <div style="font-size:36px; margin-bottom:8px;">📁</div>
      <div>Tap to pick files</div>
      <input type="file" id="fileInput" multiple style="display:none">
    </div>
    <div class="file-list" id="fileList"></div>
    <button class="btn" id="uploadBtn" disabled>Upload Files</button>
    <div class="progress-box" id="progressBox">
      <div class="progress-bar-bg"><div class="progress-bar" id="progressBar"></div></div>
      <div id="progressText" style="margin-top:6px; font-size:0.8rem; text-align:right;">0%</div>
    </div>
    <div class="status" id="statusMessage"></div>
  </div>
  <script>
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const uploadBtn = document.getElementById('uploadBtn');
    const fileList = document.getElementById('fileList');
    const progressBox = document.getElementById('progressBox');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const statusMessage = document.getElementById('statusMessage');
    let selectedFiles = [];

    dropZone.onclick = () => fileInput.click();
    fileInput.onchange = () => {
      selectedFiles = Array.from(fileInput.files);
      if (!selectedFiles.length) return;
      fileList.innerHTML = selectedFiles.map(f => '• ' + f.name).join('<br>');
      uploadBtn.disabled = false;
      uploadBtn.innerText = 'Upload ' + selectedFiles.length + ' file(s)';
      statusMessage.style.display = 'none';
    };

    uploadBtn.onclick = () => {
      const formData = new FormData();
      for (const file of selectedFiles) formData.append('files', file);

      uploadBtn.disabled = true;
      progressBox.style.display = 'block';
      progressBar.style.width = '0%';
      progressText.innerText = '0%';

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
        if (xhr.status === 200) {
          statusMessage.className = 'status success';
          statusMessage.innerText = '✅ Files uploaded successfully!';
          statusMessage.style.display = 'block';
          fileList.innerHTML = '';
          selectedFiles = [];
          uploadBtn.innerText = 'Upload Files';
        } else {
          statusMessage.className = 'status error';
          statusMessage.innerText = 'Upload failed.';
          statusMessage.style.display = 'block';
          uploadBtn.disabled = false;
        }
      };
      xhr.send(formData);
    };
  </script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
