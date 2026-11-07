import { describe, expect, it } from 'vitest'
import { slugify } from './slugify'

describe('slugify', () => {
  it('quita tildes y la ñ', () => expect(slugify('Panadería Ñandú')).toBe('panaderia-nandu'))
  it('colapsa símbolos y espacios', () => expect(slugify('Mi   Empresa SpA!!')).toBe('mi-empresa-spa'))
  it('no deja guiones en los bordes', () => expect(slugify('---hola---')).toBe('hola'))
  it('devuelve vacío si no queda nada', () => expect(slugify('¡¡¡')).toBe(''))
})
