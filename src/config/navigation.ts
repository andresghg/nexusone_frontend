import {
  Banknote,
  BarChart3,
  Building2,
  CalendarDays,
  CheckSquare,
  LayoutDashboard,
  MessagesSquare,
  Package,
  ReceiptText,
  Settings2,
  ShoppingCart,
  Users,
  Wallet,
} from 'lucide-react'
import type { NavigationGroup, Permission } from '@/types/navigation'

/**
 * ============================================================================
 * Configuración central de navegación — LA ÚNICA fuente de verdad.
 * ----------------------------------------------------------------------------
 * Para agregar un módulo nuevo: agregar una entrada aquí. Nada más.
 * Sidebar, navbar, breadcrumbs, buscador ⌘K y estado activo se derivan
 * automáticamente de esta estructura.
 *
 * Reglas de diseño que esta config materializa:
 * - Máximo 2 niveles (grupo → ítem → hijo). Un tercer nivel es síntoma
 *   de que el módulo necesita navegación interna propia (tabs), no más sidebar.
 * - Grupos = dominios del negocio, no tecnología.
 * - 'soon' comunica el roadmap sin prometer funcionalidad inexistente.
 * ============================================================================
 */

const DASHBOARD = '/dashboard';

export const navigationConfig: NavigationGroup[] = [
  {
    id: 'principal',
    label: 'Principal',
    items: [
      {
        id: 'dashboard',
        label: 'Panel',
        icon: LayoutDashboard,
        href: DASHBOARD,
        activeMatch: 'exact',
        description: 'Resumen del negocio',
      },
      {
        id: 'pos',
        label: 'POS',
        icon: ShoppingCart,
        description: 'Punto de venta',
        children: [
          {
            id: 'pos-facturacion',
            label: 'Facturación',
            icon: ReceiptText,
            href: `${DASHBOARD}/pos/facturacion`,
            permissions: ['pos.facturacion.read'],
            description: 'Facturas, clientes y cobros',
          },
          {
            id: 'pos-inventario',
            label: 'Inventario',
            icon: Package,
            href: `${DASHBOARD}/pos/inventario`,
            permissions: ['pos.inventario.read'],
            description: 'Productos, stock y movimientos',
            badge: { label: '3', variant: 'destructive' }, // p. ej. productos con stock bajo
          },
        ],
      },
    ],
  },
  {
    id: 'gestion',
    label: 'Gestión',
    items: [
      {
        id: 'calendario',
        label: 'Calendario',
        icon: CalendarDays,
        href: `${DASHBOARD}/gestion/calendario`,
        status: 'soon',
        badge: { label: 'Pronto', variant: 'outline' },
        permissions: ['gestion.calendario.read'],
      },
      {
        id: 'tareas',
        label: 'Tareas',
        icon: CheckSquare,
        href: `${DASHBOARD}/gestion/tareas`,
        status: 'soon',
        badge: { label: 'Pronto', variant: 'outline' },
        permissions: ['gestion.tareas.read'],
      },
      {
        id: 'mensajeria',
        label: 'Mensajería',
        icon: MessagesSquare,
        href: `${DASHBOARD}/gestion/mensajeria`,
        status: 'soon',
        badge: { label: 'Pronto', variant: 'outline' },
        permissions: ['gestion.mensajeria.read'],
      },
    ],
  },
  {
    id: 'finanzas',
    label: 'Finanzas',
    items: [
      {
        id: 'bancos',
        label: 'Bancos',
        icon: Banknote,
        href: `${DASHBOARD}/finanzas/bancos`,
        status: 'soon',
        badge: { label: 'Pronto', variant: 'outline' },
        permissions: ['finanzas.bancos.read'],
      },
      {
        id: 'reportes',
        label: 'Reportes',
        icon: BarChart3,
        href: `${DASHBOARD}/finanzas/reportes`,
        status: 'soon',
        badge: { label: 'Pronto', variant: 'outline' },
        permissions: ['finanzas.reportes.read'],
      },
      {
        id: 'caja',
        label: 'Caja y pagos',
        icon: Wallet,
        href: `${DASHBOARD}/finanzas/caja`,
        status: 'disabled', // feature flag apagado: no se renderiza
      },
    ],
  },
  {
    id: 'configuracion',
    label: 'Configuración',
    items: [
      {
        id: 'config',
        label: 'Configuración',
        icon: Settings2,
        children: [
          {
            id: 'config-empresa',
            label: 'Empresa',
            icon: Building2,
            href: `${DASHBOARD}/configuracion/empresa`,
            permissions: ['config.empresa.read'],
          },
          {
            id: 'config-usuarios',
            label: 'Usuarios y permisos',
            icon: Users,
            href: `${DASHBOARD}/configuracion/usuarios`,
            permissions: ['config.usuarios.read'],
          },
        ],
      },
    ],
  },
]

/**
 * Permisos del usuario actual.
 * En producción: derivados de la sesión (Server Component en Next.js)
 * y pasados como prop o vía contexto. Aquí simulamos un rol "cajero/admin".
 */
export const currentUserPermissions: Permission[] = [
  'pos.facturacion.read',
  'pos.facturacion.create',
  'pos.inventario.read',
  'gestion.calendario.read',
  'gestion.tareas.read',
  'gestion.mensajeria.read',
  'finanzas.bancos.read',
  'finanzas.reportes.read',
  'config.empresa.read',
  'config.usuarios.read',
]
