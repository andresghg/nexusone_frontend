import { sql } from "drizzle-orm";
import { db } from "../src/db";

try {
  await db.execute(sql`select 1 as ok`);
  console.log("Drizzle: conexión OK");

  const orgs = await db.query.organizations.findMany({
    limit: 1,
    with: { modules: true, members: true },
  });
  console.log("organizations (máx. 1):", JSON.stringify(orgs, null, 2));

  const perfiles = await db.query.profiles.findMany({ limit: 1 });
  console.log("profiles (máx. 1):", perfiles.length ? "hay filas" : "sin filas");
} catch (e) {
  console.error("FALLÓ:", e instanceof Error ? (e.cause ?? e) : e);
  process.exitCode = 1;
} finally {
  process.exit(process.exitCode ?? 0);
}