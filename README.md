# ff14-booking

FF14 RP 桌遊店「光之意志」預約網站。專案目前是純靜態前端，使用 Google Apps Script Web App 作為資料 API，可部署到 GitHub Pages 或任一靜態主機。

## 檔案

- `index.html`：玩家前台，可查看開放時段並送出待審核預約。
- `admin.html`：主持人後台，可發布時段、通過預約、刪除紀錄。
- `adim.html`：舊後台檔名的轉址頁，會導向 `admin.html`。
- `config.js`：Google Apps Script Web App URL 設定。
- `data.json`：本地資料結構占位，正式流程目前以 GAS 為主。

## Google Apps Script API 契約

前後台會呼叫 `config.js` 中的 `window.FF14_BOOKING_API_URL`。

### 讀取資料

使用 JSONP：

```text
GET <API_URL>?callback=<callbackName>&t=<timestamp>
```

回傳可為陣列：

```json
[
  {
    "id": "slot_xxx",
    "type": "slot",
    "status": "active",
    "date": "2026-06-07",
    "start": "18:00",
    "end": "23:00"
  }
]
```

也可為物件：

```json
{
  "opSlots": {},
  "bookings": {}
}
```

### 寫入資料

使用 POST。因 GAS/CORS 部署限制，前端目前以 `mode: "no-cors"` 送出，因此瀏覽器端無法可靠讀取成功或失敗回應。

新增開放時段：

```json
{
  "action": "insert",
  "data": {
    "id": "slot_xxx",
    "type": "slot",
    "status": "active",
    "date": "2026-06-07",
    "start": "18:00",
    "end": "23:00",
    "game": "-",
    "title": "-",
    "names": "-",
    "max": "-"
  }
}
```

新增玩家預約：

```json
{
  "action": "insert",
  "data": {
    "id": "booking_xxx",
    "type": "booking",
    "status": "pending",
    "slotId": "slot_xxx",
    "date": "2026-06-07",
    "start": "18:00",
    "end": "23:00",
    "game": "FF14 RP",
    "title": "水晶塔的秘密委託",
    "names": "角色名",
    "max": "4"
  }
}
```

審核預約：

```json
{
  "action": "update",
  "id": "booking_xxx",
  "status": "success",
  "names": "角色名"
}
```

刪除紀錄：

```json
{
  "action": "delete",
  "id": "slot_or_booking_xxx"
}
```

## 注意事項

- 後台目前沒有登入驗證；知道網址的人仍可操作管理功能。正式公開前，建議在 GAS 端加入管理 token 或其他驗證。
- `no-cors` POST 只能確認請求已送出，不能確認 GAS 實際寫入成功；重要操作仍應以重新讀取後的資料為準。
- GAS 原始碼尚未放入此 repo，若多人維護，建議新增 `gas/Code.gs` 並記錄部署步驟。