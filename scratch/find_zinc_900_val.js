const fs = require("fs");
const path = require("path");

const rootDir = "c:\\Users\\Engineer\\Documents\\devflow-ai";

function findCssFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (file !== "node_modules" && file !== ".git") {
        results = results.concat(findCssFiles(fullPath));
      }
    } else if (file.endsWith(".css")) {
      results.push(fullPath);
    }
  });
  return results;
}

const cssFiles = findCssFiles(rootDir);

cssFiles.forEach(file => {
  const content = fs.readFileSync(file, "utf8");
  
  let index = -1;
  const matches = [];
  while ((index = content.indexOf("--color-zinc-900", index + 1)) !== -1) {
    const start = Math.max(0, index - 50);
    const end = Math.min(content.length, index + 150);
    matches.push(content.substring(start, end));
  }
  
  if (matches.length > 0) {
    console.log(`\n=== File: ${file} ===`);
    console.log(`Found ${matches.length} occurrences of '--color-zinc-900':`);
    matches.forEach((m, idx) => {
      console.log(`Match ${idx + 1}:\n${m}\n---`);
    });
  }
});
