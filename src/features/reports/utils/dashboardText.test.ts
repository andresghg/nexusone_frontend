import { describe, expect, it } from 'vitest'
import { compareToYesterday, plural } from './dashboardText'

const money = (n: number) => `$${n}`

describe('compareToYesterday', () => {
  it('sube, baja o queda igual, con el monto de ayer', () => {
    expect(compareToYesterday(1120, 1000, money)).toBe('+12 % vs. ayer ($1000)')
    expect(compareToYesterday(750, 1000, money)).toBe('−25 % vs. ayer ($1000)')
    expect(compareToYesterday(1000, 1000, money)).toBe('Igual que ayer ($1000)')
  })

  it('redondea el porcentaje', () => {
    expect(compareToYesterday(1004, 1000, money)).toBe('Igual que ayer ($1000)') // +0,4 %
    expect(compareToYesterday(1005, 1000, money)).toBe('+1 % vs. ayer ($1000)')
    expect(compareToYesterday(2000, 3000, money)).toBe('−33 % vs. ayer ($3000)')
  })

  it('más del doble es un porcentaje mayor a 100, no un tope', () => {
    expect(compareToYesterday(5000, 1000, money)).toBe('+400 % vs. ayer ($1000)')
  })

  it('hoy en cero frente a un ayer con ventas es −100 %', () => {
    expect(compareToYesterday(0, 1000, money)).toBe('−100 % vs. ayer ($1000)')
  })

  it('si ayer no hubo nada que comparar no inventa un porcentaje (ni divide por cero)', () => {
    expect(compareToYesterday(0, 0, money)).toBe('Todavía sin ventas hoy')
    expect(compareToYesterday(500, 0, money)).toBe('Ayer no hubo ventas')
  })

  it('si ayer cerró en negativo muestra el monto, no un porcentaje sin sentido', () => {
    expect(compareToYesterday(500, -200, money)).toBe('Ayer: $-200')
  })
})

describe('plural', () => {
  it('singular solo con 1; el cero va en plural', () => {
    expect(plural(1, 'documento', 'documentos')).toBe('1 documento')
    expect(plural(0, 'documento', 'documentos')).toBe('0 documentos')
    expect(plural(12, 'documento', 'documentos')).toBe('12 documentos')
  })
})
