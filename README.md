# NexusOne — ERP multiempresa

Aplicación web de NexusOne: un ERP donde cada usuario puede gestionar una o varias empresas, cada una con sus
miembros, roles, módulos habilitados y datos aislados. Hoy incluye **facturación (con notas de crédito), clientes,
inventario, reportes con exportación a PDF/Excel y un panel de inicio con datos reales**.

## Stack

- **Next.js 16** (App Router, Server Components, Server Actions) · **React 19** · **TypeScript**
- **Tailwind CSS 3** + **shadcn/ui** (Radix) · `react-hook-form` + **Zod 4**
- **Supabase** (Auth + PostgreSQL) y **Drizzle ORM** (solo para consultar y tipar; no gestiona migraciones)
- `recharts` (gráficos), `exceljs` (exportación a Excel, solo servidor)
- **Vitest** + Testing Library (jsdom) · PGlite para pruebas de integración contra Postgres real

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # y completar los valores (ver abajo)
npm run dev                  # http://localhost:3000
```

### Variables de entorno

| Variable | Dónde se usa | Notas |
|---|---|---|
| `DATABASE_URL` | Solo servidor (Drizzle) | Usar el **pooler** de Supabase (puerto 6543); la conexión directa puede fallar por IPv6 |
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente y servidor | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Cliente y servidor | Clave pública (publishable); nunca la `service_role` |
| `NEXT_PUBLIC_SITE_URL` | Redirecciones de auth | Por defecto `http://localhost:3000` |
| `APP_NAME` | Título de las páginas | |

### Scripts

```bash
npm run dev          # desarrollo
npm run build        # compilación de producción
npm run start        # servir la compilación
npm run lint         # eslint
npm test             # suite completa (vitest run)
npm run test:watch   # vitest en modo observación
```

> **No uses `npm run db:push` ni `db:migrate`.** El esquema de la base vive en Supabase y se cambia con SQL escrito
> a mano (ver [`db/sql/README.md`](db/sql/README.md)). Drizzle solo describe lo que ya existe.

## Base de datos

El esquema se administra directamente en Supabase y los cambios se versionan como SQL en `db/sql/`, que se ejecuta
a mano en el SQL Editor. Léelo antes de tocar la base: ahí se explica qué archivos van a producción y cuáles existen
solo para los tests.

## Arquitectura

Organización **por features (dominio)**. Las rutas en `app/` solo componen features; la lógica vive en `src/`.

```
app/                              Rutas (App Router), sin lógica propia
├── auth/                          login, registro, recuperar contraseña
├── invitacion/[token]/            aceptar una invitación por enlace
├── nueva-empresa/                 crear empresas adicionales
└── dashboard/[slug]/              Todo cuelga de la empresa (slug en la URL)
    ├── layout.tsx                  Sesión, permisos, empresas, avisos → monta el shell
    ├── page.tsx                    Panel de inicio
    ├── pos/{facturacion,clientes,inventario}/
    ├── finanzas/reportes/          (+ exportar/route.ts: descarga .xlsx)
    └── configuracion/{empresa,facturacion,usuarios}/

src/
├── features/<dominio>/            auth · billing · customers · inventory · notifications ·
│   ├── action/                      organization · profile · reports · dashboard
│   ├── components/
│   ├── schemas/                   Zod: lo que entra
│   ├── services/                  *Service (reglas, permisos) y *Repository (Drizzle)
│   ├── types/
│   └── utils/                     Lógica pura y testeable
├── shared/                        UI y utilidades compartidas (shadcn/ui, data-table genérica, navegación)
├── config/navigation.ts           Única fuente de verdad de la navegación (sidebar, navbar, ⌘K, breadcrumbs)
├── db/                            Cliente Drizzle, esquema y relaciones
├── lib/                           router-adapter, table-query (estado de tablas en la URL), supabase, utils
└── types/navigation.ts            Tipos de navegación y la lista de permisos
```

