'use client'

import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Image as ImageIcon, Loader2, Upload, X } from 'lucide-react'

/**
 * Logo de la empresa. Se guarda en R2 y se usa como encabezado del recetario.
 *
 * El `?v=` fuerza a recargar la imagen después de subir una nueva: el endpoint
 * la sirve con cache de un año, que es lo correcto porque la key cambia en
 * cada subida, pero la URL que usa esta pantalla no lleva key.
 */
export function LogoEmpresa({ logoKey }: { logoKey: string | null }) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [version, setVersion] = useState(0)

  const subir = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/configuracion/empresa/logo', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'No se pudo subir')
      return json as { logoKey: string }
    },
    onSuccess: () => {
      setVersion((v) => v + 1)
      qc.invalidateQueries({ queryKey: ['empresa'] })
      toast.success('Logo actualizado')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const quitar = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/configuracion/empresa', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logoKey: '' }),
      })
      if (!res.ok) throw new Error('No se pudo quitar')
    },
    onSuccess: () => {
      setVersion((v) => v + 1)
      qc.invalidateQueries({ queryKey: ['empresa'] })
      toast.success('Logo quitado')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="border-t pt-5">
      <p className="text-sm font-medium text-slate-700">Logo</p>
      <p className="mt-0.5 text-xs text-slate-500">
        Se muestra como encabezado del recetario. PNG, WEBP o JPG, hasta 2 MB.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <div className="grid h-20 w-40 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {logoKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/configuracion/empresa/logo?v=${version}`}
              alt="Logo de la empresa"
              className="max-h-full max-w-full object-contain p-2"
            />
          ) : (
            <ImageIcon className="h-7 w-7 text-slate-300" />
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/webp,image/jpeg"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) subir.mutate(file)
              e.target.value = ''
            }}
          />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={subir.isPending} className="gap-1.5">
            {subir.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {logoKey ? 'Cambiar logo' : 'Subir logo'}
          </Button>
          {logoKey && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => quitar.mutate()}
              disabled={quitar.isPending}
              className="gap-1.5 text-slate-500"
            >
              <X className="h-4 w-4" />
              Quitar
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
