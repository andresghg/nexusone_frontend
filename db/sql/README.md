# SQL del proyecto (`db/sql/`)

El esquema de la base **vive en Supabase** y se cambia con SQL escrito a mano, que se ejecuta en el **SQL Editor**.
No se usa `drizzle-kit push` ni migraciones automáticas. Los archivos de esta carpeta existen para **versionar** el
esquema y para que los tests de integración (PGlite) tengan sobre qué correr.

## Qué se ejecuta en producción y qué no

| Archivo | ¿Se ejecuta en producción? | Qué es |
|---|---|---|
| `001_billing.sql` | **No** | **Reconstrucción** (2026-11-20) del estado de la base antes de las notas de crédito: tablas de facturación, cobros, impuesto por producto, claves, índices, CHECK y triggers. Reemplaza a los antiguos `001`, `002` y `003`, que **ya se aplicaron** en producción pero no estaban en el repositorio. Está hecho a partir de `src/db/schema/billing.ts` y de las definiciones reales extraídas de la base. |
| `004_credit_notes.sql` | Sí (**ya aplicado**) | Notas de crédito: columnas nuevas en `invoices`, triggers de topes e inmutabilidad. Idempotente y en una sola transacción. |

> ⚠ **No ejecutes `001_billing.sql` en producción.** Esa base ya tiene todo lo que contiene y un `CREATE TABLE`
> sobre tablas existentes fallaría o, peor, dejaría el esquema a medias. Sirve únicamente como referencia y para
> los tests.

Se asume que ya existen `organizations`, `products`, `stock_movements` y `auth.users`.

## Cómo se usan los tests con estos archivos

Los tests de integración leen **todos** los `*.sql` de esta carpeta, **ordenados por nombre**, y los aplican sobre una
base PGlite en memoria (con un esqueleto mínimo de las tablas que no están versionadas aquí). Por eso:

- Los archivos nuevos deben llevar un prefijo numérico creciente (`005_…`, `006_…`).
- Si cambia el esquema de `organizations`, `products`, `stock_movements`, `product_categories` o `auth.users`,
  hay que actualizar el esqueleto que arma cada `*.integration.test.ts`.

## Agregar un cambio de esquema

1. Escribe `NNN_descripcion.sql`: **idempotente** (`if not exists`, `create or replace`) y dentro de `begin; … commit;`.
2. Corre las pruebas de integración (`npm i --no-save @electric-sql/pglite && npm test`): fallan si el SQL es inválido.
3. Ejecútalo a mano en el SQL Editor de Supabase.
4. Refleja el cambio en `src/db/schema/` (Drizzle solo describe, no migra) y, si cambia lo que ve la base real,
   comprueba que `001_…` + los siguientes sigan reproduciendo el esquema de producción.
5. Anota aquí el archivo y si ya se aplicó.

## Lo que todavía no está versionado

El resto del esquema (organizaciones, miembros, módulos, invitaciones, perfiles, inventario, políticas **RLS** y los
triggers `add_org_owner` y `handle_new_user`) se creó desde el SQL Editor y **no está en esta carpeta**. Para
versionarlo hay que exportarlo desde Supabase (por ejemplo `pg_dump --schema-only` sobre el esquema `public`); no se
puede reconstruir con certeza solo desde el código.
