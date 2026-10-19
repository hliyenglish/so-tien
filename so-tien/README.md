# Sổ Tiền: app quản lý tài chính cá nhân

Web app ghi thu chi chạy trên điện thoại lẫn máy tính, cài được ra màn hình chính như một app và vẫn mở được khi mất mạng. Dữ liệu được lưu vào **một repo GitHub riêng tư của bạn**, nên dùng chung được trên nhiều thiết bị và GitHub giữ lại lịch sử mọi lần thay đổi. App xuất được Excel (.xlsx) và CSV (mở bằng Google Sheets).

```
Repo "so-tien"       (Public)   → chứa code app, chạy trên GitHub Pages
Repo "so-tien-data"  (Private)  → chứa data.json, dữ liệu của bạn
```

App không có máy chủ riêng. Trình duyệt nói chuyện thẳng với GitHub bằng token của bạn, và token chỉ được quyền vào đúng repo dữ liệu.

---

## Cài đặt lần đầu (khoảng 10 phút)

### Bước 1. Đưa app lên GitHub Pages

1. Đăng nhập GitHub, vào **https://github.com/new**
   - Repository name: `so-tien`
   - Chọn **Public** (GitHub Pages miễn phí cần repo Public; repo này chỉ có code, không có dữ liệu của bạn)
   - Bấm **Create repository**
2. Ở trang repo vừa tạo, bấm **uploading an existing file**, rồi kéo thả **toàn bộ nội dung bên trong thư mục `so-tien`** (gồm `index.html`, `sw.js`, `manifest.webmanifest`, `README.md`, `.nojekyll`, `.gitignore` và 3 thư mục `css`, `js`, `icons`) vào trang. Bấm **Commit changes**.
3. Vào **Settings → Pages**:
   - Source: **Deploy from a branch**
   - Branch: **main**, thư mục **/ (root)** → **Save**
4. Đợi 1–2 phút, link app sẽ là:
   **`https://<tên-tài-khoản>.github.io/so-tien/`**

### Bước 2. Tạo repo riêng tư để chứa dữ liệu

1. Vào **https://github.com/new**
   - Repository name: `so-tien-data`
   - Chọn **Private** (quan trọng!)
   - Tích **Add a README file**
   - Bấm **Create repository**

### Bước 3. Tạo token (chìa khóa cho app ghi vào repo dữ liệu)

1. Vào **https://github.com/settings/personal-access-tokens/new**
2. Điền:
   - Token name: `so-tien`
   - Expiration: chọn thời hạn (ví dụ 1 năm; hết hạn thì tạo token mới và dán lại trong app)
   - Repository access: **Only select repositories** → chọn **so-tien-data**
   - Permissions → Repository permissions → **Contents: Read and write**
3. Bấm **Generate token** và **copy ngay** chuỗi `github_pat_...` (GitHub chỉ hiện một lần).

### Bước 4. Kết nối app và nhập dữ liệu cũ

Trên máy tính:

1. Mở link app → **Cài đặt** → mục **Đồng bộ qua GitHub**: điền tên tài khoản, tên repo `so-tien-data`, dán token, bấm **Kết nối**.
2. Cũng trong **Cài đặt** → **Dữ liệu** → **Nhập file JSON** → chọn file **`du-lieu-tu-excel-cu.json`** (nằm cạnh thư mục `so-tien`, là toàn bộ dữ liệu Daily Expense từ 04/2025 đã được chuyển đổi).
3. Ở trang **Tổng quan**, chạm vào từng ví (Tiền mặt, Momo, ACB, PayPal) để **cập nhật số dư thực tế hôm nay**. Số dư khởi đầu được lấy từ lần ghi gần nhất trong Excel (05/10/2026).

Trên điện thoại:

1. Mở link app bằng **Safari** (iPhone) hoặc **Chrome** (Android).
2. Cài ra màn hình chính:
   - iPhone: nút **Chia sẻ** → **Thêm vào MH chính**
   - Android: menu **⋮** → **Thêm vào màn hình chính** / **Cài đặt ứng dụng**
3. Mở app → **Cài đặt** → **Kết nối** với cùng thông tin. Dữ liệu sẽ tự tải về.
   Để không phải gõ lại token dài, có thể tạo thêm một token riêng cho điện thoại ở Bước 3 rồi gửi cho chính mình qua Zalo "Cloud của tôi", hoặc dùng chung token cũ. Token riêng cho từng máy giúp bạn thu hồi riêng khi mất điện thoại.

---

## Dùng hằng ngày

