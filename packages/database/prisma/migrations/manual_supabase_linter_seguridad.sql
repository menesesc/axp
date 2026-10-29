-- Avisos de seguridad del linter de Supabase (oct-2026).
--
-- La app accede a la base con Prisma como `postgres` (bypassrls) o con
-- service_role, así que nada de esto cambia lo que ve la app. Lo único que se
-- lee desde el navegador vía PostgREST es `usuarios`, `planes` y
-- `v_suscripcion_cliente`, que ya tienen RLS con políticas propias.

BEGIN;

-- 1) RLS en todas las tablas de public que no la tenían. Sin políticas:
--    anon/authenticated no ven nada por la API REST; postgres y service_role sí.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END $$;

-- 2) Las vistas aplican los permisos de quien consulta, no del dueño.
ALTER VIEW public.insumo_consumo_linea     SET (security_invoker = true);
ALTER VIEW public.receta_ingrediente_costo SET (security_invoker = true);
ALTER VIEW public.v_estadisticas_cliente   SET (security_invoker = true);
ALTER VIEW public.v_suscripcion_cliente    SET (security_invoker = true);
ALTER VIEW public.insumo_compra_linea      SET (security_invoker = true);
ALTER VIEW public.pos_mesa_estado          SET (security_invoker = true);

-- 3) search_path fijo en las funciones SECURITY DEFINER.
ALTER FUNCTION public.handle_new_user()       SET search_path = public, pg_temp;
ALTER FUNCTION public.get_user_cliente_id()   SET search_path = public, pg_temp;
ALTER FUNCTION public.is_user_admin()         SET search_path = public, pg_temp;
ALTER FUNCTION public.is_superadmin()         SET search_path = public, pg_temp;
ALTER FUNCTION public.get_current_user_info() SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_uso_mensual(uuid, integer, integer, bigint, numeric) SET search_path = public, pg_temp;

-- 4) Quién puede ejecutarlas por /rest/v1/rpc.
--    Las que usan las políticas RLS quedan para authenticated (las necesitan).
REVOKE EXECUTE ON FUNCTION public.get_user_cliente_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_user_admin()       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_superadmin()       FROM PUBLIC, anon;
--    El resto no lo llama nadie desde el navegador.
REVOKE EXECUTE ON FUNCTION public.get_current_user_info() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_uso_mensual(uuid, integer, integer, bigint, numeric) FROM PUBLIC, anon, authenticated;

COMMIT;
