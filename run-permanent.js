const { spawn } = require('child_process');
const qrcode = require('qrcode');
const path = require('path');

// Pick your unique permanent name here
const SUBDOMAIN = 'selim-drop-pc';
const PORT = 3000;
const FIXED_URL = `https://${SUBDOMAIN}.serveo.net`;

console.log(`Setting up permanent link: ${FIXED_URL}`);

// Generate the printable Ultra-HD QR code once for this permanent URL
const qrPath = path.join(__dirname, 'permanent_qr.png');
qrcode.toFile(qrPath, FIXED_URL, { width: 2000, margin: 2, errorCorrectionLevel: 'H' }, (err) => {
  if (!err) console.log(`✅ Permanent QR Code saved to: ${qrPath}`);
});

function connect() {
  const ssh = spawn('ssh', [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ServerAliveInterval=30',
    '-o', 'BatchMode=yes',
    '-R', `${SUBDOMAIN}:80:localhost:${PORT}`,
    'serveo.net'
  ], { stdio: 'inherit' });

  ssh.on('close', (code) => {
    console.log(`Tunnel closed (${code}), reconnecting in 5s...`);
    setTimeout(connect, 5000);
  });
}

connect();
