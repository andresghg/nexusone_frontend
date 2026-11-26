import { revalidatePath } from 'next/cache'

/**
 * Refresca el layout del dashboard (campana de notificaciones y badge de stock bajo del sidebar).
 * `revalidatePath(..., 'page')` solo refresca la pantalla: el layout no se vuelve a renderizar al navegar,
 * así que sin esto esos avisos quedarían desactualizados hasta recargar el navegador.
 */
export function revalidateShell() {
  revalidatePath('/dashboard/[slug]', 'layout')
}
