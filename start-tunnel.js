const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const qrcode = require('qrcode');

const cloudflared = path.join(__dirname, 'cloudflared.exe');

console.log('Starting Cloudflare Tunnel to port 3000...');

const child = spawn(cloudflared, ['tunnel', '--url', 'http://localhost:3000'], {
  shell: false,
  stdio: ['ignore', 'pipe', 'pipe']
});

let urlFound = false;

function handleOutput(data) {
  const text = data.toString();
  process.stdout.write(text);

  // Look for the generated *.trycloudflare.com URL
  const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  if (match && !urlFound) {
    urlFound = true;
    const url = match[0];

    console.log('\n=============================================================');
    console.log(' YOUR PUBLIC INTERNET DROP LINK IS READY:');
    console.log(' ' + url);
    console.log('=============================================================\n');

    // Save permanent HD QR code
    const qrPath = path.join(__dirname, 'permanent_qr.png');
    qrcode.toFile(qrPath, url, { width: 2000, margin: 2, errorCorrectionLevel: 'H' }, (err) => {
      if (!err) {
        console.log('✅ Ultra-HD QR code saved to: ' + qrPath);
        console.log('Opening printable QR code image now...\n');
        spawn('cmd.exe', ['/c', 'start', qrPath], { detached: true, stdio: 'ignore' });
      }
    });
  }
}

child.stdout.on('data', handleOutput);
child.stderr.on('data', handleOutput);

child.on('exit', (code) => {
  console.log(`Tunnel process exited with code ${code}`);
  process.exit(code || 0);
});
