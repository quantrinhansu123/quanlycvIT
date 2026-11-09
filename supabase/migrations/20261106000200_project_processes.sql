-- Nội dung hướng dẫn quy trình theo dự án, tách khỏi cấu hình trạng thái steps.
create table if not exists public.quy_trinh_du_an (
  id uuid primary key default gen_random_uuid(),
  du_an_id uuid not null references public.du_an(id) on delete cascade,
  tieu_de text not null check (char_length(tieu_de) between 1 and 200),
  mo_ta text not null default '',
  cac_buoc jsonb not null default '[]'::jsonb check (jsonb_typeof(cac_buoc) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quy_trinh_du_an_project_idx on public.quy_trinh_du_an(du_an_id, updated_at desc);
drop trigger if exists set_quy_trinh_du_an_updated_at on public.quy_trinh_du_an;
create trigger set_quy_trinh_du_an_updated_at before update on public.quy_trinh_du_an
for each row execute function public.set_updated_at();

alter table public.quy_trinh_du_an enable row level security;
create policy quy_trinh_du_an_read on public.quy_trinh_du_an for select to authenticated using (
  exists (
    select 1 from public.tai_khoan tk
    where tk.auth_user_id = auth.uid()
      and (tk.role in ('admin', 'manager')
        or exists (select 1 from public.du_an_thanh_vien tv where tv.du_an_id = quy_trinh_du_an.du_an_id and tv.tai_khoan_id = tk.id)
        or exists (select 1 from public.du_an_quan_ly ql where ql.du_an_id = quy_trinh_du_an.du_an_id and ql.tai_khoan_id = tk.id)
        or exists (select 1 from public.du_an da where da.id = quy_trinh_du_an.du_an_id and da.nguoi_ql_id = tk.id))
  )
);
create policy quy_trinh_du_an_write on public.quy_trinh_du_an for all to authenticated
using (exists (select 1 from public.tai_khoan tk where tk.auth_user_id = auth.uid() and tk.role in ('admin','manager')))
with check (exists (select 1 from public.tai_khoan tk where tk.auth_user_id = auth.uid() and tk.role in ('admin','manager')));
grant select, insert, update, delete on public.quy_trinh_du_an to authenticated;
