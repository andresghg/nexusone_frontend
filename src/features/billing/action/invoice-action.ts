'use server'

import { revalidatePath } from 'next/cache'
import { getAuthUserId } from '@/lib/supabase/get-user-id'
import { revalidateShell } from '@/lib/revalidate-shell'
import {
  AddPaymentActionSchema,
  IssueCreditNoteActionSchema,
  IssueInvoiceActionSchema,
  SearchProductsActionSchema,
  VoidInvoiceActionSchema,
  VoidPaymentActionSchema,
  type AddPaymentActionInput,
  type IssueCreditNoteActionInput,
  type IssueInvoiceActionInput,
  type SearchProductsActionInput,
  type VoidInvoiceActionInput,
  type VoidPaymentActionInput,
} from '../schemas/invoiceSchema'
import { invoiceService } from '../services/InvoiceService'
import type { IssuedCreditNote, IssuedInvoice, ProductOption } from '../types/invoice'

const INVOICES_PATH = '/dashboard/[slug]/pos/facturacion'
const DETAIL_PATH = '/dashboard/[slug]/pos/facturacion/[id]'
const INVENTORY_PATH = '/dashboard/[slug]/pos/inventario'

const failure = (error: string) => ({ error, success: '' })

export async function issueInvoiceAction(
  input: IssueInvoiceActionInput,
): Promise<{ error: string; success: string; invoice?: IssuedInvoice }> {
  const data = IssueInvoiceActionSchema.safeParse(input)
  if (!data.success) return failure(data.error.issues[0]?.message ?? 'Datos inválidos')

  const userId = await getAuthUserId()
  if (!userId) return failure('Sesión no válida')

  try {
    const { organizationId, ...request } = data.data
    const result = await invoiceService.issue(userId, organizationId, request)
    if (result.error) return failure(result.error)

    // Emitir descuenta stock: se refrescan la lista de documentos y el inventario
    revalidatePath(INVOICES_PATH, 'page')
    revalidateShell() // la campana de notificaciones depende de cobros y stock
    revalidatePath(INVENTORY_PATH, 'page')
    return { error: '', success: result.success, invoice: result.invoice }
  } catch {
    return failure('No se pudo emitir el documento')
  }
}

export async function searchProductsAction(
  input: SearchProductsActionInput,
): Promise<{ error: string; products: ProductOption[] }> {
  const data = SearchProductsActionSchema.safeParse(input)
  if (!data.success) return { error: data.error.issues[0]?.message ?? 'Datos inválidos', products: [] }

  const userId = await getAuthUserId()
  if (!userId) return { error: 'Sesión no válida', products: [] }

  try {
    const products = await invoiceService.searchProducts(userId, data.data.organizationId, data.data.query)
    return { error: '', products }
  } catch {
    return { error: 'No se pudo buscar productos', products: [] }
  }
}

export async function voidInvoiceAction(input: VoidInvoiceActionInput) {
  const data = VoidInvoiceActionSchema.safeParse(input)
  if (!data.success) return failure(data.error.issues[0]?.message ?? 'Datos inválidos')

  const userId = await getAuthUserId()
  if (!userId) return failure('Sesión no válida')

  try {
    const { organizationId, ...request } = data.data
    const result = await invoiceService.voidInvoice(userId, organizationId, request)
    if (result.error) return failure(result.error)

    // Anular devuelve stock: se refrescan la lista de documentos, su detalle y el inventario
    revalidatePath(INVOICES_PATH, 'page')
    revalidateShell()
    revalidatePath(DETAIL_PATH, 'page')
    revalidatePath(INVENTORY_PATH, 'page')
    return { error: '', success: result.success }
  } catch {
    return failure('No se pudo anular el documento')
  }
}

export async function addPaymentAction(input: AddPaymentActionInput) {
  const data = AddPaymentActionSchema.safeParse(input)
  if (!data.success) return failure(data.error.issues[0]?.message ?? 'Datos inválidos')

  const userId = await getAuthUserId()
  if (!userId) return failure('Sesión no válida')

  try {
    const { organizationId, ...payment } = data.data
    const result = await invoiceService.addPayment(userId, organizationId, payment)
    if (result.error) return failure(result.error)

    revalidatePath(INVOICES_PATH, 'page') // cambia el estado de cobro que muestra la lista
    revalidateShell()
    revalidatePath(DETAIL_PATH, 'page')
    return { error: '', success: result.success }
  } catch {
    return failure('No se pudo registrar el cobro')
  }
}

export async function voidPaymentAction(input: VoidPaymentActionInput) {
  const data = VoidPaymentActionSchema.safeParse(input)
  if (!data.success) return failure(data.error.issues[0]?.message ?? 'Datos inválidos')

  const userId = await getAuthUserId()
  if (!userId) return failure('Sesión no válida')

  try {
    const { organizationId, ...request } = data.data
    const result = await invoiceService.voidPayment(userId, organizationId, request)
    if (result.error) return failure(result.error)

    revalidatePath(INVOICES_PATH, 'page')
    revalidateShell()
    revalidatePath(DETAIL_PATH, 'page')
    return { error: '', success: result.success }
  } catch {
    return failure('No se pudo anular el cobro')
  }
}

export async function issueCreditNoteAction(
  input: IssueCreditNoteActionInput,
): Promise<{ error: string; success: string; creditNote?: IssuedCreditNote }> {
  const data = IssueCreditNoteActionSchema.safeParse(input)
  if (!data.success) return failure(data.error.issues[0]?.message ?? 'Datos inválidos')

  const userId = await getAuthUserId()
  if (!userId) return failure('Sesión no válida')

  try {
    const { organizationId, ...request } = data.data
    const result = await invoiceService.issueCreditNote(userId, organizationId, request)
    if (result.error) return failure(result.error)

    // La nota cambia el saldo del documento y puede devolver stock: se refrescan lista, detalle e inventario
    revalidatePath(INVOICES_PATH, 'page')
    revalidateShell()
    revalidatePath(DETAIL_PATH, 'page')
    revalidatePath(INVENTORY_PATH, 'page')
    return { error: '', success: result.success, creditNote: result.creditNote }
  } catch {
    return failure('No se pudo emitir la nota de crédito')
  }
}
