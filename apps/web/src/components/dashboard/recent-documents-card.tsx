'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfidenceBadge } from '@/components/ui/confidence-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency } from '@/lib/utils';
import { FileText, ArrowRight } from 'lucide-react';

interface Document {
  id: string;
  tipo: string;
  letra: string | null;
  numeroCompleto: string | null;
  estadoRevision: 'PENDIENTE' | 'CONFIRMADO';
  confidenceScore: number | null;
  total: number | null;
  proveedores: {
    razonSocial: string;
  } | null;
}

interface RecentDocumentsCardProps {
  documents: Document[];
  isLoading?: boolean;
}

export function RecentDocumentsCard({ documents, isLoading }: RecentDocumentsCardProps) {
  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Documentos recientes</CardTitle>
          <Button variant="ghost" size="sm" asChild className="text-slate-500 -mr-2">
            <Link href="/documentos">
              Ver todas
              <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse flex items-center gap-4 py-2">
                <div className="h-4 bg-slate-100 rounded w-32" />
                <div className="h-4 bg-slate-100 rounded w-24" />
                <div className="flex-1" />
                <div className="h-4 bg-slate-100 rounded w-16" />
              </div>
            ))}
          </div>
        ) : documents.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Sin documentos"
            description="Los documentos procesados aparecerán aquí"
          />
        ) : (
          <div className="space-y-1">
            {documents.map((doc) => (
              <Link
                key={doc.id}
                href={`/documento/${doc.id}`}
                className="flex items-center gap-3 py-2 px-2 -mx-2 rounded-md hover:bg-slate-50 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900 truncate">
                      {doc.proveedores?.razonSocial || 'Sin proveedor'}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {doc.tipo} {doc.letra || ''} {doc.numeroCompleto || 'S/N'}
                  </span>
                </div>
                <StatusBadge status={doc.estadoRevision} />
                <ConfidenceBadge score={doc.confidenceScore || 0} />
                <span className="text-sm font-medium text-slate-900 tabular-nums w-24 text-right">
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
