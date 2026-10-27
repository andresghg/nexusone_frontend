
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })

          response = NextResponse.next({ request })

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const INACTIVITY_MS = 30 * 60 * 1000 // 30 minuto
  const ACTIVITY_COOKIE = 'last-activity'

  let {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (user) {
    const last = Number(
      request.cookies.get(ACTIVITY_COOKIE)?.value
    )

    if (last && Date.now() - last > INACTIVITY_MS) {
      await supabase.auth.signOut({ scope: 'local' })

      response.cookies.delete(ACTIVITY_COOKIE)
      user = null
    } else {
      response.cookies.set(
        ACTIVITY_COOKIE,
        String(Date.now()),
        {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
        }
      )
    }
  } else {
    response.cookies.delete(ACTIVITY_COOKIE)
  }

  const isProtected = pathname.startsWith('/dashboard')

  const isAuthPage =
    pathname.startsWith('/auth') &&
    !pathname.startsWith('/auth/callback') &&
    !pathname.startsWith('/auth/actualizar-contrasena')

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone()
    url.pathname = path

    const redirect = NextResponse.redirect(url)

    response.cookies.getAll().forEach((cookie) => {
      redirect.cookies.set(cookie)
    })

    return redirect
  }

  if (!user && isProtected) {
    return redirectTo('/auth/login')
  }

  if (user && isAuthPage) {
    return redirectTo('/dashboard')
  }

  return response
}
