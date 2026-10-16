'use client'

import { useState } from 'react'
import { GrillaProductos, type CategoriaPos, type ProductoPos } from './grilla-productos'
import { OpcionesProducto, type GrupoPos, type OpcionElegida } from './opciones-producto'

/**
 * La grilla más el paso de opciones, que van siempre juntos.
 *
 * Si el producto no pide nada, entra al pedido con un solo toque. Si pide
 * algo —la salsa del fetuccini, los sabores del helado— se abre la elección
 * antes de sumarlo, nunca después: corregirlo cuando la comanda ya salió no
 * sirve de nada.
 */
export function SelectorProductos({
  categorias,
  productos,
  grupos,
  onAgregar,
  enPedido,
}: {
  /** Unidades de cada producto ya cargadas en el pedido. */
  enPedido?: Record<string, number>
  categorias: CategoriaPos[]
  productos: ProductoPos[]
  grupos: GrupoPos[]
  onAgregar: (p: ProductoPos, opciones: OpcionElegida[], nota: string | null) => void
}) {
  const [pendiente, setPendiente] = useState<ProductoPos | null>(null)

  const gruposDe = (p: ProductoPos) => grupos.filter((g) => g.productos.includes(p.id))

  return (
    <>
      <GrillaProductos
        categorias={categorias}
        productos={productos}
        {...(enPedido ? { enPedido } : {})}
        onElegir={(p) => {
          if (gruposDe(p).length > 0) setPendiente(p)
          else onAgregar(p, [], null)
        }}
      />
      {pendiente && (
        <OpcionesProducto
          nombre={pendiente.nombre}
          precioBase={pendiente.precio}
          grupos={gruposDe(pendiente)}
          onCancelar={() => setPendiente(null)}
          onConfirmar={(opciones, nota) => {
            onAgregar(pendiente, opciones, nota)
            setPendiente(null)
          }}
        />
      )}
    </>
  )
}
