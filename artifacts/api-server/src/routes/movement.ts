import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, movementAccounts, movementNative, movementManual } from "@workspace/db";
import {
  GetMovementResponse, PutMovementNativeBody, PutMovementNativeResponse,
  AddMovementManualBody, AddMovementManualResponse, ResetMovementManualParams,
  ResetMovementManualResponse, PutMovementSettingsBody, PutMovementSettingsResponse,
  CreateMovementAccountResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const hash = (key: string) => createHash("sha256").update(key).digest("hex");
const empty = () => Array(24).fill(0) as number[];
const validDay = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T12:00:00Z`));

async function load(keyHash: string) {
  const [account] = await db.select().from(movementAccounts).where(eq(movementAccounts.keyHash, keyHash));
  if (!account) return null;
  const [native, manual] = await Promise.all([
    db.select().from(movementNative).where(eq(movementNative.keyHash, keyHash)),
    db.select().from(movementManual).where(eq(movementManual.keyHash, keyHash)),
  ]);
  const days = new Map<string, { date: string; nativeHours: number[] | null; manualHours: number[] }>();
  for (const row of native) days.set(row.date, { date: row.date, nativeHours: row.hours, manualHours: empty() });
  for (const row of manual) {
    if (!days.has(row.date)) days.set(row.date, { date: row.date, nativeHours: null, manualHours: empty() });
    days.get(row.date)!.manualHours[row.hour] += row.amount;
  }
  return { days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)), goal: account.goal, strideCm: account.strideCm, weightKg: account.weightKg };
}

async function authorized(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = /^Bearer ([a-f0-9]{64})$/.exec(req.get("authorization") ?? "")?.[1];
  if (!token) { res.status(401).json({ error: "Enter your pairing key." }); return; }
  const keyHash = hash(token);
  const [account] = await db.select({ keyHash: movementAccounts.keyHash }).from(movementAccounts).where(eq(movementAccounts.keyHash, keyHash));
  if (!account) { res.status(401).json({ error: "Pairing key not found." }); return; }
  res.locals.keyHash = keyHash;
  next();
}

router.post("/movement/accounts", async (_req, res): Promise<void> => {
  const key = randomBytes(32).toString("hex");
  await db.insert(movementAccounts).values({ keyHash: hash(key) });
  res.status(201).json(CreateMovementAccountResponse.parse({ key }));
});
router.use("/movement", authorized);
router.get("/movement", async (_req, res): Promise<void> => {
  res.json(GetMovementResponse.parse(await load(res.locals.keyHash)));
});
router.put("/movement/native", async (req, res): Promise<void> => {
  const parsed = PutMovementNativeBody.safeParse(req.body);
  if (!parsed.success || !validDay(parsed.data?.date ?? "") || !parsed.data?.hours.every(Number.isSafeInteger)) {
    res.status(400).json({ error: "Invalid hourly steps." }); return;
  }
  const { date, hours } = parsed.data;
  await db.insert(movementNative).values({ keyHash: res.locals.keyHash, date, hours })
    .onConflictDoUpdate({ target: [movementNative.keyHash, movementNative.date], set: { hours } });
  res.json(PutMovementNativeResponse.parse(await load(res.locals.keyHash)));
});
router.post("/movement/manual", async (req, res): Promise<void> => {
  const parsed = AddMovementManualBody.safeParse(req.body);
  if (!parsed.success || !validDay(parsed.data?.date ?? "") || !Number.isSafeInteger(parsed.data?.amount)) {
    res.status(400).json({ error: "Invalid manual steps." }); return;
  }
  await db.insert(movementManual).values({ keyHash: res.locals.keyHash, ...parsed.data }).onConflictDoNothing();
  res.json(AddMovementManualResponse.parse(await load(res.locals.keyHash)));
});
router.delete("/movement/manual/:date", async (req, res): Promise<void> => {
  const parsed = ResetMovementManualParams.safeParse(req.params);
  if (!parsed.success || !validDay(parsed.data.date)) { res.status(400).json({ error: "Invalid date." }); return; }
  await db.delete(movementManual).where(and(eq(movementManual.keyHash, res.locals.keyHash), eq(movementManual.date, parsed.data.date)));
  res.json(ResetMovementManualResponse.parse(await load(res.locals.keyHash)));
});
router.put("/movement/settings", async (req, res): Promise<void> => {
  const parsed = PutMovementSettingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid settings." }); return; }
  await db.update(movementAccounts).set(parsed.data).where(eq(movementAccounts.keyHash, res.locals.keyHash));
  res.json(PutMovementSettingsResponse.parse(await load(res.locals.keyHash)));
});

export default router;