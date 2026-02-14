'use client'

import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { PaymentWizard, type EditModeData } from '@/components/payments/payment-wizard'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useUser } from '@/hooks/use-user'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { PaymentMethodLine } from '@/components/payments/payment-methods-editor'

interface PagoResponse {
  pago: {
    id: string
    numero: number
    fecha: string
    estado: string
    montoTotal: number
    nota: string | null
    proveedor: { id: string; razonSocial: string }
    documentos: {
      id: string
      tipo: string
      total: number | null
      montoAplicado: number
    }[]
    metodos: {
      id: string
      tipo: string
      monto: number
      fecha: string
      referencia: string | null
      attachments: { key: string; filename: string }[]
    }[]
  }
}

export default function EditarOrdenPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { clienteId, isAdmin } = useUser()

  const { data, isLoading } = useQuery<PagoResponse>({
    queryKey: ['pago', id],
    queryFn: async () => {
      const res = await fetch(`/api/pagos/${id}`)
      if (!res.ok) throw new Error('Error al cargar')
      return res.json()
    },
    enabled: !!id,
  })

  if (!clienteId || !isAdmin) {
    return (
      <DashboardLayout>
        <div className="text-center py-8 text-sm text-slate-500">
          No tienes permisos para editar órdenes de pago
        </div>
      </DashboardLayout>
    )
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </DashboardLayout>
    )
  }

  const pago = data?.pago
  if (!pago || pago.estado !== 'BORRADOR') {
    router.push(`/pagos/${id}`)
    return null
  }

  const editMode: EditModeData = {
    pagoId: pago.id,
    proveedorId: pago.proveedor.id,
    fecha: new Date(pago.fecha),
    nota: pago.nota || '',
    documentos: pago.documentos.map((d) => ({
      documentoId: d.id,
      montoAplicado: d.montoAplicado,
    })),
    metodos: pago.metodos.map((m) => {
      const line: PaymentMethodLine = {
        id: m.id,
        tipo: m.tipo as PaymentMethodLine['tipo'],
        monto: m.monto,
        fecha: new Date(m.fecha),
        attachments: m.attachments || [],
      }
      if (m.referencia) line.referencia = m.referencia
      return line
    }),
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/pagos/${id}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Header title="Editar orden de pago" />
        </div>

        <PaymentWizard clienteId={clienteId} editMode={editMode} />
      </div>
    </DashboardLayout>
  )
}
