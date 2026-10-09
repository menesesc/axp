'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Loader2, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Escena, type NombreEscena } from '@/components/layout/escenas'

const MOMENTOS: Array<{ escena: NombreEscena; titulo: string; texto: string }> = [
  { escena: 'comprobantes', titulo: 'Tus facturas se cargan solas', texto: 'Reenviás el mail o sacás una foto y AXP lee cada dato por vos.' },
  { escena: 'pagos', titulo: 'Sabés qué pagar y cuándo', texto: 'Órdenes de pago, cheques y eCheq, con los vencimientos de la semana a la vista.' },
  { escena: 'stock', titulo: 'Pedís antes de quedarte sin nada', texto: 'Stock por depósito y compras sugeridas según lo que venís vendiendo.' },
  { escena: 'ventas', titulo: 'Cada turno, cerrado y medido', texto: 'Los cierres de caja entran solos y ves cómo te fue al mediodía y a la noche.' },
]

function GoogleIcono() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [momento, setMomento] = useState(0)

  // Rota la escena cada pocos segundos (se detiene si el usuario pidió menos movimiento).
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setMomento((m) => (m + 1) % MOMENTOS.length), 5500)
    return () => clearInterval(t)
  }, [])

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      })
      if (error) throw error
    } catch (err) {
      console.error('Error during login:', err)
      setError('No pudimos conectar con Google. Probá de nuevo en unos segundos.')
      setIsLoading(false)
    }
  }

  const actual = MOMENTOS[momento]!

  return (
    <div className="ax grid min-h-[100dvh] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* Lado de la marca: escena que muestra lo que hace AXP */}
      <section className="relative hidden overflow-hidden border-r border-[var(--borde)] lg:flex lg:flex-col">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(60% 50% at 50% 45%, rgba(59,155,255,0.18), transparent 70%), radial-gradient(rgba(31,111,209,0.14) 1px, transparent 1.2px) 0 0 / 18px 18px',
            WebkitMaskImage: 'radial-gradient(70% 70% at 50% 45%, #000 40%, transparent)',
            maskImage: 'radial-gradient(70% 70% at 50% 45%, #000 40%, transparent)',
          }}
        />
        <div className="relative z-10 p-10">
          <Image src="/marca/axp-logo.png" alt="AXP" width={104} height={48} priority />
        </div>
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-10">
          <div key={actual.escena} className="ax-entra aspect-[300/244] w-full max-w-[34rem]">
            <Escena nombre={actual.escena} />
          </div>
          <div key={`t-${momento}`} className="ax-entra mt-6 max-w-md text-center">
            <h2 className="ax-display text-[1.75rem] font-semibold leading-tight">{actual.titulo}</h2>
            <p className="mt-2 text-[15px] text-[var(--sec)]">{actual.texto}</p>
          </div>
          <div className="mt-6 flex gap-2" role="tablist" aria-label="Qué hace AXP">
            {MOMENTOS.map((m, i) => (
              <button
                key={m.escena}
                type="button"
                role="tab"
                aria-selected={i === momento}
                aria-label={m.titulo}
                onClick={() => setMomento(i)}
                className={`h-1.5 rounded-full transition-all duration-500 ${i === momento ? 'w-8 bg-[var(--azul)]' : 'w-1.5 bg-slate-900/15 hover:bg-slate-900/30'}`}
              />
            ))}
          </div>
        </div>
        <p className="relative z-10 p-10 text-xs text-[var(--ter)]">
          Un producto de{' '}
          <a href="https://southbit.dev" className="font-medium text-[var(--sec)] hover:text-[var(--texto)]" target="_blank" rel="noreferrer">
            southbit
          </a>
        </p>
      </section>

      {/* Acceso */}
      <main className="flex flex-col items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center lg:items-start lg:text-left">
            <div className="mb-6 lg:hidden">
              <Image src="/marca/axp-logo.png" alt="AXP" width={96} height={44} priority />
            </div>
            <div className="mx-auto mb-4 h-40 w-full max-w-[16rem] lg:hidden" aria-hidden>
              <Escena nombre="inicio" />
            </div>
            <h1 className="ax-display text-[2rem] font-semibold leading-tight">Entrá a tu cuenta</h1>
            <p className="mt-2 text-[15px] text-[var(--sec)]">Compras, pagos, stock y ventas de tu negocio en un solo lugar.</p>
          </div>

          <section className="ax-card ax-entra p-6 sm:p-7">
            {error && (
              <div role="alert" className="mb-4 rounded-xl border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.06)] px-4 py-3 text-sm text-[var(--rojo-t)]">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-900/[0.14] bg-white text-[15px] font-medium text-[var(--texto)] shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition-[background-color,box-shadow,transform] hover:bg-slate-50 hover:shadow-[0_8px_24px_-12px_rgba(15,35,70,0.3)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleIcono />}
              {isLoading ? 'Conectando con Google…' : 'Continuar con Google'}
            </button>

            <p className="mt-5 flex items-start gap-2 text-xs text-[var(--ter)]">
              <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-[var(--verde)]" />
              Entrás con tu cuenta de Google: AXP no guarda tu contraseña. Si es tu primera vez, el administrador de tu empresa tiene que haberte invitado.
            </p>
          </section>

          <p className="mt-6 text-center text-xs text-[var(--ter)] lg:text-left">
            Al entrar aceptás la{' '}
            <Link href="/privacidad" className="text-[var(--azul-2)] hover:underline">
              política de privacidad
            </Link>
            .{' '}
            <Link href="/" className="text-[var(--azul-2)] hover:underline">
              Conocé AXP
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
