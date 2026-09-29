import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { authFailureLimit, mutationLimit } from "../security-limits";
import { db, journalRecords, movementAccounts } from "@workspace/db";
import {
  ApplyJournalChangesBody,
  ApplyJournalChangesResponse,
  GetJournalResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const hash = (key: string) => createHash("sha256").update(key).digest("hex");

async function authorized(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = /^Bearer ([a-f0-9]{64})$/.exec(req.get("authorization") ?? "")?.[1];
  if (!token) { res.status(401).json({ error: "Enter your pairing key." }); return; }
  const keyHash = hash(token);
  const [account] = await db.select({ keyHash: movementAccounts.keyHash })
    .from(movementAccounts).where(eq(movementAccounts.keyHash, keyHash));
  if (!account) { res.status(401).json({ error: "Pairing key not found." }); return; }
  res.locals.keyHash = keyHash;
  next();
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function recordShape(row: typeof journalRecords.$inferSelect) {
  return {
    entity: row.entity,
    id: row.id,
    revision: row.revision,
    deleted: row.deleted,
    data: row.data,
    updatedAt: row.updatedAt,
  };
}

router.use("/journal", authFailureLimit, authorized);

router.get("/journal", async (_req, res): Promise<void> => {
  const rows = await db.select().from(journalRecords)
    .where(eq(journalRecords.keyHash, res.locals.keyHash))
    .orderBy(journalRecords.entity, journalRecords.id);
  res.json(GetJournalResponse.parse({ records: rows.map(recordShape) }));
});

router.post("/journal/changes", mutationLimit, async (req, res): Promise<void> => {
  const parsed = ApplyJournalChangesBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const seen = new Set<string>();
  for (const change of parsed.data.changes) {
    if (change.deleted !== (change.data === null)) {
      res.status(400).json({ error: "Deleted records must have null data; active records must have object data." });
      return;
    }
    const recordKey = `${change.entity}\u0000${change.id}`;
    if (seen.has(recordKey)) {
      res.status(400).json({ error: "A batch may contain each entity/id record only once." });
      return;
    }
    seen.add(recordKey);
  }

  const keyHash: string = res.locals.keyHash;
  const records: ReturnType<typeof recordShape>[] = [];
  const conflicts: { entity: string; id: string; current: ReturnType<typeof recordShape> | null }[] = [];

  for (const change of parsed.data.changes) {
    const identity = and(
      eq(journalRecords.keyHash, keyHash),
      eq(journalRecords.entity, change.entity),
      eq(journalRecords.id, change.id),
    );
    const [current] = await db.select().from(journalRecords).where(identity);

    // A persisted mutation ID makes a retry after a lost response idempotent.
    if (current?.mutationId === change.mutationId &&
      current.revision === change.baseRevision + 1 &&
      current.deleted === change.deleted &&
      canonical(current.data) === canonical(change.data)) {
      records.push(recordShape(current));
      continue;
    }

    let accepted: typeof journalRecords.$inferSelect | undefined;
    if (!current && change.baseRevision === 0) {
      [accepted] = await db.insert(journalRecords).values({
        keyHash,
        entity: change.entity,
        id: change.id,
        revision: 1,
        deleted: change.deleted,
        data: change.data,
        mutationId: change.mutationId,
      }).onConflictDoNothing().returning();
    } else if (current && current.revision === change.baseRevision) {
      [accepted] = await db.update(journalRecords).set({
        revision: change.baseRevision + 1,
        deleted: change.deleted,
        data: change.data,
        mutationId: change.mutationId,
        updatedAt: new Date(),
      }).where(and(identity, eq(journalRecords.revision, change.baseRevision))).returning();
    }

    if (accepted) {
      records.push(recordShape(accepted));
      continue;
    }

    const [latest] = await db.select().from(journalRecords).where(identity);
    conflicts.push({
      entity: change.entity,
      id: change.id,
      current: latest ? recordShape(latest) : null,
    });
  }

  res.json(ApplyJournalChangesResponse.parse({ records, conflicts }));
});

export default router;