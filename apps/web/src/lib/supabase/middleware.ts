import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies'
import { apisPermitidas, paginasPermitidas, landingRestringido } from '@/lib/permisos'

type CookieToSet = { name: string; value: string; options?: Partial<ResponseCookie> }

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Partial<ResponseCookie>)
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Rutas públicas que no requieren autenticación
  const pathname = request.nextUrl.pathname
  const publicPaths = new Set(['/', '/demo', '/login', '/auth/callback', '/auth/error', '/privacidad'])
  const isPublicPath =
    publicPaths.has(pathname) ||
    pathname.startsWith('/demo/') ||
    pathname === '/api/lead' ||
    // Webhooks server-to-server (validan firma propia, no sesión Supabase)
    pathname === '/api/email/inbound'

  // Si no hay usuario y no es una ruta pública, redirigir a login
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Si hay usuario y está en login, redirigir al dashboard
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Gating de usuarios RESTRINGIDOS (permisos no vacío): solo pueden ver los
  // módulos habilitados. Este es el candado de servidor; la UI solo acompaña.
  if (user && !isPublicPath) {
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('permisos')
      .eq('id', user.id)
      .single()
    const permisos = ((usuario?.permisos as string[] | null) ?? []).filter(Boolean)

    if (permisos.length > 0) {
      if (pathname.startsWith('/api/')) {
        // Solo las APIs explícitamente habilitadas (match exacto de path;
        // p.ej. /api/sales/ranking sí, /api/sales/ranking/product no).
        const ok = apisPermitidas(permisos).includes(pathname)
        if (!ok) {
          return NextResponse.json({ error: 'No tienes acceso a esta sección' }, { status: 403 })
        }
      } else {
        const allowed = paginasPermitidas(permisos)
        const ok = allowed.some((p) => pathname === p || pathname.startsWith(`${p}/`))
        if (!ok) {
          const url = request.nextUrl.clone()
          url.pathname = landingRestringido(permisos)
          url.search = ''
          return NextResponse.redirect(url)
        }
      }
    }
  }

  return supabaseResponse
}
