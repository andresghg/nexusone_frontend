export interface AuthNavLink {
  href: string
  prompt: string
  action: string
}

export const authNavLinks: Record<string, AuthNavLink[]> = {
  '/auth/login': [
    { href: '/auth/registrar', prompt: '¿No tenés cuenta?', action: 'Registrate.' },
    { href: '/auth/recuperar-contrasena', prompt: '¿Olvidaste tu contraseña?', action: 'Recuperar contraseña' },
  ],
  '/auth/registrar': [
    { href: '/auth/login', prompt: '¿Ya tenés cuenta?', action: 'Iniciá sesión.' },
    { href: '/auth/recuperar-contrasena', prompt: '¿Olvidaste tu contraseña?', action: 'Recuperar contraseña' },
  ],
  '/auth/recuperar-contrasena': [
    { href: '/auth/login', prompt: '¿Ya te acordaste?', action: 'Iniciá sesión.' },
    { href: '/auth/registrar', prompt: '¿No tenés cuenta?', action: 'Registrate.' },
  ],
}