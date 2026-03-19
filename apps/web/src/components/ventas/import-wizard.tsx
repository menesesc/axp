'use client'

import { useState, useRef, useCallback } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { Button } from '@/components/ui/button'
import { Upload, ChevronRight, ChevronLeft, FileSpreadsheet, Loader2, Check, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface ImportWizardProps {
  onImportComplete: () => void
  onClose: () => void
}

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

const FIELD_LABELS: Record<keyof ColumnMap, { label: string; required?: boolean }> = {
  fecha: { label: 'Fecha', required: true },
  itemDescripcion: { label: 'Descripción del ítem', required: true },
  nroDocumento: { label: 'Nro. documento' },
  tipoDoc: { label: 'Tipo de documento' },
  clienteNombre: { label: 'Cliente' },
  formaPago: { label: 'Forma de pago' },
  itemCantidad: { label: 'Cantidad' },
  itemPrecioUnitario: { label: 'Precio unitario' },
  itemSubtotal: { label: 'Subtotal ítem' },
  total: { label: 'Total documento' },
}

const FIELD_ORDER: (keyof ColumnMap)[] = [
  'fecha', 'itemDescripcion', 'nroDocumento', 'tipoDoc',
  'clienteNombre', 'formaPago', 'itemCantidad', 'itemPrecioUnitario', 'itemSubtotal', 'total',
]

function autoDetect(columns: string[]): ColumnMap {
  const lc = columns.map(c => c.toLowerCase().trim())

  const match = (patterns: string[]): string | undefined => {
    const idx = lc.findIndex(c => patterns.some(p => c.includes(p)))
    return idx >= 0 ? columns[idx] : undefined
  }

  const result: ColumnMap = {}
  const fecha = match(['fecha', 'date', 'emision', 'emisión'])
  if (fecha) result.fecha = fecha
  const nroDocumento = match(['nro', 'numero', 'número', 'comprobante', 'factura', 'doc'])
  if (nroDocumento) result.nroDocumento = nroDocumento
  const tipoDoc = match(['tipo', 'type', 'clase'])
  if (tipoDoc) result.tipoDoc = tipoDoc
  const clienteNombre = match(['cliente', 'razon', 'razón', 'nombre', 'customer'])
  if (clienteNombre) result.clienteNombre = clienteNombre
  const formaPago = match(['pago', 'payment', 'forma', 'cobro', 'medio'])
  if (formaPago) result.formaPago = formaPago
  const itemDescripcion = match(['descrip', 'articulo', 'artículo', 'item', 'product', 'servicio'])
  if (itemDescripcion) result.itemDescripcion = itemDescripcion
  const itemCantidad = match(['cantidad', 'qty', 'cant', 'quantity'])
  if (itemCantidad) result.itemCantidad = itemCantidad
  const itemPrecioUnitario = match(['precio', 'unit', 'unitario', 'price'])
  if (itemPrecioUnitario) result.itemPrecioUnitario = itemPrecioUnitario
  const itemSubtotal = match(['subtotal', 'importe', 'monto'])
  if (itemSubtotal) result.itemSubtotal = itemSubtotal
  const total = match(['total'])
  if (total) result.total = total

  return result
}

export function ImportWizard({ onImportComplete, onClose }: ImportWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [columns, setColumns] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [fileName, setFileName] = useState('')
  const [columnMap, setColumnMap] = useState<ColumnMap>({})
  const [isImporting, setIsImporting] = useState(false)
  const [result, setResult] = useState<{ ventasImportadas: number; itemsImportados: number; errores: string[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const parseFile = useCallback((file: File) => {
    setFileName(file.name)
    const ext = file.name.split('.').pop()?.toLowerCase()

    if (ext === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          const cols = result.meta.fields || []
          const data = result.data as Record<string, string>[]
          setColumns(cols)
          setRows(data)
          setColumnMap(autoDetect(cols))
          setStep(2)
        },
        error: () => toast.error('Error al leer el archivo CSV'),
      })
    } else {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target?.result, { type: 'binary', cellDates: false })
          const sheetName = wb.SheetNames[0]
          if (!sheetName) { toast.error('El archivo no tiene hojas'); return }
          const ws = wb.Sheets[sheetName]
          if (!ws) { toast.error('No se pudo leer la hoja'); return }
          const data = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '', raw: false })
          const cols = Object.keys(data[0] || {})
          setColumns(cols)
          setRows(data)
          setColumnMap(autoDetect(cols))
          setStep(2)
        } catch {
          toast.error('Error al leer el archivo Excel')
        }
      }
      reader.readAsBinaryString(file)
    }
  }, [])

  const handleFile = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['csv', 'xls', 'xlsx'].includes(ext || '')) {
      toast.error('Solo se aceptan archivos CSV, XLS o XLSX')
      return
    }
    parseFile(file)
  }

  const isValid = columnMap.fecha && columnMap.itemDescripcion

  // Preview: group rows by key to show estimated ventas count
  const previewGroups = (() => {
    if (!isValid) return []
    const seen = new Set<string>()
    rows.slice(0, 5).forEach(row => {
      const fecha = row[columnMap.fecha!] || ''
      const nro = columnMap.nroDocumento ? row[columnMap.nroDocumento] || '' : ''
      seen.add(`${fecha}__${nro}`)
    })
    return Array.from(seen)
  })()

  const totalGroups = (() => {
    if (!isValid) return 0
    const seen = new Set<string>()
    rows.forEach(row => {
      const fecha = row[columnMap.fecha!] || ''
      const nro = columnMap.nroDocumento ? row[columnMap.nroDocumento] || '' : ''
      seen.add(`${fecha}__${nro}`)
    })
    return seen.size
  })()

  const handleImport = async () => {
    setIsImporting(true)
    try {
      const res = await fetch('/api/ventas/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, columnMap }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Error al importar')
        return
      }
      setResult(data)
      setStep(3)
      onImportComplete()
    } catch {
      toast.error('Error de conexión')
    } finally {
      setIsImporting(false)
    }
  }

  const NO_COLUMN = '__none__'

  return (
    <div className="space-y-5">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
              ${step === s ? 'bg-blue-600 text-white' : step > s ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
              {step > s ? <Check className="h-3.5 w-3.5" /> : s}
            </div>
            <span className={step === s ? 'text-slate-700 font-medium' : 'text-slate-400'}>
              {s === 1 ? 'Archivo' : s === 2 ? 'Mapear columnas' : 'Confirmar'}
            </span>
            {s < 3 && <ChevronRight className="h-4 w-4 text-slate-300" />}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <div
          className="border-2 border-dashed border-slate-300 rounded-lg p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const file = e.dataTransfer.files[0]
            if (file) handleFile(file)
          }}
        >
          <FileSpreadsheet className="h-10 w-10 mx-auto text-slate-400 mb-3" />
          <p className="text-sm font-medium text-slate-700">Arrastrá tu archivo o hacé clic para seleccionar</p>
          <p className="text-xs text-slate-500 mt-1">CSV, XLS o XLSX</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xls,.xlsx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
            }}
          />
        </div>
      )}

      {/* Step 2: Column mapping */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-md px-3 py-2">
            <FileSpreadsheet className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{fileName}</span>
            <span className="flex-shrink-0">— {rows.length} filas detectadas</span>
          </div>

          <p className="text-sm text-slate-600">Asigná cada campo al nombre de columna de tu archivo:</p>

          <div className="space-y-2.5">
            {FIELD_ORDER.map((field) => {
              const { label, required } = FIELD_LABELS[field]
              return (
                <div key={field} className="grid grid-cols-2 items-center gap-3">
                  <label className="text-sm text-slate-700">
                    {label}
                    {required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <Select
                    value={columnMap[field] || NO_COLUMN}
                    onValueChange={(val) =>
                      setColumnMap((prev) => ({ ...prev, [field]: val === NO_COLUMN ? undefined : val }))
                    }
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="No disponible" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_COLUMN}>No disponible</SelectItem>
                      {columns.map((col) => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )
            })}
          </div>

          {/* Preview table */}
          {rows.length > 0 && columnMap.fecha && columnMap.itemDescripcion && (
            <div className="border border-slate-200 rounded-md overflow-hidden">
              <p className="text-xs font-medium text-slate-500 px-3 py-2 bg-slate-50 border-b">Vista previa (primeras 3 filas)</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      {([columnMap.fecha, columnMap.nroDocumento, columnMap.itemDescripcion, columnMap.total] as string[]).filter(Boolean).map(col => (
                        <th key={col} className="text-left px-3 py-1.5 text-slate-500 font-medium">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 3).map((row, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        {([columnMap.fecha, columnMap.nroDocumento, columnMap.itemDescripcion, columnMap.total] as string[]).filter(Boolean).map(col => (
                          <td key={col} className="px-3 py-1.5 text-slate-700 truncate max-w-[120px]">{row[col]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Volver
            </Button>
            <Button size="sm" disabled={!isValid} onClick={() => setStep(3)}>
              Continuar <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === 3 && !result && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium text-blue-800">Resumen de importación</p>
            <div className="text-sm text-blue-700 space-y-1">
              <p>• <strong>{totalGroups}</strong> ventas a importar</p>
              <p>• <strong>{rows.length}</strong> ítems en total</p>
              {previewGroups.length > 0 && (
                <p className="text-xs text-blue-600 mt-1">
                  Agrupado por fecha{columnMap.nroDocumento ? ' + nro. documento' : ''}
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Volver
            </Button>
            <Button onClick={handleImport} disabled={isImporting}>
              {isImporting ? (
                <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Importando...</>
              ) : (
                <><Upload className="h-4 w-4 mr-1.5" /> Importar {totalGroups} ventas</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Result */}
      {step === 3 && result && (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-1">
            <div className="flex items-center gap-2 text-emerald-700 font-medium">
              <Check className="h-5 w-5" />
              Importación completada
            </div>
            <p className="text-sm text-emerald-600">
              {result.ventasImportadas} ventas · {result.itemsImportados} ítems importados correctamente
            </p>
          </div>

          {result.errores?.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-2 text-amber-700 text-sm font-medium">
                <AlertCircle className="h-4 w-4" />
                {result.errores.length} filas con errores
              </div>
              <ul className="text-xs text-amber-600 space-y-0.5 max-h-24 overflow-y-auto">
                {result.errores.map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={onClose}>Cerrar</Button>
          </div>
        </div>
      )}
    </div>
  )
}
