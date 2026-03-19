import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

interface ColumnMap {
  fecha?: string
  nroDocumento?: string
  tipoDoc?: string
  clienteNombre?: string
  formaPago?: string
  itemDescripcion?: string
  itemCantidad?: string
  itemPrecioUnitario?: string
  itemSubtotal?: string
  total?: string
}

interface ImportRow {
  [key: string]: string
}

function parseDecimal(val: string | undefined): number | null {
  if (!val) return null
  // Handle Argentine number format (1.234,56 → 1234.56)
  const cleaned = val.trim().replace(/\./g, '').replace(',', '.')
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

function parseDate(val: string | undefined): Date | null {
  if (!val) return null
  const trimmed = val.trim()

  // Try DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/)
  if (dmyMatch && dmyMatch[1] && dmyMatch[2] && dmyMatch[3]) {
    const d = new Date(`${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`)
    if (!isNaN(d.getTime())) return d
  }

  // Try YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    const d = new Date(trimmed.substring(0, 10))
    if (!isNaN(d.getTime())) return d
  }

  // Try Excel serial number
  const serial = parseFloat(trimmed)
  if (!isNaN(serial) && serial > 1000) {
    // Excel epoch: Jan 1, 1900 = serial 1
    const excelEpoch = new Date(1899, 11, 30)
    const d = new Date(excelEpoch.getTime() + serial * 86400000)
    if (!isNaN(d.getTime())) return d
  }

  return null
}

function getVal(row: ImportRow, colName: string | undefined): string | undefined {
  if (!colName) return undefined
  return row[colName]
}

export async function POST(request: NextRequest) {
  try {
    const { user, error } = await getAuthUser()
    if (error) return error

    const clienteId = user?.clienteId
    if (!clienteId) {
      return NextResponse.json({ error: 'No tienes una empresa asignada' }, { status: 403 })
    }

    const body = await request.json()
    const { rows, columnMap }: { rows: ImportRow[]; columnMap: ColumnMap } = body

    if (!rows?.length) {
      return NextResponse.json({ error: 'No hay filas para importar' }, { status: 400 })
    }

    if (!columnMap.fecha || !columnMap.itemDescripcion) {
      return NextResponse.json({ error: 'Los campos Fecha y Descripción de ítem son obligatorios' }, { status: 400 })
    }

    // Group rows by (fecha + nroDocumento) to form ventas
    const ventaMap = new Map<string, { venta: Record<string, unknown>; items: ImportRow[] }>()
    const rowErrors: string[] = []

    rows.forEach((row, idx) => {
      const fechaRaw = getVal(row, columnMap.fecha)
      const fecha = parseDate(fechaRaw)
      if (!fecha) {
        rowErrors.push(`Fila ${idx + 1}: fecha inválida "${fechaRaw}"`)
        return
      }

      const descripcion = getVal(row, columnMap.itemDescripcion)?.trim()
      if (!descripcion) {
        rowErrors.push(`Fila ${idx + 1}: descripción vacía`)
        return
      }

      const nroDoc = getVal(row, columnMap.nroDocumento)?.trim() || ''
      const key = `${fecha.toISOString().split('T')[0]}__${nroDoc}`

      if (!ventaMap.has(key)) {
        ventaMap.set(key, {
          venta: {
            fecha,
            nroDocumento: nroDoc || null,
            tipoDoc: getVal(row, columnMap.tipoDoc)?.trim() || null,
            clienteNombre: getVal(row, columnMap.clienteNombre)?.trim() || null,
            formaPago: getVal(row, columnMap.formaPago)?.trim() || null,
            total: parseDecimal(getVal(row, columnMap.total)),
          },
          items: [],
        })
      }

      ventaMap.get(key)!.items.push(row)
    })

    if (rowErrors.length > 0 && ventaMap.size === 0) {
      return NextResponse.json({ error: 'Ninguna fila válida', errores: rowErrors }, { status: 400 })
    }

    // Insert all ventas in a transaction
    let ventasImportadas = 0
    let itemsImportados = 0

    await prisma.$transaction(async (tx) => {
      for (const [, { venta, items }] of ventaMap) {
        // Calculate subtotal from items if not provided
        let subtotal: number | null = null
        const ventaItems = items.map((row, idx) => {
          const cantidad = parseDecimal(getVal(row, columnMap.itemCantidad))
          const precioUnitario = parseDecimal(getVal(row, columnMap.itemPrecioUnitario))
          const itemSubtotal = parseDecimal(getVal(row, columnMap.itemSubtotal))
          if (itemSubtotal) subtotal = (subtotal ?? 0) + itemSubtotal
          return {
            linea: idx + 1,
            descripcion: getVal(row, columnMap.itemDescripcion)!.trim(),
            cantidad,
            precioUnitario,
            subtotal: itemSubtotal,
          }
        })

        const created = await tx.ventas.create({
          data: {
            clienteId,
            fecha: venta.fecha as Date,
            nroDocumento: venta.nroDocumento as string | null,
            tipoDoc: venta.tipoDoc as string | null,
            clienteNombre: venta.clienteNombre as string | null,
            formaPago: venta.formaPago as string | null,
            subtotal: subtotal ?? null,
            total: (venta.total as number | null) ?? subtotal ?? null,
            venta_items: { create: ventaItems },
          },
        })

        ventasImportadas++
        itemsImportados += created ? ventaItems.length : 0
      }
    })

    return NextResponse.json({
      ventasImportadas,
      itemsImportados,
      errores: rowErrors,
    })
  } catch (error) {
    console.error('Error importing ventas:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
