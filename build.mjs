import { cp, mkdir, rm, writeFile } from "node:fs/promises";

const files = [
  "index.html",
  "styles.css",
  "game.js",
  "Run.mp4",
  "Jump.mp4",
  "Dash.mp4",
  "monster.mp4",
  "obstacle-plane.png",
  "obstacle-truck.png",
  "obstacle-tower.png",
  "obstacle-car.png",
  "obstacle-bus.png",
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
await mkdir("dist/client", { recursive: true });
for (const file of files) {
  await cp(file, `dist/${file}`, { recursive: true });
  await cp(file, `dist/client/${file}`, { recursive: true });
}
await writeFile("dist/.vercel-ready", "Static Vercel build output.\n");
await writeFile("dist/client/.vercel-ready", "Static Vercel build output.\n");
