import { describe, expect, it } from 'vitest'
import { IssueInvoiceSchema } from '../schemas/invoiceSchema'
import { DEFAULT_BILLING_SETTINGS } from '../types/billing'
import type { ProductOption } from '../types/invoice'
import {
  computeDraft,
  draftReducer,
  parseDecimal,
  stockShortages,
  toIssueInput,
  type DraftAction,
  type DraftLine,
  type DraftMeta,
  type DraftSettings,
} from './invoiceDraft'

const PRODUCT_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_ID = '66666666-6666-4666-8666-666666666666'
const KEY = '44444444-4444-4444-8444-444444444444'

const cola: ProductOption = { id: PRODUCT_ID, sku: 'COLA', barcode: null, name: 'Cola 1L', unit: 'un', price: 1190, taxRate: null, trackStock: true, stock: 8 }
const pan: ProductOption = { id: OTHER_ID, sku: 'PAN', barcode: null, name: 'Pan', unit: 'kg', price: 2000, taxRate: null, trackStock: false, stock: null }

const settings: DraftSettings = {
  pricesIncludeTax: DEFAULT_BILLING_SETTINGS.pricesIncludeTax,
  currencyDecimals: DEFAULT_BILLING_SETTINGS.currencyDecimals,
  taxRate: DEFAULT_BILLING_SETTINGS.taxRate,
  allowNegativeStock: false,
}

const reduce = (lines: DraftLine[], ...actions: DraftAction[]) => actions.reduce(draftReducer, lines)
const withProduct = (product = cola, key = 'k1') => reduce([], { type: 'add-product', product, key })
const line = (over: Partial<DraftLine> = {}): DraftLine => ({ ...withProduct()[0], ...over })
const meta = (over: Partial<DraftMeta> = {}): DraftMeta => ({
  documentType: 'invoice', customerId: null, dueDate: '', notes: '', paid: false, paymentMethod: 'cash', idempotencyKey: KEY, ...over,
})

describe('parseDecimal', () => {
  it('acepta punto o coma como separador decimal', () => {
    expect(parseDecimal('2')).toBe(2)
    expect(parseDecimal('1.5')).toBe(1.5)
    expect(parseDecimal('1,5')).toBe(1.5)
    expect(parseDecimal('  3 ')).toBe(3)
    expect(parseDecimal('0,001')).toBe(0.001)
  })

  it('tolera un número a medias mientras se escribe', () => {
    expect(parseDecimal('1.')).toBe(1)
    expect(parseDecimal('1,')).toBe(1)
    expect(parseDecimal(',5')).toBe(0.5)
    expect(parseDecimal('.5')).toBe(0.5)
  })

  it('todo lo demás es NaN', () => {
    for (const text of ['', ' ', 'abc', '1e3', '-1', '1,2,3', '1.2.3', '$100', '1 000', '--', '.', ',']) {
      expect(parseDecimal(text), JSON.stringify(text)).toBeNaN()
    }
  })
})

