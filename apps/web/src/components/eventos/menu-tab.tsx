'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, BookCopy, ChefHat, ChevronDown, ChevronRight, FileText, ListChecks, RefreshCw, Salad, Sparkles, Undo2 } from 'lucide-react'
import { pesos } from '@/components/dashboard/inicio'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { REGIMEN_TEXTO, type Regimen } from '@/lib/eventos/constantes'
import { APLICA_SUFIJO } from '@/lib/eventos/presupuesto'
import { PASO_TEXTO, bloquesDePaso, claveOpcion, cocinaReserva, itemTexto, porPaso, type Adicional, type ItemMenu, type Paso } from '@/lib/eventos/menu'
import type { MenuDetalle, OpcionElegida, PlantillaFila } from '@/lib/eventos/menus'
import { cn } from '@/lib/utils'
import { EditorAdicionales } from './adicionales'
import { avisarError, claseSelect, enviar } from './comunes'
import { MenuEditor, ValorMenu, type Precios } from './menu-editor'

/*
 * Pestaña Menú de la reserva y del evento: qué se come (y a qué valor de
 * carta contra el precio que se cobra), qué comen los regímenes, qué
 * adicionales hay y los presupuestos generados.
 */

export function usePlantillas() {
  return useQuery({
    queryKey: ['eventos-plantillas'],
    queryFn: async () => {
      const res = await fetch('/api/eventos/menus')
      if (!res.ok) throw new Error('No se pudieron cargar los menús')
      return res.json() as Promise<{ plantillas: PlantillaFila[] }>
    },
    staleTime: 60 * 1000,
  })
}

interface Version {
  id: string
  version: number
  total: number | null
  incluyeRegimenes: boolean
  usuarioNombre: string | null
  createdAt: string
}

/* ------------------------------------------------------------ asignación */

type Destino = { eventoId: string; regimen?: Regimen | undefined } | { reservaId: string; regimen?: Regimen | undefined }

/**
 * Qué menú tiene y cómo cambiarlo. Elegir una plantilla la copia; la copia
 * se puede actualizar desde su plantilla cuando uno quiere, nunca sola.
 */
