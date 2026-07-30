alter table public.cong_viec
  add column if not exists hinh_anh text[] not null default '{}',
  add column if not exists tep_dinh_kem jsonb not null default '[]'::jsonb,
  add column if not exists lien_ket_dinh_kem jsonb not null default '[]'::jsonb;

alter table public.du_an
  add column if not exists hinh_anh text[] not null default '{}',
  add column if not exists tep_dinh_kem jsonb not null default '[]'::jsonb,
  add column if not exists lien_ket_dinh_kem jsonb not null default '[]'::jsonb;

comment on column public.cong_viec.hinh_anh is
  'Danh sach URL anh minh hoa cua cong viec, toi da 10 anh theo validation API.';
comment on column public.cong_viec.tep_dinh_kem is
  'Danh sach tep dinh kem cua cong viec, dang [{"name":"...","url":"..."}], url tro toi Google Drive.';
comment on column public.cong_viec.lien_ket_dinh_kem is
  'Danh sach lien ket dinh kem cua cong viec, dang [{"label":"...","url":"..."}].';

comment on column public.du_an.hinh_anh is
  'Danh sach URL anh minh hoa cua du an, toi da 10 anh theo validation API.';
comment on column public.du_an.tep_dinh_kem is
  'Danh sach tep dinh kem cua du an, dang [{"name":"...","url":"..."}], url tro toi Google Drive.';
comment on column public.du_an.lien_ket_dinh_kem is
  'Danh sach lien ket dinh kem cua du an, dang [{"label":"...","url":"..."}].';
