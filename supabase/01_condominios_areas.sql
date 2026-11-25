-- Módulo 1 · Condominios y áreas
-- Restricciones de datos y permisos de escritura (solo administrador)

-- 1. Campos que nunca deben quedar vacíos
update condominios set activo = true where activo is null;
alter table condominios
  alter column activo set default true,
  alter column activo set not null;

update areas set requiere_lecturas = (tipo = 'alberca') where requiere_lecturas is null;
alter table areas
  alter column requiere_lecturas set default false,
  alter column requiere_lecturas set not null,
  alter column condominio_id set not null;

-- 2. Escritura: solo el administrador
create policy condominios_admin_insert on condominios
  for insert to authenticated
  with check (ruta_seguridad.es_admin());

create policy condominios_admin_update on condominios
  for update to authenticated
  using (ruta_seguridad.es_admin())
  with check (ruta_seguridad.es_admin());

create policy areas_admin_insert on areas
  for insert to authenticated
  with check (ruta_seguridad.es_admin());

create policy areas_admin_update on areas
  for update to authenticated
  using (ruta_seguridad.es_admin())
  with check (ruta_seguridad.es_admin());

-- Sin política DELETE en condominios a propósito:
-- se desactivan con activo = false para no perder historial.