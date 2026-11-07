import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type Breakpoint = 'sm' | 'md' | 'lg'

/** Una columna de la tabla. `cell` recibe la fila y devuelve lo que se muestra. */
export type DataTableColumn<T> = {
  id: string
  header: ReactNode
  cell: (row: T) => ReactNode
  align?: 'left' | 'center' | 'right'
  /** Oculta la columna en pantallas más angostas que este punto (útil en móvil). */
  hideBelow?: Breakpoint
  className?: string
}

export type RowActionConfirm = {
  title: string
  description: string
  confirmLabel?: string
}

/** Una acción del menú de una fila. El módulo decide cuáles incluir (p. ej. según permisos). */
export type RowAction = {
  id: string
  label: string
  icon?: LucideIcon
  variant?: 'default' | 'destructive'
  separatorBefore?: boolean
  /** Si se define, se pide confirmación antes de ejecutar `onSelect`. */
  confirm?: RowActionConfirm
  /**
   * Si devuelve una promesa, el menú queda deshabilitado hasta que termine.
   * Debe manejar sus propios errores (por ejemplo, con un aviso al usuario).
   */
  onSelect: () => void | Promise<void>
}

/** Un control de la barra de filtros. `key` es el campo del `QuerySpec` que controla. */
export type ToolbarControl =
  | { type: 'search'; key: string; placeholder: string; ariaLabel: string }
  | {
      type: 'select'
      key: string
      ariaLabel: string
      options: { value: string; label: string }[]
      /** Etiqueta de la opción "sin filtro" (valor ''). Sin ella, el select no tiene opción vacía. */
      emptyOption?: string
      className?: string
    }
  | { type: 'toggle'; key: string; label: string; icon?: LucideIcon }
