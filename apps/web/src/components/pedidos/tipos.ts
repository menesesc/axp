export interface PedidoItem {
  insumoId: string
  nombre: string
  unidad: string
  cantidadVendida: number | null
  cantidadPedida: number
  cantidadEnviada: number | null
  manual: boolean
}

export interface Pedido {
  id: string
  numero: number
  origen: 'ventas' | 'manual'
  estado: 'pendiente' | 'enviado' | 'cancelado'
  nota: string | null
  fechaVentas: string | null
  fechaEnvio: string | null
  enviadoAt: string | null
  createdAt: string
  updatedAt: string
  origenDeposito: { id: string; nombre: string }
  destinoDeposito: { id: string; nombre: string }
  items: PedidoItem[]
}

export interface Deposito {
  id: string
  nombre: string
  esCentral: boolean
}

export interface InsumoCat {
  id: string
  nombre: string
  unidadBase: string
}

export interface Plantilla {
  id: string
  nombre: string
  destinoId: string | null
  items: Array<{ insumoId: string; nombre: string; unidad: string; cantidad: number }>
}

export interface Catalogo {
  depositos: Deposito[]
  insumos: InsumoCat[]
  plantillas: Plantilla[]
}

export function fmtFecha(iso: string | null) {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y!.slice(2)}`
}

/** "1,5" o "1.5" → 1.5; vacío → null; inválido → undefined. */
export function parseCantidad(v: string): number | null | undefined {
  const t = v.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

export function fmtCant(n: number | null | undefined) {
  if (n === null || n === undefined) return ''
  return (Math.round(n * 1000) / 1000).toLocaleString('es-AR', { maximumFractionDigits: 3 })
}

/** Texto plano del pedido para mandar por WhatsApp o pegar donde sea. */
export function textoPedido(p: Pedido): string {
  const lineas = p.items
    .filter((it) => it.cantidadPedida > 0)
    .map((it) => `• ${it.nombre}: ${fmtCant(it.cantidadPedida)} ${it.unidad}`)
  return [
    `Pedido #${p.numero} — ${p.destinoDeposito.nombre}${p.fechaVentas ? ` (ventas del ${fmtFecha(p.fechaVentas)})` : ''}`,
    ...lineas,
    ...(p.nota ? ['', p.nota] : []),
  ].join('\n')
}
