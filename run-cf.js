const { spawn } = require('child_process');
const path = require('path');
const qrcode = require('qrcode');

const cloudflared = path.join(__dirname, 'cloudflared.exe');

const child = spawn(cloudflared, ['tunnel', '--url', 'http://localhost:3000'], {
  stdio: ['ignore', 'pipe', 'pipe']
});

let found = false;

function scan(data) {
  const line = data.toString();
  process.stdout.write(line);

  const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  if (match && !found) {
    found = true;
    const url = match[0];
    console.log('\n=============================================================');
    console.log(' YOUR LIVE URL IS: ' + url);
    console.log('=============================================================\n');

    const qrPath = path.join(__dirname, 'live_qr.png');
    qrcode.toFile(qrPath, url, { width: 2000, margin: 2, errorCorrectionLevel: 'H' }, () => {
      console.log('✅ High-Definition QR Code generated at: ' + qrPath);
    });
  }
}

child.stdout.on('data', scan);
child.stderr.on('data', scan);

child.on('exit', (code) => {
  process.exit(code || 0);
});
