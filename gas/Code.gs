/**
 * FF14 預約系統 - Google Apps Script backend.
 *
 * Required Script Property:
 * - SPREADSHEET_ID: the Google Sheet ID that stores the booking data.
 */

function createJsonResponse(data, callback) {
  var payload = JSON.stringify(data);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + payload + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet() {
  var ssId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!ssId) {
    throw new Error('尚未設定 Script Property: SPREADSHEET_ID');
  }

  try {
    return SpreadsheetApp.openById(ssId);
  } catch (e) {
    throw new Error('連不到試算表！請檢查權限或 ID。錯誤內容: ' + e.message);
  }
}

function getSheetSafe(name) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    var allNames = ss.getSheets().map(function(s) { return "'" + s.getName() + "'"; }).join(', ');
    throw new Error("找不到分頁 '" + name + "'。目前有的分頁為: " + allNames);
  }
  return sheet;
}

function doGet(e) {
  var callback = e && e.parameter ? e.parameter.callback : '';
  try {
    var action = e.parameter.action;
    if (action === 'getShifts') return getShifts(callback);
    return createJsonResponse({ success: false, message: '無效的 GET 請求' }, callback);
  } catch (err) {
    return createJsonResponse({ success: false, message: err.message }, callback);
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
    return createJsonResponse({ success: false, message: '無效的 POST 請求' });
  } catch (err) {
    return createJsonResponse({ success: false, message: err.message });
  }
}

function login(u, p) {
  var sheet = getSheetSafe('主持人帳號表');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == u && data[i][1] == p) {
      return createJsonResponse({
        success: true,
        displayName: data[i][2],
        games: data[i][3].toString().split(',').map(function(game) { return game.trim(); }).filter(Boolean)
      });
    }
  }
  return createJsonResponse({ success: false, message: '帳號或密碼錯誤' });
}

function getShifts(callback) {
  var shiftSheet = getSheetSafe('預約總表');
  var bookingSheet = getSheetSafe('併桌團員明細');

  var shifts = shiftSheet.getDataRange().getValues();
  var bookings = bookingSheet.getDataRange().getValues();

  var result = [];
  for (var i = 1; i < shifts.length; i++) {
    var shiftId = shifts[i][0];
    if (!shiftId) continue;

    var shiftBookings = [];
    for (var j = 1; j < bookings.length; j++) {
      if (bookings[j][1] === shiftId) {
        shiftBookings.push({
          bookingId: bookings[j][0],
          startTime: formatTime(bookings[j][2]),
          endTime: formatTime(bookings[j][3]),
          game: bookings[j][4],
          type: bookings[j][5],
          playerCount: parseInt(bookings[j][10] || 0, 10),
          joinedCount: parseInt(bookings[j][11] || 0, 10),
          rounds: bookings[j][12] || '',
          members: bookings[j][13] || ''
        });
      }
    }

    result.push({
      shiftId: shiftId,
      date: shifts[i][1] instanceof Date ? Utilities.formatDate(shifts[i][1], 'GMT+8', 'yyyy-MM-dd') : shifts[i][1],
      startTime: formatTime(shifts[i][2]),
      endTime: formatTime(shifts[i][3]),
      host: shifts[i][4],
      gamesOffered: shifts[i][5].toString().split(',').map(function(game) { return game.trim(); }).filter(Boolean),
      status: shifts[i][6],
      bookings: shiftBookings
    });
  }
  return createJsonResponse({ success: true, data: result }, callback);
}

function formatTime(timeVal) {
  if (timeVal instanceof Date) return Utilities.formatDate(timeVal, 'GMT+8', 'HH:mm');
  var s = timeVal.toString();
  if (s.indexOf('T') !== -1) return s.split('T')[1].substring(0, 5);
  return s;
}

function timeToMinutes(t) {
  if (!t || t.toString().indexOf(':') === -1) throw new Error('時間格式錯誤');
  var p = t.toString().split(':');
  return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
}

function findShift_(shiftId) {
  var sheet = getSheetSafe('預約總表');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === shiftId) {
      return { sheet: sheet, rowIndex: i + 1, row: data[i] };
    }
  }
  throw new Error('找不到指定班表。');
}

function assertBookingInsideShift_(shiftRow, startTime, endTime) {
  var shiftStart = timeToMinutes(formatTime(shiftRow[2]));
  var shiftEnd = timeToMinutes(formatTime(shiftRow[3]));
  var bookingStart = timeToMinutes(startTime);
  var bookingEnd = timeToMinutes(endTime);

  if (bookingStart >= bookingEnd) throw new Error('預約結束時間必須晚於開始時間。');
  if (bookingStart < shiftStart || bookingEnd > shiftEnd) {
    throw new Error('預約時間必須落在主持人開放時段內。');
  }
  if (shiftRow[6] !== '開放中') throw new Error('此班表目前未開放預約。');
}

