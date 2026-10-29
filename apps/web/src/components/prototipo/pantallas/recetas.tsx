'use client'

import { useState } from 'react'
import {
  ArrowLeft,
  ChefHat,
  Clock,
  Flame,
  Heart,
  Minus,
  Pencil,
  Play,
  Plus,
  Printer,
  Search,
  Settings2,
  StickyNote,
  Users,
} from 'lucide-react'
import { Titulo } from '../shell'
import { Card, pesos } from '../ui'

type Ingrediente = { c: number | null; u: string; n: string; nota?: string }
type Seccion = { titulo?: string; items: Ingrediente[] }

interface Receta {
  id: string
  titulo: string
  desc: string
  cat: string
  prep: number
  total: number
  porciones: number
  dificultad: 'Fácil' | 'Media' | 'Difícil'
  estacion: string
  costo: number
  parcial?: number
  destacada?: boolean
  favorita?: boolean
  borrador?: boolean
  video?: boolean
  dispositivos: string[]
  ingredientes: Seccion[]
  pasos: string[]
  sugerencias?: string
}

const CATEGORIAS: Record<string, { emoji: string; c1: string; c2: string }> = {
  Entradas: { emoji: '🥟', c1: '#fde68a', c2: '#f59e0b' },
  Principales: { emoji: '🥩', c1: '#fecaca', c2: '#ef4444' },
  Pescados: { emoji: '🐟', c1: '#bae6fd', c2: '#0ea5e9' },
  Postres: { emoji: '🍮', c1: '#fde4cf', c2: '#d97706' },
  Bases: { emoji: '🫙', c1: '#d9f99d', c2: '#65a30d' },
  Barra: { emoji: '🍋', c1: '#fef08a', c2: '#84cc16' },
}

