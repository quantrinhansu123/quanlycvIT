-- Nguoi quan ly va thanh vien tham gia la hai danh sach khong trung nhau.
-- Lam sach cac ban ghi cu sau khi chuyen sang nhieu nguoi quan ly.

delete from public.du_an_thanh_vien as thanh_vien
using public.du_an_quan_ly as quan_ly
where thanh_vien.du_an_id = quan_ly.du_an_id
  and thanh_vien.tai_khoan_id = quan_ly.tai_khoan_id;
