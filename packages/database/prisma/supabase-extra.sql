-- ============================================================================
-- AXP - SQL Adicional para Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================================

-- Habilitar extensión para búsqueda con trigramas (full-text search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- ÍNDICES GIN con pg_trgm para SUPERBUSCADOR
-- ============================================================================

-- Búsqueda por razón social de proveedor (tolerante a typos)
CREATE INDEX IF NOT EXISTS idx_proveedores_razon_social_trgm 
ON proveedores USING GIN (razon_social gin_trgm_ops);

-- Búsqueda por número completo de documento
CREATE INDEX IF NOT EXISTS idx_documentos_numero_completo_trgm 
ON documentos USING GIN (numero_completo gin_trgm_ops);

-- Búsqueda por descripción de items (el más usado en búsquedas)
CREATE INDEX IF NOT EXISTS idx_documento_items_descripcion_trgm 
ON documento_items USING GIN (descripcion gin_trgm_ops);

-- Búsqueda por CUIT de proveedor (exacta, pero útil)
CREATE INDEX IF NOT EXISTS idx_proveedores_cuit_trgm 
ON proveedores USING GIN (cuit gin_trgm_ops);

-- ============================================================================
-- CONSTRAINT: Usuario SUPERADMIN no debe tener clienteId
-- (Prisma no soporta CHECK constraints complejos en schema)
-- ============================================================================

ALTER TABLE usuarios 
ADD CONSTRAINT usuarios_rol_cliente_check 
CHECK (
  (rol = 'SUPERADMIN' AND cliente_id IS NULL) OR
  (rol != 'SUPERADMIN' AND cliente_id IS NOT NULL)
);

-- ============================================================================
-- ÍNDICE PARCIAL: Proveedores con CUIT único por cliente
-- (Workaround para UNIQUE con NULLs - ya está en Prisma schema)
-- ============================================================================

-- Este índice permite buscar rápido proveedores con CUIT
-- y garantiza unicidad (clienteId, cuit) cuando cuit NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_proveedores_cliente_cuit_not_null
ON proveedores (cliente_id, cuit)
WHERE cuit IS NOT NULL;

-- ============================================================================
-- ÍNDICE COMPUESTO: Búsquedas comunes de documentos
-- ============================================================================

-- Búsqueda por cliente + rango de fechas + estado (muy común)
CREATE INDEX IF NOT EXISTS idx_documentos_cliente_fecha_estado
ON documentos (cliente_id, fecha_emision DESC, estado_revision);

-- Búsqueda por cliente + proveedor + fecha (reportes)
CREATE INDEX IF NOT EXISTS idx_documentos_cliente_proveedor_fecha
ON documentos (cliente_id, proveedor_id, fecha_emision DESC)
WHERE proveedor_id IS NOT NULL;

-- ============================================================================
-- ÍNDICE: Pagos pendientes de conciliación
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_pagos_cliente_estado_fecha
ON pagos (cliente_id, estado, fecha DESC);

-- ============================================================================
-- ÍNDICE: Cola de ingesta para worker (optimización de polling)
-- ============================================================================

-- Worker consulta por status PENDING y nextRetryAt <= now()
CREATE INDEX IF NOT EXISTS idx_ingest_queue_worker_poll
ON ingest_queue (status, next_retry_at)
WHERE status IN ('PENDING', 'ERROR');

-- ============================================================================
-- FUNCIÓN: Actualizar timestamp automático (si lo preferís vs Prisma)
-- ============================================================================

-- Esta función puede usarse en triggers para updated_at
-- Prisma ya maneja @updatedAt, así que es opcional

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ejemplo de trigger (comentado porque Prisma lo maneja):
-- CREATE TRIGGER update_clientes_updated_at
-- BEFORE UPDATE ON clientes
-- FOR EACH ROW
-- EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- POLÍTICA RLS (Row Level Security) - OPCIONAL
-- ============================================================================

-- Si querés habilitar RLS para multi-tenant a nivel DB:
-- ALTER TABLE documentos ENABLE ROW LEVEL SECURITY;
-- 
-- CREATE POLICY documentos_tenant_isolation ON documentos
-- FOR ALL
-- USING (cliente_id = current_setting('app.current_tenant_id')::uuid);
--
-- Luego en app:
-- SET app.current_tenant_id = 'uuid-del-cliente';

-- ============================================================================
-- VIEWS ÚTILES (Opcional)
-- ============================================================================

-- View: Documentos con información de proveedor
CREATE OR REPLACE VIEW v_documentos_completos AS
SELECT 
  d.*,
  p.razon_social as proveedor_razon_social,
  p.cuit as proveedor_cuit,
  c.razon_social as cliente_razon_social,
  c.cuit as cliente_cuit
FROM documentos d
LEFT JOIN proveedores p ON d.proveedor_id = p.id
INNER JOIN clientes c ON d.cliente_id = c.id;

-- View: Deuda por proveedor
CREATE OR REPLACE VIEW v_deuda_por_proveedor AS
SELECT 
  d.cliente_id,
  d.proveedor_id,
  p.razon_social as proveedor,
  SUM(d.total) as total_documentos,
  COALESCE(SUM(pd.monto_aplicado), 0) as total_pagado,
  SUM(d.total) - COALESCE(SUM(pd.monto_aplicado), 0) as saldo_pendiente
FROM documentos d
INNER JOIN proveedores p ON d.proveedor_id = p.id
LEFT JOIN pago_documentos pd ON d.id = pd.documento_id
WHERE d.tipo = 'FACTURA' 
  AND d.estado_revision = 'CONFIRMADO'
GROUP BY d.cliente_id, d.proveedor_id, p.razon_social
HAVING SUM(d.total) - COALESCE(SUM(pd.monto_aplicado), 0) > 0;

-- ============================================================================
-- COMENTARIOS EN TABLAS (Documentación)
-- ============================================================================

COMMENT ON TABLE clientes IS 'Multi-tenant root: cada cliente es un tenant aislado';
COMMENT ON TABLE usuarios IS 'Usuarios con roles. SUPERADMIN tiene cliente_id NULL';
COMMENT ON TABLE proveedores IS 'Proveedores por cliente. Consolida variaciones de OCR';
COMMENT ON TABLE documentos IS 'Facturas, remitos, NC. Idempotencia por hash SHA256';
COMMENT ON TABLE documento_items IS 'Detalle de artículos. Indexado para búsqueda full-text';
COMMENT ON TABLE documento_revisiones IS 'Auditoría completa de cambios humanos';
COMMENT ON TABLE pagos IS 'Pagos por proveedor. Puede tener múltiples métodos';
COMMENT ON TABLE pago_metodos IS 'Efectivo, transferencia, cheque. Meta en JSONB';
COMMENT ON TABLE pago_documentos IS 'Aplicación de pagos a documentos con montos parciales';
COMMENT ON TABLE ingest_queue IS 'Cola de procesamiento para worker. Idempotencia por source+ref';

-- ============================================================================
-- GRANTS (Opcional - si usás roles personalizados)
-- ============================================================================

-- Ejemplo para role de app:
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO axp_app_role;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO axp_app_role;

-- ============================================================================
-- FINALIZADO
-- ============================================================================

-- Verificar extensiones instaladas:
-- SELECT * FROM pg_extension WHERE extname = 'pg_trgm';

-- Verificar índices creados:
-- SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename;
