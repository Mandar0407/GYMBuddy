import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { apiLimit } from "./security-limits";

const app: Express = express();
// One trusted reverse proxy sits in front of the API. Do not trust arbitrary X-Forwarded-For chains.
app.set("trust proxy", 1);

const configuredOrigins = new Set([
  ...(process.env.CORS_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()),
  ...(process.env.REPLIT_DOMAINS ?? "").split(",").map((domain) => domain.trim()).filter(Boolean).map((domain) => `https://${domain}`),
  ...(process.env.REPLIT_EXPO_DEV_DOMAIN ? [`https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`] : []),
].filter(Boolean));

function isAllowedOrigin(origin: string, host: string | undefined): boolean {
  try {
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) return false;
    if (configuredOrigins.has(origin)) return true;
    // Browsers using the shared path proxy are first-party, not cross-origin.
    if (host && url.host === host && (url.protocol === "https:" || process.env.NODE_ENV !== "production")) return true;
    return process.env.NODE_ENV !== "production" &&
      ["http://localhost", "http://127.0.0.1"].includes(origin);
  } catch { return false; }
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"], frameAncestors: ["'none'"],
  } },
  frameguard: { action: "deny" },
  hsts: process.env.NODE_ENV === "production" ? { maxAge: 31_536_000, includeSubDomains: false } : false,
}));
app.use("/api", apiLimit);
app.use("/api", (req, res, next) => {
  const origin = req.get("origin");
  if (origin && !isAllowedOrigin(origin, req.get("host"))) {
    res.status(403).json({ error: "Origin is not allowed." });
    return;
  }
  next();
});
app.use("/api", cors({
  origin(origin, callback) { callback(null, origin || false); },
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Authorization", "Content-Type"],
}));
app.use(express.json({ limit: "32kb" }));

app.use("/api", router);

export default app;
