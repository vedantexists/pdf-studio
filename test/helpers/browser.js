const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function findBrowser() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.EDGE_BIN,
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'microsoft-edge',
    'msedge',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];

  // Also check Playwright installed browsers
  try {
    const pwDir = process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA || '', 'ms-playwright')
      : path.join(process.env.HOME || '', '.cache', 'ms-playwright');
    if (fs.existsSync(pwDir)) {
      const dirs = fs.readdirSync(pwDir).filter(d => d.startsWith('chromium-'));
      for (const d of dirs) {
        const bin = process.platform === 'win32'
          ? path.join(pwDir, d, 'chrome-win', 'chrome.exe')
          : path.join(pwDir, d, 'chrome-linux', 'chrome');
        if (fs.existsSync(bin)) candidates.push(bin);
      }
    }
  } catch {}

  for (const c of candidates) {
    if (!c) continue;
    if (fs.existsSync(c)) return c;
    try {
      const checkCmd = process.platform === 'win32' ? `where "${c}"` : `which "${c}"`;
      execSync(checkCmd, { stdio: 'ignore' });
      return c;
    } catch {}
  }
  return null;
}

module.exports = { findBrowser };
