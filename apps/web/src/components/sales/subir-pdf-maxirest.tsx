'use client'

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

/** Botón para importar a mano el PDF de un cierre de caja de Maxirest. */
export function SubirPdfMaxirest() {
  const queryClient = useQueryClient()
  const [subiendo, setSubiendo] = useState(false)
  const archivo = useRef<HTMLInputElement>(null)

  async function subir(file: File) {
    setSubiendo(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/sales/closures/upload', { method: 'POST', body: form })
      const body = await res.json()
      if (res.ok && body.status === 'OK') {
        toast.success(`Cierre #${body.nroCierre} del ${body.fecha} importado`)
        for (const k of ['sales-closures', 'sales-ranking', 'sales-waiters', 'sales-payments', 'sales-by-shift']) {
          queryClient.invalidateQueries({ queryKey: [k] })
        }
      } else {
        toast.error(body.message || 'No se pudo procesar el PDF')
      }
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSubiendo(false)
      if (archivo.current) archivo.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={archivo}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) subir(f)
        }}
      />
      <Button variant="outline" onClick={() => archivo.current?.click()} disabled={subiendo}>
        {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 text-[#3b9bff]" />}
        {subiendo ? 'Procesando…' : 'Subir cierre de Maxirest'}
      </Button>
    </>
  )
}
