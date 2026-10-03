import { describe, expect, test } from 'bun:test'
import { leerComprobanteGalicia, repartirComprobantes } from '../comprobantes-galicia'

// Textos tal como los devuelve pdf-parse para comprobantes reales de Galicia.
const DETALLE_OPERACION = `

 Detalle de la operación
 Fecha de operación Número de operación
08/07/2026LR78GA8733
Razon Social
 Importe
Walpina S. A. S.$ 4.900.500,00
 Motivo Tipo de transferencia
VariosProveedores
 Datos del destinatario
Razon SocialCUIT
Truchas Bariloche Srl30711363382
CuentaBanco
0070031320000004568944Banco Galicia
Salvo Error u Omisión (S.E.U.O.)`

const COMPROBANTE_OPERACION = `

Identificador de la operación: LRA2CLo646
Datos del pago
Tipo de transferenciaNro. de Transferencia
Proveedores1
Fecha de envíoMonto
02/10/2026$ 602.272,91
ConceptoDescripción
Factura-
Datos del pagador
CUIT/CUILRazón Social
30719238692WALPINA S. A. S.
Cuenta a debitar
CC$ 191527390
Datos del destinatario
CUIT/CUILRazón social
30581106234Transportes Imaz Srl
Cuenta enCuenta de destino
Banco Santander0720285020000000003454
COMPROBANTE DE LA OPERACIÓN
1/1Impreso 02/10/2026 - 12:20`

const PAGADOR = '30719238692'

describe('leerComprobanteGalicia', () => {
  test('detalle de la operación', () => {
    expect(leerComprobanteGalicia(DETALLE_OPERACION, PAGADOR)).toEqual({
      cbu: '0070031320000004568944',
      cuit: '30711363382',
      monto: 4900500,
      operacion: 'LR78GA8733',
      fecha: '2026-07-08',
    })
  })

  test('comprobante de la operación: descarta el CUIT del pagador', () => {
    expect(leerComprobanteGalicia(COMPROBANTE_OPERACION, PAGADOR)).toEqual({
      cbu: '0720285020000000003454',
      cuit: '30581106234',
      monto: 602272.91,
      operacion: 'LRA2CLo646',
      fecha: '2026-10-02',
    })
  })
})

describe('repartirComprobantes', () => {
  const ordenes = [
    { id: 'truchas', cbu: '0070031320000004568944', cuit: '30711363382', monto: 4900500 },
    { id: 'imaz', cbu: null, cuit: '30581106234', monto: 602272.91 },
    { id: 'otra', cbu: '0340292600292038490009', cuit: '30717619893', monto: 1000 },
  ]

  test('asigna por CBU o CUIT + importe', () => {
    const leidos = [COMPROBANTE_OPERACION, DETALLE_OPERACION].map((t) => leerComprobanteGalicia(t, PAGADOR))
    const r = repartirComprobantes(leidos, ordenes)
    expect(r.map((a) => [a.pagoId, a.coincidencia])).toEqual([
      ['imaz', 'exacta'],
      ['truchas', 'exacta'],
    ])
  })

  test('mismo destinatario con importe distinto queda como probable', () => {
    const r = repartirComprobantes(
      [{ cbu: '0340292600292038490009', cuit: null, monto: 999, operacion: null, fecha: null }],
      ordenes
    )
    expect(r[0]).toMatchObject({ pagoId: 'otra', coincidencia: 'probable' })
  })

  test('dos comprobantes iguales no se asignan a la misma orden', () => {
    const l = leerComprobanteGalicia(DETALLE_OPERACION, PAGADOR)
    const r = repartirComprobantes([l, l], ordenes)
    expect(r.every((a) => a.pagoId === null)).toBe(true)
  })

  test('importe repetido entre órdenes no se asigna solo', () => {
    const r = repartirComprobantes(
      [{ cbu: null, cuit: null, monto: 50, operacion: null, fecha: null }],
      [
        { id: 'a', cbu: null, cuit: null, monto: 50 },
        { id: 'b', cbu: null, cuit: null, monto: 50 },
      ]
    )
    expect(r[0]).toMatchObject({ pagoId: null, motivo: '2 órdenes posibles' })
  })
})
