import { createClient } from './server'

/** Id del usuario autenticado en el servidor (o undefined si no hay sesión). */
export async function getAuthUserId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id
}
