'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ClipboardPaste, Loader2, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Logo de un proveedor.
 *
 * `mix-blend-multiply` funde el fondo blanco con el de la tarjeta. Es lo que
 * hace falta casi siempre, porque los logos se pegan desde una web o un mail
 * y vienen con fondo blanco. Recortar el blanco de verdad se comería las
 * partes blancas del propio logo, así que no se toca el archivo.
 *
 * Sin logo cae a las iniciales sobre un color derivado del nombre: siempre el
 * mismo para el mismo proveedor, para que se reconozca igual en el dashboard,
 * la ficha y los pedidos.
 */

const TONOS = [
  'bg-rose-100 text-rose-700', 'bg-amber-100 text-amber-700', 'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700', 'bg-teal-100 text-teal-700',
  'bg-orange-100 text-orange-700', 'bg-indigo-100 text-indigo-700',
]

function tono(nombre: string) {
  let h = 0
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) >>> 0
  return TONOS[h % TONOS.length]!
}

function iniciales(nombre: string) {
  return nombre
    .replace(/\b(S\.?A\.?S?|S\.?R\.?L\.?|SAS|SRL|SA)\b/gi, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}

/** Solo muestra. Es el que se reutiliza en listados, dashboard y pedidos. */
export function LogoProveedor({
  id,
  nombre,
  conLogo,
  size = 40,
  className,
}: {
  id: string
  nombre: string
  conLogo: boolean
  size?: number
  className?: string
}) {
  const [falló, setFalló] = useState(false)
  const lado = { width: size, height: size }

  if (!conLogo || falló) {
    return (
      <span
        style={lado}
        title={nombre}
        className={cn(
          'grid shrink-0 place-items-center rounded-lg font-bold',
          size <= 32 ? 'text-[11px]' : size <= 48 ? 'text-sm' : 'text-lg',
          tono(nombre),
          className
        )}
      >
        {iniciales(nombre) || '?'}
      </span>
    )
  }
  return (
    <span style={lado} className={cn('grid shrink-0 place-items-center overflow-hidden rounded-lg bg-white', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/proveedores/${id}/logo`}
        alt={nombre}
        onError={() => setFalló(true)}
        className="max-h-full max-w-full object-contain mix-blend-multiply"
      />
    </span>
  )
}

/** Con subida: archivo, arrastrar o pegar del portapapeles. */
export function LogoProveedorEditable({
  id,
  nombre,
  conLogo,
  size = 72,
}: {
  id: string
  nombre: string
  conLogo: boolean
  size?: number
}) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const zonaRef = useRef<HTMLDivElement>(null)
  const [version, setVersion] = useState(0)

  const subir = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/proveedores/${id}/logo`, { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'No se pudo subir')
      return json
    },
    onSuccess: () => {
      setVersion((v) => v + 1)
      qc.invalidateQueries({ queryKey: ['proveedor', id] })
      qc.invalidateQueries({ queryKey: ['proveedores'] })
      toast.success('Logo actualizado')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const quitar = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/proveedores/${id}/logo`, { method: 'DELETE' })
      if (!res.ok) throw new Error('No se pudo quitar')
    },
    onSuccess: () => {
      setVersion((v) => v + 1)
      qc.invalidateQueries({ queryKey: ['proveedor', id] })
      qc.invalidateQueries({ queryKey: ['proveedores'] })
      toast.success('Logo quitado')
    },
  })

  // Pegar con ⌘V mientras el bloque tiene el foco o el mouse encima. Es la
  // forma natural de traer un logo: se copia de la web del proveedor y se pega.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const zona = zonaRef.current
      if (!zona) return
      const dentro = zona.matches(':hover') || zona.contains(document.activeElement)
      if (!dentro) return
      const img = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'))
      if (!img) return
      const file = img.getAsFile()
      if (file) {
        e.preventDefault()
        subir.mutate(file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [subir])

  return (
    <div
      ref={zonaRef}
      tabIndex={0}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const file = e.dataTransfer.files?.[0]
        if (file) subir.mutate(file)
      }}
      className="group relative shrink-0 rounded-lg outline-none ring-offset-2 focus:ring-2 focus:ring-slate-300"
      title="Clic para subir, o pegá una imagen con ⌘V"
    >
      <LogoProveedor
        key={version}
        id={id}
        nombre={nombre}
        conLogo={conLogo}
        size={size}
        className="border border-slate-200"
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/webp,image/jpeg,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) subir.mutate(file)
          e.target.value = ''
        }}
      />

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={subir.isPending}
        aria-label="Subir logo"
        className="absolute inset-0 grid place-items-center rounded-lg bg-slate-900/60 text-white opacity-0 transition group-hover:opacity-100 group-focus:opacity-100"
      >
        {subir.isPending ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <span className="flex flex-col items-center gap-0.5">
            <Upload className="h-4 w-4" />
            <ClipboardPaste className="h-3 w-3 opacity-70" />
          </span>
        )}
      </button>

      {conLogo && (
        <button
          type="button"
          onClick={() => quitar.mutate()}
          aria-label="Quitar logo"
          className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 opacity-0 shadow-sm transition hover:text-slate-900 group-hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
