import { cp, mkdir, rm } from "node:fs/promises";

const files = [
  "index.html",
  "styles.css",
  "game.js",
  "Run.mp4",
  "Jump.mp4",
  "Dash.mp4",
  "1.png",
  "2.png",
  "3.png",
  "4.png",
  "ግራውንድ.png",
  "ሴት.png",
  "ወንድ.png",
  "መሰናክል.png",
];

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
for (const file of files) {
  await cp(file, `dist/${file}`, { recursive: true });
}