### Capas (respetarlas)

```
Server Action  →  Service  →  Repository
```

- **Action** (`'use server'`): valida con Zod, obtiene el usuario de la sesión, llama al service, refresca rutas
  y devuelve `{ error, success }` sin filtrar detalles internos.
- **Service**: autoriza (`accessService.authorize(userId, organizationId, permiso)`) y aplica las reglas de negocio.
  Vuelve a validar con el mismo schema que la acción.
- **Repository**: único lugar con Drizzle. `organizationId` es **siempre** el primer parámetro y filtra toda consulta.
- Los módulos de servidor importan `server-only`: si algún componente de cliente los importa por error, el build falla.

### Multiempresa y permisos

- La empresa sale del **slug de la URL validado contra la membresía** (`getCurrentAccess(slug)`), nunca del cliente.
- Roles: `owner`, `admin`, `member`. Permisos efectivos = **permisos del rol ∩ módulos activos** de esa empresa
  (`src/features/organization/permissions.ts`).
- El aislamiento entre empresas se refuerza con RLS en Supabase y con claves foráneas compuestas
  `(organization_id, id)`.

### Dinero, stock y fechas

- Todo el cálculo de montos usa **enteros** (BigInt; unidades mínimas de la moneda), con redondeo por línea.
  El precio y el impuesto **siempre se leen de la base**, nunca del navegador.
- Los documentos emitidos son **inmutables** (lo exigen triggers en la base); se corrigen con notas de crédito.
- Fechas y números se formatean con la **zona horaria, idioma y moneda de la empresa**, no los del servidor.
- Son documentos **internos**, no tributarios electrónicos (sin integración con el SII).

### Avisos (campana de notificaciones)

Los avisos **no se guardan**: se derivan del estado actual (facturas vencidas, facturas que vencen en los próximos
3 días y productos con stock bajo), así que desaparecen solos al resolver el problema. Se calculan en el layout del
dashboard; las acciones que cambian cobros o stock llaman a `revalidateShell()` (`src/lib/revalidate-shell.ts`)
para refrescarlos sin recargar.

## Pruebas

```bash
npm test                                   # unitarias, de componentes y (si hay PGlite) de integración
npm i --no-save @electric-sql/pglite       # activa las pruebas de integración contra Postgres real
```

- Los tests viven junto al código en `src/**/*.test.{ts,tsx}` (un test dentro de `app/` **no** corre).
- Las pruebas de integración (`*.integration.test.ts`) aplican `db/sql/*.sql` sobre PGlite y se **saltan solas** si
  PGlite no está instalado. PGlite usa una sola conexión: **no prueba carreras ni `FOR UPDATE`**; eso se comprueba
  a mano con dos sesiones de Supabase.
- Para lógica de dinero, stock o fechas conviene además probar con varias zonas horarias y romper el código a
  propósito para confirmar que los tests fallan.

## Estilo

- `src/features/**`: sin punto y coma y comillas simples. `src/db/schema/**`: con punto y coma y comillas dobles.
- Textos de usuario y comentarios en español.
- Accesibilidad: etiqueta antes del valor, `role="alert"`/`role="status"`, nada que dependa solo del color.

## Cómo agregar un módulo nuevo

1. Crear `src/features/<dominio>/` con `action/`, `services/` (service + repository), `schemas/`, `components/`.
2. Si hay tablas nuevas: escribir el SQL en `db/sql/` (con RLS) y describirlas en `src/db/schema/`.
3. Declarar los permisos en `src/types/navigation.ts` y asignarlos a los roles en
   `src/features/organization/permissions.ts`.
4. Agregar la entrada en `src/config/navigation.ts` (sidebar, navbar, breadcrumbs y ⌘K se derivan de ahí).
5. Crear la ruta en `app/dashboard/[slug]/<modulo>/page.tsx`, que solo compone la feature.
6. Escribir los tests junto al código (y de integración si toca dinero, stock o fechas).
