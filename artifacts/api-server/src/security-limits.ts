import { rateLimit } from "express-rate-limit";

export const apiLimit = rateLimit({
  windowMs: 15 * 60_000, limit: 100, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "Too many requests. Try again later." },
});

export const mutationLimit = rateLimit({
  windowMs: 60_000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "Too many changes. Wait a minute and try again." },
});

export const authFailureLimit = rateLimit({
  windowMs: 60_000, limit: 10, skipSuccessfulRequests: true,
  standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "Too many invalid pairing attempts. Try again in a minute." },
});