-- Módulo 3 · Personal y Cuadrillas (HU-04)
-- Borrado lógico en cuadrillas y separación entre responsable y técnicos de apoyo

-- 1. Columna de estado activo/inactivo para borrado lógico de cuadrillas
ALTER TABLE public.cuadrillas
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

-- 2. Reconocer en RLS tanto al técnico responsable como a los técnicos de apoyo
CREATE OR REPLACE FUNCTION ruta_seguridad.pertenece_cuadrilla(p_cuadrilla_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.cuadrilla_usuario AS cu
    WHERE cu.usuario_id = ruta_seguridad.usuario_actual_id()
      AND cu.cuadrilla_id = p_cuadrilla_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.cuadrillas AS c
    WHERE c.id = p_cuadrilla_id
      AND c.responsable_id = ruta_seguridad.usuario_actual_id()
  );
$function$;
