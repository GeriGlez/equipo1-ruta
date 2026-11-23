-- =====================================================
-- RUTA - Módulo 6: Insumos y consumo (HU-11)
-- Tablas oficiales según la especificación del PO:
--   10. insumos (nombre, unidad, existencia)
--   11. visita_insumo (visita_id, insumo_id, cantidad)
-- =====================================================

create table if not exists public.insumos (
  id          bigint generated always as identity primary key,
  nombre      text    not null,
  unidad      text    not null,
  existencia  numeric not null default 0 check (existencia >= 0),
  created_at  timestamptz not null default now()
);

create unique index if not exists insumos_nombre_unico
  on public.insumos (lower(nombre));


create table if not exists public.visita_insumo (
  id         bigint generated always as identity primary key,
  visita_id  bigint not null references public.visitas(id) on delete cascade,
  insumo_id  bigint not null references public.insumos(id),
  cantidad   numeric not null check (cantidad > 0),
  created_at timestamptz not null default now()
);

create index if not exists visita_insumo_visita_idx
  on public.visita_insumo (visita_id);

create index if not exists visita_insumo_insumo_idx
  on public.visita_insumo (insumo_id);


-- ---------- Descuento de existencia automático ----------
create or replace function public.ajustar_existencia_insumo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update insumos
    set existencia = existencia - new.cantidad
    where id = new.insumo_id;
  elsif tg_op = 'UPDATE' then
    update insumos
    set existencia = existencia + old.cantidad - new.cantidad
    where id = new.insumo_id;
  elsif tg_op = 'DELETE' then
    update insumos
    set existencia = existencia + old.cantidad
    where id = old.insumo_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_ajustar_existencia_insumo on public.visita_insumo;

create trigger trg_ajustar_existencia_insumo
after insert or update or delete on public.visita_insumo
for each row execute function public.ajustar_existencia_insumo();


-- ---------- Seguridad (RLS) ----------
alter table public.insumos enable row level security;
alter table public.visita_insumo enable row level security;

-- Catálogo: todos los autenticados leen; solo admin modifica
drop policy if exists insumos_select on public.insumos;
create policy insumos_select on public.insumos
  for select to authenticated using (true);

drop policy if exists insumos_admin on public.insumos;
create policy insumos_admin on public.insumos
  for all to authenticated
  using (ruta_seguridad.es_admin())
  with check (ruta_seguridad.es_admin());

-- Consumos en visita: admin ve todo; técnico solo en sus visitas asignadas
drop policy if exists visita_insumo_admin on public.visita_insumo;
create policy visita_insumo_admin on public.visita_insumo
  for all to authenticated
  using (ruta_seguridad.es_admin())
  with check (ruta_seguridad.es_admin());

drop policy if exists visita_insumo_tecnico on public.visita_insumo;
create policy visita_insumo_tecnico on public.visita_insumo
  for all to authenticated
  using (
    exists (
      select 1
      from visitas v
      join usuarios u on u.id = v.tecnico_id
      where v.id = visita_insumo.visita_id
        and u.correo = auth.email()
    )
  )
  with check (
    exists (
      select 1
      from visitas v
      join usuarios u on u.id = v.tecnico_id
      where v.id = visita_insumo.visita_id
        and u.correo = auth.email()
    )
  );
