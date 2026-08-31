-- Imprenta Print Shop · Estructura segura para Supabase
-- Pega este archivo completo en Supabase: SQL Editor > New query > Run

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique not null,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client text not null check (char_length(trim(client)) > 0),
  phone text not null check (char_length(trim(phone)) > 0),
  delivery_date date not null,
  work_type text not null check (char_length(trim(work_type)) > 0),
  price numeric(12,2) not null check (price >= 0),
  status text not null default 'en-proceso' check (status in ('en-proceso', 'listo', 'entregado')),
  payment_method text not null default 'Efectivo',
  paid boolean not null default false,
  invoice boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders enable row level security;

-- Ninguna persona sin iniciar sesión puede leer o modificar pedidos.
revoke all on public.orders from anon;
grant select, insert, update, delete on public.orders to authenticated;
grant usage, select on sequence public.orders_number_seq to authenticated;

drop policy if exists "Los usuarios ven sus propios pedidos" on public.orders;
create policy "Los usuarios ven sus propios pedidos"
  on public.orders for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "Los usuarios crean sus propios pedidos" on public.orders;
create policy "Los usuarios crean sus propios pedidos"
  on public.orders for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Los usuarios actualizan sus propios pedidos" on public.orders;
create policy "Los usuarios actualizan sus propios pedidos"
  on public.orders for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "Los usuarios eliminan sus propios pedidos" on public.orders;
create policy "Los usuarios eliminan sus propios pedidos"
  on public.orders for delete to authenticated
  using ((select auth.uid()) = owner_id);

create or replace function public.set_order_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_order_updated_at();
