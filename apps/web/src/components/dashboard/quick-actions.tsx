'use client'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Upload, Mail, Download, ChevronDown, FileSpreadsheet, FileText } from 'lucide-react'

interface QuickActionsProps {
  onUpload?: () => void
  onEmail?: () => void
  onExport?: (format: 'csv' | 'excel' | 'pdf') => void
}

export function QuickActions({ onUpload, onEmail, onExport }: QuickActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="primary" size="sm" onClick={onUpload}>
        <Upload className="h-4 w-4 mr-1.5" />
        Subir factura
      </Button>

      <Button variant="outline" size="sm" onClick={onEmail}>
        <Mail className="h-4 w-4 mr-1.5" />
        Enviar por email
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-1.5" />
            Exportar
            <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onExport?.('csv')}>
            <FileText className="h-4 w-4 mr-2" />
            CSV
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onExport?.('excel')}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Excel
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onExport?.('pdf')}>
            <FileText className="h-4 w-4 mr-2" />
            PDF
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
