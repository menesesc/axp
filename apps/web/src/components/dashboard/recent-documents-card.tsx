'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency } from '@/lib/utils';
import { FileText, ArrowRight } from 'lucide-react';

interface Document {
  id: string;
  tipo: string;
  letra: string | null;
  numeroCompleto: string | null;
  fechaEmision: string | null;
  estadoRevision: 'PENDIENTE' | 'CONFIRMADO' | 'PAGADO';
  total: number | null;
  proveedores: {
    razonSocial: string;
  } | null;
  _count?: {
    documento_items: number;
  };
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  // Usar split para evitar problemas de timezone con fechas ISO
  const datePart = dateStr.split('T')[0] || dateStr;
  const parts = datePart.split('-');
  if (parts.length < 3) return '--';
  return `${parts[2]}-${parts[1]}`;
}

interface RecentDocumentsCardProps {
  documents: Document[];
  isLoading?: boolean;
}

export function RecentDocumentsCard({ documents, isLoading }: RecentDocumentsCardProps) {
  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Últimos documentos</CardTitle>
          <Button variant="ghost" size="sm" asChild className="text-slate-500 -mr-2 h-7 text-xs">
            <Link href="/documentos">
              Ver todos
              <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-3">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse flex items-center gap-3 py-1.5">
                <div className="h-3 bg-slate-100 rounded w-24" />
                <div className="flex-1" />
                <div className="h-3 bg-slate-100 rounded w-16" />
              </div>
            ))}
          </div>
        ) : documents.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Sin documentos"
            description="Los documentos aparecerán aquí"
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {documents.slice(0, 5).map((doc) => (
              <Link
                key={doc.id}
                href={`/documento/${doc.id}`}
                className="flex items-center gap-2 py-2 hover:bg-slate-50 -mx-2 px-2 rounded transition-colors"
              >
                <span className="text-[10px] text-slate-400 tabular-nums w-10 flex-shrink-0">
                  {formatShortDate(doc.fechaEmision)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-900 truncate">
                    {doc.proveedores?.razonSocial || 'Sin proveedor'}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {doc.letra || '-'} {doc.numeroCompleto?.slice(-8) || 'S/N'}
                  </p>
                </div>
                <div className="w-[70px] flex justify-center flex-shrink-0">
                  <StatusBadge status={doc.estadoRevision} size="sm" />
                </div>
                <span className="text-xs font-medium text-slate-700 tabular-nums min-w-[110px] text-right flex-shrink-0">
                  {doc.total ? formatCurrency(doc.total) : '-'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
