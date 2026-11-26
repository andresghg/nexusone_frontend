// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReportsQuery } from '../utils/reportParams'
import { display, productsReport, receivablesReport, salesReport } from './fixtures.test-util'
import type { ReportData } from '../types/report'
import { ReportsView } from './ReportsView'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
const print = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/dashboard/acme/finanzas/reportes',
}))

const PATH = '/dashboard/acme/finanzas/reportes'
const base: ReportsQuery = { tab: 'ventas', period: 'mes', from: '', to: '', rank: 'importe' }

type Over = { query?: Partial<ReportsQuery>; data?: ReportData; range?: { from: string; to: string } }
const setup = ({ query = {}, data, range = { from: '2026-11-01', to: '2026-11-23' } }: Over = {}) => {
  const q = { ...base, ...query }
  const content: ReportData =
    data ??
    (q.tab === 'productos'
      ? { tab: 'productos', report: productsReport() }
      : q.tab === 'cobrar'
        ? { tab: 'cobrar', report: receivablesReport() }
        : { tab: 'ventas', report: salesReport() })
  const user = userEvent.setup({ pointerEventsCheck: 0, delay: null })
  render(<ReportsView query={q} range={range} today="2026-11-23" display={display} data={content} companyName="Acme SpA" print={print} />)
  return { user }
}
const tab = (name: string) => screen.getByRole('tab', { name })
const period = () => screen.getByRole('combobox', { name: 'Período' })

beforeEach(() => {
  push.mockClear()
  print.mockClear()
})
afterEach(cleanup)

describe('ReportsView · estructura', () => {
  it('título, descripción con la moneda y las tres pestañas con la activa marcada', () => {
    setup()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Reportes')
    expect(screen.getByText(/Los montos están en CLP/)).toBeTruthy()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Ventas', 'Productos', 'Por cobrar'])
    expect(tab('Ventas').getAttribute('aria-selected')).toBe('true')
    expect(tab('Productos').getAttribute('aria-selected')).toBe('false')
  })

  it.each([
    ['ventas', 'Ventas netas por día'],
    ['productos', 'Más vendidos por importe'],
    ['cobrar', 'Antigüedad de la deuda'],
  ] as const)('en la pestaña %s muestra solo su contenido', (name, heading) => {
    setup({ query: { tab: name } })
    expect(screen.getByText(heading)).toBeTruthy()
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
    expect(tab(name === 'cobrar' ? 'Por cobrar' : name === 'ventas' ? 'Ventas' : 'Productos').getAttribute('aria-selected')).toBe('true')
  })

  it('el contenido no está ocupado cuando no se está cambiando de reporte', () => {
    setup()
    expect(screen.getByRole('tabpanel').getAttribute('aria-busy')).toBe('false')
  })
})

describe('ReportsView · mientras cambia el reporte', () => {
  it('avisa que está actualizando y atenúa el contenido hasta que llegue el nuevo', async () => {
    push.mockImplementationOnce(() => new Promise(() => {})) // una navegación que todavía no termina
    const { user } = setup()
    await user.click(tab('Productos'))
    expect(await screen.findByText('Actualizando el reporte…')).toBeTruthy()
    const panel = screen.getByRole('tabpanel')
    expect(panel.getAttribute('aria-busy')).toBe('true')
    expect(panel.className).toContain('opacity-60')
  })
})

describe('ReportsView · pestañas', () => {
  it('cambiar de pestaña actualiza la URL', async () => {
    const { user } = setup()
    await user.click(tab('Productos'))
    expect(push).toHaveBeenCalledWith(`${PATH}?tab=productos`)
  })

  it('volver a la pestaña inicial deja la URL limpia', async () => {
    const { user } = setup({ query: { tab: 'productos' } })
    await user.click(tab('Ventas'))
    expect(push).toHaveBeenCalledWith(PATH)
  })

  it('al cambiar de pestaña se conserva el período elegido', async () => {
    const { user } = setup({ query: { period: '30d' } })
    await user.click(tab('Productos'))
    expect(push).toHaveBeenCalledWith(`${PATH}?tab=productos&periodo=30d`)
  })

  it('por cobrar tiene su propia URL', async () => {
    const { user } = setup()
    await user.click(tab('Por cobrar'))
    expect(push).toHaveBeenCalledWith(`${PATH}?tab=cobrar`)
  })
})