describe('draftReducer', () => {
  it('agregar un producto crea la línea con los datos del catálogo y cantidad 1', () => {
    expect(withProduct()).toEqual([
      {
        key: 'k1', productId: PRODUCT_ID, sku: 'COLA', description: 'Cola 1L', unit: 'un', unitPrice: '1190', quantity: '1',
        discountType: 'percent', discountValue: '', taxRate: null, productTaxRate: null, trackStock: true, stock: 8,
      },
    ])
  })

  it('elegir el mismo producto otra vez suma una unidad en lugar de duplicar la línea', () => {
    const lines = reduce([], { type: 'add-product', product: cola, key: 'a' }, { type: 'add-product', product: cola, key: 'b' }, { type: 'add-product', product: cola, key: 'c' })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ key: 'a', quantity: '3' })
  })

  it('sumar respeta los decimales y una cantidad inválida vuelve a empezar en 1', () => {
    const base = withProduct()
    expect(reduce(base, { type: 'update', key: 'k1', patch: { quantity: '1,5' } }, { type: 'add-product', product: cola, key: 'x' })[0].quantity).toBe('2.5')
    expect(reduce(base, { type: 'update', key: 'k1', patch: { quantity: '' } }, { type: 'add-product', product: cola, key: 'x' })[0].quantity).toBe('1')
    expect(reduce(base, { type: 'update', key: 'k1', patch: { quantity: '0,1' } }, { type: 'add-product', product: cola, key: 'x' })[0].quantity).toBe('1.1')
  })

  it('productos distintos son líneas distintas, en el orden en que se agregan', () => {
    const lines = reduce([], { type: 'add-product', product: cola, key: 'a' }, { type: 'add-product', product: pan, key: 'b' })
    expect(lines.map((l) => l.productId)).toEqual([PRODUCT_ID, OTHER_ID])
    expect(lines[1]).toMatchObject({ trackStock: false, stock: null })
  })

  it('un concepto libre parte vacío, sin producto ni stock', () => {
    expect(reduce([], { type: 'add-free', key: 'f' })[0]).toEqual({
      key: 'f', productId: null, sku: null, description: '', unit: 'un', unitPrice: '', quantity: '1',
      discountType: 'percent', discountValue: '', taxRate: null, productTaxRate: null, trackStock: false, stock: null,
    })
  })

  it('los conceptos libres no se fusionan entre sí', () => {
    expect(reduce([], { type: 'add-free', key: 'a' }, { type: 'add-free', key: 'b' })).toHaveLength(2)
  })

  it('actualizar cambia solo la línea indicada y solo los campos del cambio', () => {
    const lines = reduce([], { type: 'add-product', product: cola, key: 'a' }, { type: 'add-product', product: pan, key: 'b' })
    const next = draftReducer(lines, { type: 'update', key: 'b', patch: { quantity: '3', discountValue: '10' } })
    expect(next[0]).toBe(lines[0]) // la otra línea ni se toca
    expect(next[1]).toMatchObject({ quantity: '3', discountValue: '10', description: 'Pan' })
  })

  it('actualizar o quitar una línea que no existe no cambia nada', () => {
    const lines = withProduct()
    expect(draftReducer(lines, { type: 'update', key: 'nope', patch: { quantity: '9' } })).toEqual(lines)
    expect(draftReducer(lines, { type: 'remove', key: 'nope' })).toEqual(lines)
  })

  it('quitar y vaciar', () => {
    const lines = reduce([], { type: 'add-product', product: cola, key: 'a' }, { type: 'add-product', product: pan, key: 'b' })
    expect(draftReducer(lines, { type: 'remove', key: 'a' }).map((l) => l.key)).toEqual(['b'])
    expect(draftReducer(lines, { type: 'clear' })).toEqual([])
  })

  it('no modifica el arreglo original', () => {
    const lines = withProduct()
    const copy = structuredClone(lines)
    reduce(lines, { type: 'add-product', product: cola, key: 'z' }, { type: 'update', key: 'k1', patch: { quantity: '5' } }, { type: 'remove', key: 'k1' })
    expect(lines).toEqual(copy)
  })
})

describe('computeDraft', () => {
  const ok = (lines: DraftLine[], s = settings) => {
    const result = computeDraft(lines, s)
    if (!result.ok) throw new Error(`se esperaba ok, vino: ${result.error}`)
    return result
  }

  it('calcula con el precio del catálogo y la tasa de la empresa (precios con impuesto incluido)', () => {
    const result = ok([line({ quantity: '2' })])
    expect(result.totals).toMatchObject({ subtotal: 2000, taxTotal: 380, total: 2380 })
  })

  it('con precios sin impuesto, el impuesto se suma', () => {
    expect(ok([line({ quantity: '2' })], { ...settings, pricesIncludeTax: false }).totals).toMatchObject({ subtotal: 2380, taxTotal: 452, total: 2832 })
  })

  it('entiende la coma decimal de quien escribe en español', () => {
    const result = ok([line({ unitPrice: '1990', quantity: '0,5' })])
    expect(result.lines[0].total).toBe(995)
  })

  it('aplica el descuento y la tasa propios de la línea', () => {
    const result = ok([line({ quantity: '2', discountValue: '10', taxRate: '0' })])
    expect(result.lines[0]).toMatchObject({ gross: 2380, discount: 238, total: 2142, tax: 0 })
  })

  it('un descuento vacío es cero', () => {
    expect(ok([line({ discountValue: '  ' })]).lines[0].discount).toBe(0)
  })

  it('un concepto libre usa el precio que escribió la persona', () => {
    const free = reduce([], { type: 'add-free', key: 'f' })
    expect(ok([{ ...free[0], description: 'Flete', unitPrice: '5000' }]).totals.total).toBe(5000)
  })

  it('un borrador vacío o con datos a medias devuelve un error con el número de línea, sin lanzar', () => {
    expect(computeDraft([], settings)).toEqual({ ok: false, error: 'Agrega al menos un producto' })
    expect(computeDraft([line(), line({ quantity: '' })], settings)).toEqual({ ok: false, error: 'Línea 2: la cantidad debe ser mayor a 0' })
    expect(computeDraft([line({ quantity: '0' })], settings)).toEqual({ ok: false, error: 'Línea 1: la cantidad debe ser mayor a 0' })
    const free = reduce([], { type: 'add-free', key: 'f' })
    expect(computeDraft(free, settings)).toEqual({ ok: false, error: 'Línea 1: el precio no puede ser negativo' }) // precio vacío
    expect(computeDraft([line({ discountValue: 'abc' })], settings).ok).toBe(false)
  })
})

