import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const savedPlans = sqliteTable("saved_plans", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  data: text("data").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [index("idx_saved_plans_owner_updated").on(table.ownerId, table.updatedAt)]);
