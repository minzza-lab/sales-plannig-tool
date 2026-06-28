const fs = require('fs');
const path = require('path');

const dirPath = '/Users/minzza/sales-plannig-tool/src/components';
const files = fs.readdirSync(dirPath);

files.forEach(file => {
  if (!file.endsWith('.tsx')) return;
  const filePath = path.join(dirPath, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Replace gemini-3.5-flash with gemini-2.0-flash
  if (content.includes('gemini-3.5-flash')) {
    content = content.replace(/['"]gemini-3.5-flash['"]/g, "'gemini-2.0-flash'");
    changed = true;
  }

  // Replace custom fallback list ["gemini-3.5-flash", "gemini-2.5-pro", "gemini-2.5-flash"] with default or correct list
  if (content.includes('["gemini-3.5-flash", "gemini-2.5-pro", "gemini-2.5-flash"]') || 
      content.includes('["gemini-3.5-flash", "gemini-2.5-pro", "gemini-2.5-flash"]')) {
    content = content.replace(/\[\s*['"]gemini-3.5-flash['"]\s*,\s*['"]gemini-2.5-pro['"]\s*,\s*['"]gemini-2.5-flash['"]\s*\]/g, "['gemini-2.0-flash', 'gemini-1.5-flash']");
    changed = true;
  }

  // Double check any loose gemini-2.5 or 3.5 strings
  if (content.includes('gemini-2.5-pro')) {
    content = content.replace(/['"]gemini-2.5-pro['"]/g, "'gemini-1.5-pro'");
    changed = true;
  }
  if (content.includes('gemini-2.5-flash')) {
    content = content.replace(/['"]gemini-2.5-flash['"]/g, "'gemini-1.5-flash'");
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ 수정됨: ${file}`);
  }
});
