const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dest = path.join(root, "public", "vendor");
fs.mkdirSync(dest, { recursive: true });
for (const [source, name] of [
  ["lucide/dist/umd/lucide.js", "lucide.js"],
  ["sortablejs/Sortable.min.js", "sortable.js"],
  ["three/build/three.module.js", "three.module.js"],
  ["three/build/three.core.js", "three.core.js"],
])
  fs.copyFileSync(
    path.join(root, "node_modules", source),
    path.join(dest, name),
  );
console.log("Browser assets ready.");
