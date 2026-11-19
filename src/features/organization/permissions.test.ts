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

  it('configurar la facturación es solo de owner y admin', () => {
    expect(resolvePermissions('owner', ALL_MODULES)).toContain('pos.facturacion.configure')
    expect(resolvePermissions('admin', ALL_MODULES)).toContain('pos.facturacion.configure')
    expect(resolvePermissions('member', ALL_MODULES)).not.toContain('pos.facturacion.configure')
  })

  it('clientes: todos los roles leen y modifican, y solo con el módulo pos activo', () => {
    for (const role of ['owner', 'admin', 'member']) {
      const perms = resolvePermissions(role, ALL_MODULES)
      expect(perms).toContain('pos.clientes.read')
      expect(perms).toContain('pos.clientes.write')
    }
    const withoutPos = resolvePermissions('owner', ['gestion', 'finanzas'])
    expect(withoutPos).not.toContain('pos.clientes.read')
    expect(withoutPos).not.toContain('pos.clientes.write')
  })

  it('anular documentos es solo de owner y admin', () => {
    expect(resolvePermissions('owner', ALL_MODULES)).toContain('pos.facturacion.void')
    expect(resolvePermissions('admin', ALL_MODULES)).toContain('pos.facturacion.void')
    expect(resolvePermissions('member', ALL_MODULES)).not.toContain('pos.facturacion.void')
    // emitir sí lo puede hacer quien factura
    expect(resolvePermissions('member', ALL_MODULES)).toContain('pos.facturacion.create')
  })

  it('ajustar precios (descuentos e impuesto por línea) es solo de owner y admin', () => {
    expect(resolvePermissions('owner', ALL_MODULES)).toContain('pos.facturacion.adjust')
    expect(resolvePermissions('admin', ALL_MODULES)).toContain('pos.facturacion.adjust')
    expect(resolvePermissions('member', ALL_MODULES)).not.toContain('pos.facturacion.adjust')
  })
})
