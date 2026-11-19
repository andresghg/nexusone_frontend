/**
 * Imprime un documento HTML sin salir de la aplicación ni mostrar el menú: lo carga en un iframe oculto
 * y abre el diálogo de impresión del navegador (desde donde también se guarda como PDF).
 * Solo se puede usar en el navegador.
 */
export function printHtml(html: string): void {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  frame.srcdoc = html

  const cleanup = () => frame.remove()
  frame.onload = () => {
    const printWindow = frame.contentWindow
    if (!printWindow) return cleanup()
    printWindow.onafterprint = cleanup
    printWindow.focus()
    printWindow.print()
    // Respaldo: si el navegador no avisa que terminó, el iframe no se queda para siempre
    setTimeout(cleanup, 60_000)
  }
  document.body.append(frame)
}
