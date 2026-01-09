# AWS Textract Setup para AXP

Este documento explica cómo configurar AWS Textract para el OCR Worker (Fase 2).

## 1. Crear cuenta AWS

1. Ir a https://aws.amazon.com/
2. Crear cuenta si no tienes una
3. Ingresar método de pago (tarjeta de crédito)

## 2. Crear usuario IAM para Textract

1. Ir a IAM Console: https://console.aws.amazon.com/iam/
2. Click en "Users" → "Create user"
3. Nombre: `axp-textract-user`
4. Permisos: Attach policies directly
5. Buscar y seleccionar: `AmazonTextractFullAccess`
6. Click "Create user"

## 3. Crear Access Keys

1. Ir al usuario recién creado
2. Tab "Security credentials"
3. Click "Create access key"
4. Caso de uso: "Application running outside AWS"
5. Click "Next" → "Create access key"
6. **IMPORTANTE**: Copiar y guardar:
   - Access Key ID
   - Secret Access Key (no se puede ver después)

## 4. Configurar variables de entorno

### Desarrollo Local (.env)

```bash
# AWS Textract Configuration
AWS_ACCESS_KEY_ID="AKIAXXXXXXXXXXXXXXXX"
AWS_SECRET_ACCESS_KEY="your-secret-access-key-here"
TEXTRACT_REGION="us-east-1"

# OCR Worker Configuration
WORKER_MODE="ocr"
OCR_POLL_INTERVAL="30000"  # 30 segundos
OCR_MAX_CONCURRENT_JOBS="3"
```

### Producción (Dokploy)

En Dokploy → Tu aplicación → Environment Variables:

```
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=your-secret-access-key-here
TEXTRACT_REGION=us-east-1
OCR_POLL_INTERVAL=30000
OCR_MAX_CONCURRENT_JOBS=3
```

## 5. Regiones disponibles

Textract está disponible en estas regiones:
- `us-east-1` (N. Virginia) - **Recomendado**
- `us-east-2` (Ohio)
- `us-west-1` (N. California)
- `us-west-2` (Oregon)
- `eu-west-1` (Irlanda)
- `eu-west-2` (Londres)
- `eu-central-1` (Frankfurt)

**Nota**: `us-east-1` tiene mejor cobertura de features y menor latencia desde Argentina.

## 6. Costos aproximados

AWS Textract pricing (2024):
- **Detect Document Text**: $1.50 por 1,000 páginas (solo texto)
- **Analyze Document (Forms + Tables)**: $50 por 1,000 páginas (nuestro caso)

Para 100 facturas/mes:
- 100 páginas × $0.05 = **$5 USD/mes**

Para 1,000 facturas/mes:
- 1,000 páginas × $0.05 = **$50 USD/mes**

**Free Tier** (primer año):
- 1,000 páginas gratis por mes para Detect Document Text
- **NO aplica** para Analyze Document (Forms + Tables)

## 7. Testing local

```bash
# En tu terminal local
cd /Volumes/Satechi2T/Programacion/axp/apps/worker

# Asegúrate que .env tiene las AWS credentials
bun run dev:ocr
```

El OCR worker:
1. Buscará PDFs en `inbox/` de todos los buckets R2
2. Los descargará uno por uno
3. Los enviará a AWS Textract
4. Parseará los resultados
5. Creará registro en tabla `Documento`
6. Moverá el PDF a `YYYY/MM/DD/` según fecha de emisión
7. Guardará el JSON de Textract en `textract-raw/`

## 8. Monitorear costos

1. AWS Console → Billing Dashboard
2. AWS Console → Cost Explorer
3. Configurar "Budget Alert" para recibir email si supera $10 USD/mes

## 9. Límites de AWS Textract

- Max file size: 5 MB (sync) o 500 MB (async)
- Max pages: 3,000 páginas (async)
- Concurrent requests: 10 por cuenta (default)
- Formatos soportados: PDF, PNG, JPEG, TIFF

Nuestro caso: Facturas típicas son 1 página ≈ 100-200 KB → Sin problemas

## 10. Troubleshooting

### Error: "UnrecognizedClientException"
- Las credenciales AWS son incorrectas
- Verificar Access Key ID y Secret Access Key

### Error: "AccessDeniedException"
- El usuario IAM no tiene permisos de Textract
- Agregar policy `AmazonTextractFullAccess`

### Error: "InvalidS3ObjectException"
- El PDF está corrupto o no es válido
- Verificar que el archivo sea un PDF válido

### Error: "ProvisionedThroughputExceededException"
- Demasiados requests concurrentes
- Reducir `OCR_MAX_CONCURRENT_JOBS` en .env

## 11. Deployment checklist

- [ ] Usuario IAM creado con `AmazonTextractFullAccess`
- [ ] Access Keys generados y guardados
- [ ] Variables de entorno configuradas en Dokploy
- [ ] Budget alert configurado en AWS ($10 USD/mes)
- [ ] Test local exitoso con `bun run dev:ocr`
- [ ] docker-compose.prod.yml actualizado con servicio `ocr`
- [ ] Git push para activar auto-deploy
- [ ] Verificar logs en Dokploy después del deploy
- [ ] Probar con PDF real: upload a WebDAV → inbox → OCR → organizado

## 12. Próximos pasos después de deploy

1. Subir un PDF de prueba vía WebDAV scanner
2. Verificar que aparece en `IngestQueue` con estado PENDING
3. Verificar que el processor lo sube a R2 `inbox/`
4. Verificar logs del OCR worker procesándolo
5. Verificar que se crea registro en tabla `Documento`
6. Verificar que el PDF se movió a `YYYY/MM/DD/`
7. Verificar que `pdfFinalKey` se actualizó en el registro

SQL útil:
```sql
-- Ver documentos recientes
SELECT * FROM "Documento" ORDER BY "createdAt" DESC LIMIT 10;

-- Ver documentos en estado PENDIENTE (necesitan revisión)
SELECT * FROM "Documento" WHERE "estadoRevision" = 'PENDIENTE';

-- Ver archivos en inbox (sin procesar por OCR)
SELECT * FROM "IngestQueue" 
WHERE estado = 'DONE' 
AND "ingestMetadata"->>'pdfRawKey' LIKE '%inbox/%';
```
