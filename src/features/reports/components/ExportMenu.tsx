'use client'

import { Download, FileSpreadsheet, Printer } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { printHtml } from '@/features/billing/utils/printHtml'
import type { ReportData } from '../types/report'
import { buildReportHtml } from '../utils/reportHtml'

type Props = {
  data: ReportData
  companyName: string
  excelHref: string // la descarga del servidor, con los mismos parámetros que la pantalla
  print?: (html: string) => void
}

/** "Exportar": imprimir o guardar como PDF (diálogo del navegador) y descargar a Excel. Sin reporte no hay qué exportar. */
export function ExportMenu({ data, companyName, excelHref, print = printHtml }: Props) {
  const exportable = !('error' in data)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" disabled={!exportable}>
          <Download aria-hidden />
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={!exportable}
          onSelect={() => {
            if (!('error' in data)) print(buildReportHtml(data, { companyName, generatedAt: new Date() }))
          }}
        >
          <Printer aria-hidden />
          Imprimir o guardar como PDF
        </DropdownMenuItem>
        <DropdownMenuItem asChild disabled={!exportable}>
          {/* Un enlace normal (no de la app): es una descarga, no una navegación */}
          <a href={excelHref} download>
            <FileSpreadsheet aria-hidden />
            Descargar Excel (.xlsx)
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
