const localtunnel = require('localtunnel');

const SUBDOMAIN = 'selim-drop-box-2026';
const PORT = 3000;

async function startTunnel() {
  try {
    const tunnel = await localtunnel({ port: PORT, subdomain: SUBDOMAIN });
    console.log(`\n=============================================================`);
    console.log(` Tunnel is online at: ${tunnel.url}`);
    console.log(`=============================================================\n`);

    tunnel.on('close', () => {
      console.log('Tunnel closed. Reconnecting in 5 seconds...');
      setTimeout(startTunnel, 5000);
    });

    tunnel.on('error', (err) => {
      console.error('Tunnel error:', err.message);
    });
  } catch (err) {
    console.error('Failed to initialize tunnel:', err.message);
    setTimeout(startTunnel, 5000);
  }
}

startTunnel();