describe('ReportsView · período', () => {
  it('muestra el período actual y el rango en palabras', () => {
    setup()
    expect(period().textContent).toBe('Este mes')
    expect(screen.getByText(/Del 1 nov.*2026 al 23 nov.*2026/)).toBeTruthy()
  })

  it('un solo día se dice "El …"', () => {
    setup({ query: { period: 'hoy' }, range: { from: '2026-11-23', to: '2026-11-23' } })
    expect(screen.getByText(/^El 23 nov.*2026$/)).toBeTruthy()
  })

  it('elegir un atajo actualiza la URL', async () => {
    const { user } = setup()
    await user.click(period())
    await user.click(await screen.findByRole('option', { name: 'Últimos 7 días' }))
    expect(push).toHaveBeenCalledWith(`${PATH}?periodo=7d`)
  })

  it('volver al período por defecto deja la URL limpia', async () => {
    const { user } = setup({ query: { period: '30d' } })
    await user.click(period())
    await user.click(await screen.findByRole('option', { name: 'Este mes' }))
    expect(push).toHaveBeenCalledWith(PATH)
  })

  it('"Personalizado" parte del rango que ya se está viendo', async () => {
    const { user } = setup()
    await user.click(period())
    await user.click(await screen.findByRole('option', { name: 'Personalizado' }))
    expect(push).toHaveBeenCalledWith(`${PATH}?periodo=personalizado&desde=2026-11-01&hasta=2026-11-23`)
  })

  it('las fechas solo aparecen con el período personalizado', () => {
    setup()
    expect(screen.queryByLabelText('Desde')).toBeNull()
    cleanup()
    setup({ query: { period: 'personalizado', from: '2026-11-01', to: '2026-11-15' }, range: { from: '2026-11-01', to: '2026-11-15' } })
    expect((screen.getByLabelText('Desde') as HTMLInputElement).value).toBe('2026-11-01')
    expect((screen.getByLabelText('Hasta') as HTMLInputElement).value).toBe('2026-11-15')
  })

  it('no deja elegir fechas futuras', () => {
    setup({ query: { period: 'personalizado', from: '2026-11-01', to: '2026-11-15' }, range: { from: '2026-11-01', to: '2026-11-15' } })
    expect(screen.getByLabelText('Desde').getAttribute('max')).toBe('2026-11-23')
    expect(screen.getByLabelText('Hasta').getAttribute('max')).toBe('2026-11-23')
  })
})

describe('ReportsView · fechas personalizadas', () => {
  const custom = { query: { period: 'personalizado', from: '2026-11-01', to: '2026-11-15' } as Partial<ReportsQuery>, range: { from: '2026-11-01', to: '2026-11-15' } }

  it('un rango válido consulta', () => {
    setup(custom)
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-20' } })
    expect(push).toHaveBeenCalledWith(`${PATH}?periodo=personalizado&desde=2026-11-01&hasta=2026-11-20`)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('un rango al revés explica el problema y no consulta', () => {
    setup(custom)
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-20' } })
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('La fecha de inicio no puede ser posterior a la de término')
    expect(screen.getByLabelText('Hasta').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByLabelText('Hasta').getAttribute('aria-describedby')).toBe('report-range-error')
  })

  it('una fecha borrada no consulta y pide fechas reales', () => {
    setup(custom)
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '' } })
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('Las fechas deben ser reales, en formato AAAA-MM-DD')
  })

  it('más de un año explica el máximo', () => {
    setup(custom)
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2025-01-01' } })
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('El rango máximo es de un año')
  })

  it('al corregir el rango el aviso desaparece y consulta', () => {
    setup(custom)
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-20' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-11-18' } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith(`${PATH}?periodo=personalizado&desde=2026-11-01&hasta=2026-11-18`)
  })

  it('con un rango inválido no se promete un rango en palabras', () => {
    setup(custom)
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-20' } })
    expect(screen.queryByText(/^Del /)).toBeNull()
  })
})

