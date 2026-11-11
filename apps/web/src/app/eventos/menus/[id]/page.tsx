'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Archive, ArrowLeft, Copy, Trash2 } from 'lucide-react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Campo, avisarError, claseSelect, claseTextarea, enviar } from '@/components/eventos/comunes'
import { MenuConReferencia } from '@/components/eventos/menu-tab'
import { useUser } from '@/hooks/use-user'
import { SECCION } from '@/lib/permisos'
import { IVA_MODOS, parsearMonto, type IvaModo } from '@/lib/eventos/constantes'
import type { MenuDetalle } from '@/lib/eventos/menus'

/**
 * Una plantilla de la biblioteca. Sin evento no hay precio por cubierto, así
 * que se puede probar uno ("¿y si lo cobro 60.000 más IVA?") para ver contra
 * la carta antes de cotizar.
 */
export default function PlantillaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const qc = useQueryClient()
  const { canEdit } = useUser()
  const puedeEditar = canEdit(SECCION.EVENTOS_RESERVAS)
  const { data, error } = useQuery({
    queryKey: ['eventos-menu', id],
    queryFn: async () => {
      const res = await fetch(`/api/eventos/menus/${id}`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'No se pudo cargar el menú')
      return res.json() as Promise<{ menu: MenuDetalle; verImportes: boolean }>
    },
  })
  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['eventos-menu', id] })
    qc.invalidateQueries({ queryKey: ['eventos-plantillas'] })
  }
  const m = data?.menu
  const [cabecera, setCabecera] = useState({ nombre: '', descripcion: '' })
  useEffect(() => {
    if (m) setCabecera({ nombre: m.nombre, descripcion: m.descripcion ?? '' })
  }, [m])
  const [prueba, setPrueba] = useState({ adulto: '', menor: '', ivaModo: 'FINAL' as IvaModo })

  const guardar = useMutation({
    mutationFn: (cuerpo: Record<string, unknown>) => enviar(`/api/eventos/menus/${id}`, 'PATCH', cuerpo),
    onSuccess: () => {
      toast.success('Guardado')
      refrescar()
    },
    onError: avisarError,
  })
  const duplicar = useMutation({
    mutationFn: () => enviar('/api/eventos/menus', 'POST', { desdeId: id, nombre: `${m?.nombre} (copia)` }),
    onSuccess: (x: { id: string }) => {
      toast.success('Menú duplicado')
      qc.invalidateQueries({ queryKey: ['eventos-plantillas'] })
      router.push(`/eventos/menus/${x.id}` as Route)
    },
    onError: avisarError,
  })
  const borrar = useMutation({
    mutationFn: () => enviar(`/api/eventos/menus/${id}`, 'DELETE'),
    onSuccess: () => {
      toast.success('Menú borrado')
      qc.invalidateQueries({ queryKey: ['eventos-plantillas'] })
      router.replace('/eventos/menus' as Route)
    },
    onError: avisarError,
  })

  if (error) {
    return (
      <DashboardLayout>
        <p className="py-10 text-center text-sm text-[var(--sec)]">{(error as Error).message}</p>
      </DashboardLayout>
    )
  }

  const pa = parsearMonto(prueba.adulto)
  const precios = pa != null ? { adulto: pa, menor: parsearMonto(prueba.menor) ?? 0, ivaModo: prueba.ivaModo, ivaAlicuota: 21 } : null

  return (
    <DashboardLayout>
      <Header
        compacto
        title={m?.nombre ?? 'Menú'}
        description={m && !m.plantilla ? 'Copia asignada a un evento o una reserva' : 'Plantilla de la biblioteca'}
        actions={
          <Button variant="ghost" asChild>
            <Link href={'/eventos/menus' as Route}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        }
      />
      {!m ? (
        <div className="h-64 animate-pulse rounded-2xl bg-slate-900/[0.04]" />
      ) : (
        <div className="grid max-w-5xl gap-5">
          <section className="ax-card grid gap-3 p-5 sm:grid-cols-3">
            <fieldset disabled={!puedeEditar} className="contents">
              <Campo etiqueta="Nombre">
                <Input value={cabecera.nombre} onChange={(e) => setCabecera((x) => ({ ...x, nombre: e.target.value }))} />
              </Campo>
              <Campo etiqueta="Descripción (sale en el presupuesto)" className="sm:col-span-2">
                <textarea value={cabecera.descripcion} onChange={(e) => setCabecera((x) => ({ ...x, descripcion: e.target.value }))} className={`${claseTextarea} min-h-[2.5rem]`} />
              </Campo>
            </fieldset>
            {puedeEditar && (
              <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
                <Button
                  size="sm"
                  disabled={guardar.isPending || !cabecera.nombre.trim() || (cabecera.nombre === m.nombre && cabecera.descripcion === (m.descripcion ?? ''))}
                  onClick={() => guardar.mutate(cabecera)}
                >
                  Guardar
                </Button>
                <Button size="sm" variant="ghost" className="gap-1" onClick={() => duplicar.mutate()}>
                  <Copy className="h-3.5 w-3.5" />
                  Duplicar
                </Button>
                {m.plantilla && (
                  <Button size="sm" variant="ghost" className="gap-1" onClick={() => guardar.mutate({ activo: !m.activo })}>
                    <Archive className="h-3.5 w-3.5" />
                    {m.activo ? 'Archivar' : 'Desarchivar'}
                  </Button>
                )}
                {m.plantilla && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto gap-1 text-[var(--rojo-t)]"
                    onClick={() => window.confirm('¿Borrar el menú? Los eventos y reservas que lo usan conservan su copia.') && borrar.mutate()}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Borrar
                  </Button>
                )}
              </div>
            )}
          </section>

          {data.verImportes && (
            <section className="ax-card flex flex-wrap items-end gap-3 p-4">
              <p className="w-full text-sm font-medium">
                Probar un precio por cubierto <span className="font-normal text-[var(--ter)]">— para compararlo con la carta; no se guarda</span>
              </p>
              <Campo etiqueta="Adulto" className="w-32">
                <Input value={prueba.adulto} onChange={(e) => setPrueba((x) => ({ ...x, adulto: e.target.value }))} inputMode="decimal" placeholder="$" />
              </Campo>
              <Campo etiqueta="Menor" className="w-32">
                <Input value={prueba.menor} onChange={(e) => setPrueba((x) => ({ ...x, menor: e.target.value }))} inputMode="decimal" placeholder="$" />
              </Campo>
              <Campo etiqueta="IVA" className="w-44">
                <select value={prueba.ivaModo} onChange={(e) => setPrueba((x) => ({ ...x, ivaModo: e.target.value as IvaModo }))} className={claseSelect}>
                  {IVA_MODOS.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.texto}
                    </option>
                  ))}
                </select>
              </Campo>
            </section>
          )}

          <section className="ax-card p-5">
            <MenuConReferencia key={m.updatedAt.toString()} menu={m} precios={precios} verImportes={data.verImportes} puedeEditar={puedeEditar} onCambio={refrescar} abierto />
          </section>
        </div>
      )}
    </DashboardLayout>
  )
}