const RECETAS: Receta[] = [
  {
    id: 'ojo',
    titulo: 'Ojo de bife con papas rústicas',
    desc: 'El clásico de la parrilla, con papas al horno con romero y ajo confitado.',
    cat: 'Principales',
    prep: 15,
    total: 40,
    porciones: 4,
    dificultad: 'Media',
    estacion: 'Parrilla',
    costo: 7840,
    destacada: true,
    favorita: true,
    video: true,
    dispositivos: ['Parrilla', 'Horno convector'],
    ingredientes: [
      { titulo: 'Carne', items: [{ c: 1.6, u: 'kg', n: 'ojo de bife', nota: 'en 4 cortes de 400 g' }, { c: 20, u: 'g', n: 'sal parrillera' }] },
      {
        titulo: 'Papas',
        items: [
          { c: 1.2, u: 'kg', n: 'papa blanca' },
          { c: 60, u: 'ml', n: 'aceite de oliva' },
          { c: 4, u: 'ramas', n: 'romero' },
          { c: 1, u: 'cabeza', n: 'ajo' },
        ],
      },
    ],
    pasos: [
      'Sacar la carne de la cámara 30 minutos antes y salar justo antes de la parrilla.',
      'Cortar las papas en gajos con piel, hervir 6 minutos y escurrir.',
      'Hornear las papas a 220 °C con aceite, romero y los dientes de ajo enteros por 25 minutos.',
      'Asar el ojo de bife 4 minutos por lado para punto jugoso y dejar reposar 3 minutos.',
      'Emplatar con las papas y el ajo confitado por encima.',
    ],
    sugerencias: 'Acompañar con salsa criolla de la casa. Si piden bien cocido, terminar en horno para no secar.',
  },
  {
    id: 'trucha',
    titulo: 'Trucha a la manteca negra',
    desc: 'Filet de trucha patagónica con alcaparras, limón y puré de calabaza.',
    cat: 'Pescados',
    prep: 10,
    total: 25,
    porciones: 2,
    dificultad: 'Media',
    estacion: 'Cocina caliente',
    costo: 6210,
    parcial: 1,
    destacada: true,
    dispositivos: ['Anafe'],
    ingredientes: [
      {
        items: [
          { c: 2, u: 'filets', n: 'trucha desespinada' },
          { c: 80, u: 'g', n: 'manteca' },
          { c: 30, u: 'g', n: 'alcaparras' },
          { c: 1, u: 'unidad', n: 'limón' },
          { c: 400, u: 'g', n: 'calabaza', nota: 'para el puré' },
        ],
      },
    ],
    pasos: [
      'Secar bien los filets y salpimentar.',
      'Sellar del lado de la piel 3 minutos en sartén bien caliente, dar vuelta 1 minuto.',
      'En la misma sartén dorar la manteca hasta que tome color avellana y sumar alcaparras y limón.',
      'Servir sobre el puré y bañar con la manteca.',
    ],
  },
  {
    id: 'flan',
    titulo: 'Flan casero con dulce de leche',
    desc: 'Flan de huevo a baño María, con dulce de leche repostero y crema.',
    cat: 'Postres',
    prep: 20,
    total: 90,
    porciones: 8,
    dificultad: 'Fácil',
    estacion: 'Pastelería',
    costo: 920,
    destacada: true,
    favorita: true,
    dispositivos: ['Horno convector'],
    ingredientes: [
      {
        items: [
          { c: 1, u: 'l', n: 'leche entera' },
          { c: 8, u: 'unidades', n: 'huevo' },
          { c: 250, u: 'g', n: 'azúcar' },
          { c: 1, u: 'cdta', n: 'esencia de vainilla' },
        ],
      },
      { titulo: 'Para servir', items: [{ c: 400, u: 'g', n: 'dulce de leche repostero' }, { c: 200, u: 'ml', n: 'crema' }] },
    ],
    pasos: ['Hacer un caramelo con 100 g de azúcar y cubrir la budinera.', 'Batir huevos, azúcar y vainilla; sumar la leche tibia.', 'Cocinar a baño María a 160 °C durante 1 hora.', 'Enfriar en cámara al menos 4 horas antes de desmoldar.'],
  },
  {
    id: 'risotto',
    titulo: 'Risotto de hongos',
    desc: 'Arroz carnaroli con hongos de pino, champiñones y parmesano.',
    cat: 'Principales',
    prep: 10,
    total: 35,
    porciones: 4,
    dificultad: 'Media',
    estacion: 'Cocina caliente',
    costo: 3480,
    dispositivos: ['Anafe'],
    ingredientes: [{ items: [{ c: 320, u: 'g', n: 'arroz carnaroli' }, { c: 30, u: 'g', n: 'hongos de pino secos' }, { c: 250, u: 'g', n: 'champiñones' }, { c: 80, u: 'g', n: 'parmesano' }, { c: 1.2, u: 'l', n: 'caldo de verduras' }] }],
    pasos: ['Hidratar los hongos secos en agua caliente.', 'Nacarar el arroz y agregar el caldo de a poco, revolviendo.', 'Sumar los hongos a mitad de cocción.', 'Mantecar con parmesano fuera del fuego.'],
  },
  {
    id: 'empanadas',
    titulo: 'Empanadas de carne cortada a cuchillo',
    desc: 'Relleno jugoso con cebolla de verdeo, huevo y aceitunas.',
    cat: 'Entradas',
    prep: 40,
    total: 70,
    porciones: 24,
    dificultad: 'Media',
    estacion: 'Cocina fría',
    costo: 610,
    video: true,
    dispositivos: ['Horno convector'],
    ingredientes: [{ items: [{ c: 1.5, u: 'kg', n: 'roast beef' }, { c: 24, u: 'unidades', n: 'tapas de empanada' }, { c: 4, u: 'unidades', n: 'cebolla de verdeo' }, { c: 3, u: 'unidades', n: 'huevo duro' }] }],
    pasos: ['Cortar la carne a cuchillo en cubos chicos.', 'Rehogar la cebolla, sumar la carne y condimentar.', 'Enfriar el relleno, armar y repulgar.', 'Hornear a 220 °C por 15 minutos.'],
  },
  {
    id: 'calabaza',
    titulo: 'Ensalada tibia de calabaza',
    desc: 'Calabaza asada, rúcula, queso de cabra y semillas tostadas.',
    cat: 'Entradas',
    prep: 10,
    total: 30,
    porciones: 4,
    dificultad: 'Fácil',
    estacion: 'Cocina fría',
    costo: 1950,
    parcial: 2,
    dispositivos: ['Horno convector'],
    ingredientes: [{ items: [{ c: 800, u: 'g', n: 'calabaza' }, { c: 150, u: 'g', n: 'rúcula' }, { c: 120, u: 'g', n: 'queso de cabra' }, { c: 40, u: 'g', n: 'semillas de girasol' }] }],
    pasos: ['Asar la calabaza en cubos a 200 °C por 20 minutos.', 'Tostar las semillas en seco.', 'Armar con la rúcula de base y el queso desgranado.'],
  },
  {
    id: 'criolla',
    titulo: 'Salsa criolla de la casa',
    desc: 'Base para parrilla: tomate, cebolla, morrones y vinagre de manzana.',
    cat: 'Bases',
    prep: 15,
    total: 15,
    porciones: 10,
    dificultad: 'Fácil',
    estacion: 'Cocina fría',
    costo: 240,
    borrador: true,
    dispositivos: [],
    ingredientes: [{ items: [{ c: 4, u: 'unidades', n: 'tomate' }, { c: 2, u: 'unidades', n: 'cebolla' }, { c: 1, u: 'unidad', n: 'morrón rojo' }, { c: 100, u: 'ml', n: 'vinagre de manzana' }] }],
    pasos: ['Picar todo en brunoise.', 'Condimentar y dejar macerar 1 hora antes del servicio.'],
  },
  {
    id: 'limonada',
    titulo: 'Limonada de jengibre y menta',
    desc: 'La más pedida del verano. Se prepara la base y se termina al momento.',
    cat: 'Barra',
    prep: 10,
    total: 10,
    porciones: 6,
    dificultad: 'Fácil',
    estacion: 'Barra',
    costo: 380,
    video: true,
    dispositivos: ['Licuadora'],
    ingredientes: [{ items: [{ c: 6, u: 'unidades', n: 'limón' }, { c: 30, u: 'g', n: 'jengibre fresco' }, { c: 1, u: 'atado', n: 'menta' }, { c: 150, u: 'g', n: 'azúcar' }, { c: 1.5, u: 'l', n: 'agua fría' }] }],
    pasos: ['Licuar limones pelados, jengibre, menta y azúcar con medio litro de agua.', 'Colar y completar con el resto del agua.', 'Servir con hielo y una rama de menta.'],
  },
]

