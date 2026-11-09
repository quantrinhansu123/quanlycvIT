-- Ảnh minh họa của quy trình (mục cha), độc lập với ảnh từng bước.
alter table public.quy_trinh_du_an
  add column if not exists anh_dai_dien text not null default '';
