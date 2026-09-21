'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useUser } from '@/hooks/use-user'
import { Button } from '@/components/ui/button'

/**
 * Pantalla para cuentas que existen pero no pueden entrar a ninguna sección:
 * sin empresa asignada (típico de quien entró con Google desde el landing) o
 * dadas de baja. Evita el bucle de redirecciones contra el resto de la app.
 */
function SinAccesoContenido() {
  const params = useSearchParams()
  const { user, signOut } = useUser()
  const inactivo = params.get('motivo') === 'inactivo'

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 text-center">
        <div className="mx-auto mb-4 h-11 w-11 rounded-full bg-amber-50 flex items-center justify-center">
          <ShieldAlert className="h-5 w-5 text-amber-600" />
        </div>
        <h1 className="text-lg font-semibold text-slate-800">
          {inactivo ? 'Tu cuenta está desactivada' : 'Tu cuenta todavía no tiene acceso'}
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          {inactivo
            ? 'Un administrador de tu empresa desactivó esta cuenta. Escribile si creés que es un error.'
            : 'Iniciaste sesión correctamente, pero tu usuario no está asociado a ninguna empresa. Pedile a un administrador que te invite desde Configuración → Usuarios.'}
        </p>
        {user?.email && <p className="mt-3 text-xs text-slate-400">Ingresaste como {user.email}</p>}
        <Button variant="outline" className="mt-5 w-full" onClick={() => signOut()}>
          Cerrar sesión
        </Button>
      </div>
    </div>
  )
}

export default function SinAccesoPage() {
  return (
    <Suspense fallback={null}>
      <SinAccesoContenido />
    </Suspense>
  )
}
