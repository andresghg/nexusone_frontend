import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { relations } from "./relations";

// Solo servidor. prepare:false es necesario con el pooler en modo transacción (puerto 6543).
const client = postgres(process.env.DATABASE_URL!, { prepare: false });

export const db = drizzle({ client, relations });