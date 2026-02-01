'use client'

import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Header } from '@/components/layout/header'
import { PaymentWizard } from '@/components/payments/payment-wizard'
import { Button } from '@/components/ui/button'
import { useUser } from '@/hooks/use-user'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function NuevaOrdenPage() {
  const { clienteId, isAdmin } = useUser()

  if (!clienteId) {
    return (
      <DashboardLayout>
        <div className="text-center py-8 text-sm text-slate-500">
          No tienes acceso
        </div>
      </DashboardLayout>
    )
  }

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <div className="text-center py-8 text-sm text-slate-500">
          No tienes permisos para crear órdenes de pago
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/pagos">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Header title="Nueva orden de pago" />
        </div>

        <PaymentWizard clienteId={clienteId} />
      </div>
    </DashboardLayout>
  )
}
