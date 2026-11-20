'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  Mail,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  ExternalLink,
  Pencil,
  Inbox,
  KeyRound,
} from 'lucide-react'

export interface EmailCasilla {
  casilla: string | null
  dominio: string
  direccion: string | null
}

export interface EmailRecibido {
  id: string
  fecha: string
  remitente: string
  destinatario: string
  asunto: string
  resultado: string
  detalle: string | null
  adjuntos: number
  codigo: string | null
  link: string | null
  solicitante: string | null
}

const RESULTADOS: Record<string, { label: string; className: string }> = {
  PROCESADO: { label: 'Procesado', className: 'bg-green-100 text-green-700' },
  SIN_ADJUNTO: { label: 'Sin adjunto: revisar a mano', className: 'bg-amber-100 text-amber-800' },
  DUPLICADO: { label: 'Duplicado', className: 'bg-slate-100 text-slate-600' },
  NO_RESUELTO: { label: 'No resuelto', className: 'bg-slate-100 text-slate-600' },
  MAXIREST: { label: 'Cierre Maxirest', className: 'bg-blue-100 text-blue-700' },
  CONFIRMACION_GMAIL: { label: 'Confirmación de Gmail', className: 'bg-purple-100 text-purple-700' },
  ERROR: { label: 'Error', className: 'bg-red-100 text-red-700' },
}

// La confirmación de Gmail se muestra destacada mientras sea reciente.
const DIAS_CONFIRMACION_VISIBLE = 7

function formatFecha(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function BotonCopiar({ texto, label }: { texto: string; label?: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        navigator.clipboard.writeText(texto)
        setCopiado(true)
        setTimeout(() => setCopiado(false), 2000)
      }}
    >
      {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {label && <span className="ml-1.5">{label}</span>}
    </Button>
  )
}

