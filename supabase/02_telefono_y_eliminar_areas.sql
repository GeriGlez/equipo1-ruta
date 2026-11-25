-- Módulo 1 · Teléfono de 10 dígitos y eliminar áreas

-- 1. Corregir teléfonos existentes
--    Quita espacios, guiones y letras ('322 150 4789' -> '3221504789')
update condominios
set telefono = regexp_replace(telefono, '\D', '', 'g')
where telefono is not null;

--    Lo que no quede en 10 dígitos no es un teléfono válido ('fff')
update condominios
set telefono = null
where telefono is not null and telefono !~ '^[0-9]{10}$';

-- 2. Regla en la base: vacío o exactamente 10 dígitos
alter table condominios
  add constraint condominios_telefono_10_digitos
  check (telefono is null or telefono ~ '^[0-9]{10}$');

-- 3. Eliminar áreas: solo el administrador
create policy areas_admin_delete on areas
  for delete to authenticated
  using (ruta_seguridad.es_admin());

-- Las llaves foráneas de ordenes_servicio e incidencias hacia areas
-- no tienen ON DELETE, así que Postgres impide borrar un área
-- que ya tenga órdenes o incidencias: el historial queda protegido.