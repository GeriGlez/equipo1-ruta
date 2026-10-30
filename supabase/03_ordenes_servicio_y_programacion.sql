-- =============================================================================
-- Módulo 5 · Órdenes de servicio y programación semanal (HU-05, HU-06, HU-07)
-- Migración incremental y segura: preserva tablas, datos, políticas y módulos
-- existentes (autenticación, condominios, áreas, servicios, contratos y visitas).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columnas incrementales en ordenes_servicio
-- -----------------------------------------------------------------------------
alter table if exists ordenes_servicio
  alter column estado set default 'programada',
  alter column estado set not null,
  alter column condominio_id set not null,
  alter column area_id set not null,
  alter column servicio_id set not null,
  alter column fecha_programada set not null;

alter table if exists ordenes_servicio
  add column if not exists motivo_cancelacion text,
  add column if not exists cancelada_en timestamptz,
  add column if not exists contrato_id bigint,
  add column if not exists origen_generacion text not null default 'manual',
  add column if not exists clave_programacion text,
  add column if not exists id_local uuid;

-- Llave foránea opcional hacia contratos (ON DELETE SET NULL para conservar el historial)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'contratos'
  ) and not exists (
    select 1 from pg_constraint
    where conname = 'ordenes_servicio_contrato_id_fkey'
  ) then
    alter table ordenes_servicio
      add constraint ordenes_servicio_contrato_id_fkey
      foreign key (contrato_id) references contratos(id) on delete set null;
  end if;
end $$;

-- Preservar validez de órdenes canceladas históricas antes de agregar restricción
update ordenes_servicio
set motivo_cancelacion = 'Cancelación previa registrada en sistema'
where estado = 'cancelada'
  and (motivo_cancelacion is null or btrim(motivo_cancelacion) = '');

