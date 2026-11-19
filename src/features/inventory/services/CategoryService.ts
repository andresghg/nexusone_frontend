import { isUniqueViolation } from '@/db/pg-errors'
import {
  accessService,
  type IAccessResolver,
} from '@/features/organization/services/AccessService'
import { categoryRepository, type ICategoryRepository } from './CategoryRepository'

const fail = (error: string) => ({ error, success: '' })
const NO_WRITE = 'No tienes permisos para modificar el inventario'
const DUPLICATE = 'Ya existe una categoría con ese nombre'

export class CategoryService {
  constructor(
    private categories: ICategoryRepository,
    private access: IAccessResolver,
  ) {}

  async list(userId: string, organizationId: string) {
    const access = await this.access.authorize(userId, organizationId, 'pos.inventario.read')
    return access ? this.categories.findAll(access.organizationId) : []
  }

  async create(userId: string, organizationId: string, name: string) {
    const access = await this.access.authorize(userId, organizationId, 'pos.inventario.write')
    if (!access) return fail(NO_WRITE)

    try {
      await this.categories.create(access.organizationId, name.trim())
    } catch (error) {
      if (isUniqueViolation(error)) return fail(DUPLICATE)
      throw error
    }
    return { error: '', success: 'Categoría creada' }
  }

  async rename(userId: string, organizationId: string, categoryId: string, name: string) {
    const access = await this.access.authorize(userId, organizationId, 'pos.inventario.write')
    if (!access) return fail(NO_WRITE)

    try {
      const renamed = await this.categories.rename(access.organizationId, categoryId, name.trim())
      if (!renamed) return fail('La categoría no existe')
    } catch (error) {
      if (isUniqueViolation(error)) return fail(DUPLICATE)
      throw error
    }
    return { error: '', success: 'Categoría actualizada' }
  }

  // Los productos de la categoría borrada quedan "sin categoría"; no se pierden.
  async remove(userId: string, organizationId: string, categoryId: string) {
    const access = await this.access.authorize(userId, organizationId, 'pos.inventario.write')
    if (!access) return fail(NO_WRITE)

    const removed = await this.categories.remove(access.organizationId, categoryId)
    if (!removed) return fail('La categoría no existe')
    return { error: '', success: 'Categoría eliminada' }
  }
}

export const categoryService = new CategoryService(categoryRepository, accessService)
