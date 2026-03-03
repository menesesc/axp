/**
 * Comprime y auto-rota imágenes del celular antes de subir.
 * Usa createImageBitmap con imageOrientation para respetar EXIF.
 * Mantiene resolución suficiente para OCR (Textract necesita ~200 DPI).
 */

const MAX_DIMENSION = 2400 // px — suficiente para A4 a ~200 DPI
const JPEG_QUALITY = 0.85

/**
 * Comprime una imagen manteniendo calidad para OCR.
 * - Auto-rota según EXIF (fotos de celular)
 * - Redimensiona a máximo 2400px de lado mayor
 * - Comprime a JPEG quality 85%
 * - Retorna un nuevo File con el mismo nombre pero extensión .jpg
 */
export async function compressImage(file: File): Promise<File> {
  // Solo procesar imágenes
  if (!file.type.startsWith('image/')) return file

  // PDFs no se comprimen
  if (file.type === 'application/pdf') return file

  try {
    // createImageBitmap con imageOrientation respeta EXIF (rotación)
    const bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
    })

    let { width, height } = bitmap

    // Calcular nuevas dimensiones manteniendo aspect ratio
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height)
      width = Math.round(width * ratio)
      height = Math.round(height * ratio)
    }

    // Dibujar en canvas con las dimensiones correctas
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return file
    }

    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    // Exportar como JPEG
    const blob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: JPEG_QUALITY,
    })

    // Si la compresión no redujo el tamaño, devolver original
    if (blob.size >= file.size) {
      return file
    }

    // Crear nuevo File con nombre .jpg
    const newName = file.name.replace(/\.\w+$/, '.jpg')
    return new File([blob], newName, { type: 'image/jpeg' })
  } catch (err) {
    console.warn('Error comprimiendo imagen, usando original:', err)
    return file
  }
}

/**
 * Comprime múltiples imágenes en paralelo.
 */
export async function compressImages(files: File[]): Promise<File[]> {
  return Promise.all(files.map(compressImage))
}
