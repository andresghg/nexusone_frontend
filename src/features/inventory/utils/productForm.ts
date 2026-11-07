import { PRODUCT_UNITS, type ProductFormValues } from '../schemas/inventorySchema'
import type { ProductRow } from '../types/inventory'

export const UNIT_LABEL: Record<ProductFormValues['unit'], string> = {
  un: 'Unidad',
  kg: 'Kilogramo',
  g: 'Gramo',
  lt: 'Litro',
  ml: 'Mililitro',
  m: 'Metro',
  caja: 'Caja',
  pack: 'Pack',
}

/** Valores iniciales del formulario para un producto nuevo. */
export const emptyProductValues = (): ProductFormValues => ({
  sku: '',
  barcode: '',
  name: '',
  description: '',
  unit: 'un',
  categoryId: '',
  price: 0,
  cost: 0,
  minStock: 0,
  trackStock: true,
  active: true,
  initialStock: 0,
})

/** Valores del formulario al editar un producto existente (el stock inicial no aplica). */
export const productToFormValues = (product: ProductRow): ProductFormValues => ({
  sku: product.sku,
  barcode: product.barcode ?? '',
  name: product.name,
  description: product.description ?? '',
  // Si la base trae una unidad que ya no está en la lista, se cae a 'un' en vez de romper el formulario
  unit: (PRODUCT_UNITS as readonly string[]).includes(product.unit)
    ? (product.unit as ProductFormValues['unit'])
    : 'un',
  categoryId: product.categoryId ?? '',
  price: product.price,
  cost: product.cost,
  minStock: product.minStock,
  trackStock: product.trackStock,
  active: product.active,
  initialStock: 0,
})
