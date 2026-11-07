import { describe, expect, it } from 'vitest'
import { PERMISSIONS } from '@/types/navigation'
import { resolvePermissions } from './permissions'

const ALL_MODULES = ['pos', 'gestion', 'finanzas']

describe('resolvePermissions', () => {
  it('owner y admin con todos los módulos reciben todos los permisos', () => {
    expect(resolvePermissions('owner', ALL_MODULES)).toEqual([...PERMISSIONS])
    expect(resolvePermissions('admin', ALL_MODULES)).toEqual([...PERMISSIONS])
  })

  it('member nunca recibe finanzas ni gestión de usuarios', () => {
    const perms = resolvePermissions('member', ALL_MODULES)
    expect(perms.some((p) => p.startsWith('finanzas.'))).toBe(false)
    expect(perms).not.toContain('config.usuarios.read')
    expect(perms).toContain('pos.facturacion.create')
  })

  it('un módulo desactivado quita sus permisos aunque el rol los tenga', () => {
    const perms = resolvePermissions('owner', ['pos'])
    expect(perms.filter((p) => p.startsWith('gestion.') || p.startsWith('finanzas.'))).toEqual([])
    expect(perms).toContain('pos.inventario.read')
  })

  it('dashboard y configuración no dependen de módulos activos', () => {
    const perms = resolvePermissions('owner', [])
    expect(perms).toContain('dashboard.read')
    expect(perms).toContain('config.empresa.read')
    expect(perms).toContain('config.usuarios.read')
  })

  it('un rol desconocido no recibe nada', () => {
    expect(resolvePermissions('hacker', ALL_MODULES)).toEqual([])
  })

  it('member lee inventario pero no puede modificarlo', () => {
    const perms = resolvePermissions('member', ALL_MODULES)
    expect(perms).toContain('pos.inventario.read')
    expect(perms).not.toContain('pos.inventario.write')
  })

  it('sin el módulo pos activo nadie toca inventario', () => {
    for (const role of ['owner', 'admin', 'member']) {
      const perms = resolvePermissions(role, ['gestion', 'finanzas'])
      expect(perms.filter((p) => p.startsWith('pos.'))).toEqual([])
    }
  })
})