- **Ghi một khoản**: bấm nút **+**, gõ số tiền rồi chọn danh mục và bấm **Lưu**. Ví và ngày (hôm nay) được chọn sẵn.
  - Gõ tắt được: `25k` = 25.000, `1tr8` = 1.800.000, `1,5tr` = 1.500.000.
  - Gộp nhiều khoản như trong Excel: `15k+25k` sẽ lưu 40.000 và giữ lại phép tính để xem lại.
- **Ghi nhanh**: trang Tổng quan tự hiện các khoản bạn hay ghi (Ăn uống 15k, Cà phê 25k…). Chạm một lần là ghi xong, có nút **Hoàn tác**.
- **Ghi bù ngày quên**: dải cột trong phần đầu trang là chi tiêu từng ngày, chấm rỗng là ngày chưa ghi. Chạm vào ngày đó rồi chọn **Ghi cho ngày này**.
- **Thu nhập dạy học**: bấm **+** → **Thu** → **Dạy tiếng Anh**, ghi chú tên học viên.
- **Trả nợ** (Nam, A Toàn, Hiếu): bấm **+** → **Chuyển**, chọn từ ví ACB đến "Nợ Nam". Tổng nợ và tài sản ròng tự cập nhật.
- **Tiền lo cho mẹ**: dùng ví **Quỹ chi tiêu của mẹ** để khoản người thân gửi và khoản chi cho mẹ không lẫn vào chi tiêu cá nhân.
- **Hóa đơn định kỳ** (Spotify, FPT, điện thoại, Soundcloud): trang Tổng quan nhắc trong tháng, bấm **Đã trả** là ghi xong. Sửa số tiền hoặc tắt trong **Cài đặt → Hóa đơn định kỳ**.
- **Số dư lệch** so với thực tế: chạm vào ví → nhập số thực tế. App ghi phần chênh lệch là "Điều chỉnh số dư" và không tính phần này vào chi tiêu.
- **Ngân sách, mục tiêu thu nhập (9tr), Runway**: chỉnh trong **Cài đặt → Ngân sách và mục tiêu**.
- Trên máy tính có phím tắt: **N** để ghi khoản mới, **Enter** để lưu, **Esc** để đóng.

## Xuất file lưu trữ

**Báo cáo → Xuất file để lưu trữ** → chọn tháng / năm / toàn bộ / tự chọn:

- **Excel (.xlsx)** gồm 4 sheet: *Giao dịch*, *Theo ngày* (bố cục giống sheet Daily Expense cũ), *Theo tháng*, *Số dư ví*.
- **CSV cho Google Sheets**.
- Mở bằng Google Sheets: vào drive.google.com → **Mới → Tải tệp lên** → chọn file .xlsx → mở bằng **Google Trang tính**. Trên điện thoại có thêm nút **Gửi file Excel qua Drive, Zalo…**.

Ngoài ra **Cài đặt → Dữ liệu → Tải bản sao lưu JSON** để tự giữ một bản dự phòng.

## Dữ liệu và bảo mật

- Dữ liệu nằm ở 2 nơi: trình duyệt trên từng thiết bị và file `data.json` trong repo **so-tien-data**. Mỗi lần thay đổi là một commit, xem lịch sử ở tab **Commits** của repo.
- **Repo dữ liệu phải để Private.** App sẽ cảnh báo nếu phát hiện repo đang Public.
- Token chỉ lưu trong trình duyệt của thiết bị đã nhập nó. Nếu mất điện thoại: vào https://github.com/settings/personal-access-tokens và **Revoke** token của máy đó.
- Không bao giờ upload file `.json`, `.xlsx`, `.csv` chứa dữ liệu vào repo `so-tien` (Public). File `.gitignore` đã chặn sẵn khi dùng Git.

## Cập nhật app sau này

Khi có phiên bản mới, upload đè các file đã đổi vào repo `so-tien`. Lần mở app kế tiếp (khi có mạng) sẽ tự dùng bản mới. Dữ liệu không bị ảnh hưởng.

## Cấu trúc code

```
index.html              Khung trang
css/app.css             Giao diện (sáng/tối, điện thoại/máy tính)
js/app.js               Các màn hình, bảng nhập, cài đặt
js/store.js             Dữ liệu, gộp dữ liệu giữa các máy, tính số dư/thống kê
js/sync.js              Đồng bộ với GitHub (Contents API)
js/export.js            Xuất Excel/CSV/JSON, nhập JSON
js/xlsx-lite.js         Bộ tạo file .xlsx không cần thư viện ngoài
js/util.js              Định dạng tiền, ngày, đọc số tiền gõ tắt
sw.js                   Chạy offline, cài như app
manifest.webmanifest    Thông tin app khi cài ra màn hình chính
```
