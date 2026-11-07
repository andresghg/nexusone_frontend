import { describe, expect, it } from 'vitest'
import { extractOrganizationSlug, pickInitialOrganization } from './pickOrganization'

describe('extractOrganizationSlug', () => {
  it.each([
    ['/dashboard/acme', 'acme'],
    ['/dashboard/acme/', 'acme'],
    ['/dashboard/acme/pos/facturacion', 'acme'],
  ])('%s → %s', (path, slug) => expect(extractOrganizationSlug(path)).toBe(slug))

  it.each(['/dashboard', '/dashboard/', '/nueva-empresa', '/dashboardx/acme', '/auth/login'])(
    'devuelve null en %s',
    (path) => expect(extractOrganizationSlug(path)).toBeNull(),
  )
})

describe('pickInitialOrganization', () => {
  const orgs = [{ slug: 'acme' }, { slug: 'stark' }, { slug: 'wayne' }]

  it('elige la última empresa usada', () => {
    expect(pickInitialOrganization(orgs, 'stark')).toEqual({ slug: 'stark' })
  })

  it('cae a la primera si no hay pista', () => {
    expect(pickInitialOrganization(orgs)).toEqual({ slug: 'acme' })
  })

  it('ignora una pista que no es una empresa del usuario', () => {
    expect(pickInitialOrganization(orgs, 'empresa-ajena')).toEqual({ slug: 'acme' })
  })

  it('devuelve undefined si no tiene empresas', () => {
    expect(pickInitialOrganization([], 'stark')).toBeUndefined()
  })
})