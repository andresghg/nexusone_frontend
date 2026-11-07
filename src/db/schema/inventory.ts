import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import { organizations } from "./organization";

export const productCategories = pgTable(
  "product_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    unique().on(t.organizationId, t.name),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id"),
    sku: text("sku").notNull(),
    barcode: text("barcode"),
    name: text("name").notNull(),
    description: text("description"),
    unit: text("unit").notNull().default("un"),
    price: numeric("price", { precision: 14, scale: 2 }).notNull().default("0"),
    cost: numeric("cost", { precision: 14, scale: 2 }).notNull().default("0"),
    minStock: numeric("min_stock", { precision: 14, scale: 3 }).notNull().default("0"),
    trackStock: boolean("track_stock").notNull().default(true),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.organizationId, t.id),
    unique().on(t.organizationId, t.sku),
    uniqueIndex("products_org_barcode_key")
      .on(t.organizationId, t.barcode)
      .where(sql`${t.barcode} is not null`),
    index("products_org_name_idx").on(t.organizationId, t.name),
    foreignKey({
      columns: [t.organizationId, t.categoryId],
      foreignColumns: [productCategories.organizationId, productCategories.id],
    }),
  ],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull(),
    type: text("type").notNull(),
    delta: numeric("delta", { precision: 14, scale: 3 }).notNull(),
    reason: text("reason"),
    createdBy: uuid("created_by").references(() => authUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("stock_movements_product_idx").on(t.organizationId, t.productId, t.createdAt),
    foreignKey({
      columns: [t.organizationId, t.productId],
      foreignColumns: [products.organizationId, products.id],
    }),
  ],
);