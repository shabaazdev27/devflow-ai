const fs = require("fs");
const path = require("path");

// Find CSS file in .next directory or chunks
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
console.log("Found CSS files:", cssFiles);

cssFiles.forEach(file => {
  const content = fs.readFileSync(file, "utf8");
  console.log(`\n=== File: ${file} ===`);
  
  // Find rule for dark:text-white
  // In Tailwind v4, this might be written as .dark\:text-white, or inside a media/selector block
  const lines = content.split("\n");
  
  // Let's search for "dark\:text-white"
  const matches = [];
  let index = -1;
  while ((index = content.indexOf("text-white", index + 1)) !== -1) {
    // print some context around the match
    const start = Math.max(0, index - 100);
    const end = Math.min(content.length, index + 200);
    matches.push(content.substring(start, end));
  }
  
  console.log(`Found ${matches.length} occurrences of 'text-white':`);
  matches.slice(0, 5).forEach((m, idx) => {
    console.log(`Match ${idx + 1}:\n${m}\n---`);
  });
});
