alter table public.du_an
  add column if not exists steps jsonb not null default
  '[
    {"key":"todo","label":"Cần làm","enabled":true},
    {"key":"inProgress","label":"Đang làm","enabled":true},
    {"key":"review","label":"Chờ đánh giá","enabled":true},
    {"key":"done","label":"Hoàn thành","enabled":true}
  ]'::jsonb;

comment on column public.du_an.steps is
  'Cau hinh cac buoc trang thai cua du an, luu duoi dang JSON.';
