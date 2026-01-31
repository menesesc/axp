# Página de Detalle de Documentos

## 🎯 Funcionalidad

Visualización completa de un documento con:
- Información general (proveedor, cliente, fechas)
- Montos (subtotal, IVA, total)
- Items de la factura (líneas de detalle)
- Visor de PDF integrado
- Indicador de campos faltantes

## 📍 URL

```
/documento/[id]
```

## 🚀 Cómo Acceder

### Desde el Listado de Documentos

**Doble clic** en cualquier fila del listado de documentos para abrir el detalle.

Visual:
```
┌────────────────────────────────────────────────────────┐
│ ☑ Fecha     Tipo  N°Doc      Proveedor    Total  Est. │
├────────────────────────────────────────────────────────┤
│ □ 10/01/25  FC B  0001-123   Carnes... $15,000  ✅ CF │ ← Doble clic aquí
│ □ 09/01/25  FC A  0002-456   Del Sup... $8,500  ⏳ PD │
└────────────────────────────────────────────────────────┘
```

## 🎨 Diseño de Interfaz

### Layout
- **Columna Izquierda**: Información y datos del documento
- **Columna Derecha**: Visor de PDF (sticky)

### Secciones

#### 1. Header (Fixed Top)
- Botón de volver
- Título del documento (Tipo + Letra + Número)
- Proveedor
- Badge de estado

#### 2. Información General
- 🏢 Proveedor (razón social + CUIT)
- 🏢 Cliente
- 📅 Fecha de emisión
- 📅 Fecha de vencimiento (opcional)

#### 3. Montos
- Subtotal
- IVA
- **Total** (destacado)

#### 4. Campos Faltantes (si aplica)
- Alert amarillo con lista de campos faltantes
- Ejemplo: "Faltan: Letra, Número completo, Subtotal, IVA"

#### 5. Items de Factura
- Tabla con columnas:
  - **#**: Número de línea
  - **Descripción**: Nombre del producto/servicio
  - **Cant.**: Cantidad y unidad
  - **P. Unit.**: Precio unitario
  - **Subtotal**: Subtotal de la línea

#### 6. Visor de PDF
- Iframe con el PDF del documento
- Altura: Ocupa el espacio disponible (viewport - 200px)
- Sticky en scroll

## 🔧 Implementación Técnica

### API Endpoints

#### 1. GET `/api/documentos/[id]`
Obtiene el documento completo con sus relaciones:

```typescript
{
  documento: {
    id: string
    tipo: string
    letra: string | null
    numeroCompleto: string | null
    fechaEmision: string | null
    fechaVencimiento: string | null
    total: number | null
    subtotal: number | null
    iva: number | null
    estadoRevision: 'PENDIENTE' | 'CONFIRMADO' | 'ERROR' | 'DUPLICADO'
    missingFields: string[]
    pdfFinalKey: string | null
    pdfRawKey: string
    clientes: { id: string; nombre: string }
    proveedores: { id: string; razonSocial: string; cuit: string } | null
  },
  items: [
    {
      id: string
      linea: number
      descripcion: string
      codigo: string | null
      cantidad: number | null
      unidad: string | null
      precioUnitario: number | null
      subtotal: number | null
    }
  ]
}
```

#### 2. GET `/api/pdf?key={pdfKey}`
Genera una URL firmada para acceder al PDF en R2:

```typescript
{
  url: string  // URL firmada válida por 1 hora
}
```

**Parámetros:**
- `key`: La clave del PDF en R2 (formato: `bucket/path/to/file.pdf`)

**Seguridad:**
- URL firmada con AWS SDK
- Expira en 1 hora (3600 segundos)
- Acceso directo a Cloudflare R2

### Componente React

**Archivo:** `/app/(dashboard)/documento/[id]/page.tsx`

**Queries:**
1. **Documento**: Obtiene datos del documento e items
2. **PDF URL**: Genera URL firmada del PDF (se actualiza cada 30 minutos)

**Features:**
- Loading state con spinner
- Error state con mensaje y botón de volver
- Responsive design (grid 1 columna en mobile, 2 en desktop)
- Sticky PDF viewer en desktop

## 📦 Dependencias

```json
{
  "@aws-sdk/client-s3": "^3.966.0",
  "@aws-sdk/s3-request-presigner": "^3.966.0"
}
```

Instalación:
```bash
bun add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

## 🔐 Variables de Entorno Requeridas

```env
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
```

## 🎯 Mejoras del Listado de Documentos

### Orden de Columnas (Optimizado)
1. ☑ **Checkbox** - Selección
2. 📅 **Fecha** - Fecha de emisión (sorteable)
3. 📄 **Tipo** - Tipo + Letra (FC B, ND A, etc.)
4. 🔢 **N° Documento** - Número completo
5. 🏢 **Proveedor** - Razón social
6. 💰 **Total** - Importe (sorteable)
7. 🏷️ **Estado** - Badge de estado

### Interacciones
- **Hover**: Fondo azul claro (`bg-blue-50`)
- **Doble clic**: Navega a `/documento/[id]`
- **Tooltip**: "Doble clic para ver detalles"
- **Checkbox click**: No propaga al doble clic (usa `stopPropagation`)

## 📊 Casos de Uso

### Caso 1: Ver Detalle de Factura
```
1. Usuario ve listado de documentos
2. Hace doble clic en una factura
3. Se abre la página de detalle
4. Ve la información y el PDF lado a lado
5. Puede revisar items línea por línea
```

### Caso 2: Identificar Campos Faltantes
```
1. Usuario abre documento PENDIENTE
2. Ve el alert amarillo con campos faltantes
3. Identifica qué información debe completar
4. (Futuro) Puede editar desde esta misma vista
```

### Caso 3: Verificar Items de Factura
```
1. Usuario abre documento
2. Revisa la tabla de items
3. Compara con el PDF visible
4. Verifica cantidades, precios y subtotales
```

## 🎨 Paleta de Colores

- **Fondo**: `bg-gray-50`
- **Cards**: `bg-white` con `border` y `shadow-sm`
- **Hover filas**: `bg-blue-50`
- **Alert faltantes**: `bg-amber-50` + `border-amber-200`
- **Estado PENDIENTE**: Badge amarillo
- **Estado CONFIRMADO**: Badge verde
- **Total destacado**: `text-blue-600` + `text-2xl` + `font-bold`

## 🚧 TODOs Futuros

- [ ] Edición inline de campos faltantes
- [ ] Botón de descarga del PDF
- [ ] Historial de revisiones del documento
- [ ] Botón de imprimir
- [ ] Comparación con otro documento
- [ ] Agregar comentarios/notas
- [ ] Validación de items vs montos totales
- [ ] Zoom del PDF
- [ ] Navegación entre documentos (anterior/siguiente)

## 🐛 Troubleshooting

### PDF no se muestra
1. Verificar que `pdfFinalKey` o `pdfRawKey` existan
2. Verificar variables de entorno de R2
3. Revisar consola del navegador para errores de CORS
4. Verificar que la URL firmada no haya expirado

### Items no aparecen
1. Verificar que existan en `documento_items`
2. Revisar relación `documentoId` en la BD
3. Consulta incluye `.order('linea', { ascending: true })`

### Doble clic no funciona
1. Verificar que la fila tenga `onDoubleClick`
2. Verificar que checkbox use `stopPropagation`
3. Verificar routing en Next.js
