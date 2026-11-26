import 'server-only'
import type {
  AddPaymentCommand,
  CreditContext,
  InvoiceDetail,
  InvoiceQueryFilters,
  IssueCommand,
  IssueCreditNoteCommand,
  IssueCreditNoteOutcome,
  IssueOutcome,
  IssuedCreditNote,
  IssuedInvoice,
  IssuerSnapshot,
  PaymentOutcome,
  ProductOption,
  SaleProduct,
  VoidCommand,
  VoidOutcome,
  VoidPaymentCommand,
  VoidPaymentOutcome,
} from '../types/invoice'
import { CreditNotes } from './invoice/CreditNotes'
import { InvoiceIssuing } from './invoice/InvoiceIssuing'
import { InvoicePayments } from './invoice/InvoicePayments'
import { InvoiceQueries } from './invoice/InvoiceQueries'
import { InvoiceVoiding } from './invoice/InvoiceVoiding'
import type { InvoicePageResult, Pagination } from './invoice/shared'

export type { InvoicePageResult, Pagination }

// Regla del módulo: `organizationId` es SIEMPRE el primer parámetro y filtra toda consulta.
export interface IInvoiceRepository {
  /** Productos por id, con su precio y estado reales. Los que no existen en la empresa no vienen. */
  findProducts(organizationId: string, productIds: string[]): Promise<SaleProduct[]>
  /** Productos activos para el buscador: por nombre, SKU o código de barras (el que coincide exacto va primero). */
  searchProducts(organizationId: string, term: string, limit: number): Promise<ProductOption[]>
  /** Datos de la empresa que se copian al documento al emitirlo. */
  findIssuer(organizationId: string): Promise<IssuerSnapshot>
  findByIdempotencyKey(organizationId: string, key: string): Promise<IssuedInvoice | undefined>
  /** Documentos emitidos o anulados (nunca borradores), del más reciente al más antiguo. */
  findPage(organizationId: string, filters: InvoiceQueryFilters, pagination: Pagination): Promise<InvoicePageResult>
  /** Un documento con sus líneas y pagos. `today` (YYYY-MM-DD, zona de la empresa) define si está vencido. */
  findDetail(organizationId: string, invoiceId: string, today: string): Promise<InvoiceDetail | undefined>
  /** Registra un cobro (completo o parcial) y actualiza el estado de pago, en una transacción. */
  addPayment(organizationId: string, command: AddPaymentCommand): Promise<PaymentOutcome>
  /** Anula un cobro (queda quién, cuándo y por qué) y recalcula el estado de pago. */
  voidPayment(organizationId: string, command: VoidPaymentCommand): Promise<VoidPaymentOutcome>
  /**
   * Emite el documento en UNA transacción: bloquea los productos, verifica que nada cambió y que
   * alcanza el stock, toma el siguiente número, guarda documento y líneas y descuenta el stock.
   * Si cualquier paso falla no queda nada guardado (ni número consumido).
   */
  issue(organizationId: string, command: IssueCommand): Promise<IssueOutcome>
  /** Anula un documento emitido y devuelve el stock, en una sola transacción. */
  voidInvoice(organizationId: string, command: VoidCommand): Promise<VoidOutcome>
  /** Las líneas de un documento emitido con lo ya acreditado. Undefined si no existe, no está emitido o es una nota. */
  findCreditContext(organizationId: string, invoiceId: string): Promise<CreditContext | undefined>
  findCreditNoteByIdempotencyKey(organizationId: string, key: string): Promise<IssuedCreditNote | undefined>
  /**
   * Emite una nota de crédito en UNA transacción: bloquea el documento original, calcula los montos con lo que
   * quedaba por acreditar, toma el siguiente número NC, guarda nota y líneas, devuelve el stock elegido y
   * recalcula el estado de cobro del original. La base vuelve a verificar los topes. Si algo falla no queda nada.
   */
  issueCreditNote(organizationId: string, command: IssueCreditNoteCommand): Promise<IssueCreditNoteOutcome>
}

/**
 * Punto de entrada del repositorio de documentos. La implementación vive en `./invoice/`, partida por tema
 * (consultas, cobros, emisión, notas de crédito, anulación); aquí solo se delega, así el resto del sistema
 * sigue importando un único `invoiceRepository`.
 */
class InvoiceRepository implements IInvoiceRepository {
  private readonly queries = new InvoiceQueries()
  private readonly payments = new InvoicePayments()
  private readonly issuing = new InvoiceIssuing(this.queries)
  private readonly creditNotes = new CreditNotes()
  private readonly voiding = new InvoiceVoiding()

  findProducts: IInvoiceRepository['findProducts'] = (...args) => this.queries.findProducts(...args)
  searchProducts: IInvoiceRepository['searchProducts'] = (...args) => this.queries.searchProducts(...args)
  findIssuer: IInvoiceRepository['findIssuer'] = (...args) => this.queries.findIssuer(...args)
  findByIdempotencyKey: IInvoiceRepository['findByIdempotencyKey'] = (...args) => this.queries.findByIdempotencyKey(...args)
  findPage: IInvoiceRepository['findPage'] = (...args) => this.queries.findPage(...args)
  findDetail: IInvoiceRepository['findDetail'] = (...args) => this.queries.findDetail(...args)
  addPayment: IInvoiceRepository['addPayment'] = (...args) => this.payments.addPayment(...args)
  voidPayment: IInvoiceRepository['voidPayment'] = (...args) => this.payments.voidPayment(...args)
  issue: IInvoiceRepository['issue'] = (...args) => this.issuing.issue(...args)
  voidInvoice: IInvoiceRepository['voidInvoice'] = (...args) => this.voiding.voidInvoice(...args)
  findCreditContext: IInvoiceRepository['findCreditContext'] = (...args) => this.creditNotes.findCreditContext(...args)
  findCreditNoteByIdempotencyKey: IInvoiceRepository['findCreditNoteByIdempotencyKey'] = (...args) =>
    this.creditNotes.findCreditNoteByIdempotencyKey(...args)
  issueCreditNote: IInvoiceRepository['issueCreditNote'] = (...args) => this.creditNotes.issueCreditNote(...args)
}

export const invoiceRepository = new InvoiceRepository()
