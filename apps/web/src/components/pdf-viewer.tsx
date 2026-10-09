'use client'

import { useState, useRef } from 'react'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, RotateCw } from 'lucide-react'

interface PDFViewerProps {
  url: string
}

export default function PDFViewer({ url }: PDFViewerProps) {
  const [zoom, setZoom] = useState(100)
  const [page, setPage] = useState(1)
  const [rotation, setRotation] = useState(0)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Construir URL con parámetros de PDF.js
  const getPdfUrl = () => {
    const params = new URLSearchParams({
      zoom: zoom.toString(),
      page: page.toString(),
      rotate: rotation.toString(),
    })
    return `${url}#${params.toString()}`
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
      <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2 text-sm">
          📄 Documento PDF
        </h2>
        
        {/* Controles */}
        <div className="flex items-center gap-3">
          {/* Navegación de páginas */}
          <div className="flex items-center gap-1 border-r pr-3">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="p-1.5 hover:bg-gray-200 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="number"
              value={page}
              onChange={(e) => setPage(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-12 text-center text-sm border rounded px-1 py-0.5"
              min="1"
            />
            <button
              onClick={() => setPage(page + 1)}
              className="p-1.5 hover:bg-gray-200 rounded transition-colors"
              title="Página siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          
          {/* Controles de Zoom */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setZoom(Math.max(50, zoom - 25))}
              className="p-1.5 hover:bg-gray-200 rounded transition-colors disabled:opacity-30"
              title="Alejar"
              disabled={zoom <= 50}
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <select
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="text-sm border rounded px-2 py-1 bg-white"
            >
              <option value={50}>50%</option>
              <option value={75}>75%</option>
              <option value={100}>100%</option>
              <option value={125}>125%</option>
              <option value={150}>150%</option>
              <option value={200}>200%</option>
            </select>
            <button
              onClick={() => setZoom(Math.min(200, zoom + 25))}
              className="p-1.5 hover:bg-gray-200 rounded transition-colors disabled:opacity-30"
              title="Acercar"
              disabled={zoom >= 200}
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              onClick={() => setZoom(100)}
              className="p-1.5 hover:bg-gray-200 rounded transition-colors"
              title="Ajustar al ancho"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setRotation((rotation + 90) % 360)}
              className="p-1.5 hover:bg-gray-200 rounded transition-colors"
              title="Rotar"
            >
              <RotateCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      
      {/* Marco con proporción A4 (210 x 297 mm). Antes era una altura fija
          atada al viewport, así que la hoja quedaba achatada o estirada según
          la pantalla y sobraba gris a los costados.

          El ancho máximo sale de la altura disponible por 0.707 (=210/297):
          en pantalla ancha manda el alto y la hoja entra entera sin scroll;
          en pantalla angosta manda el ancho y el alto lo sigue. */}
      <div className="bg-gray-100 p-3">
        <div
          className="relative mx-auto aspect-[210/297] w-full overflow-hidden rounded bg-white shadow-sm"
          style={{ maxWidth: 'min(100%, calc((100vh - 15rem) * 0.707))' }}
        >
          <iframe
            ref={iframeRef}
            key={`${zoom}-${page}-${rotation}`}
            src={getPdfUrl()}
            className="absolute inset-0 h-full w-full border-0"
            title="PDF Viewer"
          />
        </div>
      </div>
    </div>
  )
}

