const fs = require("node:fs");
const path = require("node:path");
const { zipSync } = require("fflate");
const root = path.resolve(__dirname, "..");
const output = path.resolve(root, "../task-3-github-ready");
const name = "task-3-project-management";
const entries = {};
const allowed = [
  "package.json",
  "package-lock.json",
  "README.md",
  ".gitignore",
  ".dockerignore",
  "Dockerfile",
  "server.js",
  "public",
  "tests",
  "scripts",
];
function copy(relative) {
  const source = path.join(root, relative);
  if (fs.statSync(source).isDirectory()) {
    for (const item of fs.readdirSync(source)) copy(path.join(relative, item));
    return;
  }
  const bytes = fs.readFileSync(source);
  const destination = path.join(output, name, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  entries[`${name}/${relative.replaceAll("\\", "/")}`] = new Uint8Array(bytes);
}
allowed.forEach(copy);
fs.writeFileSync(
  path.join(output, name + "-source.zip"),
  zipSync(entries, { level: 6 }),
);
console.log(
  `Prepared ${Object.keys(entries).length} source files in ${output}`,
);
