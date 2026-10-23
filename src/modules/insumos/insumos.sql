-- =====================================================
-- RUTA - HU-11 Insumos y consumo
-- Ejecutar en el SQL Editor de Supabase.
--
-- SUPUESTOS (ajusta si tu esquema es distinto):
--   * visitas.id es bigint
--   * usuarios(id, correo) existe y el técnico se relaciona
--     con Supabase Auth por correo (igual que en el front)
--   * Existe ruta_seguridad.es_admin() (ya la usan 01 y 02)
-- =====================================================

create table if not exists public.insumos (
  id          bigint generated always as identity primary key,
  nombre      text    not null,
  tipo        text,
  unidad      text    not null,
  stock       numeric not null default 0,   -- existencia actual
  cantidad    numeric not null default 0,   -- cantidad total registrada
  descripcion text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

create unique index if not exists insumos_nombre_unico
  on public.insumos (lower(nombre));


create table if not exists public.consumos_insumo (
  id         bigint generated always as identity primary key,
  id_local   uuid   not null unique,        -- idempotencia offline
  visita_id  bigint not null references public.visitas(id) on delete cascade,
  insumo_id  bigint not null references public.insumos(id),
  cantidad   numeric not null check (cantidad > 0),
  created_at timestamptz not null default now()
);

create index if not exists consumos_insumo_visita_idx
  on public.consumos_insumo (visita_id);


-- ---------- Stock automático ----------
create or replace function public.ajustar_stock_insumo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update insumos set stock = stock - new.cantidad where id = new.insumo_id;
  elsif tg_op = 'UPDATE' then
    update insumos set stock = stock + old.cantidad where id = old.insumo_id;
    update insumos set stock = stock - new.cantidad where id = new.insumo_id;
  elsif tg_op = 'DELETE' then
    update insumos set stock = stock + old.cantidad where id = old.insumo_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_ajustar_stock_insumo on public.consumos_insumo;

create trigger trg_ajustar_stock_insumo
after insert or update or delete on public.consumos_insumo
for each row execute function public.ajustar_stock_insumo();


-- ---------- Seguridad (RLS) ----------
-- Se usa la función que ya existe en tu base: ruta_seguridad.es_admin()

alter table public.insumos enable row level security;
alter table public.consumos_insumo enable row level security;

-- Catálogo: todos los autenticados leen; solo admin escribe
create policy insumos_select on public.insumos
  for select to authenticated using (true);

create policy insumos_admin on public.insumos
  for all to authenticated
  using (ruta_seguridad.es_admin())
  with check (ruta_seguridad.es_admin());

-- Consumos: admin ve todo; técnico solo en sus visitas
create policy consumos_admin on public.consumos_insumo
  for all to authenticated
  using (ruta_seguridad.es_admin())
  with check (ruta_seguridad.es_admin());

create policy consumos_tecnico on public.consumos_insumo
  for all to authenticated
  using (
    exists (
      select 1
      from visitas v
      join usuarios u on u.id = v.tecnico_id
      where v.id = consumos_insumo.visita_id
        and u.correo = auth.email()
    )
  )
  with check (
    exists (
      select 1
      from visitas v
      join usuarios u on u.id = v.tecnico_id
      where v.id = consumos_insumo.visita_id
        and u.correo = auth.email()
    )
  );
