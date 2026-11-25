import { describe, expect, it } from 'vitest'
import type { CategoryRow } from '../types/inventory'
import { applyLabel, customRateError, describeScope, taxRateInput } from './bulkTax'
import type { InventoryQuery } from './inventoryParams'

const categories: CategoryRow[] = [{ id: 'c1', name: 'Libros', productCount: 4 }]
const base: InventoryQuery = { q: '', category: '', status: 'active', low: false, page: 1 }

describe('taxRateInput', () => {
  it('exento = "0", tasa de la empresa = vacío, otra tasa = lo escrito sin espacios', () => {
    expect(taxRateInput('exempt', '99')).toBe('0')
    expect(taxRateInput('default', '99')).toBe('')
    expect(taxRateInput('custom', ' 10,5 ')).toBe('10,5')
  })
})

describe('customRateError', () => {
  it.each(['0', '10', '19', '5,5', '5.5', '12.25', '100', ' 7 '])('"%s" es válida', (value) => {
    expect(customRateError(value)).toBeNull()
  })
  it('vacío no vale: "tasa de la empresa" es otra opción', () => {
    expect(customRateError('')).toBe('Escribe la tasa de impuesto')
    expect(customRateError('   ')).toBe('Escribe la tasa de impuesto')
  })
  it.each(['101', '100,01', '-1', 'abc', '1.234', '5%', '1,2,3', '١٠'])('"%s" no es válida', (value) => {
    expect(customRateError(value)).toBe('Debe ser un número entre 0 y 100, con máximo 2 decimales')
  })
})

describe('applyLabel', () => {
  it('dice el efecto y cuántos productos, en singular y plural', () => {
    expect(applyLabel('exempt', '', 12)).toBe('Dejar 12 productos exentos')
    expect(applyLabel('exempt', '', 1)).toBe('Dejar 1 producto exento')
    expect(applyLabel('default', '', 3)).toBe('Aplicar la tasa de la empresa a 3 productos')
    expect(applyLabel('default', '', 1)).toBe('Aplicar la tasa de la empresa a 1 producto')
    expect(applyLabel('custom', ' 10.5 ', 7)).toBe('Aplicar 10,5 % a 7 productos')
  })
})

describe('describeScope', () => {
  it('la lista sin filtros son los productos activos', () => {
    expect(describeScope(base, categories)).toEqual(['Estado: Activos'])
  })
  it('nombra cada filtro de la lista', () => {
    expect(describeScope({ ...base, q: 'pan', category: 'c1', status: 'all', low: true }, categories)).toEqual([
      'Búsqueda: «pan»',
      'Categoría: Libros',
      'Estado: Todos',
      'Solo stock bajo',
    ])
    expect(describeScope({ ...base, status: 'archived' }, categories)).toEqual(['Estado: Archivados'])
  })
  it('una categoría que ya no está en la lista de categorías no rompe', () => {
    expect(describeScope({ ...base, category: 'zzz' }, categories)).toEqual(['Una categoría', 'Estado: Activos'])
  })
})
