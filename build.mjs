import { cp, mkdir, rm, writeFile } from "node:fs/promises";

const files = [
  "index.html",
  "styles.css",
  "game.js",
  "Run.mp4",
  "Jump.mp4",
  "Dash.mp4",
  "bird-flying.mp4",
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
await mkdir("dist/client", { recursive: true });
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
for (const file of files) {
  await cp(file, `dist/client/${file}`, { recursive: true });
}
await cp(".openai/hosting.json", "dist/.openai/hosting.json");
await writeFile(
  "dist/server/index.js",
  `export default {
  async fetch(request, env) {
    if (!env?.ASSETS) {
      return new Response("Static assets binding is unavailable.", { status: 500 });
    }

    const url = new URL(request.url);
    if (url.pathname === "/") {
      return env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
    }

    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return response;
    return env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
  },
};
`,
);