const minutos = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`)
const cantidad = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: n < 10 ? 2 : 0 })

function Foto({ r, grande }: { r: Receta; grande?: boolean | undefined }) {
  const c = CATEGORIAS[r.cat]!
  return (
    <div
      className="pt-receta-foto relative overflow-hidden"
      style={{ '--c1': c.c1, '--c2': c.c2 } as React.CSSProperties}
    >
      <span className={`pt-receta-emoji ${grande ? 'text-[5.5rem]' : 'text-[3.4rem]'}`} aria-hidden>
        {c.emoji}
      </span>
      {r.video && (
        <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-[var(--texto)] backdrop-blur">
          <Play className="h-3 w-3 fill-current" /> Video
        </span>
      )}
    </div>
  )
}

function Tarjeta({ r, grande, onAbrir, fav, onFav }: { r: Receta; grande?: boolean | undefined; onAbrir: () => void; fav: boolean; onFav: () => void }) {
  return (
    <article className={`pt-card pt-entra group cursor-pointer ${grande ? 'sm:col-span-2 sm:row-span-2' : ''}`} onClick={onAbrir}>
      <div className={grande ? 'h-56 sm:h-[19rem]' : 'h-36'}>
        <Foto r={r} grande={grande} />
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onFav()
        }}
        className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 shadow-sm backdrop-blur transition-transform active:scale-90"
        aria-label={fav ? 'Quitar de favoritas' : 'Marcar como favorita'}
        aria-pressed={fav}
      >
        <Heart className={`h-4 w-4 ${fav ? 'fill-[#ef4444] text-[#ef4444]' : 'text-[var(--sec)]'}`} />
      </button>
      <div className={grande ? 'p-5' : 'p-4'}>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--ter)]">{r.cat}</span>
          {r.borrador && <span className="pt-chip pt-chip-gris !py-0 !text-[11px]">Borrador</span>}
        </div>
        <h3 className={`pt-display mt-1 font-semibold leading-snug group-hover:text-[var(--azul-2)] transition-colors ${grande ? 'text-2xl' : 'text-[15px]'}`}>{r.titulo}</h3>
        {grande && <p className="mt-1.5 text-sm text-[var(--sec)]">{r.desc}</p>}
        <div className="mt-3 flex items-center gap-4 text-xs text-[var(--sec)]">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {minutos(r.total)}
          </span>
          <span className="pt-num font-medium text-[var(--texto)]">
            {pesos(r.costo)}
            {r.parcial ? '*' : ''}
            <span className="font-normal text-[var(--ter)]"> por porción</span>
          </span>
        </div>
      </div>
    </article>
  )
}

function Ficha({ r, onVolver, fav, onFav }: { r: Receta; onVolver: () => void; fav: boolean; onFav: () => void }) {
  const [porciones, setPorciones] = useState(r.porciones)
  const [hechos, setHechos] = useState<Set<number>>(new Set())
  const factor = porciones / r.porciones
  const c = CATEGORIAS[r.cat]!

  return (
    <div className="pt-entra">
      <button type="button" onClick={onVolver} className="mb-5 inline-flex items-center gap-1.5 text-sm text-[var(--sec)] hover:text-[var(--texto)]">
        <ArrowLeft className="h-4 w-4" /> Recetario
      </button>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="pt-card h-64 sm:h-[22rem]">
          <Foto r={r} grande />
          {r.video && (
            <button type="button" className="absolute inset-0 m-auto grid h-16 w-16 place-items-center rounded-full bg-white/95 shadow-xl transition-transform hover:scale-105" aria-label="Ver en YouTube">
              <Play className="ml-1 h-6 w-6 fill-[var(--texto)] text-[var(--texto)]" />
            </button>
          )}
        </div>

        <div className="flex flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <span className="pt-chip" style={{ background: `color-mix(in srgb, ${c.c2} 14%, transparent)`, color: `color-mix(in srgb, ${c.c2} 80%, #000)` }}>
              {c.emoji} {r.cat}
            </span>
            {r.borrador && <span className="pt-chip pt-chip-gris">Borrador</span>}
            {r.dispositivos.map((d) => (
              <span key={d} className="pt-chip pt-chip-azul">
                {d}
              </span>
            ))}
          </div>
          <h1 className="pt-display mt-3 text-[clamp(1.8rem,3.2vw,2.5rem)] font-semibold leading-tight">{r.titulo}</h1>
          <p className="mt-2 text-[15px] text-[var(--sec)]">{r.desc}</p>

          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { t: 'Preparación', v: minutos(r.prep), i: Clock },
              { t: 'Total', v: minutos(r.total), i: Flame },
              { t: 'Dificultad', v: r.dificultad, i: ChefHat },
              { t: 'Estación', v: r.estacion, i: Users },
            ].map((d) => (
              <div key={d.t} className="rounded-xl border border-[var(--borde)] bg-white/70 px-3 py-2.5">
                <dt className="flex items-center gap-1.5 text-xs text-[var(--ter)]">
                  <d.i className="h-3.5 w-3.5" /> {d.t}
                </dt>
                <dd className="mt-0.5 text-sm font-medium">{d.v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-auto pt-5 flex flex-wrap items-center gap-2">
            <button type="button" className="pt-boton pt-boton-primario">
              <ChefHat className="h-4 w-4" /> Cocinar hoy
            </button>
            <button type="button" className="pt-boton pt-boton-sec">
              <Printer className="h-4 w-4" /> Imprimir
            </button>
            <button type="button" className="pt-boton pt-boton-sec">
              <Pencil className="h-4 w-4" /> Editar
            </button>
            <button type="button" className="pt-boton pt-boton-sec !px-3" onClick={onFav} aria-label="Favorita" aria-pressed={fav}>
              <Heart className={`h-4 w-4 ${fav ? 'fill-[#ef4444] text-[#ef4444]' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-5">
          <Card tono="verde">
            <p className="text-sm text-[var(--sec)]">Costo por porción</p>
            <p className="pt-display pt-num mt-1 text-[2rem] font-semibold leading-none">{pesos(r.costo)}</p>
            <p className="mt-2 text-sm text-[var(--sec)]">
              Receta completa ({porciones} {porciones === 1 ? 'porción' : 'porciones'}):{' '}
              <span className="pt-num font-medium text-[var(--texto)]">{pesos(r.costo * porciones)}</span>
            </p>
            {r.parcial && (
              <p className="mt-3 rounded-lg bg-[rgba(245,165,36,0.12)] px-3 py-2 text-xs text-[var(--ambar-2)]">
                Parcial: {r.parcial} {r.parcial === 1 ? 'ingrediente' : 'ingredientes'} sin insumo vinculado o sin compras.
              </p>
            )}
          </Card>

          <Card
            titulo="Ingredientes"
            accion={
              <div className="flex items-center gap-1 rounded-xl bg-slate-900/[0.05] p-1">
                <button type="button" className="grid h-7 w-7 place-items-center rounded-lg hover:bg-white" onClick={() => setPorciones((p) => Math.max(1, p - 1))} aria-label="Menos porciones">
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="pt-num min-w-[5.5rem] text-center text-sm font-medium">
                  {porciones} {porciones === 1 ? 'porción' : 'porciones'}
                </span>
                <button type="button" className="grid h-7 w-7 place-items-center rounded-lg hover:bg-white" onClick={() => setPorciones((p) => p + 1)} aria-label="Más porciones">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            }
          >
            {porciones !== r.porciones && <p className="-mt-2 mb-3 text-xs text-[var(--azul-2)]">Cantidades recalculadas desde {r.porciones} porciones.</p>}
            <div className="space-y-4">
              {r.ingredientes.map((s, i) => (
                <div key={i}>
                  {s.titulo && <p className="mb-1.5 text-xs font-medium text-[var(--ter)]">{s.titulo}</p>}
                  <ul className="divide-y divide-slate-900/[0.06]">
                    {s.items.map((it) => (
                      <li key={it.n} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                        <span>
                          {it.n}
                          {it.nota && <span className="text-[var(--ter)]">, {it.nota}</span>}
                        </span>
                        <span className="pt-num shrink-0 font-medium">
                          {it.c !== null ? cantidad(it.c * factor) : ''} {it.u}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card titulo="Preparación" accion={<span className="text-xs text-[var(--ter)]">Tocá un paso para tacharlo</span>}>
            <ol className="space-y-2">
              {r.pasos.map((p, i) => {
                const hecho = hechos.has(i)
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() =>
                        setHechos((h) => {
                          const n = new Set(h)
                          n.has(i) ? n.delete(i) : n.add(i)
                          return n
                        })
                      }
                      className={`flex w-full gap-3 rounded-xl p-2.5 text-left text-sm transition-colors hover:bg-slate-900/[0.035] ${hecho ? 'text-[var(--ter)] line-through' : ''}`}
                    >
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors ${
                          hecho ? 'bg-[#10b981] text-white' : 'bg-[rgba(59,155,255,0.12)] text-[var(--azul-2)]'
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="pt-1">{p}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </Card>
          {r.sugerencias && (
            <Card titulo="Sugerencias" tono="ambar">
              <p className="text-sm text-[var(--sec)]">{r.sugerencias}</p>
            </Card>
          )}
          <Card titulo="Mis notas">
            <button type="button" className="flex w-full items-center gap-2 rounded-xl border border-dashed border-[var(--borde-fuerte)] px-4 py-3 text-sm text-[var(--ter)] hover:border-[var(--azul)] hover:text-[var(--azul-2)]">
              <StickyNote className="h-4 w-4" /> Añadir una nota que solo ves vos
            </button>
          </Card>
        </div>
      </div>
    </div>
  )
}

export function PantallaRecetas() {
  const [cat, setCat] = useState('Todas')
  const [q, setQ] = useState('')
  const [abierta, setAbierta] = useState<string | null>(null)
  const [favs, setFavs] = useState<Set<string>>(new Set(RECETAS.filter((r) => r.favorita).map((r) => r.id)))
  const alternarFav = (id: string) =>
    setFavs((f) => {
      const n = new Set(f)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  const receta = RECETAS.find((r) => r.id === abierta)
  if (receta) {
    return <Ficha key={receta.id} r={receta} onVolver={() => setAbierta(null)} fav={favs.has(receta.id)} onFav={() => alternarFav(receta.id)} />
  }

  const filtradas = RECETAS.filter((r) => (cat === 'Todas' || r.cat === cat) && (r.titulo + r.desc).toLowerCase().includes(q.toLowerCase()))
  const casa = filtradas.filter((r) => r.destacada)
  const resto = filtradas.filter((r) => !r.destacada)

  return (
    <>
      <Titulo
        escena="recetas"
        titulo="Recetario"
        bajada="Las recetas de la casa con su costo actualizado según lo que pagás a tus proveedores."
        acciones={
          <>
            <button type="button" className="pt-boton pt-boton-primario">
              <Plus className="h-4 w-4" /> Nueva receta
            </button>
            <button type="button" className="pt-boton pt-boton-sec">
              <Settings2 className="h-4 w-4" /> Categorías y dispositivos
            </button>
          </>
        }
      />

      <div className="mb-6 flex flex-col-reverse gap-3 lg:flex-row lg:items-center">
        <div className="pt-sin-barra flex min-w-0 flex-1 gap-2 overflow-x-auto">
          {['Todas', ...Object.keys(CATEGORIAS)].map((c) => {
            const n = c === 'Todas' ? RECETAS.length : RECETAS.filter((r) => r.cat === c).length
            const activa = cat === c
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCat(c)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                  activa ? 'border-transparent bg-[var(--texto)] text-white' : 'border-[var(--borde-fuerte)] bg-white text-[var(--sec)] hover:text-[var(--texto)]'
                }`}
              >
                {c !== 'Todas' && <span aria-hidden>{CATEGORIAS[c]!.emoji}</span>}
                {c}
                <span className={activa ? 'text-white/60' : 'text-[var(--ter)]'}>{n}</span>
              </button>
            )
          })}
        </div>
        <label className="pt-buscador w-full shrink-0 lg:w-64">
          <Search className="h-4 w-4 shrink-0" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar receta" className="w-full bg-transparent text-[var(--texto)] outline-none placeholder:text-[var(--ter)]" />
        </label>
      </div>

      {filtradas.length === 0 && (
        <Card>
          <p className="py-8 text-center text-sm text-[var(--sec)]">No hay recetas con ese filtro.</p>
        </Card>
      )}

      {casa.length > 0 && (
        <>
          <h2 className="pt-display mb-3 text-lg font-semibold">De la casa</h2>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {casa.map((r, i) => (
              <Tarjeta key={r.id} r={r} grande={i === 0} onAbrir={() => setAbierta(r.id)} fav={favs.has(r.id)} onFav={() => alternarFav(r.id)} />
            ))}
          </div>
        </>
      )}

      {resto.length > 0 && (
        <>
          <h2 className="pt-display mb-3 text-lg font-semibold">{casa.length ? 'Todo el recetario' : 'Recetas'}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {resto.map((r) => (
              <Tarjeta key={r.id} r={r} onAbrir={() => setAbierta(r.id)} fav={favs.has(r.id)} onFav={() => alternarFav(r.id)} />
            ))}
          </div>
          <p className="mt-4 text-xs text-[var(--ter)]">* Costo parcial: hay ingredientes sin insumo vinculado.</p>
        </>
      )}
    </>
  )
}