describe('ReportsView · productos', () => {
  it('ofrece ordenar por importe o cantidad, con el actual marcado', () => {
    setup({ query: { tab: 'productos' } })
    expect(screen.getByRole('radio', { name: 'Importe' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: 'Cantidad' }).getAttribute('aria-checked')).toBe('false')
  })

  it('cambiar el orden actualiza la URL y conserva la pestaña', async () => {
    const { user } = setup({ query: { tab: 'productos' } })
    await user.click(screen.getByRole('radio', { name: 'Cantidad' }))
    expect(push).toHaveBeenCalledWith(`${PATH}?tab=productos&orden=cantidad`)
  })

  it('volver a tocar el orden activo no desmarca ni consulta de más', async () => {
    const { user } = setup({ query: { tab: 'productos' } })
    await user.click(screen.getByRole('radio', { name: 'Importe' }))
    expect(push).not.toHaveBeenCalled()
  })

  it('el orden no aparece en las otras pestañas', () => {
    setup()
    expect(screen.queryByRole('radio', { name: 'Cantidad' })).toBeNull()
  })
})

describe('ReportsView · por cobrar', () => {
  it('no pide período: lo que se debe es de hoy', () => {
    setup({ query: { tab: 'cobrar' } })
    expect(screen.queryByRole('combobox', { name: 'Período' })).toBeNull()
    expect(screen.getByText(/Lo que se debe hoy, al 23 nov.*2026/)).toBeTruthy()
  })
})

describe('ReportsView · errores', () => {
  it('un error de la consulta se muestra como alerta en lugar del reporte', () => {
    setup({ data: { tab: 'ventas', error: 'El rango máximo es de un año' } })
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toBe('El rango máximo es de un año')
    expect(screen.queryByText('Ventas netas por día')).toBeNull()
  })

  it('un error de permisos también', () => {
    setup({ query: { tab: 'cobrar' }, data: { tab: 'cobrar', error: 'No tienes permisos para ver los reportes' } })
    expect(within(screen.getByRole('tabpanel')).getByRole('alert').textContent).toBe('No tienes permisos para ver los reportes')
  })
})

describe('ReportsView · exportar', () => {
  const excel = async (over: Over) => {
    const { user } = setup(over)
    await user.click(screen.getByRole('button', { name: 'Exportar' }))
    return (await screen.findByRole('menuitem', { name: 'Descargar Excel (.xlsx)' })).getAttribute('href')
  }

  it('la descarga lleva lo mismo que se está viendo', async () => {
    expect(await excel({})).toBe(`${PATH}/exportar`)
    cleanup()
    expect(await excel({ query: { tab: 'productos', period: '30d', rank: 'cantidad' } })).toBe(`${PATH}/exportar?tab=productos&periodo=30d&orden=cantidad`)
  })

  it('un período personalizado viaja con sus fechas', async () => {
    expect(
      await excel({ query: { period: 'personalizado', from: '2026-11-01', to: '2026-11-15' }, range: { from: '2026-11-01', to: '2026-11-15' } }),
    ).toBe(`${PATH}/exportar?periodo=personalizado&desde=2026-11-01&hasta=2026-11-15`)
  })

  it('por cobrar no arrastra un período que no usa', async () => {
    expect(await excel({ query: { tab: 'cobrar' } })).toBe(`${PATH}/exportar?tab=cobrar`)
  })

  it('imprimir manda el reporte de la pestaña activa con el nombre de la empresa', async () => {
    const { user } = setup({ query: { tab: 'cobrar' } })
    await user.click(screen.getByRole('button', { name: 'Exportar' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Imprimir o guardar como PDF' }))
    expect(print.mock.calls[0][0]).toContain('<title>Cuentas por cobrar — Acme SpA</title>')
  })

  it('con un error en pantalla no se puede exportar', () => {
    setup({ data: { tab: 'ventas', error: 'x' } })
    expect((screen.getByRole('button', { name: 'Exportar' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
