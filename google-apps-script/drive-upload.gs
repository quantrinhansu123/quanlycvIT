/**
 * Google Apps Script — nhận tệp từ API "/api/media/task-file" của ứng dụng
 * quan-ly-nhan-su, lưu vào một thư mục Google Drive, rồi trả về link chia sẻ.
 *
 * CÀI ĐẶT
 * 1. Vào https://script.google.com > Dự án mới, dán toàn bộ nội dung file này.
 * 2. Đổi FOLDER_ID bên dưới thành ID thư mục Drive muốn lưu tệp đính kèm
 *    (mở thư mục trên Drive, ID nằm cuối URL).
 * 3. Đổi SHARED_SECRET thành một chuỗi bí mật do bạn tự nghĩ ra (khó đoán).
 * 4. Menu Deploy > New deployment > chọn loại "Web app":
 *    - Execute as: Me (tài khoản sở hữu thư mục Drive)
 *    - Who has access: Anyone
 * 5. Copy "Web app URL" (kết thúc bằng /exec), điền vào biến môi trường
 *    GOOGLE_APPS_SCRIPT_UPLOAD_URL của ứng dụng Next.js.
 * 6. Điền đúng SHARED_SECRET ở trên vào biến môi trường
 *    GOOGLE_APPS_SCRIPT_UPLOAD_SECRET của ứng dụng Next.js.
 * 7. Mỗi khi sửa code này, phải tạo "New deployment" mới (hoặc "Manage
 *    deployments" > Edit > version mới) thì URL mới nhận code mới.
 */

var FOLDER_ID = "1J1o03bE2TT4w7NMZqE6KgAy43PAsiCIA";
var SHARED_SECRET = "hello";

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    if (!body || body.secret !== SHARED_SECRET) {
      return jsonResponse({ error: "Unauthorized" });
    }
    if (!body.dataBase64 || !body.fileName) {
      return jsonResponse({ error: "Thiếu dữ liệu tệp." });
    }

    var folder = DriveApp.getFolderById(FOLDER_ID);
    var bytes = Utilities.base64Decode(body.dataBase64);
    var blob = Utilities.newBlob(
      bytes,
      body.mimeType || "application/octet-stream",
      body.fileName
    );

    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return jsonResponse({
      url: file.getUrl(),
      id: file.getId(),
      name: file.getName(),
    });
  } catch (error) {
    return jsonResponse({ error: String(error) });
  }
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}
