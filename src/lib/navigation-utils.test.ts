import { describe, expect, it } from 'vitest'
import type { NavigationGroup } from '@/types/navigation'
import { findBreadcrumbs, isLeafActive, withBasePath } from './navigation-utils'

const icon = (() => null) as never

const groups: NavigationGroup[] = [
  {
    id: 'g',
    label: 'Grupo',
    items: [
      { id: 'dashboard', label: 'Panel', icon, href: '/dashboard', activeMatch: 'exact' },
      {
        id: 'pos',
        label: 'POS',
        icon,
        children: [{ id: 'fact', label: 'Facturación', icon, href: '/dashboard/pos/facturacion' }],
      },
    ],
  },
]

describe('withBasePath', () => {
  it('prefija hojas y ramas con la empresa activa', () => {
    const [group] = withBasePath(groups, '/dashboard/acme')
    expect(group.items[0]).toMatchObject({ href: '/dashboard/acme' })
    expect(group.items[1]).toMatchObject({
      children: [{ href: '/dashboard/acme/pos/facturacion' }],
    })
  })

  it('no muta la configuración original', () => {
    withBasePath(groups, '/dashboard/acme')
    expect(groups[0].items[0]).toMatchObject({ href: '/dashboard' })
  })

  it('el panel no se marca activo en las rutas hijas de la empresa', () => {
    const [group] = withBasePath(groups, '/dashboard/acme')
    const panel = group.items[0] as never
    expect(isLeafActive(panel, '/dashboard/acme')).toBe(true)
    expect(isLeafActive(panel, '/dashboard/acme/pos/facturacion')).toBe(false)
  })

  it('el breadcrumb se deriva bien con rutas prefijadas', () => {
    const prefixed = withBasePath(groups, '/dashboard/acme')
    expect(findBreadcrumbs(prefixed, '/dashboard/acme/pos/facturacion')).toEqual([
      { label: 'Grupo' },
      { label: 'POS' },
      { label: 'Facturación', href: '/dashboard/acme/pos/facturacion' },
    ])
  })
})
