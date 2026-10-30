const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const token = process.env.PEP_CLUSTER_TOKEN;
if (!token) {
  console.error("Missing PEP_CLUSTER_TOKEN. Start with scripts/start-dashboard.sh.");
  process.exit(1);
}
const host = process.env.PEP_CLUSTER_HOST || "127.0.0.1";
const port = Number(process.env.PORT || 8787);
const workers = new Map();
const htmlPath = path.join(__dirname, "public", "index.html");

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, {"content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff"});
  res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}
function authorized(req) {
  const supplied = req.headers["x-cluster-token"];
  return typeof supplied === "string" && supplied.length === token.length &&
    crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(token));
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 16384) reject(new Error("Payload too large"));
    });
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "GET" && url.pathname === "/health") {
    return send(res, 200, {ok:true, service:"pep-miner-cluster-monitor", miningEngine:"not-implemented"});
  }
  if (req.method === "GET" && url.pathname === "/") {
    try { return send(res, 200, fs.readFileSync(htmlPath, "utf8"), "text/html; charset=utf-8"); }
    catch { return send(res, 500, {error:"Dashboard file unavailable"}); }
  }
  if (!authorized(req)) return send(res, 401, {error:"Unauthorized: provide X-Cluster-Token"});
  if (req.method === "GET" && url.pathname === "/api/workers") {
    return send(res, 200, {workers:[...workers.values()], count:workers.size});
  }
  if (req.method === "POST" && url.pathname === "/api/workers") {
    try {
      const body = await readJson(req);
      if (typeof body.workerId !== "string" || !/^[a-zA-Z0-9_-]{1,40}$/.test(body.workerId))
        return send(res, 400, {error:"Invalid workerId"});
      for (const field of ["hashrateH","accepted","rejected"]) {
        if (body[field] !== undefined && (!Number.isFinite(body[field]) || body[field] < 0))
          return send(res, 400, {error:field+" must be a non-negative number"});
      }
      const worker = {
        workerId:body.workerId,
        device:typeof body.device === "string" ? body.device.slice(0,80) : "Android",
        status:typeof body.status === "string" ? body.status.slice(0,24) : "reporting",
        hashrateH:Number(body.hashrateH || 0),
        accepted:Number(body.accepted || 0),
        rejected:Number(body.rejected || 0),
        updatedAt:new Date().toISOString()
      };
      workers.set(worker.workerId, worker);
      return send(res, 202, {ok:true, worker});
    } catch (error) { return send(res, 400, {error:error.message || "Invalid request"}); }
  }
  return send(res, 404, {error:"Not found"});
});
server.listen(port, host, () => console.log("PEP Miner Cluster monitor listening on http://"+host+":"+port));
