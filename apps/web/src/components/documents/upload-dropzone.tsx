'use client'

import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Upload, X, FileText, ImageIcon, Loader2, Camera } from 'lucide-react'
import { toast } from 'sonner'
import { compressImages } from '@/lib/image-utils'

interface UploadDropzoneProps {
  onUploadComplete: () => void
  onClose: () => void
}

const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export function UploadDropzone({ onUploadComplete, onClose }: UploadDropzoneProps) {
  const [files, setFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return `${file.name}: tipo no soportado`
    }
    if (file.size > MAX_SIZE) {
      return `${file.name}: excede 10MB`
    }
    return null
  }

  const addFiles = useCallback(async (newFiles: FileList | File[]) => {
    const valid: File[] = []
    for (const file of Array.from(newFiles)) {
      const error = validateFile(file)
      if (error) {
        toast.error(error)
      } else {
        valid.push(file)
      }
    }
    if (valid.length === 0) return

    // Comprimir imágenes (auto-rota y reduce tamaño)
    const processed = await compressImages(valid)
    setFiles((prev) => [...prev, ...processed])
  }, [])

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files)
    }
  }

  const handleUpload = async () => {
    if (files.length === 0) return
    setIsUploading(true)
    setProgress(0)

    try {
      const formData = new FormData()
      files.forEach((file) => formData.append('files', file))

      const data = await new Promise<{ uploaded?: number; errors?: string[]; error?: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest()

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100)
            setProgress(pct)
          }
        })

        xhr.addEventListener('load', () => {
          try {
            const json = JSON.parse(xhr.responseText)
            if (xhr.status >= 400) {
              reject(new Error(json.error || 'Error al subir archivos'))
            } else {
              resolve(json)
            }
          } catch {
            reject(new Error('Error al procesar respuesta'))
          }
        })

        xhr.addEventListener('error', () => reject(new Error('Error de red')))
        xhr.open('POST', '/api/documentos/upload')
        xhr.send(formData)
      })

      if (data.errors?.length) {
        data.errors.forEach((err: string) => toast.error(err))
      }

      if (data.uploaded && data.uploaded > 0) {
        toast.success(`${data.uploaded} archivo${data.uploaded !== 1 ? 's' : ''} subido${data.uploaded !== 1 ? 's' : ''} correctamente. Se procesarán automáticamente.`)
        setFiles([])
        onUploadComplete()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al subir archivos')
    } finally {
      setIsUploading(false)
      setProgress(0)
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const isImage = (type: string) => type.startsWith('image/')

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
          }
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="h-8 w-8 mx-auto text-slate-400 mb-3" />
        <p className="text-sm font-medium text-slate-700">
          Arrastra archivos aquí o haz clic para seleccionar
        </p>
        <p className="text-xs text-slate-500 mt-1">
          PDF, JPG, PNG — máximo 10MB por archivo
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {/* Scan button - opens camera on mobile */}
      <button
        type="button"
        onClick={() => cameraInputRef.current?.click()}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <Camera className="h-4 w-4" />
        Escanear documento
      </button>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">
            {files.length} archivo{files.length !== 1 ? 's' : ''} seleccionado{files.length !== 1 ? 's' : ''}
          </p>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-md text-sm"
              >
                {isImage(file.type) ? (
                  <ImageIcon className="h-4 w-4 text-slate-400 flex-shrink-0" />
                ) : (
                  <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                )}
                <span className="truncate flex-1">{file.name}</span>
                <span className="text-xs text-slate-500 flex-shrink-0">
                  {formatSize(file.size)}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeFile(index)
                  }}
                  className="p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress bar */}
      {isUploading && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-500">
            <span>Subiendo...</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={isUploading}>
          Cancelar
        </Button>
        <Button
          onClick={handleUpload}
          disabled={files.length === 0 || isUploading}
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-1.5" />
          )}
          {isUploading ? 'Subiendo...' : `Subir ${files.length > 0 ? files.length : ''} archivo${files.length !== 1 ? 's' : ''}`}
        </Button>
      </div>
    </div>
  )
}