describe('impuesto propio del producto', () => {
  const exento: ProductOption = { ...pan, id: 'ex', name: 'Libro', price: 5000, taxRate: 0 }
  const reducido: ProductOption = { ...pan, id: 'red', name: 'Pan', price: 1100, taxRate: 10 }
  const draftOf = (...products: ProductOption[]) =>
    products.reduce<DraftLine[]>((lines, product, i) => draftReducer(lines, { type: 'add-product', product, key: `k${i}` }), [])

  it('la línea recuerda la tasa propia del producto', () => {
    expect(draftOf(exento)[0].productTaxRate).toBe(0)
    expect(draftOf(reducido)[0].productTaxRate).toBe(10)
    expect(draftOf(cola)[0].productTaxRate).toBeNull()
    expect(reduce([], { type: 'add-free', key: 'f' })[0].productTaxRate).toBeNull()
  })

  it('un producto exento no lleva impuesto, con precios con o sin impuesto incluido', () => {
    for (const pricesIncludeTax of [true, false]) {
      const result = computeDraft(draftOf(exento), { ...settings, pricesIncludeTax })
      if (!result.ok) throw new Error(result.error)
      expect(result.totals).toMatchObject({ subtotal: 5000, taxTotal: 0, total: 5000 })
    }
  })

  it('un producto con tasa propia usa esa tasa y no la de la empresa', () => {
    const result = computeDraft(draftOf(reducido), settings) // 1.100 con 10% incluido: neto 1.000 + 100
    if (!result.ok) throw new Error(result.error)
    expect(result.totals).toMatchObject({ subtotal: 1000, taxTotal: 100, total: 1100 })
  })

  it('un producto sin tasa propia usa la de la empresa', () => {
    const result = computeDraft(draftOf(cola), settings)
    if (!result.ok) throw new Error(result.error)
    expect(result.totals.taxTotal).toBe(190) // 1.190 con 19% incluido
  })

  it('mezclar productos exentos, con tasa propia y con la de la empresa desglosa el impuesto por tasa', () => {
    const result = computeDraft(draftOf(exento, reducido, cola), settings)
    if (!result.ok) throw new Error(result.error)
    expect(result.totals.taxBreakdown).toEqual([
      { rate: 0, base: 5000, tax: 0 },
      { rate: 10, base: 1000, tax: 100 },
      { rate: 19, base: 1000, tax: 190 },
    ])
    expect(result.totals.total).toBe(5000 + 1100 + 1190)
  })

  it('lo que se escribe en la línea manda sobre la tasa del producto', () => {
    const [line] = draftOf(exento)
    const result = computeDraft([{ ...line, taxRate: '19' }], settings)
    if (!result.ok) throw new Error(result.error)
    expect(result.totals.taxTotal).toBe(798) // 5.000 con 19% incluido
  })

  it('al enviar, la tasa de la línea sigue siendo null: el servidor aplica la del producto', () => {
    expect(toIssueInput(draftOf(exento), meta()).lines[0].taxRate).toBeNull()
  })
})

