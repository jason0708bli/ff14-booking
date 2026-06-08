# ff14-booking

《FF14》RP 桌遊店「光之意志桌遊酒館」預約與併桌系統。

技術組合：

- 前端：純 HTML + CSS + JavaScript + Tailwind CDN
- 後端：Google Apps Script
- 資料庫：Google 試算表

## 檔案

- `index.html`：客人官網與併桌大廳
- `admin.html`：主持人登入與管理後台
- `gas/Code.gs`：Google Apps Script 後端
- `adim.html`：舊後台網址轉址到 `admin.html`
- `config.js`：保留的舊共用設定檔；新版頁面使用各自的 `GAS_API_URL`

## Google 試算表結構

GAS 會支援並可初始化以下三張工作表：

### Hosts

主持人帳號表。

| 欄位 | 說明 |
| --- | --- |
| `username` | 主持人帳號 |
| `password` | 主持人密碼 |
| `displayName` | 前台顯示名稱 |

### Bookings

預約總表。

| 欄位 | 說明 |
| --- | --- |
| `bookingId` | 場次 ID |
| `date` | 日期 |
| `startTime` | 開始時間 |
| `endTime` | 結束時間 |
| `game` | 阿瓦隆 / 阿瓦隆2 / 璀璨寶石 / TRPG |
| `hostUsername` | 主持人帳號 |
| `hostName` | 主持人顯示名稱 |
| `mode` | 時段釋出 / 包場/私人團 / 開放併桌 |
| `maxPlayers` | 人數上限 |
| `currentPlayers` | 目前人數 |
| `status` | 開放預約中 / 已滿團 / 使用寶石兌換 / 已結束 |
| `useGem` | 是否使用寶石兌換 |
| `totalFeeWan` | 預計費用，單位：萬金幣 |
| `createdAt` | 建立時間 |
| `updatedAt` | 更新時間 |

### Participants

併桌團員明細。

| 欄位 | 說明 |
| --- | --- |
| `participantId` | 團員紀錄 ID |
| `bookingId` | 對應場次 ID |
| `server` | 客人伺服器 |
| `characterId` | 客人角色 ID |
| `count` | 本次加入人數 |
| `role` | 發起人 / 併桌團員 |
| `joinedAt` | 加入時間 |

## GAS API

### GET

```text
?action=setupSheets
?action=listBookings
```

### POST

POST body 使用 JSON 字串；前端使用 `Content-Type: text/plain;charset=utf-8`。

```json
{ "action": "login", "username": "admin", "password": "password" }
```

```json
{
  "action": "createSlot",
  "host": { "username": "admin", "displayName": "示範主持人" },
  "date": "2026-06-08",
  "startTime": "18:00",
  "endTime": "22:00",
  "game": "阿瓦隆"
}
```

```json
{
  "action": "reserveSlot",
  "bookingId": "BK...",
  "server": "Typhon",
  "characterId": "光之冒險者",
  "mode": "開放併桌",
  "playerCount": 5,
  "useGem": false
}
```

```json
{
  "action": "joinTable",
  "bookingId": "BK...",
  "server": "Typhon",
  "characterId": "光之冒險者"
}
```

```json
{ "action": "endBooking", "bookingId": "BK..." }
```

## 部署教學

### 1. 建立 Google 試算表

1. 到 Google Drive 新增一份 Google 試算表。
2. 檔名可命名為 `光之意志預約資料庫`。
3. 不需要手動建立分頁，GAS 會幫你初始化。

### 2. 建立 Apps Script

1. 在試算表上方選單點選「擴充功能」→「Apps Script」。
2. 刪除預設內容。
3. 將 `gas/Code.gs` 的全部內容貼上。
4. 儲存專案。

### 3. 初始化資料表

在 Apps Script 編輯器上方函式下拉選單選擇：

```text
setupSheets
```

按「執行」。第一次會要求授權，請依照 Google 指示授權。

初始化後會建立：

- `Hosts`
- `Bookings`
- `Participants`

並建立一組示範主持人：

```text
帳號：admin
密碼：password
顯示名稱：示範主持人
```

正式使用前請到 `Hosts` 分頁修改帳號密碼。

### 4. 部署 Web App

1. Apps Script 右上角點「部署」→「新增部署作業」。
2. 類型選擇「網頁應用程式」。
3. 執行身分選「我」。
4. 存取權限選「任何人」。
5. 點「部署」。
6. 複製產生的 Web App URL，通常長得像：

```text
https://script.google.com/macros/s/AKfycb.../exec
```

### 5. 確認前端 URL

目前 `index.html` 與 `admin.html` 已填入以下 Web App URL：

```js
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxhuKNH6-OEBH6csgZOseaZU20dxI-DuYm4ecxPiLekBlyHpOmnYTgsC0bZuIQRYAXxRQ/exec';
```

如果你之後重新部署並取得新的 URL，請同時更新 `index.html` 與 `admin.html` 的 `GAS_API_URL`。

### 6. 部署網站

可以使用 GitHub Pages 或任何靜態網站空間。

至少需要上傳：

- `index.html`
- `admin.html`
- `adim.html`

## 業務規則

- 阿瓦隆：5 ~ 10 人，每人 7 萬金幣，可獲得藍寶石；5 顆可兌換免費場。
- 阿瓦隆2：5 ~ 10 人，每人 9 萬金幣，可獲得紅寶石；5 顆可兌換免費場。
- 璀璨寶石：2 ~ 4 人，每人 5 萬金幣。
- TRPG：1 ~ 6 人，每人 10 萬金幣。
- 寶石點數由店家在遊戲內人工紀錄；網站只負責預約時標記「使用寶石兌換」。

## 後端防呆

- 同一主持人、同一日期、同一時段不能重複開團。
- 併桌加入時會重新檢查人數上限。
- 滿團時自動改為 `已滿團`。
- 若客人手速太慢，後端會回傳：`此團已滿，手速太慢囉！`

## 安全提醒

目前主持人密碼為明文存放在試算表，適合小型內部使用。若要正式公開營運，建議改成雜湊密碼、管理 token，或改用 Google 帳號授權。
