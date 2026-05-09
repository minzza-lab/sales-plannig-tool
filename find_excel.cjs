const fs = require('fs');
const path = require('path');
const os = require('os');

const dirs = [
  path.join(os.homedir(), 'Desktop'),
  path.join(os.homedir(), 'Downloads'),
  path.join(os.homedir(), 'Documents')
];

let found = [];

function searchDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file.endsWith('.xlsx')) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      found.push({ name: file, path: fullPath, time: stat.mtimeMs });
    }
  }
}

dirs.forEach(searchDir);

found.sort((a, b) => b.time - a.time);
console.log('Recent Excel Files:');
found.slice(0, 10).forEach(f => console.log(f.path));
