import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import { organizations } from "./organization";
import { products } from "./inventory";

// Espejo de db/sql/001_billing.sql. Los CHECK y los triggers (documentos emitidos
// inmutables) viven solo en el SQL: aquí van columnas, claves e índices.

export const billingSettings = pgTable("billing_settings", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  currency: text("currency").notNull().default("CLP"),
  currencyDecimals: smallint("currency_decimals").notNull().default(0),
  locale: text("locale").notNull().default("es-CL"),
  timezone: text("timezone").notNull().default("America/Santiago"),
  taxName: text("tax_name").notNull().default("IVA"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("19"),
  pricesIncludeTax: boolean("prices_include_tax").notNull().default(true),
  allowNegativeStock: boolean("allow_negative_stock").notNull().default(false),
  defaultDueDays: integer("default_due_days").notNull().default(0),
  documentPrefixes: jsonb("document_prefixes")
    .$type<Record<string, string>>()
    .notNull()
    .default(sql`'{"invoice":"F","receipt":"R","sales_note":"NV"}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    taxId: text("tax_id"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("customers_organization_id_id_key").on(t.organizationId, t.id),
    uniqueIndex("customers_org_tax_id_key")
      .on(t.organizationId, t.taxId)
      .where(sql`${t.taxId} is not null`),
    index("customers_org_name_idx").on(t.organizationId, t.name),
  ],
);

export const invoiceCounters = pgTable(
  "invoice_counters",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentType: text("document_type").notNull(),
    lastNumber: integer("last_number").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.documentType] })],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentType: text("document_type").notNull().default("invoice"),
    number: integer("number"),
    status: text("status").notNull().default("draft"),
    paymentStatus: text("payment_status").notNull().default("unpaid"),
    paidAt: timestamp("paid_at", { withTimezone: true }),

    customerId: uuid("customer_id"),
    customerName: text("customer_name"),
    customerTaxId: text("customer_tax_id"),
    customerEmail: text("customer_email"),
    customerAddress: text("customer_address"),

    issuerLegalName: text("issuer_legal_name"),
    issuerTaxId: text("issuer_tax_id"),
    issuerAddress: text("issuer_address"),

    currency: text("currency").notNull(),
    currencyDecimals: smallint("currency_decimals").notNull(),
    taxName: text("tax_name").notNull(),
    pricesIncludeTax: boolean("prices_include_tax").notNull(),

    issuedAt: timestamp("issued_at", { withTimezone: true }),
    dueDate: date("due_date", { mode: "string" }),

    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
    discountTotal: numeric("discount_total", { precision: 14, scale: 2 }).notNull().default("0"),
    taxTotal: numeric("tax_total", { precision: 14, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
    paidTotal: numeric("paid_total", { precision: 14, scale: 2 }).notNull().default("0"),

    notes: text("notes"),
    idempotencyKey: uuid("idempotency_key"),

    createdBy: uuid("created_by").references(() => authUsers.id, { onDelete: "set null" }),
    issuedBy: uuid("issued_by").references(() => authUsers.id, { onDelete: "set null" }),
    voidedBy: uuid("voided_by").references(() => authUsers.id, { onDelete: "set null" }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("invoices_organization_id_id_key").on(t.organizationId, t.id),
    foreignKey({
      name: "invoices_customer_fkey",
      columns: [t.organizationId, t.customerId],
      foreignColumns: [customers.organizationId, customers.id],
    }),
    uniqueIndex("invoices_org_type_number_key")
      .on(t.organizationId, t.documentType, t.number)
      .where(sql`${t.number} is not null`),
    uniqueIndex("invoices_org_idempotency_key")
      .on(t.organizationId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
    index("invoices_org_created_idx").on(t.organizationId, t.createdAt.desc()),
    index("invoices_org_status_idx").on(t.organizationId, t.status),
    index("invoices_org_customer_idx").on(t.organizationId, t.customerId),
  ],
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id").notNull(),
    position: smallint("position").notNull(),
    productId: uuid("product_id"),
    sku: text("sku"),
    description: text("description").notNull(),
    unit: text("unit").notNull().default("un"),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
    discountType: text("discount_type").notNull().default("percent"),
    discountValue: numeric("discount_value", { precision: 14, scale: 2 }).notNull().default("0"),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    tracksStock: boolean("tracks_stock").notNull().default(false),
    lineGross: numeric("line_gross", { precision: 14, scale: 2 }).notNull(),
    lineDiscount: numeric("line_discount", { precision: 14, scale: 2 }).notNull(),
    lineNet: numeric("line_net", { precision: 14, scale: 2 }).notNull(),
    lineTax: numeric("line_tax", { precision: 14, scale: 2 }).notNull(),
    lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    foreignKey({
      name: "invoice_items_invoice_fkey",
      columns: [t.organizationId, t.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "invoice_items_product_fkey",
      columns: [t.organizationId, t.productId],
      foreignColumns: [products.organizationId, products.id],
    }),
    unique("invoice_items_position_key").on(t.organizationId, t.invoiceId, t.position),
    index("invoice_items_product_idx")
      .on(t.organizationId, t.productId)
      .where(sql`${t.productId} is not null`),
  ],
);

export const invoicePayments = pgTable(
  "invoice_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    method: text("method").notNull(),
    reference: text("reference"),
    paidAt: timestamp("paid_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid("created_by").references(() => authUsers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => authUsers.id, { onDelete: "set null" }),
    voidReason: text("void_reason"),
  },
  (t) => [
    foreignKey({
      name: "invoice_payments_invoice_fkey",
      columns: [t.organizationId, t.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.id],
    }).onDelete("cascade"),
    index("invoice_payments_invoice_idx").on(t.organizationId, t.invoiceId),
  ],
);
