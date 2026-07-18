import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { attachGameServer } from "./gameServer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const app = express();
const httpServer = createServer(app);
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";

app.get("/healthz", (_request, response) => {
  response.status(200).json({ ok: true });
});

attachGameServer(httpServer);

if (isProduction) {
  const dist = path.join(root, "dist");
  app.use(express.static(dist));
  app.get("*", (_request, response) => {
    response.sendFile(path.join(dist, "index.html"));
  });
} else {
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
}

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Gulag Duel server listening on http://localhost:${port}`);
});