function normalizeMembers_(members) {
  if (!Array.isArray(members) || members.length === 0) {
    throw new Error('請至少填寫一位角色資料。');
  }
  var normalized = members.map(function(m) {
    return {
      server: (m.server || '').toString().trim(),
      characterId: (m.characterId || '').toString().trim()
    };
  }).filter(function(m) {
    return m.server && m.characterId;
  });
  if (normalized.length === 0) throw new Error('角色資料格式錯誤，請填寫伺服器與角色名。');
  return normalized;
}

function addShift(d) {
  var gamesOffered = Array.isArray(d.gamesOffered) ? d.gamesOffered : [];
  if (!d.date || !d.startTime || !d.endTime || !d.host || gamesOffered.length === 0) {
    throw new Error('發布班表資料不完整。');
  }
  if (timeToMinutes(d.startTime) >= timeToMinutes(d.endTime)) {
    throw new Error('班表結束時間必須晚於開始時間。');
  }

  var sheet = getSheetSafe('預約總表');
  var id = 'S' + new Date().getTime();
  sheet.appendRow([id, d.date, d.startTime, d.endTime, d.host, gamesOffered.join(','), '開放中']);
  return createJsonResponse({ success: true, shiftId: id });
}

function makeBooking(d) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var shift = findShift_(d.shiftId);
    assertBookingInsideShift_(shift.row, d.bookingStartTime, d.bookingEndTime);

    var bookingSheet = getSheetSafe('併桌團員明細');
    var bookings = bookingSheet.getDataRange().getValues();
    var newStart = timeToMinutes(d.bookingStartTime);
    var newEnd = timeToMinutes(d.bookingEndTime);
    var buffer = 30;
    var members = normalizeMembers_(d.members);
    var playerCount = parseInt(d.playerCount || members.length, 10);
    if (!d.game || !d.type) throw new Error('請選擇遊戲與預約類型。');
    if (playerCount < 1 || playerCount > 10) throw new Error('預約人數必須介於 1 到 10 人。');

    for (var i = 1; i < bookings.length; i++) {
      if (bookings[i][1] === d.shiftId) {
        var existStart = timeToMinutes(formatTime(bookings[i][2]));
        var existEnd = timeToMinutes(formatTime(bookings[i][3]));
        if (!(newEnd <= (existStart - buffer) || newStart >= (existEnd + buffer))) {
          if (d.type === '併桌' && bookings[i][5] === '併桌' && d.game === bookings[i][4] && d.bookingStartTime === formatTime(bookings[i][2])) {
            continue;
          }
          return createJsonResponse({ success: false, message: '此時段已有預約（需留 30 分鐘間隔）。' });
        }
      }
    }

    var memberInfo = members.map(function(m) { return m.server + '/' + m.characterId; }).join('\n');
    bookingSheet.appendRow([
      'B' + new Date().getTime(), d.shiftId, d.bookingStartTime, d.bookingEndTime,
      d.game, d.type, members[0].server, members[0].characterId,
      d.useGem ? '使用寶石兌換' : '一般付費', new Date(), playerCount, 0, d.rounds, memberInfo
    ]);
    return createJsonResponse({ success: true, message: '預約成功' });
  } finally {
    lock.releaseLock();
  }
}

function joinExistingBooking(d) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheetSafe('併桌團員明細');
    var data = sheet.getDataRange().getValues();
    var members = normalizeMembers_(d.members);
    var addCount = parseInt(d.addCount || members.length, 10);
    if (addCount < 1) throw new Error('加入人數必須大於 0。');

    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === d.bookingId) {
        if (data[i][5] !== '併桌') return createJsonResponse({ success: false, message: '此預約不是併桌團。' });
        var shift = findShift_(data[i][1]);
        if (shift.row[6] !== '開放中') return createJsonResponse({ success: false, message: '此班表目前未開放加入。' });
        var initialCount = parseInt(data[i][10] || 0, 10);
        var currentJoined = parseInt(data[i][11] || 0, 10);
        if (initialCount + currentJoined + addCount > 10) {
          return createJsonResponse({ success: false, message: '人數已滿（上限 10 人）。' });
        }
        sheet.getRange(i + 1, 12).setValue(currentJoined + addCount);
        var newMemberInfo = members.map(function(m) { return m.server + '/' + m.characterId; }).join('\n');
        var memo = data[i][13] || '';
        memo += (memo ? '\n' : '') + newMemberInfo;
        sheet.getRange(i + 1, 14).setValue(memo);
        return createJsonResponse({ success: true, message: '成功加入併桌！' });
      }
    }
    return createJsonResponse({ success: false, message: '找不到該預約團。' });
  } finally {
    lock.releaseLock();
  }
}

function endShift(id) {
  var shift = findShift_(id);
  shift.sheet.getRange(shift.rowIndex, 7).setValue('已結束');
  return createJsonResponse({ success: true });
}
