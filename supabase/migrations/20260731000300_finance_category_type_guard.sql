create or replace function public.validate_thu_chi_category_type()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  category_type text;
begin
  select loai into category_type
  from public.thu_chi_danh_muc
  where id = new.danh_muc_id;

  if category_type is null then
    raise foreign_key_violation using message = 'Danh mục thu chi không tồn tại.';
  end if;

  if category_type <> new.loai then
    raise check_violation using message = 'Danh mục không phù hợp với loại giao dịch.';
  end if;

  return new;
end;
$$;

create trigger validate_thu_chi_category_type_before_write
before insert or update of loai, danh_muc_id on public.thu_chi
for each row execute function public.validate_thu_chi_category_type();
