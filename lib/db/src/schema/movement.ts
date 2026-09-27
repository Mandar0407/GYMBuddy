import { pgTable, text, integer, real, jsonb, primaryKey } from "drizzle-orm/pg-core";

export const movementAccounts = pgTable("movement_accounts", {
  keyHash: text("key_hash").primaryKey(),
  goal: integer("goal").notNull().default(10000),
  strideCm: real("stride_cm").notNull().default(74),
  weightKg: real("weight_kg").notNull().default(68),
});

export const movementNative = pgTable("movement_native", {
  keyHash: text("key_hash").notNull().references(() => movementAccounts.keyHash),
  date: text("date").notNull(),
  hours: jsonb("hours").$type<number[]>().notNull(),
}, (table) => [primaryKey({ columns: [table.keyHash, table.date] })]);

export const movementManual = pgTable("movement_manual", {
  keyHash: text("key_hash").notNull().references(() => movementAccounts.keyHash),
  id: text("id").notNull(),
  date: text("date").notNull(),
  hour: integer("hour").notNull(),
  amount: integer("amount").notNull(),
}, (table) => [primaryKey({ columns: [table.keyHash, table.id] })]);