function AsignarMenu({
  destino,
  menu,
  heredado,
  vacio,
  personalizarDesde,
  puedeEditar,
  onCambio,
}: {
  destino: Destino
  menu: MenuDetalle | null
  heredado?: boolean | undefined
  /** Cómo se llama "sin menú" acá: "Sin menú" o "El del evento". */
  vacio: string
  /** En una reserva que hereda: el menú del evento, para hacerse una copia propia. */
  personalizarDesde?: string | null | undefined
  puedeEditar: boolean
  onCambio: () => void
}) {
  const qc = useQueryClient()
  const { data } = usePlantillas()
  const [elegida, setElegida] = useState('')
  const ir = useMutation({
    mutationFn: (cuerpo: Record<string, unknown>) => enviar('/api/eventos/menus/asignar', 'POST', { ...destino, ...cuerpo }),
    onSuccess: () => {
      toast.success('Menú actualizado')
      setElegida('')
      onCambio()
    },
    onError: avisarError,
  })
  const comoPlantilla = useMutation({
    mutationFn: (nombre: string) => enviar('/api/eventos/menus', 'POST', { desdeId: menu!.id, nombre }),
    onSuccess: () => {
      toast.success('Guardado en la biblioteca de menús')
      qc.invalidateQueries({ queryKey: ['eventos-plantillas'] })
    },
    onError: avisarError,
  })
  const activas = (data?.plantillas ?? []).filter((p) => p.activo)
  const propio = !!menu && !heredado

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {menu ? (
        <span className="font-medium">{menu.nombre}</span>
      ) : (
        <span className="text-[var(--ter)]">{vacio === 'El del evento' ? 'El evento no tiene menú' : 'Sin menú'}</span>
      )}
      {heredado && <span className="ax-chip ax-chip-gris">del evento</span>}
      {propio && menu.plantillaNombre && <span className="text-xs text-[var(--ter)]">copia de «{menu.plantillaNombre}»</span>}
      {propio && menu.plantillaCambio && <span className="ax-chip ax-chip-ambar">la plantilla cambió</span>}
      {puedeEditar && (
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <select value={elegida} onChange={(e) => setElegida(e.target.value)} className={cn(claseSelect, 'h-8 w-auto max-w-[14rem] text-xs')} aria-label="Elegir menú">
            <option value="">{menu && !heredado ? 'Cambiar por…' : 'Elegir de la biblioteca…'}</option>
            {activas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            disabled={!elegida || ir.isPending}
            onClick={() => (!propio || window.confirm('Se reemplaza el menú actual (y lo que se le haya retocado). ¿Seguir?')) && ir.mutate({ origenId: elegida })}
          >
            Asignar
          </Button>
          {heredado && personalizarDesde && (
            <Button size="sm" variant="ghost" className="gap-1" onClick={() => ir.mutate({ origenId: personalizarDesde })} title="Copia el menú del evento para cambiarlo sólo en esta reserva">
              <Sparkles className="h-3.5 w-3.5" />
              Personalizar
            </Button>
          )}
          {propio && menu.plantillaId && (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1"
              onClick={() => window.confirm(`¿Volver a copiar «${menu.plantillaNombre}»? Se pierden los cambios hechos acá.`) && ir.mutate({ accion: 'actualizar' })}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Actualizar desde plantilla
            </Button>
          )}
          {propio && (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1"
              onClick={() => {
                const nombre = window.prompt('Nombre de la plantilla nueva', menu.nombre)
                if (nombre?.trim()) comoPlantilla.mutate(nombre.trim())
              }}
            >
              <BookCopy className="h-3.5 w-3.5" />
              Guardar como plantilla
            </Button>
          )}
          {propio && (
            <Button size="sm" variant="ghost" className="gap-1 text-[var(--rojo-t)]" onClick={() => window.confirm('¿Quitar este menú?') && ir.mutate({ origenId: null })}>
              <Undo2 className="h-3.5 w-3.5" />
              {vacio === 'El del evento' ? 'Volver al del evento' : 'Quitar'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/** El menú en modo lectura, por paso, como sale en el presupuesto. */
export function MenuLectura({ menu, className }: { menu: Pick<MenuDetalle, 'items'>; className?: string }) {
  const grupos = porPaso(menu.items)
  if (!grupos.length) return <p className="text-sm text-[var(--ter)]">Menú vacío.</p>
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2', className)}>
      {grupos.map((g) => (
        <div key={g.paso}>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ter)]">{PASO_TEXTO[g.paso]}</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {bloquesDePaso(g.items).map((b, k) => (
              <li key={b.items[0]?.id ?? k}>
                {b.grupo != null && <span className="text-xs text-[var(--ter)]">A elección: </span>}
                {b.items.map((i, n) => (
                  <span key={i.id ?? n}>
                    {n > 0 && <span className="italic text-[var(--ter)]"> o </span>}
                    {itemTexto(i)}
                    <span className="text-xs text-[var(--ter)]">{APLICA_SUFIJO[i.aplica]}</span>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function Seccion({ titulo, icono: Icono, children, acciones }: { titulo: string; icono: typeof ChefHat; children: React.ReactNode; acciones?: React.ReactNode }) {
  return (
    <section className="ax-card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="ax-card-titulo flex items-center gap-2">
          <Icono className="h-4 w-4 text-[var(--ter)]" />
          {titulo}
        </h3>
        {acciones}
      </div>
      {children}
    </section>
  )
}

function Versiones({ versiones, href, verImportes }: { versiones: Version[]; href: string; verImportes: boolean }) {
  return (
    <div className="space-y-3">
      <Button asChild className="gap-1.5">
        <Link href={href as Route}>
          <FileText className="h-4 w-4" />
          Ver presupuesto
        </Link>
      </Button>
      {versiones.length === 0 ? (
        <p className="text-sm text-[var(--ter)]">Todavía no se generó ninguna versión.</p>
      ) : (
        <ul className="divide-y divide-slate-900/[0.05] text-sm">
          {versiones.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <Link href={`${href}?v=${v.id}` as Route} className="font-medium text-[var(--azul-2)] hover:underline">
                v{v.version}
              </Link>
              <span className="text-xs text-[var(--ter)]">
                {new Date(v.createdAt).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {v.usuarioNombre ? ` · ${v.usuarioNombre}` : ''}
                {v.incluyeRegimenes ? ' · con regímenes' : ''}
              </span>
              {verImportes && v.total != null && <span className="ax-num">{pesos(v.total)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Un menú que se puede abrir para editar (copias propias) o sólo leer (heredadas). */
function BloqueMenu({
  menu,
  editable,
  verImportes,
  puedeEditar,
  grupo,
  precios,
  onCambio,
  abiertoInicial = false,
  extraResumen,
}: {
  menu: MenuDetalle
  editable: boolean
  verImportes: boolean
  puedeEditar: boolean
  grupo: { adultos: number; menores: number }
  precios?: Precios | null | undefined
  onCambio: () => void
  abiertoInicial?: boolean | undefined
  extraResumen?: React.ReactNode
}) {
  const [editando, setEditando] = useState(abiertoInicial)
  if (editable && editando) {
    return (
      <div className="space-y-2">
        <button type="button" className="flex items-center gap-1 text-xs text-[var(--azul-2)]" onClick={() => setEditando(false)}>
          <ChevronDown className="h-3.5 w-3.5" /> Cerrar el editor
        </button>
        <MenuEditor menu={menu} verImportes={verImportes} puedeEditar={puedeEditar} grupo={grupo} precios={precios} onGuardado={onCambio} extraResumen={extraResumen} />
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <ValorMenu items={menu.items} grupo={grupo} precios={precios} verImportes={verImportes} extra={extraResumen} />
      <MenuLectura menu={menu} />
      {editable && puedeEditar && (
        <button type="button" className="flex items-center gap-1 text-xs text-[var(--azul-2)]" onClick={() => setEditando(true)}>
          <ChevronRight className="h-3.5 w-3.5" /> Editar el menú
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ reserva */

interface FichaMenuReserva {
  menu: MenuDetalle | null
  heredado: boolean
  menuEvento: { id: string; nombre: string } | null
  eventoId: string | null
  grupo: { adultos: number; menores: number; bebes: number; liberados: number }
  precios: Precios
  regimenes: Array<{ tipo: Regimen; cantidad: number; nota: string | null; notaEvento: string | null; menu: MenuDetalle | null; heredado: boolean }>
  adicionales: Adicional[]
  totales: { adicionales: number; adicionalesPasajero: number; total: number } | null
  versiones: Version[]
  elegidas: OpcionElegida[]
  verImportes: boolean
}

export function MenuReserva({ reservaId, puedeEditar, onCambio }: { reservaId: string; puedeEditar: boolean; onCambio: () => void }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['reserva-menu', reservaId],
    queryFn: async () => {
      const res = await fetch(`/api/eventos/reservas/${reservaId}/menu`)
      if (!res.ok) throw new Error('No se pudo cargar el menú')
      return res.json() as Promise<FichaMenuReserva>
    },
  })
  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['reserva-menu', reservaId] })
    onCambio()
  }
  if (isLoading || !data) return <div className="h-48 animate-pulse rounded-2xl bg-slate-900/[0.04]" />

  // Los liberados comen como adultos.
  const grupo = { adultos: data.grupo.adultos + data.grupo.liberados, menores: data.grupo.menores }
  const destino = { reservaId }

  return (
    <div className="grid max-w-5xl gap-5">
      <Seccion titulo="Menú" icono={ChefHat}>
        <div className="space-y-4">
          <AsignarMenu
            destino={destino}
            menu={data.menu}
            heredado={data.heredado}
            vacio={data.eventoId ? 'El del evento' : 'Sin menú'}
            personalizarDesde={data.menuEvento?.id}
            puedeEditar={puedeEditar}
            onCambio={refrescar}
          />
          {data.menu ? (
            <BloqueMenu key={data.menu.id + data.menu.updatedAt} menu={data.menu} editable={!data.heredado} verImportes={data.verImportes} puedeEditar={puedeEditar} grupo={grupo} precios={data.precios} onCambio={refrescar} />
          ) : (
            <p className="text-sm text-[var(--ter)]">Elegí un menú de la biblioteca (Eventos → Menús) para compararlo con el precio por cubierto y sumarlo al presupuesto.</p>
          )}
          {data.heredado && <p className="text-xs text-[var(--ter)]">Es el menú del evento: se edita en el evento. Para cambiarlo sólo en esta reserva, “Personalizar”.</p>}
        </div>
      </Seccion>

      {data.menu?.items.some((i) => i.opcionGrupo != null) && (
        <Seccion titulo="Qué eligen" icono={ListChecks}>
          <OpcionesReserva
            key={data.menu.id + data.menu.updatedAt + JSON.stringify(data.elegidas)}
            reservaId={reservaId}
            items={data.menu.items}
            grupo={grupo}
            elegidas={data.elegidas}
            puedeEditar={puedeEditar}
            onCambio={refrescar}
          />
        </Seccion>
      )}

      <Seccion titulo="Regímenes especiales" icono={Salad}>
        {data.regimenes.length === 0 ? (
          <p className="text-sm text-[var(--ter)]">Sin regímenes. Se cargan en la pestaña Personas; acá se elige qué come cada uno.</p>
        ) : (
          <div className="space-y-4">
            {data.regimenes.map((g) => (
              <div key={g.tipo} className="space-y-2 rounded-xl border border-slate-900/[0.08] p-3">
                <p className="text-sm">
                  <b>
                    {g.cantidad} {REGIMEN_TEXTO[g.tipo].toLowerCase()}
                  </b>
                  {g.nota && <span className="text-[var(--sec)]"> · {g.nota}</span>}
                  {g.notaEvento && <span className="text-[var(--ter)]"> · del evento: {g.notaEvento}</span>}
                </p>
                <AsignarMenu
                  destino={{ ...destino, regimen: g.tipo }}
                  menu={g.menu}
                  heredado={g.heredado}
                  vacio="Sin menú"
                  puedeEditar={puedeEditar}
                  onCambio={refrescar}
                />
                {g.menu && (
                  <BloqueMenu
                    key={g.menu.id + g.menu.updatedAt}
                    menu={g.menu}
                    editable={!g.heredado}
                    verImportes={false}
                    puedeEditar={puedeEditar}
                    grupo={{ adultos: g.cantidad, menores: 0 }}
                    onCambio={refrescar}
                  />
                )}
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-[var(--ter)]">Los regímenes no van en el presupuesto salvo que lo pidas al generarlo.</p>
      </Seccion>

      <Seccion
        titulo="Adicionales"
        icono={Sparkles}
        acciones={
          data.totales && (
            <span className="ax-num text-xs text-[var(--sec)]">
              Suman {pesos(data.totales.adicionales)}
              {data.totales.adicionalesPasajero > 0 && ` · a cargo de los pasajeros ${pesos(data.totales.adicionalesPasajero)}`}
            </span>
          )
        }
      >
        <EditorAdicionales
          dueno={destino}
          adicionales={data.adicionales}
          grupo={{ adultos: data.grupo.adultos, menores: data.grupo.menores }}
          verImportes={data.verImportes}
          puedeEditar={puedeEditar}
          onGuardado={refrescar}
        />
      </Seccion>

      <Seccion titulo="Presupuesto" icono={FileText}>
        <Versiones versiones={data.versiones} href={`/eventos/reserva/${reservaId}/presupuesto`} verImportes={data.verImportes} />
      </Seccion>
    </div>
  )
}

/* ------------------------------------------------------------ evento */

interface FichaMenuEvento {
  menu: MenuDetalle | null
  precios: Precios
  regimenes: Array<{
    tipo: Regimen
    texto: string
    cantidad: number
    nota: string | null
    menu: MenuDetalle | null
    reservas: Array<{ id: string; numero: number; nombre: string; cantidad: number; nota: string | null; menuPropio: string | null }>
  }>
  adicionales: Adicional[]
  cocina: {
    reservas: number
    sinMenu: number
    /** Reservas cuyas opciones elegidas no suman sus personas. */
    avisos: Array<{ id: string; numero: number; nombre: string; texto: string }>
    menus: Array<{
      menu: string
      propio: boolean
      reservas: number
      adultos: number
      menores: number
      items: Array<{ paso: Paso; pasoTexto: string; texto: string; porcion: string; unidades: number; aElegir: boolean }>
    }>
  }
  versiones: Version[]
  verImportes: boolean
}

export function MenuEvento({ eventoId, puedeEditar, onCambio }: { eventoId: string; puedeEditar: boolean; onCambio: () => void }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['evento-menu', eventoId],
    queryFn: async () => {
      const res = await fetch(`/api/eventos/${eventoId}/menu`)
      if (!res.ok) throw new Error('No se pudo cargar el menú')
      return res.json() as Promise<FichaMenuEvento>
    },
  })
  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['evento-menu', eventoId] })
    onCambio()
  }
  if (isLoading || !data) return <div className="h-48 animate-pulse rounded-2xl bg-slate-900/[0.04]" />
  const destino = { eventoId }

  return (
    <div className="grid max-w-5xl gap-5">
      <Seccion titulo="Menú del evento" icono={ChefHat}>
        <div className="space-y-4">
          <AsignarMenu destino={destino} menu={data.menu} vacio="Sin menú" puedeEditar={puedeEditar} onCambio={refrescar} />
          {data.menu ? (
            <MenuConReferencia key={data.menu.id + data.menu.updatedAt} menu={data.menu} precios={data.precios} verImportes={data.verImportes} puedeEditar={puedeEditar} onCambio={refrescar} />
          ) : (
            <p className="text-sm text-[var(--ter)]">Elegí un menú de la biblioteca: lo heredan todas las reservas que no tengan uno propio.</p>
          )}
        </div>
      </Seccion>

      <Seccion titulo="Regímenes especiales" icono={Salad}>
        <RegimenesEvento eventoId={eventoId} regimenes={data.regimenes} puedeEditar={puedeEditar} onCambio={refrescar} />
      </Seccion>

      <Seccion titulo="Adicionales del evento" icono={Sparkles}>
        <EditorAdicionales dueno={destino} adicionales={data.adicionales} grupo={null} verImportes={data.verImportes} puedeEditar={puedeEditar} onGuardado={refrescar} />
      </Seccion>

      <Seccion titulo="Para la cocina" icono={ChefHat}>
        <Cocina cocina={data.cocina} />
      </Seccion>

      <Seccion titulo="Presupuesto del evento" icono={FileText}>
        <p className="mb-3 text-xs text-[var(--ter)]">Para agencias y eventos privados: las condiciones del evento y, si ya tiene reservas, el total del grupo.</p>
        <Versiones versiones={data.versiones} href={`/eventos/evento/${eventoId}/presupuesto`} verImportes={data.verImportes} />
      </Seccion>
    </div>
  )
}

/**
 * En el evento (y en la plantilla) no hay un grupo real: el valor por
 * cubierto se calcula con un grupo de referencia, que se guarda en el menú.
 */
export function MenuConReferencia({
  menu,
  precios,
  verImportes,
  puedeEditar,
  onCambio,
  abierto,
}: {
  menu: MenuDetalle
  precios?: Precios | null | undefined
  verImportes: boolean
  puedeEditar: boolean
  onCambio: () => void
  abierto?: boolean | undefined
}) {
  const [ref, setRef] = useState(String(menu.personasReferencia))
  const [menores, setMenores] = useState(menu.items.some((i) => i.aplica === 'MENORES') ? '2' : '0')
  useEffect(() => setRef(String(menu.personasReferencia)), [menu.personasReferencia])
  const guardarRef = useMutation({
    mutationFn: () => enviar(`/api/eventos/menus/${menu.id}`, 'PATCH', { personasReferencia: Number(ref) }),
    onSuccess: onCambio,
    onError: avisarError,
  })
  const n = Math.max(Number(ref) || 1, 1)
  const extra = (
    <span className="ml-auto flex items-center gap-1">
      grupo de
      <Input
        value={ref}
        onChange={(e) => setRef(e.target.value)}
        onBlur={() => puedeEditar && Number(ref) > 0 && Number(ref) !== menu.personasReferencia && guardarRef.mutate()}
        inputMode="numeric"
        className="h-7 w-14 text-xs"
        aria-label="Adultos de referencia"
      />
      adultos y
      <Input value={menores} onChange={(e) => setMenores(e.target.value)} inputMode="numeric" className="h-7 w-12 text-xs" aria-label="Menores de referencia" />
      menores
    </span>
  )
  return (
    <BloqueMenu
      menu={menu}
      editable
      verImportes={verImportes}
      puedeEditar={puedeEditar}
      grupo={{ adultos: n, menores: Math.max(Number(menores) || 0, 0) }}
      precios={precios}
      onCambio={onCambio}
      abiertoInicial={abierto}
      extraResumen={extra}
    />
  )
}

function RegimenesEvento({
  eventoId,
  regimenes,
  puedeEditar,
  onCambio,
}: {
  eventoId: string
  regimenes: FichaMenuEvento['regimenes']
  puedeEditar: boolean
  onCambio: () => void
}) {
  const [nuevo, setNuevo] = useState<Regimen | ''>('')
  const nota = useMutation({
    mutationFn: (x: { regimen: Regimen; nota: string }) => enviar('/api/eventos/menus/asignar', 'POST', { eventoId, accion: 'nota', ...x }),
    onSuccess: () => {
      toast.success('Indicación guardada')
      onCambio()
    },
    onError: avisarError,
  })
  const tipos = regimenes.map((g) => g.tipo)
  const faltan = (Object.keys(REGIMEN_TEXTO) as Regimen[]).filter((t) => !tipos.includes(t))
  const total = regimenes.reduce((s, g) => s + g.cantidad, 0)
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--sec)]">
        {total ? `${total} cubiertos con régimen especial en las reservas.` : 'Ninguna reserva pidió régimen especial todavía.'} Lo que se defina acá (menú o indicación) lo
        heredan las reservas; cada una puede tener el suyo.
      </p>
      {regimenes.map((g) => (
        <div key={g.tipo} className="space-y-2 rounded-xl border border-slate-900/[0.08] p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <b>{g.texto}</b>
            <span className="ax-chip ax-chip-ambar">{g.cantidad} en total</span>
          </div>
          <NotaRegimen inicial={g.nota ?? ''} puedeEditar={puedeEditar} onGuardar={(v) => nota.mutate({ regimen: g.tipo, nota: v })} />
          <AsignarMenu destino={{ eventoId, regimen: g.tipo }} menu={g.menu} vacio="Sin menú" puedeEditar={puedeEditar} onCambio={onCambio} />
          {g.menu && <BloqueMenu key={g.menu.id + g.menu.updatedAt} menu={g.menu} editable verImportes={false} puedeEditar={puedeEditar} grupo={{ adultos: Math.max(g.cantidad, 1), menores: 0 }} onCambio={onCambio} />}
          {g.reservas.length > 0 && (
            <ul className="text-xs text-[var(--sec)]">
              {g.reservas.map((r) => (
                <li key={r.id}>
                  <Link href={`/eventos/reserva/${r.id}` as Route} className="text-[var(--azul-2)] hover:underline">
                    #{r.numero} {r.nombre}
                  </Link>
                  : {r.cantidad}
                  {r.nota ? ` · ${r.nota}` : ''}
                  {r.menuPropio ? ` · menú propio: ${r.menuPropio}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {puedeEditar && faltan.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select value={nuevo} onChange={(e) => setNuevo(e.target.value as Regimen)} className={cn(claseSelect, 'h-8 w-auto text-xs')}>
            <option value="">Definir otro régimen…</option>
            {faltan.map((t) => (
              <option key={t} value={t}>
                {REGIMEN_TEXTO[t]}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            disabled={!nuevo}
            onClick={() => {
              const v = window.prompt(`Indicación para ${REGIMEN_TEXTO[nuevo as Regimen].toLowerCase()} (podés elegirle un menú después)`)
              if (v?.trim() && nuevo) nota.mutate({ regimen: nuevo, nota: v.trim() })
              setNuevo('')
            }}
          >
            Agregar
          </Button>
        </div>
      )}
    </div>
  )
}

function NotaRegimen({ inicial, puedeEditar, onGuardar }: { inicial: string; puedeEditar: boolean; onGuardar: (v: string) => void }) {
  const [v, setV] = useState(inicial)
  useEffect(() => setV(inicial), [inicial])
  return (
    <div className="flex gap-2">
      <Input value={v} onChange={(e) => setV(e.target.value)} disabled={!puedeEditar} placeholder="Indicación para la cocina (si no hay menú alternativo)" className="h-8 text-xs" />
      {puedeEditar && v !== inicial && (
        <Button size="sm" variant="outline" onClick={() => onGuardar(v)}>
          Guardar
        </Button>
      )}
    </div>
  )
}

function Cocina({ cocina }: { cocina: FichaMenuEvento['cocina'] }) {
  if (cocina.reservas === 0) return <p className="text-sm text-[var(--ter)]">Sin reservas activas.</p>
  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--ter)]">
        Unidades a preparar con las reservas activas. Lo compartido se cuenta por reserva (cada mesa recibe lo suyo). Las cantidades cuentan a todos los
        comensales: quienes tienen un régimen con menú alternativo comen ese menú en lugar de éste (ver Regímenes).
        {cocina.sinMenu > 0 && ` ${cocina.sinMenu} reserva${cocina.sinMenu === 1 ? '' : 's'} sin menú.`} En las opciones a elección, lo que las
        reservas no cargaron sale como “a elegir”, con las personas.
      </p>
      {cocina.avisos.length > 0 && (
        <ul className="space-y-0.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {cocina.avisos.map((a, k) => (
            <li key={k} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                <Link href={`/eventos/reserva/${a.id}` as Route} className="font-medium hover:underline">
                  #{a.numero} {a.nombre}
                </Link>
                : {a.texto}
              </span>
            </li>
          ))}
        </ul>
      )}
      {cocina.menus.map((m) => (
        <div key={m.menu + m.propio} className="space-y-1">
          <p className="text-sm font-medium">
            {m.menu}
            <span className="font-normal text-[var(--ter)]">
              {' '}
              · {m.reservas} reserva{m.reservas === 1 ? '' : 's'} · {m.adultos} adultos{m.menores ? ` · ${m.menores} menores` : ''}
              {m.propio ? ' · menú propio de la reserva' : ''}
            </span>
          </p>
          <table className="w-full text-sm">
            <tbody>
              {m.items.map((i, k) => (
                <tr key={k} className="border-b border-slate-900/[0.05] last:border-0">
                  <td className="w-28 py-1 text-xs text-[var(--ter)]">{i.pasoTexto}</td>
                  <td className="py-1">
                    {i.texto}
                    {i.porcion && <span className={cn('text-xs', i.aElegir ? 'font-medium text-amber-700' : 'text-[var(--ter)]')}> · {i.porcion}</span>}
                  </td>
                  <td className="ax-num py-1 text-right font-medium">
                    {i.unidades.toLocaleString('es-AR')}
                    {i.aElegir && <span className="ml-1 text-xs font-normal text-[var(--ter)]">pers.</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------ opciones */

/**
 * Cuántos eligen cada opción del menú, cuando el cliente confirma ("12 bife
 * / 8 pasta"). Es opcional: sin cargar, la cocina lo ve "a elegir". Avisa si
 * no suma las personas del grupo, pero deja guardar igual.
 */
function OpcionesReserva({
  reservaId,
  items,
  grupo,
  elegidas,
  puedeEditar,
  onCambio,
}: {
  reservaId: string
  items: ItemMenu[]
  grupo: { adultos: number; menores: number }
  elegidas: OpcionElegida[]
  puedeEditar: boolean
  onCambio: () => void
}) {
  const inicial = Object.fromEntries(elegidas.map((o) => [claveOpcion(o), String(o.cantidad)]))
  const [v, setV] = useState<Record<string, string>>(inicial)
  const grupos = porPaso(items).flatMap((g) => bloquesDePaso(g.items).filter((b) => b.grupo != null))
  const opciones = grupos.flatMap((b) => b.items)
  const mapa = new Map(
    opciones
      .filter((o) => (v[claveOpcion(o)] ?? '').trim() !== '')
      .map((o) => [claveOpcion(o), Math.max(0, Math.round(Number(v[claveOpcion(o)])) || 0)])
  )
  const { avisos } = cocinaReserva(items, grupo, mapa)
  const guardar = useMutation({
    mutationFn: () =>
      enviar(`/api/eventos/reservas/${reservaId}/menu`, 'PUT', {
        opciones: opciones.map((o) => ({ paso: o.paso, nombre: o.nombre, cantidad: v[claveOpcion(o)] ?? '' })),
      }),
    onSuccess: () => {
      toast.success('Opciones guardadas')
      onCambio()
    },
    onError: avisarError,
  })
  const cambiado = JSON.stringify(Object.entries(v).filter(([, x]) => x !== '').sort()) !== JSON.stringify(Object.entries(inicial).sort())

  return (
    <div className="space-y-3">
      {grupos.map((b, k) => (
        <div key={k} className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <span className="w-32 text-xs text-[var(--ter)]">{PASO_TEXTO[b.items[0]!.paso]}</span>
          {b.items.map((o, n) => (
            <label key={o.id ?? n} className="flex items-center gap-1.5">
              {n > 0 && <span className="text-xs italic text-[var(--ter)]">o</span>}
              <Input
                value={v[claveOpcion(o)] ?? ''}
                onChange={(e) => setV((x) => ({ ...x, [claveOpcion(o)]: e.target.value.replace(/\D/g, '') }))}
                inputMode="numeric"
                placeholder="—"
                disabled={!puedeEditar}
                className="h-8 w-16 text-right text-xs"
                aria-label={`Cuántos eligen ${o.nombre}`}
              />
              {o.nombre}
            </label>
          ))}
        </div>
      ))}
      {avisos.length > 0 && (
        <ul className="space-y-0.5 text-xs text-amber-700">
          {avisos.map((a, k) => (
            <li key={k} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {a}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-[var(--ter)]">Cargalo cuando el cliente confirme. Sin cargar, la cocina lo ve “a elegir”.</p>
        {puedeEditar && (
          <Button type="button" size="sm" disabled={!cambiado || guardar.isPending} onClick={() => guardar.mutate()}>
            {guardar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        )}
      </div>
    </div>
  )
}
