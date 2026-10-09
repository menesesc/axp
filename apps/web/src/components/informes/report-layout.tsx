'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import {
  SelectorPeriodo,
  periodoDe,
  periodoPersonalizado,
  type Periodo,
} from '@/components/ui/periodo';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Printer } from 'lucide-react';

export interface ReportFilters {
  desde: string;
  hasta: string;
  proveedorId?: string;
}

interface Proveedor {
  id: string;
  razonSocial: string;
}

interface ReportLayoutProps {
  title: string;
  description: string;
  children: React.ReactNode;
  filters: ReportFilters;
  onFiltersChange: (filters: ReportFilters) => void;
  showProveedorFilter?: boolean;
  proveedores?: Proveedor[];
  printRef?: React.Ref<HTMLDivElement>;
}

export function ReportLayout({
  title,
  description,
  children,
  filters,
  onFiltersChange,
  showProveedorFilter = false,
  proveedores = [],
  printRef,
}: ReportLayoutProps) {
  // El período vive acá; la página recibe solo desde/hasta en `filters`.
  const [periodo, setPeriodo] = useState<Periodo>(() =>
    filters.desde && filters.hasta
      ? periodoPersonalizado(filters.desde, filters.hasta)
      : periodoDe('mes')
  );
  const cambiarPeriodo = (p: Periodo) => {
    setPeriodo(p);
    onFiltersChange({ ...filters, desde: p.desde, hasta: p.hasta });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Header
          className="print:hidden"
          title={title}
          description={description}
          actions={
            <>
              <SelectorPeriodo valor={periodo} onCambiar={cambiarPeriodo} />
              {showProveedorFilter && (
                <Select
                  value={filters.proveedorId || 'all'}
                  onValueChange={(v) =>
                    onFiltersChange({ ...filters, proveedorId: v === 'all' ? '' : v })
                  }
                >
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Todos los proveedores" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los proveedores</SelectItem>
                    {proveedores.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.razonSocial}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4" />
                Imprimir
              </Button>
            </>
          }
        />

        {/* Print header (hidden on screen) */}
        <div className="hidden print:block mb-6">
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm text-slate-500">
            Período: {filters.desde} al {filters.hasta} | Generado:{' '}
            {new Date().toLocaleDateString('es-AR')}
          </p>
        </div>

        {/* Report content */}
        <div ref={printRef}>{children}</div>
      </div>
    </DashboardLayout>
  );
}
