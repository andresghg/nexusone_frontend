// Lista blanca: solo se permite volver a una invitación. Evita redirecciones abiertas
// (?next=https://sitio-malicioso.com).
export function safeNext(next?: string) {
  return next && /^\/invitacion\/[A-Za-z0-9_-]+$/.test(next) ? next : '/dashboard'
}