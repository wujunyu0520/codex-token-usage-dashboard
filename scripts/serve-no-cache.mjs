import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT || 5173);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function filePathFor(url) {
  const requestPath = decodeURIComponent(new URL(url, `http://127.0.0.1:${port}`).pathname);
  const safePath = normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const candidate = resolve(join(root, safePath === "/" ? "codex-dashboard.html" : safePath));

  if (!candidate.startsWith(root)) return null;
  return candidate;
}

const server = createServer((request, response) => {
  const filePath = filePathFor(request.url || "/");

  if (!filePath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) throw new Error("Not a file");

    response.writeHead(200, {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Content-Length": stats.size,
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Expires": "0",
      "Pragma": "no-cache",
      "Surrogate-Control": "no-store",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Serving no-cache dashboard at http://127.0.0.1:${port}/codex-dashboard.html`);
});
