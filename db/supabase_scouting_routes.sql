-- ─────────────────────────────────────────────────────────────────────────────
-- CI1215V2 — Rutas de scouting (MVP)
-- Ejecutar en Supabase v2 (rcwmjgcnpqlwrckcymrj) > SQL Editor.
-- Reutiliza tu función public.current_user_is_admin() ya existente.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.scouting_routes (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  asignado_a  uuid references auth.users(id) on delete set null,
  creado_por  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha       date not null default current_date,
  estado      text not null default 'planeada'
              check (estado in ('planeada','en_progreso','completada','cancelada')),
  pole_ids    jsonb not null default '[]'::jsonb,   -- array ORDENADO de IDs de poste
  notas       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists scouting_routes_asignado_idx on public.scouting_routes (asignado_a);
create index if not exists scouting_routes_creado_idx   on public.scouting_routes (creado_por);
create index if not exists scouting_routes_fecha_idx     on public.scouting_routes (fecha desc);

-- updated_at automático
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_scouting_routes_updated on public.scouting_routes;
create trigger trg_scouting_routes_updated
  before update on public.scouting_routes
  for each row execute function public.set_updated_at();

-- ─── RLS ───
alter table public.scouting_routes enable row level security;

-- Lectura: cualquier usuario autenticado (afina si quieres limitar por rol/asignación)
drop policy if exists scouting_routes_select on public.scouting_routes;
create policy scouting_routes_select on public.scouting_routes
  for select to authenticated
  using (true);

-- Inserción: el creador debe ser uno mismo
drop policy if exists scouting_routes_insert on public.scouting_routes;
create policy scouting_routes_insert on public.scouting_routes
  for insert to authenticated
  with check (creado_por = auth.uid());

-- Actualización: creador, asignado o admin
drop policy if exists scouting_routes_update on public.scouting_routes;
create policy scouting_routes_update on public.scouting_routes
  for update to authenticated
  using (creado_por = auth.uid() or asignado_a = auth.uid() or public.current_user_is_admin())
  with check (creado_por = auth.uid() or asignado_a = auth.uid() or public.current_user_is_admin());

-- Borrado: creador o admin
drop policy if exists scouting_routes_delete on public.scouting_routes;
create policy scouting_routes_delete on public.scouting_routes
  for delete to authenticated
  using (creado_por = auth.uid() or public.current_user_is_admin());
