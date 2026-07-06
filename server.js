import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 5173);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8"
};

function json(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

async function proxyRoute(url, res) {
  const lonlats = url.searchParams.get("lonlats");
  const profile = url.searchParams.get("profile") || "trekking";
  if (!lonlats || !/^[\d.,| -]+$/.test(lonlats)) {
    return json(res, 400, { error: "Ungültige Wegpunkte." });
  }
  if (!["fastbike", "trekking", "gravel", "mtb"].includes(profile)) {
    return json(res, 400, { error: "Unbekanntes Profil." });
  }

  const target = new URL("https://brouter.de/brouter");
  target.searchParams.set("lonlats", lonlats);
  target.searchParams.set("profile", profile);
  target.searchParams.set("alternativeidx", "0");
  target.searchParams.set("format", "geojson");
  target.searchParams.set("timode", "2");
  if (profile === "trekking") {
    target.searchParams.set("profile:avoid_unsafe", "1");
    target.searchParams.set("profile:correctMisplacedViaPoints", "1");
    target.searchParams.set("profile:correctMisplacedViaPointsDistance", "1200");
  }
  if (profile === "fastbike") {
    target.searchParams.set("profile:consider_traffic", "1");
    target.searchParams.set("profile:correctMisplacedViaPoints", "1");
    target.searchParams.set("profile:correctMisplacedViaPointsDistance", "1200");
  }

  const response = await fetch(target, {
    headers: { "user-agent": "Rundwerk/0.1 (local route planner)" },
    signal: AbortSignal.timeout(30000)
  });
  const body = await response.text();
  res.writeHead(response.status, {
    "content-type": response.headers.get("content-type") || "application/json",
    "cache-control": "no-store"
  });
  res.end(body);
}

async function proxySearch(url, res) {
  const query = (url.searchParams.get("q") || "").trim();
  if (query.length < 3) return json(res, 200, []);
  const target = new URL("https://nominatim.openstreetmap.org/search");
  target.searchParams.set("q", query);
  target.searchParams.set("format", "jsonv2");
  target.searchParams.set("limit", "5");
  target.searchParams.set("addressdetails", "1");

  const response = await fetch(target, {
    headers: {
      "user-agent": "Rundwerk/0.1 (local route planner)",
      "accept-language": "de"
    },
    signal: AbortSignal.timeout(10000)
  });
  const data = await response.json();
  json(res, response.status, data);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/route") return await proxyRoute(url, res);
    if (url.pathname === "/api/search") return await proxySearch(url, res);

    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
    const file = join(root, safePath);
    if (!file.startsWith(root)) return json(res, 403, { error: "Forbidden" });
    const content = await readFile(file);
    res.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream" });
    res.end(content);
  } catch (error) {
    if (error.code === "ENOENT") return json(res, 404, { error: "Nicht gefunden." });
    console.error(error);
    json(res, 502, { error: "Der Routingdienst ist gerade nicht erreichbar." });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Rundwerk läuft auf http://127.0.0.1:${port}`);
});