export function EmailCasillaCard({ email, recibidos }: { email: EmailCasilla | undefined; recibidos: EmailRecibido[] }) {
  const queryClient = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [slug, setSlug] = useState('')

  const guardarCasilla = useMutation({
    mutationFn: async (casillaEmail: string) => {
      const res = await fetch('/api/configuracion/canales', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ casillaEmail }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Error al guardar')
      return body
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canales'] })
      setEditando(false)
      toast.success('Casilla actualizada')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const dominio = email?.dominio ?? 'axp.com.ar'
  const direccion = email?.direccion ?? null

  const limite = Date.now() - DIAS_CONFIRMACION_VISIBLE * 24 * 60 * 60 * 1000
  const confirmacion = recibidos.find(
    (r) => r.resultado === 'CONFIRMACION_GMAIL' && new Date(r.fecha).getTime() >= limite
  )

  const empezarEdicion = () => {
    setSlug(email?.casilla ?? '')
    setEditando(true)
  }

  return (
    <div className="bg-white border rounded-lg p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <Mail className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold">Email</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              Las facturas que lleguen a la casilla de tu empresa se cargan solas
            </p>
          </div>
        </div>
        {direccion && (
          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">Activo</span>
        )}
      </div>

      <div className="mt-4 pt-4 border-t space-y-5">
        {/* Casilla */}
        <div>
          <label className="block text-xs text-slate-500 uppercase tracking-wider mb-1">
            Dirección de recepción
          </label>
          {editando || !direccion ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex flex-1 items-center rounded-md border">
                  <Input
                    className="border-0 font-mono focus-visible:ring-0 focus-visible:ring-offset-0"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s/g, ''))}
                    placeholder="miempresa"
                    maxLength={40}
                  />
                  <span className="px-3 text-sm font-mono text-slate-500 whitespace-nowrap">@{dominio}</span>
                </div>
                <Button
                  size="sm"
                  onClick={() => guardarCasilla.mutate(slug)}
                  disabled={guardarCasilla.isPending || !slug}
                >
                  {guardarCasilla.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                  Guardar
                </Button>
                {direccion && (
                  <Button variant="ghost" size="sm" onClick={() => setEditando(false)}>
                    Cancelar
                  </Button>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Minúsculas, números, punto o guión. Si la cambiás, la dirección vieja deja de funcionar: avisale a
                tus proveedores y actualizá el reenvío de Gmail.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-slate-100 rounded text-sm font-mono">{direccion}</code>
                <BotonCopiar texto={direccion} />
                <Button variant="ghost" size="sm" onClick={empezarEdicion} title="Cambiar casilla">
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Se acepta cualquier remitente. Solo se procesan adjuntos PDF; lo que no sea una factura queda
                rechazado en la revisión.
              </p>
            </>
          )}
        </div>

        {/* Confirmación de reenvío de Gmail */}
        {confirmacion && (
          <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="flex items-start gap-3">
              <KeyRound className="h-5 w-5 text-purple-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0 space-y-2">
                <div>
                  <p className="font-medium text-purple-900">Gmail pidió confirmar el reenvío</p>
                  <p className="text-sm text-purple-800">
                    {confirmacion.solicitante ? (
                      <>
                        <span className="font-mono">{confirmacion.solicitante}</span> quiere reenviar sus mails a esta
                        casilla.
                      </>
                    ) : (
                      'Llegó un pedido de reenvío automático desde Gmail.'
                    )}{' '}
                    <span className="text-purple-600">({formatFecha(confirmacion.fecha)})</span>
                  </p>
                </div>
                {confirmacion.codigo ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="px-3 py-2 bg-white border border-purple-200 rounded text-xl font-mono tracking-widest text-purple-900">
                      {confirmacion.codigo}
                    </code>
                    <BotonCopiar texto={confirmacion.codigo} label="Copiar código" />
                  </div>
                ) : (
                  <p className="text-sm text-purple-800">No pudimos leer el código. Asunto: {confirmacion.asunto}</p>
                )}
                {confirmacion.link && (
                  <a
                    href={confirmacion.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-purple-700 hover:underline"
                  >
                    Confirmar en Gmail <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                <p className="text-xs text-purple-700">
                  Pegá el código en Gmail (Configuración → Reenvío) o tocá el link. Después creá el filtro.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Instrucciones */}
        {direccion && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 space-y-3">
            <p className="font-medium text-slate-900">Cómo hacer que lleguen solas</p>
            <div>
              <p className="font-medium">Opción A: pasale la dirección a tus proveedores</p>
              <p className="text-slate-600 mt-0.5">
                Pediles que manden las facturas a <span className="font-mono">{direccion}</span> (o que la agreguen
                en copia). Es lo más simple.
              </p>
            </div>
            <div>
              <p className="font-medium">Opción B: reenvío automático desde Gmail</p>
              <ol className="list-decimal list-inside text-slate-600 mt-0.5 space-y-0.5">
                <li>
                  En Gmail andá a Configuración → Ver toda la configuración → Reenvío y correo POP/IMAP.
                </li>
                <li>
                  Tocá &quot;Agregar una dirección de reenvío&quot; y poné{' '}
                  <span className="font-mono">{direccion}</span>.
                </li>
                <li>
                  Gmail manda un código a esa casilla: va a aparecer acá arriba en unos segundos. Confirmalo con el
                  código o el link.
                </li>
                <li>
                  Creá un filtro (buscador → mostrar opciones), por ejemplo{' '}
                  <span className="font-mono">from:proveedor@ejemplo.com</span> o{' '}
                  <span className="font-mono">has:attachment filename:pdf</span>, y elegí &quot;Reenviar a&quot;{' '}
                  <span className="font-mono">{direccion}</span>.
                </li>
              </ol>
              <p className="text-xs text-slate-500 mt-1">
                No hace falta activar &quot;Reenviar una copia del correo entrante&quot; para todo: con el filtro
                alcanza.
              </p>
            </div>
          </div>
        )}

        {/* Últimos emails */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Inbox className="h-4 w-4 text-slate-500" />
            <label className="text-xs text-slate-500 uppercase tracking-wider">Últimos emails recibidos</label>
          </div>
          {recibidos.length === 0 ? (
            <p className="text-sm text-slate-500 italic">Todavía no llegó ningún email a esta casilla.</p>
          ) : (
            <div className="divide-y border rounded-lg max-h-96 overflow-y-auto">
              {recibidos.map((r) => {
                const info = RESULTADOS[r.resultado] ?? { label: r.resultado, className: 'bg-slate-100 text-slate-600' }
                return (
                  <div key={r.id} className="px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-slate-400 tabular-nums">{formatFecha(r.fecha)}</span>
                      <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${info.className}`}>
                        {info.label}
                      </span>
                      <span className="font-mono text-xs text-slate-600 truncate">{r.remitente}</span>
                    </div>
                    <p className="text-slate-800 truncate mt-0.5">{r.asunto || '(sin asunto)'}</p>
                    {r.detalle && r.resultado !== 'PROCESADO' && (
                      <p className="text-xs text-slate-500 mt-0.5 flex items-start gap-1">
                        {r.resultado === 'SIN_ADJUNTO' && <AlertCircle className="h-3 w-3 mt-0.5 shrink-0 text-amber-600" />}
                        {r.detalle}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
