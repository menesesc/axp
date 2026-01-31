# Gestión de Proveedores - Flujo de Trabajo

## 📋 Descripción

Sistema de gestión de proveedores con matching inteligente para reducir duplicados y mejorar la precisión del OCR.

## 🔄 Flujo de Trabajo Recomendado

### 1. **Crear Proveedores Manualmente (PRIMERO)**

**Antes** de procesar facturas, agrega tus proveedores al sistema desde el frontend:

1. Accede a **Dashboard → Proveedores**
2. Click en **"Nuevo Proveedor"**
3. Completa los datos:
   - **Razón Social**: Nombre legal completo (ej: "CARNES DEL SUDOESTE SRL")
   - **CUIT**: Número de CUIT si lo conoces (ej: "30-12345678-9")
   - **Alias**: Nombres alternativos separados por comas (ej: "CARNES SUDOESTE, DEL SUDOESTE")

💡 **Tip**: Los alias ayudan al sistema a encontrar coincidencias incluso cuando el OCR detecta mal el nombre.

### 2. **Procesar Facturas (AUTOMÁTICO)**

Cuando el worker procesa una factura con OCR, sigue esta estrategia de matching:

#### Estrategia de Búsqueda (en orden):

1. **Por CUIT** (más confiable)
   - Si el OCR detectó un CUIT, busca proveedor exacto
   - Valida que NO sea el CUIT del cliente (error común del OCR)

2. **Por Razón Social Exacta** (case-insensitive)
   - Busca coincidencia exacta con el nombre completo

3. **Por Alias**
   - Verifica si el nombre detectado está en los alias de algún proveedor

4. **Similitud de Texto** (fuzzy matching)
   - Calcula similitud por palabras en común
   - Umbral mínimo: **60%**
   - Ejemplo: "CARNES DEL SUDOESTE" vs "DEL SUPPLY" = bajo match ❌
   - Ejemplo: "CARNES DEL SUDOESTE" vs "CARNES SUDOESTE SRL" = buen match ✅

5. **Sin Match → Requiere Revisión Manual**
   - Si no encuentra coincidencia, deja `proveedorId = null`
   - El documento se marca como **PENDIENTE**
   - El usuario debe asignar el proveedor correcto desde el dashboard

#### Ventajas del Fuzzy Matching:

- **Evita duplicados**: "ACME SA" y "ACME S.A." se reconocen como el mismo proveedor
- **Tolerante a errores de OCR**: Pequeñas variaciones no crean proveedores nuevos
- **Aprendizaje automático**: Los nombres detectados se agregan como alias para mejorar futuros matches

### 3. **Revisar Documentos sin Proveedor**

Los documentos con `proveedorId = null` aparecerán como **PENDIENTE** en el dashboard.

**Próximamente**: Vista para asignar proveedores manualmente a estos documentos.

## 🎯 API Endpoints

### Listar Proveedores
```http
GET /api/proveedores?clienteId={clienteId}
```

### Crear Proveedor
```http
POST /api/proveedores
Content-Type: application/json

{
  "clienteId": "uuid",
  "razonSocial": "CARNES DEL SUDOESTE SRL",
  "cuit": "30-12345678-9",
  "alias": ["CARNES SUDOESTE", "DEL SUDOESTE"]
}
```

### Actualizar Proveedor
```http
PATCH /api/proveedores/{id}
Content-Type: application/json

{
  "razonSocial": "Nuevo nombre",
  "cuit": "30-12345678-9",
  "alias": ["Alias 1", "Alias 2"],
  "activo": true
}
```

### Eliminar/Desactivar Proveedor
```http
DELETE /api/proveedores/{id}
```

- Si tiene documentos asociados: **Soft delete** (marca como inactivo)
- Si no tiene documentos: **Hard delete** (elimina físicamente)

## 📊 Casos de Uso

### Caso 1: Proveedor ya existe con CUIT

```
OCR detecta: CUIT 30-12345678-9
Sistema: ✅ Encuentra proveedor por CUIT
Acción: Asigna automáticamente
```

### Caso 2: OCR detecta mal el nombre pero tiene alias

```
OCR detecta: "DEL SUPPLY SRL" 
Proveedor real: "CARNES DEL SUDOESTE SRL"
Alias configurado: ["DEL SUDOESTE", "CARNES SUDOESTE"]
Sistema: ❌ No hay alias que coincida con "DEL SUPPLY"
Fuzzy match: 🔍 Calcula similitud
Palabras comunes: "DEL" (1/3 = 33%)
Sistema: ❌ Por debajo del 60%
Acción: Marca como PENDIENTE para revisión manual
```

### Caso 3: Nombre similar pero sin CUIT

```
OCR detecta: "FRIGORIFICO LA PAMPA"
Proveedor real: "FRIGORIFICO LA PAMPA SA"
Fuzzy match: 🔍 Calcula similitud
Palabras comunes: "FRIGORIFICO", "LA", "PAMPA" (3/4 = 75%)
Sistema: ✅ Match encontrado (>60%)
Acción: Asigna automáticamente y agrega "FRIGORIFICO LA PAMPA" a alias
```

## 🔧 Configuración del Worker

El matching inteligente está implementado en:
```typescript
/apps/worker/src/ocr/ocrProcessor.ts
```

### Variables clave:

- **Umbral de similitud**: `0.6` (60%)
- **Normalización**: Elimina puntuación, convierte a minúsculas
- **Algoritmo**: Similitud por palabras en común (Jaccard simplificado)

## 🚀 Mejoras Futuras

1. **UI para asignar proveedores a documentos PENDIENTES**
2. **Sugerencias de proveedores** basadas en similitud durante la asignación manual
3. **Historial de cambios** en proveedores
4. **Importación masiva** de proveedores desde CSV
5. **Algoritmo de similitud más avanzado** (Levenshtein distance, TF-IDF)

## 📝 Notas Importantes

- ⚠️ **NO se crean proveedores automáticamente** si no hay match >= 60%
- ✅ **Siempre valida** que el CUIT detectado no sea el del cliente
- 📈 **El sistema aprende**: Los alias mejoran el matching con el tiempo
- 🔄 **Realtime**: Los cambios en proveedores se reflejan inmediatamente en el dashboard

## 🆘 Solución de Problemas

### "Se creó un proveedor duplicado"

1. Ve a **Proveedores**
2. Edita el proveedor correcto
3. Agrega el nombre duplicado como **alias**
4. Desactiva o elimina el proveedor duplicado
5. Los documentos del duplicado se pueden reasignar manualmente

### "El OCR no encuentra el proveedor correcto"

1. Ve a **Proveedores**
2. Edita el proveedor
3. Agrega variaciones del nombre como **alias**
4. Reprocesa el documento (próximamente)

### "Necesito cambiar el CUIT de un proveedor"

1. Ve a **Proveedores**
2. Click en editar
3. Actualiza el CUIT
4. Los documentos asociados se mantienen vinculados
