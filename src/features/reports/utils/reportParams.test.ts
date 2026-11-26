import { describe, expect, it } from 'vitest'
import { buildReportsQuery, hasActiveFilters, parseReportParams } from './reportParams'

describe('parseReportParams', () => {
  it('sin parámetros: ventas del mes, por importe', () => {
    expect(parseReportParams({})).toEqual({ tab: 'ventas', period: 'mes', from: '', to: '', rank: 'importe' })
  })

  it('lee cada parámetro', () => {
    expect(parseReportParams({ tab: 'productos', periodo: '30d', orden: 'cantidad' })).toEqual({
      tab: 'productos', period: '30d', from: '', to: '', rank: 'cantidad',
    })
    expect(parseReportParams({ tab: 'cobrar' }).tab).toBe('cobrar')
    expect(parseReportParams({ tab: 'cobros', periodo: '7d' })).toMatchObject({ tab: 'cobros', period: '7d' })
    expect(parseReportParams({ periodo: 'personalizado', desde: '2026-11-01', hasta: '2026-11-15' })).toMatchObject({
      period: 'personalizado', from: '2026-11-01', to: '2026-11-15',
    })
  })

  it('la URL es entrada del usuario: lo inválido cae al valor por defecto', () => {
    expect(parseReportParams({ tab: 'hackeo', periodo: '999', orden: '<script>' })).toEqual({
      tab: 'ventas', period: 'mes', from: '', to: '', rank: 'importe',
    })
  })

  it('recorta fechas demasiado largas y toma el primer valor si viene repetido', () => {
    expect(parseReportParams({ desde: '2026-11-01-extra-largo' }).from).toBe('2026-11-01')
    expect(parseReportParams({ tab: ['productos', 'cobrar'] }).tab).toBe('productos')
  })
})

describe('buildReportsQuery', () => {
  it('lo que es igual al valor por defecto no viaja en la URL', () => {
    expect(buildReportsQuery({})).toBe('')
    expect(buildReportsQuery({ tab: 'ventas', period: 'mes', rank: 'importe' })).toBe('')
  })

  it('arma la URL con lo que cambia', () => {
    expect(buildReportsQuery({ tab: 'productos' })).toBe('?tab=productos')
    expect(buildReportsQuery({ tab: 'productos', period: '7d', rank: 'cantidad' })).toBe('?tab=productos&periodo=7d&orden=cantidad')
  })

  it('las fechas solo viajan con el período personalizado', () => {
    expect(buildReportsQuery({ period: '30d', from: '2026-11-01', to: '2026-11-15' })).toBe('?periodo=30d')
    expect(buildReportsQuery({ period: 'personalizado', from: '2026-11-01', to: '2026-11-15' })).toBe(
      '?periodo=personalizado&desde=2026-11-01&hasta=2026-11-15',
    )
  })

  it('ida y vuelta: lo que se escribe se vuelve a leer igual', () => {
    const query = { tab: 'productos', period: 'personalizado', from: '2026-01-05', to: '2026-02-10', rank: 'cantidad' } as const
    const url = buildReportsQuery(query)
    expect(parseReportParams(Object.fromEntries(new URLSearchParams(url)))).toEqual(query)
  })
})

describe('hasActiveFilters', () => {
  it('detecta si algo difiere de lo normal', () => {
    expect(hasActiveFilters(parseReportParams({}))).toBe(false)
    expect(hasActiveFilters(parseReportParams({ periodo: 'hoy' }))).toBe(true)
  })
})
