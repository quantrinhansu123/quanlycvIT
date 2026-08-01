-- Username/email được chuẩn hoá chữ thường khi ghi, nhờ đó đăng nhập có thể
-- dùng so sánh bằng và B-tree index thay cho ILIKE.

update public.tai_khoan
set username = lower(btrim(username))
where username is not null
  and username <> lower(btrim(username));

update public.tai_khoan
set email = lower(btrim(email))
where email is not null
  and email <> lower(btrim(email));

drop index if exists public.tai_khoan_email_lower_uidx;

create unique index if not exists tai_khoan_email_uidx
  on public.tai_khoan (email)
  where email is not null;

alter table public.tai_khoan
drop constraint if exists tai_khoan_username_lowercase;

alter table public.tai_khoan
add constraint tai_khoan_username_lowercase check (
  username is null or username = lower(btrim(username))
);

alter table public.tai_khoan
drop constraint if exists tai_khoan_email_lowercase;

alter table public.tai_khoan
add constraint tai_khoan_email_lowercase check (
  email is null or email = lower(btrim(email))
);
