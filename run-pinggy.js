const { spawn } = require('child_process');

console.log('Starting stable tunnel via SSH...');

// Uses Windows built-in OpenSSH to expose port 3000
const ssh = spawn('ssh', [
  '-p', '443',
  '-R0:localhost:3000',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ServerAliveInterval=30',
  'a.pinggy.io'
], { stdio: 'inherit' });

ssh.on('exit', (code) => {
  console.log(`Tunnel closed (code ${code}), restarting...`);
  process.exit(code || 0);
});
