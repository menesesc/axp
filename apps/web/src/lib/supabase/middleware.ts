import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies'
import {
  esRutaComun,
  landingDe,
  nivelRequerido,
  puedeAbrirRuta,
} from '@/lib/permisos'

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
    // Webhooks y jobs server-to-server (validan su propio token, no sesión)
    pathname === '/api/email/inbound' ||
    pathname === '/api/jobs/sales-reports/tick'

  // Si no hay usuario y no es una ruta pública, redirigir a login
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Si hay usuario y está en login, mandarlo a la primera página que puede ver
  if (user && pathname === '/login') {
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('rol, tipo_acceso, permisos')
      .eq('id', user.id)
      .single()
    const esAdmin =
      usuario?.tipo_acceso === 'ADMIN' || usuario?.rol === 'ADMIN' || usuario?.rol === 'SUPERADMIN'
    const url = request.nextUrl.clone()
    url.pathname = esAdmin
      ? '/dashboard'
      : landingDe({ esAdmin, permisos: ((usuario?.permisos as string[] | null) ?? []).filter(Boolean) })
    return NextResponse.redirect(url)
  }

  // Gating por matriz de permisos. Este es el candado de servidor: resuelve a
  // qué módulo pertenece la ruta y compara el nivel del usuario contra lo que
  // pide el método (GET = ver, POST/PATCH/PUT/DELETE = editar).
  if (user && !isPublicPath && !esRutaComun(pathname)) {
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('rol, tipo_acceso, permisos, activo, clienteId')
      .eq('id', user.id)
      .single()

    const esAdmin =
      usuario?.tipo_acceso === 'ADMIN' || usuario?.rol === 'ADMIN' || usuario?.rol === 'SUPERADMIN'

    // Cuenta dada de baja, o sin empresa asignada. Esto último pasa cuando
    // alguien entra con "Continuar con Google" desde el landing: el trigger
    // on_auth_user_created le crea la fila en `usuarios` sin clienteId. Sin
    // empresa no hay datos que mostrar, así que no entra a ninguna sección.
    const desactivado = usuario?.activo === false
    const sinEmpresa = !esAdmin && !usuario?.clienteId

    if (desactivado || sinEmpresa) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: desactivado ? 'Tu cuenta está desactivada' : 'No tenés una empresa asignada' },
          { status: 403 }
        )
      }
      const url = request.nextUrl.clone()
      url.pathname = '/sin-acceso'
      url.search = desactivado ? '?motivo=inactivo' : ''
      return NextResponse.redirect(url)
    }

    if (!esAdmin) {
      const permisos = ((usuario?.permisos as string[] | null) ?? []).filter(Boolean)
      const sujeto = { esAdmin, permisos }
      const esApi = pathname.startsWith('/api/')

      // Ruta no declarada en SECCIONES: se deniega por defecto. Al agregar una
      // pestaña o página nueva hay que declararla (o en las rutas comunes).
      // Una página que comparten varias secciones (las pestañas de /ventas) se
      // abre con tener una sola; las APIs resuelven a una única sección.
      const minimo = esApi ? nivelRequerido(request.method) : 'view'
      const permitido = puedeAbrirRuta(sujeto, pathname, minimo)

      if (!permitido) {
        if (esApi) {
          return NextResponse.json(
            {
              error:
                minimo === 'edit'
                  ? 'No tenés permiso para modificar esta sección'
                  : 'No tenés acceso a esta sección',
            },
            { status: 403 }
          )
        }
        const url = request.nextUrl.clone()
        url.pathname = landingDe(sujeto)
        url.search = ''
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}
