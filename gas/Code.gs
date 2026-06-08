/**
 * FF14 預約系統 - 最終修正版 (v8.1-Fixed)
 */

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// 已填入您的試算表 ID
function getSpreadsheet() {
  var ssId = '16d0uBEib8z_oG8YfECC3zWaL6YUtgeyH_bNOwIh5MAo';
  try {
    return SpreadsheetApp.openById(ssId);
  } catch (e) {
    throw new Error("連不到試算表！請檢查權限或 ID。錯誤內容: " + e.message);
  }
}

// 自動檢查分頁名稱
function getSheetSafe(name) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    var allNames = ss.getSheets().map(function(s) { return "'" + s.getName() + "'"; }).join(", ");
    throw new Error("找不到分頁 '" + name + "'。目前有的分頁為: " + allNames);
  }
  return sheet;
}

function doGet(e) {
  try {
    var action = e.parameter.action;
    if (action === 'getShifts') return getShifts();
    return createJsonResponse({ success: false, message: "無效的 GET 請求" });
  } catch (err) {
    return createJsonResponse({ success: false, message: err.message });
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action;
    if (action === 'login') return login(data.username, data.password);
    if (action === 'addShift') return addShift(data);
    if (action === 'makeBooking') return makeBooking(data);
    if (action === 'joinExistingBooking') return joinExistingBooking(data);
    if (action === 'endShift') return endShift(data.shiftId);
    return createJsonResponse({ success: false, message: "無效的 POST 請求" });
  } catch (err) {
    return createJsonResponse({ success: false, message: err.message });
  }
}

function login(u, p) {
  var sheet = getSheetSafe('主持人帳號表');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == u && data[i][1] == p) {
      // 修正點：回傳 displayName 以對齊前端需求
      return createJsonResponse({
        success: true,
        displayName: data[i][2],
        games: data[i][3].toString().split(',')
      });
    }
  }
  return createJsonResponse({ success: false, message: "帳號或密碼錯誤" });
}

function getShifts() {
  var ss = getSpreadsheet();
  var shiftSheet = getSheetSafe('預約總表');
  var bookingSheet = getSheetSafe('併桌團員明細');

  var shifts = shiftSheet.getDataRange().getValues();
  var bookings = bookingSheet.getDataRange().getValues();

  var result = [];
  for (var i = 1; i < shifts.length; i++) {
    var shiftId = shifts[i][0];
    var shiftBookings = [];
    for (var j = 1; j < bookings.length; j++) {
      if (bookings[j][1] === shiftId) {
        shiftBookings.push({
          bookingId: bookings[j][0],
          startTime: formatTime(bookings[j][2]),
          endTime: formatTime(bookings[j][3]),
          game: bookings[j][4],
          type: bookings[j][5],
          playerCount: parseInt(bookings[j][10] || 0),
          joinedCount: parseInt(bookings[j][11] || 0)
        });
      }
    }
    result.push({
      shiftId: shiftId,
      date: shifts[i][1] instanceof Date ? Utilities.formatDate(shifts[i][1], "GMT+8", "yyyy-MM-dd") : shifts[i][1],
      startTime: formatTime(shifts[i][2]),
      endTime: formatTime(shifts[i][3]),
      host: shifts[i][4],
      gamesOffered: shifts[i][5].toString().split(','),
      status: shifts[i][6],
      bookings: shiftBookings
    });
  }
  return createJsonResponse({ success: true, data: result });
}

function formatTime(timeVal) {
  if (timeVal instanceof Date) return Utilities.formatDate(timeVal, "GMT+8", "HH:mm");
  var s = timeVal.toString();
  if (s.indexOf('T') !== -1) return s.split('T')[1].substring(0, 5);
  return s;
}

function timeToMinutes(t) {
  var p = t.split(':');
  return parseInt(p[0]) * 60 + parseInt(p[1]);
}

function addShift(d) {
  var sheet = getSheetSafe('預約總表');
  var id = 'S' + new Date().getTime();
  sheet.appendRow([id, d.date, d.startTime, d.endTime, d.host, d.gamesOffered.join(','), '開放中']);
  return createJsonResponse({ success: true });
}

function makeBooking(d) {
  var bookingSheet = getSheetSafe('併桌團員明細');
  var bookings = bookingSheet.getDataRange().getValues();
  var newStart = timeToMinutes(d.bookingStartTime);
  var newEnd = timeToMinutes(d.bookingEndTime);
  var buffer = 30;

  for (var i = 1; i < bookings.length; i++) {
    if (bookings[i][1] === d.shiftId) {
      var existStart = timeToMinutes(formatTime(bookings[i][2]));
      var existEnd = timeToMinutes(formatTime(bookings[i][3]));
      if (!(newEnd <= (existStart - buffer) || newStart >= (existEnd + buffer))) {
        if (d.type === '併桌' && bookings[i][5] === '併桌' && d.game === bookings[i][4] && d.bookingStartTime === formatTime(bookings[i][2])) {
          continue;
        }
        return createJsonResponse({ success: false, message: "此時段已有預約（需留 30 分鐘間隔）。" });
      }
    }
  }

  var memberInfo = d.members.map(function(m) { return m.server + "/" + m.characterId; }).join("\n");
  bookingSheet.appendRow([
    'B'+new Date().getTime(), d.shiftId, d.bookingStartTime, d.bookingEndTime,
    d.game, d.type, d.members[0].server, d.members[0].characterId,
    d.useGem?'使用寶石兌換':'一般付費', new Date(), d.playerCount, 0, d.rounds, memberInfo
  ]);
  return createJsonResponse({ success: true, message: "預約成功" });
}

function joinExistingBooking(d) {
  var sheet = getSheetSafe('併桌團員明細');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === d.bookingId) {
      var initialCount = parseInt(data[i][10] || 0);
      var currentJoined = parseInt(data[i][11] || 0);
      var addCount = parseInt(d.addCount);
      if (initialCount + currentJoined + addCount > 10) return createJsonResponse({ success: false, message: "人數已滿（上限 10 人）。" });
      sheet.getRange(i + 1, 12).setValue(currentJoined + addCount);
      var newMemberInfo = d.members.map(function(m) { return m.server + "/" + m.characterId; }).join("\n");
      var memo = data[i][13] || "";
      memo += (memo ? "\n" : "") + newMemberInfo;
      sheet.getRange(i + 1, 14).setValue(memo);
      return createJsonResponse({ success: true, message: "成功加入併桌！" });
    }
  }
  return createJsonResponse({ success: false, message: "找不到該預約團。" });
}

function endShift(id) {
  var sheet = getSheetSafe('預約總表');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.getRange(i + 1, 7).setValue('已結束');
      return createJsonResponse({ success: true });
    }
  }
  return createJsonResponse({ success: false });
}
