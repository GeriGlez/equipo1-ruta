-- Módulo 3 · Personal y Cuadrillas (HU-04)
-- Borrado lógico en cuadrillas y separación entre responsable y técnicos de apoyo

-- 1. Columna de estado activo/inactivo para borrado lógico de cuadrillas
ALTER TABLE public.cuadrillas
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

-- 2. Limpiar registros históricos donde el responsable aparecía duplicado como apoyo
DELETE FROM public.cuadrilla_usuario cu
USING public.cuadrillas c
WHERE cu.cuadrilla_id = c.id
  AND cu.usuario_id = c.responsable_id;

-- 3. Reconocer en RLS tanto al técnico responsable como a los técnicos de apoyo
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

-- 4. Alta atómica de empleado en Supabase Auth (auth.users + auth.identities) y public.usuarios
CREATE OR REPLACE FUNCTION public.crear_empleado_con_auth(
  p_nombre text,
  p_correo text,
  p_telefono text,
  p_rol text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_uid uuid := gen_random_uuid();
  v_correo text := lower(trim(p_correo));
  v_nombre text := trim(p_nombre);
  v_telefono text := trim(p_telefono);
  v_rol text := lower(trim(coalesce(p_rol, 'tecnico')));
BEGIN
  IF NOT ruta_seguridad.es_admin() THEN
    RAISE EXCEPTION 'No tienes permisos de administrador para registrar empleados.';
  END IF;

  IF v_nombre = '' THEN
    RAISE EXCEPTION 'Por favor, ingresa el nombre completo del empleado.';
  END IF;

  IF v_correo = '' THEN
    RAISE EXCEPTION 'Por favor, ingresa el correo electrónico del empleado.';
  END IF;

  IF p_password IS NULL OR char_length(p_password) < 6 THEN
    RAISE EXCEPTION 'La contraseña debe tener al menos 6 caracteres.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.usuarios WHERE lower(correo) = v_correo)
     OR EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_correo) THEN
    RAISE EXCEPTION 'Ya existe un empleado registrado con ese correo electrónico.';
  END IF;

  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_sso_user,
    is_anonymous,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    email_change_token_current,
    email_change_confirm_status,
    recovery_token,
    reauthentication_token,
    phone_change,
    phone_change_token
  ) VALUES (
    v_uid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    v_correo,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"email_verified":true}'::jsonb,
    false,
    false,
    now(),
    now(),
    '',
    '',
    '',
    '',
    0,
    '',
    '',
    '',
    ''
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_uid,
    v_uid::text,
    jsonb_build_object(
      'sub', v_uid::text,
      'email', v_correo,
      'email_verified', false,
      'phone_verified', false
    ),
    'email',
    now(),
    now(),
    now()
  );

  INSERT INTO public.usuarios (
    id,
    nombre,
    correo,
    telefono,
    rol,
    activo
  ) VALUES (
    v_uid,
    v_nombre,
    v_correo,
    v_telefono,
    v_rol,
    true
  );

  RETURN jsonb_build_object('id', v_uid, 'nombre', v_nombre);
END;
$$;

REVOKE ALL ON FUNCTION public.crear_empleado_con_auth(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_empleado_con_auth(text, text, text, text, text) TO authenticated;