describe('stockShortages', () => {
  it('avisa de los productos cuya cantidad supera el stock', () => {
    const shortages = stockShortages([line({ quantity: '9' })], false)
    expect([...shortages.keys()]).toEqual([PRODUCT_ID])
    expect(shortages.get(PRODUCT_ID)).toMatchObject({ available: 8000, requested: 9000, name: 'Cola 1L' })
  })

  it('pedir exactamente lo que hay no es un problema', () => {
    expect(stockShortages([line({ quantity: '8' })], false).size).toBe(0)
  })

  it('un producto repetido en varias líneas se suma (un concepto libre nunca cuenta)', () => {
    const shortages = stockShortages([line({ key: 'a', quantity: '5' }), line({ key: 'b', quantity: '5' })], false)
    expect(shortages.get(PRODUCT_ID)).toMatchObject({ requested: 10000 })
  })

  it('los productos sin control de stock y los conceptos libres no generan avisos', () => {
    const free = reduce([], { type: 'add-free', key: 'f' })[0]
    expect(stockShortages([line({ trackStock: false, stock: null, quantity: '999' }), { ...free, quantity: '999' }], false).size).toBe(0)
  })

  it('con "permitir vender sin stock" no avisa', () => {
    expect(stockShortages([line({ quantity: '99' })], true).size).toBe(0)
  })

  it('ignora cantidades vacías o inválidas mientras se escribe', () => {
    expect(stockShortages([line({ quantity: '' }), line({ key: 'b', quantity: 'abc' }), line({ key: 'c', quantity: '0' })], false).size).toBe(0)
  })

  it('compara con decimales exactos', () => {
    expect(stockShortages([line({ stock: 0.3, key: 'a', quantity: '0,1' }), line({ stock: 0.3, key: 'b', quantity: '0,2' })], false).size).toBe(0)
  })
})

describe('toIssueInput', () => {
  it('de un producto del catálogo solo envía el id, la cantidad, el descuento y el impuesto', () => {
    const input = toIssueInput([line({ quantity: '2,5', discountValue: '10', taxRate: '0' })], meta())
    expect(input.lines[0]).toEqual({
      productId: PRODUCT_ID, description: '', unit: '', quantity: 2.5, unitPrice: 0, discountType: 'percent', discountValue: 10, taxRate: 0,
    })
  })

  it('de un concepto libre envía descripción, unidad y precio', () => {
    const free = reduce([], { type: 'add-free', key: 'f' })[0]
    const input = toIssueInput([{ ...free, description: '  Flete  ', unit: ' un ', unitPrice: '5.000'.replace('.', '') }], meta())
    expect(input.lines[0]).toMatchObject({ productId: null, description: 'Flete', unit: 'un', unitPrice: 5000, taxRate: null })
  })

  it('el descuento vacío se envía como 0 y la tasa sin tocar como null (la de la empresa)', () => {
    expect(toIssueInput([line()], meta()).lines[0]).toMatchObject({ discountValue: 0, taxRate: null })
  })

  it('lleva los datos del documento; sin vencimiento escrito va null', () => {
    expect(toIssueInput([line()], meta({ documentType: 'receipt', customerId: OTHER_ID, paid: true, notes: 'hola' }))).toMatchObject({
      documentType: 'receipt', customerId: OTHER_ID, paid: true, notes: 'hola', dueDate: null, idempotencyKey: KEY,
    })
    expect(toIssueInput([line()], meta({ dueDate: '2026-12-10' })).dueDate).toBe('2026-12-10')
  })

  it('el método de pago solo viaja si se cobra al emitir', () => {
    expect(toIssueInput([line()], meta({ paid: true, paymentMethod: 'transfer' })).paymentMethod).toBe('transfer')
    expect(toIssueInput([line()], meta({ paid: false, paymentMethod: 'transfer' })).paymentMethod).toBeUndefined()
  })

  it('un borrador válido pasa el schema del servidor tal cual', () => {
    const free = reduce([], { type: 'add-free', key: 'f' })[0]
    const input = toIssueInput(
      [line({ quantity: '2', discountValue: '5' }), { ...free, description: 'Flete', unitPrice: '5000' }],
      meta({ customerId: OTHER_ID, dueDate: '2026-12-10', notes: 'ok' }),
    )
    expect(IssueInvoiceSchema.safeParse(input).success).toBe(true)
  })
})
