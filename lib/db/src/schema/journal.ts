import { createInsertSchema } from "drizzle-zod";
import { jsonb, pgTable, primaryKey, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { movementAccounts } from "./movement";

export const journalRecords = pgTable("journal_records", {
  keyHash: text("key_hash").notNull().references(() => movementAccounts.keyHash),
  entity: text("entity").notNull(),
  id: text("id").notNull(),
  revision: integer("revision").notNull(),
  deleted: boolean("deleted").notNull().default(false),
  data: jsonb("data").$type<Record<string, unknown> | null>(),
  mutationId: text("mutation_id").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.keyHash, table.entity, table.id] })]);

export const insertJournalRecordSchema = createInsertSchema(journalRecords);
export type InsertJournalRecord = z.infer<typeof insertJournalRecordSchema>;
export type JournalRecordRow = typeof journalRecords.$inferSelect;