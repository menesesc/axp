import { DashboardStats } from '@/components/dashboard/stats'
import { DocumentList } from '@/components/dashboard/document-list'
import Link from 'next/link'
import { Users } from 'lucide-react'

export default function Home() {
  // TODO: Get clienteId from auth session
  const clienteId = process.env.NEXT_PUBLIC_CLIENTE_ID || ''

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard OCR</h1>
              <p className="text-sm text-gray-500 mt-1">
                Gestión de facturas y documentos procesados
              </p>
            </div>
            <Link
              href="/proveedores"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Users size={20} />
              Proveedores
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* Stats Cards */}
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Resumen</h2>
            <DashboardStats clienteId={clienteId} />
          </section>

          {/* Document List */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Documentos Recientes</h2>
              {/* TODO: Add filters here */}
            </div>
            <DocumentList clienteId={clienteId} />
          </section>
        </div>
      </main>
    </div>
  )
}
