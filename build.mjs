import { cp, mkdir, rm, writeFile } from "node:fs/promises";

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
  "ground.png",
  "girl.png",
  "boy.png",
  "obstacle-source.png",
  "dash-frame.png",
  "favicon.ico",
];

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
for (const file of files) {
  await cp(file, `dist/${file}`, { recursive: true });
}
await writeFile("dist/.vercel-ready", "Static Vercel build output.\n");
