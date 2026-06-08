# ff14-booking

FF14 RP 桌遊店「光之意志」預約網站。專案目前是純靜態前端，使用 Google Apps Script Web App 作為資料 API，可部署到 GitHub Pages 或任一靜態主機。

## 檔案

- `index.html`：玩家前台，可查看開放班表、建立預約、加入既有併桌。
- `admin.html`：主持人後台，可登入、發布班表、查看預約、結束班表。
- `adim.html`：舊後台檔名的轉址頁，會導向 `admin.html`。
- `config.js`：前台使用的 Google Apps Script Web App URL 設定。
- `gas/Code.gs`：Google Apps Script 後端原始碼。
- `data.json`：本地資料結構占位，正式流程目前以 GAS 為主。

## Google Apps Script API 契約

前台會呼叫 `config.js` 中的 `window.FF14_BOOKING_API_URL`。新版後台 `admin.html` 目前內含同一個 GAS Web App URL。

目前 `gas/Code.gs` 直接在 `getSpreadsheet()` 內設定試算表 ID。

### 讀取資料

前台與後台會讀取班表：

```text
GET <API_URL>?action=getShifts&t=<timestamp>
```

回傳：

```json
{
  "success": true,
  "data": [
    {
      "shiftId": "S1780000000000",
      "date": "2026-06-07",
      "startTime": "18:00",
      "endTime": "23:00",
      "host": "主持人名稱",
      "gamesOffered": ["FF14 RP", "D&D"],
      "status": "開放中",
      "bookings": [
        {
          "bookingId": "B1780000000000",
          "startTime": "19:00",
          "endTime": "21:00",
          "game": "FF14 RP",
          "type": "併桌",
          "playerCount": 2,
          "joinedCount": 1,
          "rounds": 1,
          "members": "Typhon/角色名"
        }
      ]
    }
  ]
}
```

### 主持人登入

```json
{
  "action": "login",
  "username": "host",
  "password": "password"
}
```

### 寫入資料

使用 POST，body 為 JSON 字串。前端刻意不設定 `Content-Type: application/json`，以降低 GAS Web App 的 CORS/preflight 問題。

發布班表：

```json
{
  "action": "addShift",
  "date": "2026-06-07",
  "startTime": "18:00",
  "endTime": "23:00",
  "host": "主持人名稱",
  "gamesOffered": ["FF14 RP", "D&D"]
}
```

建立新預約：

```json
{
  "action": "makeBooking",
  "shiftId": "S1780000000000",
  "bookingStartTime": "19:00",
  "bookingEndTime": "21:00",
  "game": "FF14 RP",
  "type": "併桌",
  "members": [{ "server": "Typhon", "characterId": "角色名" }],
  "useGem": false,
  "playerCount": 1,
  "rounds": 1
}
```

加入既有併桌：

```json
{
  "action": "joinExistingBooking",
  "bookingId": "B1780000000000",
  "addCount": 1,
  "members": [{ "server": "Typhon", "characterId": "角色名" }]
}
```

結束班表：

```json
{
  "action": "endShift",
  "shiftId": "S1780000000000"
}
```

## Google Sheet 分頁與欄位

`gas/Code.gs` 目前會讀寫以下分頁：

- `主持人帳號表`
  1. 帳號
  2. 密碼
  3. 顯示名稱
  4. 可主持遊戲，使用逗號分隔

- `預約總表`
  1. 班表 ID
  2. 日期
  3. 開始時間
  4. 結束時間
  5. 主持人
  6. 可玩遊戲，使用逗號分隔
  7. 狀態，例如 `開放中` / `已結束`

- `併桌團員明細`
  1. 預約 ID
  2. 班表 ID
  3. 預約開始時間
  4. 預約結束時間
  5. 遊戲
  6. 類型，例如 `併桌` / `包桌`
  7. 代表伺服器
  8. 代表角色名
  9. 付款方式
  10. 建立時間
  11. 初始人數
  12. 加入人數
  13. 局數
  14. 角色明細

## 注意事項

- 目前主持人密碼仍是明文存放在試算表；正式營運前建議改成雜湊或至少改用管理 token / Google 帳號授權。
- 後台登入主要保護 UI；若 GAS Web App 設為公開，仍應在 GAS 端替 `addShift`、`endShift` 等管理 action 加上授權檢查。
- 更新 `gas/Code.gs` 後，需要重新部署 Web App，前後台才會吃到最新 GAS 邏輯。