-- Restricciones CHECK en ordenes_servicio (solo si no existen)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ordenes_servicio_estado_valido_chk'
  ) then
    alter table ordenes_servicio
      add constraint ordenes_servicio_estado_valido_chk
      check (estado in ('programada', 'asignada', 'en_proceso', 'completada', 'cancelada'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ordenes_servicio_origen_valido_chk'
  ) then
    alter table ordenes_servicio
      add constraint ordenes_servicio_origen_valido_chk
      check (origen_generacion in ('manual', 'programacion_semanal'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ordenes_servicio_motivo_cancelacion_chk'
  ) then
    alter table ordenes_servicio
      add constraint ordenes_servicio_motivo_cancelacion_chk
      check (
        estado <> 'cancelada'
        or (motivo_cancelacion is not null and length(btrim(motivo_cancelacion)) > 0)
      );
  end if;
end $$;

-- Índices únicos parciales para idempotencia de programación semanal y sincronización offline
create unique index if not exists ordenes_servicio_clave_programacion_uidx
  on ordenes_servicio (clave_programacion)
  where clave_programacion is not null;

create unique index if not exists ordenes_servicio_id_local_uidx
  on ordenes_servicio (id_local)
  where id_local is not null;

create index if not exists ordenes_servicio_fecha_programada_idx
  on ordenes_servicio (fecha_programada);

create index if not exists ordenes_servicio_contrato_fecha_idx
  on ordenes_servicio (contrato_id, fecha_programada)
  where contrato_id is not null;

-- -----------------------------------------------------------------------------
-- 2. Validación de coherencia Condominio-Área y protección de estados históricos
-- -----------------------------------------------------------------------------
create or replace function public.validar_integridad_orden_servicio()
returns trigger
language plpgsql
as $$
declare
  v_condominio_area bigint;
  v_tiene_visitas boolean;
begin
  if tg_op = 'DELETE' then
    if old.estado in ('en_proceso', 'completada') then
      raise exception 'No se puede eliminar una orden en estado % para proteger el historial.', old.estado;
    end if;

    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'visitas'
    ) then
      select exists(select 1 from visitas where orden_id = old.id) into v_tiene_visitas;
      if v_tiene_visitas then
        raise exception 'No se puede eliminar la orden #% porque ya tiene visitas registradas en bitácora.', old.id;
      end if;
    end if;

    return old;
  end if;

  -- Verificar que el área pertenezca al condominio seleccionado
  select condominio_id into v_condominio_area
  from areas
  where id = new.area_id;

  if v_condominio_area is null then
    raise exception 'El área seleccionada (%) no existe.', new.area_id;
  end if;

  if v_condominio_area <> new.condominio_id then
    raise exception 'El área seleccionada no pertenece al condominio indicado.';
  end if;

  if tg_op = 'INSERT' then
    if new.estado is null or btrim(new.estado) = '' then
      new.estado := 'programada';
    end if;
  elsif tg_op = 'UPDATE' then
    if old.estado = 'completada' and new.estado <> 'completada' then
      raise exception 'Una orden completada no puede cambiar de estado ni cancelarse.';
    end if;

    if old.estado = 'completada' and (
      new.condominio_id <> old.condominio_id or
      new.area_id <> old.area_id or
      new.servicio_id <> old.servicio_id or
      new.fecha_programada <> old.fecha_programada
    ) then
      raise exception 'No se pueden modificar los datos de una orden completada.';
    end if;

    if old.estado = 'en_proceso' and (
      new.condominio_id <> old.condominio_id or
      new.area_id <> old.area_id or
      new.servicio_id <> old.servicio_id or
      new.fecha_programada <> old.fecha_programada
    ) then
      raise exception 'No se pueden alterar condominio, área, servicio o fecha de una orden en proceso.';
    end if;

    if new.estado = 'cancelada' and old.estado <> 'cancelada' and new.cancelada_en is null then
      new.cancelada_en := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_integridad_orden_servicio on ordenes_servicio;
create trigger trg_validar_integridad_orden_servicio
  before insert or update or delete on ordenes_servicio
  for each row
  execute function public.validar_integridad_orden_servicio();

-- -----------------------------------------------------------------------------
-- 3. Columnas opcionales de relación en contratos (compatibles con módulo 4)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'contratos'
  ) then
    alter table contratos
      add column if not exists condominio_id bigint references condominios(id) on delete restrict,
      add column if not exists area_id bigint references areas(id) on delete restrict,
      add column if not exists servicio_id bigint references servicios(id) on delete restrict,
      add column if not exists fecha_inicio date,
      add column if not exists activo boolean not null default true;

    -- Vincular automáticamente condominio_id cuando el nombre coincida de forma única e inequívoca
    with coincidencias_unicas_condo as (
      select lower(btrim(nombre)) as nombre_norm, min(id) as unico_id
      from condominios
      group by lower(btrim(nombre))
      having count(*) = 1
    )
    update contratos c
    set condominio_id = u.unico_id
    from coincidencias_unicas_condo u
    where c.condominio_id is null
      and c.nombre_condominio is not null
      and lower(btrim(c.nombre_condominio)) = u.nombre_norm;

    -- Vincular automáticamente servicio_id cuando el nombre coincida de forma única e inequívoca
    with coincidencias_unicas_serv as (
      select lower(btrim(nombre)) as nombre_norm, min(id) as unico_id
      from servicios
      group by lower(btrim(nombre))
      having count(*) = 1
    )
    update contratos c
    set servicio_id = u.unico_id
    from coincidencias_unicas_serv u
    where c.servicio_id is null
      and c.servicio_nombre is not null
      and lower(btrim(c.servicio_nombre)) = u.nombre_norm;

    -- Inicializar fecha_inicio a partir de created_at cuando exista
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'contratos' and column_name = 'created_at'
    ) then
      update contratos
      set fecha_inicio = (created_at at time zone 'UTC')::date
      where fecha_inicio is null and created_at is not null;
    end if;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Políticas RLS para administrador en ordenes_servicio (sin duplicar)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'ruta_seguridad' and p.proname = 'es_admin'
  ) then
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'ordenes_servicio' and policyname = 'ordenes_servicio_admin_select'
    ) then
      create policy ordenes_servicio_admin_select on ordenes_servicio
        for select to authenticated
        using (ruta_seguridad.es_admin());
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'ordenes_servicio' and policyname = 'ordenes_servicio_admin_insert'
    ) then
      create policy ordenes_servicio_admin_insert on ordenes_servicio
        for insert to authenticated
        with check (ruta_seguridad.es_admin());
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'ordenes_servicio' and policyname = 'ordenes_servicio_admin_update'
    ) then
      create policy ordenes_servicio_admin_update on ordenes_servicio
        for update to authenticated
        using (ruta_seguridad.es_admin())
        with check (ruta_seguridad.es_admin());
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'ordenes_servicio' and policyname = 'ordenes_servicio_admin_delete'
    ) then
      create policy ordenes_servicio_admin_delete on ordenes_servicio
        for delete to authenticated
        using (ruta_seguridad.es_admin() and estado in ('programada', 'cancelada'));
    end if;
  end if;
end $$;
