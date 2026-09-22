# NexusOne — ERP Dashboard

Dashboard de NexusOne construido con **Next.js (App Router)**, TypeScript, Tailwind CSS y componentes shadcn/ui sobre Radix.

## Stack

- Next.js 16 (App Router, React Server Components)
- React 19 + TypeScript
- Tailwind CSS + shadcn/ui (estilo "new-york")
- react-hook-form + zod para formularios

## Scripts

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
npm run start
npm run lint
```

## Arquitectura

El proyecto sigue una **arquitectura por features (dominio)**:

```
app/                        Rutas (App Router) — solo componen features, sin lógica propia
├── layout.tsx               Layout raíz (html/body, estilos globales)
├── globals.css
└── (dashboard)/             Route group: todo lo que vive dentro del shell del dashboard
    ├── layout.tsx            Server Component: filtra permisos, monta el shell
    ├── page.tsx               → features/dashboard
    ├── pos/
    │   ├── facturacion/       → features/pos
    │   └── inventario/        → features/pos
    └── configuracion/         → features/placeholder (módulos aún no implementados)

src/
├── features/                 Un dominio de negocio por carpeta (dashboard, pos, ...)
│   └── <feature>/pages/       Página de cada feature, consumida por app/**/page.tsx
├── components/
│   ├── navigation/            Shell de navegación (sidebar, navbar, buscador ⌘K)
│   │                           — cross-cutting, usado por todas las features
│   └── ui/                    Componentes shadcn/ui, genéricos y sin lógica de negocio
├── config/navigation.ts      Única fuente de verdad de la navegación (sidebar/navbar/breadcrumbs/⌘K)
├── lib/
│   ├── router-adapter.tsx     Único punto de acoplamiento con next/link y next/navigation
│   ├── navigation-utils.ts    Lógica pura de navegación (activo, permisos, breadcrumbs)
│   └── utils.ts
├── hooks/                     Hooks compartidos (tema, estado del sidebar, mobile)
└── types/navigation.ts       Tipos del sistema de navegación
```

### Cómo agregar un módulo nuevo

1. Crear `src/features/<dominio>/pages/...` con la página del módulo.
2. Agregar la entrada correspondiente en `src/config/navigation.ts` (sidebar, navbar, breadcrumbs y buscador ⌘K se derivan solos de ahí).
3. Crear la ruta en `app/(dashboard)/<segmento>/page.tsx`, que simplemente renderiza la página del feature.

Si el módulo necesita componentes, hooks, servicios o tipos propios, viven dentro de `src/features/<dominio>/`. Solo lo verdaderamente compartido entre features va a `src/components/ui` o `src/lib`.
