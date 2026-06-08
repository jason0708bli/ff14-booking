/**
 * 光之意志桌遊酒館 - FF14 RP 預約與併桌系統
 *
 * 試算表分頁：
 * - Hosts：主持人帳號表
 * - Bookings：預約總表
 * - Participants：併桌團員明細
 */

var SHEET_NAMES = {
  hosts: 'Hosts',
  bookings: 'Bookings',
  participants: 'Participants'
};

var STATUS = {
  open: '開放預約中',
  full: '已滿團',
  gem: '使用寶石兌換',
  ended: '已結束'
};

var MODE = {
  slot: '時段釋出',
  private: '包場/私人團',
  openTable: '開放併桌'
};

var GAME_RULES = {
  '阿瓦隆': { min: 5, max: 10, priceWan: 7, gem: '藍寶石' },
  '阿瓦隆2': { min: 5, max: 10, priceWan: 9, gem: '紅寶石' },
  '璀璨寶石': { min: 2, max: 4, priceWan: 5, gem: '' },
  'TRPG': { min: 1, max: 6, priceWan: 10, gem: '' }
};

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    var action = e.parameter.action;
    if (action === 'listBookings') return listBookings();
    if (action === 'setupSheets') return setupSheets();
    return createJsonResponse({ success: false, message: '無效的 GET action。' });
  } catch (err) {
    return createJsonResponse({ success: false, message: err.message });
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents || '{}');
    var action = data.action;
    if (action === 'login') return login(data);
    if (action === 'createSlot') return createSlot(data);
    if (action === 'reserveSlot') return reserveSlot(data);
    if (action === 'joinTable') return joinTable(data);
    if (action === 'endBooking') return endBooking(data);
    if (action === 'setupSheets') return setupSheets();
    return createJsonResponse({ success: false, message: '無效的 POST action。' });
  } catch (err) {
    return createJsonResponse({ success: false, message: err.message });
  }
}

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_(name) {
  var sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('找不到工作表：' + name + '。請先執行 setupSheets。');
  return sheet;
}

function setupSheets() {
  var ss = getSpreadsheet_();
  ensureSheet_(ss, SHEET_NAMES.hosts, ['username', 'password', 'displayName']);
  ensureSheet_(ss, SHEET_NAMES.bookings, [
    'bookingId', 'date', 'startTime', 'endTime', 'game',
    'hostUsername', 'hostName', 'mode', 'maxPlayers', 'currentPlayers',
    'status', 'useGem', 'totalFeeWan', 'createdAt', 'updatedAt'
  ]);
  ensureSheet_(ss, SHEET_NAMES.participants, [
    'participantId', 'bookingId', 'server', 'characterId', 'count', 'role', 'joinedAt'
  ]);

  var hostSheet = getSheet_(SHEET_NAMES.hosts);
  if (hostSheet.getLastRow() === 1) {
    hostSheet.appendRow(['admin', 'password', '示範主持人']);
  }

  return createJsonResponse({
    success: true,
    message: '初始化完成。預設帳號：admin / password，正式使用前請修改。'
  });
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    return sheet;
  }

  var current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var shouldResetHeader = headers.some(function(header, index) {
    return current[index] !== header;
  });
  if (shouldResetHeader) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sheet;
}

function login(data) {
  var username = (data.username || '').trim();
  var password = data.password || '';
  if (!username || !password) throw new Error('請輸入帳號與密碼。');

  var rows = getRows_(SHEET_NAMES.hosts);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].username === username && rows[i].password === password) {
      return createJsonResponse({
        success: true,
        host: {
          username: rows[i].username,
          displayName: rows[i].displayName
        }
      });
    }
  }
  return createJsonResponse({ success: false, message: '帳號或密碼錯誤。' });
}

function listBookings() {
  var bookings = getRows_(SHEET_NAMES.bookings);
  var participants = getRows_(SHEET_NAMES.participants);
  var grouped = {};
  participants.forEach(function(p) {
    grouped[p.bookingId] = grouped[p.bookingId] || [];
    grouped[p.bookingId].push(p);
  });

  bookings.forEach(function(booking) {
    booking.maxPlayers = toNumber_(booking.maxPlayers);
    booking.currentPlayers = toNumber_(booking.currentPlayers);
    booking.totalFeeWan = toNumber_(booking.totalFeeWan);
    booking.useGem = booking.useGem === true || booking.useGem === 'TRUE' || booking.useGem === '是';
    booking.participants = grouped[booking.bookingId] || [];
  });

  return createJsonResponse({
    success: true,
    bookings: bookings,
    gameRules: GAME_RULES,
    statuses: STATUS,
    modes: MODE
  });
}

function createSlot(data) {
  var host = requireHost_(data.host);
  var game = data.game;
  var rule = getGameRule_(game);
  var date = data.date;
  var startTime = data.startTime;
  var endTime = data.endTime;

  validateDateTime_(date, startTime, endTime);

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var duplicate = getRows_(SHEET_NAMES.bookings).some(function(row) {
      return row.hostUsername === host.username &&
        row.date === date &&
        row.startTime === startTime &&
        row.endTime === endTime &&
        row.status !== STATUS.ended;
    });
    if (duplicate) throw new Error('同一位主持人在同一日期與時段已經開團，不能重複發布。');

    var now = new Date();
    var bookingId = makeId_('BK');
    getSheet_(SHEET_NAMES.bookings).appendRow([
      bookingId, date, startTime, endTime, game,
      host.username, host.displayName, MODE.slot, rule.max, 0,
      STATUS.open, false, 0, now, now
    ]);
    return createJsonResponse({ success: true, bookingId: bookingId, message: '時段已發布。' });
  } finally {
    lock.releaseLock();
  }
}

function reserveSlot(data) {
  var bookingId = data.bookingId;
  var server = (data.server || '').trim();
  var characterId = (data.characterId || '').trim();
  var mode = data.mode === MODE.private ? MODE.private : MODE.openTable;
  var playerCount = toNumber_(data.playerCount || 1);
  var useGem = data.useGem === true;

  if (!server || !characterId) throw new Error('請填寫伺服器與角色 ID。');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var found = findBooking_(bookingId);
    var booking = rowToObject_(SHEET_NAMES.bookings, found.values);
    var rule = getGameRule_(booking.game);

    if (booking.status === STATUS.ended) throw new Error('此時段已結束。');
    if (booking.mode !== MODE.slot || toNumber_(booking.currentPlayers) > 0) {
      throw new Error('此時段已被預約，請重新整理大廳。');
    }
    if (playerCount < rule.min || playerCount > rule.max) {
      throw new Error(booking.game + ' 人數限制為 ' + rule.min + ' ~ ' + rule.max + ' 人。');
    }
    if (useGem && !rule.gem) throw new Error('此遊戲不支援寶石兌換。');

    var status = mode === MODE.private || playerCount >= rule.max ? STATUS.full : STATUS.open;
    if (useGem) status = STATUS.gem;
    var totalFeeWan = useGem ? 0 : playerCount * rule.priceWan;
    var now = new Date();

    getSheet_(SHEET_NAMES.bookings).getRange(found.rowIndex, 8, 1, 8).setValues([[
      mode, rule.max, playerCount, status, useGem, totalFeeWan, booking.createdAt || now, now
    ]]);
    appendParticipant_(bookingId, server, characterId, playerCount, '發起人');

    return createJsonResponse({ success: true, message: '預約成功。' });
  } finally {
    lock.releaseLock();
  }
}

function joinTable(data) {
  var bookingId = data.bookingId;
  var server = (data.server || '').trim();
  var characterId = (data.characterId || '').trim();
  if (!server || !characterId) throw new Error('請填寫伺服器與角色 ID。');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var found = findBooking_(bookingId);
    var booking = rowToObject_(SHEET_NAMES.bookings, found.values);
    var current = toNumber_(booking.currentPlayers);
    var max = toNumber_(booking.maxPlayers);

    if (booking.mode !== MODE.openTable) throw new Error('此團不是開放併桌。');
    if (booking.status === STATUS.ended) throw new Error('此團已結束。');
    if (current >= max || booking.status === STATUS.full) {
      return createJsonResponse({ success: false, message: '此團已滿，手速太慢囉！' });
    }

    current += 1;
    var status = current >= max ? STATUS.full : STATUS.open;
    var now = new Date();
    getSheet_(SHEET_NAMES.bookings).getRange(found.rowIndex, 10, 1, 6).setValues([[
      current, status, booking.useGem, booking.totalFeeWan, booking.createdAt || now, now
    ]]);
    appendParticipant_(bookingId, server, characterId, 1, '併桌團員');

    return createJsonResponse({ success: true, message: '成功加入併桌！' });
  } finally {
    lock.releaseLock();
  }
}

function endBooking(data) {
  var bookingId = data.bookingId;
  var found = findBooking_(bookingId);
  getSheet_(SHEET_NAMES.bookings).getRange(found.rowIndex, 11, 1, 5).setValues([[
    STATUS.ended, found.values[11], found.values[12], found.values[13], new Date()
  ]]);
  return createJsonResponse({ success: true, message: '場次已結束。' });
}

function requireHost_(host) {
  if (!host || !host.username || !host.displayName) throw new Error('缺少主持人登入資訊。');
  return {
    username: host.username,
    displayName: host.displayName
  };
}

function validateDateTime_(date, startTime, endTime) {
  if (!date || !startTime || !endTime) throw new Error('請填寫日期與時段。');
  if (timeToMinutes_(startTime) >= timeToMinutes_(endTime)) throw new Error('結束時間必須晚於開始時間。');
}

function getGameRule_(game) {
  if (!GAME_RULES[game]) throw new Error('不支援的遊戲：' + game);
  return GAME_RULES[game];
}

function appendParticipant_(bookingId, server, characterId, count, role) {
  getSheet_(SHEET_NAMES.participants).appendRow([
    makeId_('PT'), bookingId, server, characterId, count, role, new Date()
  ]);
}

function findBooking_(bookingId) {
  if (!bookingId) throw new Error('缺少 bookingId。');
  var sheet = getSheet_(SHEET_NAMES.bookings);
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (values[i][0] === bookingId) return { rowIndex: i + 1, values: values[i] };
  }
  throw new Error('找不到指定場次，請重新整理。');
}

function getRows_(sheetName) {
  var sheet = getSheet_(sheetName);
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  var headers = values[0];
  return values.slice(1).filter(function(row) {
    return row.some(function(cell) { return cell !== ''; });
  }).map(function(row) {
    return rowToObjectFromHeaders_(headers, row);
  });
}

function rowToObject_(sheetName, row) {
  var headers = getSheet_(sheetName).getRange(1, 1, 1, row.length).getValues()[0];
  return rowToObjectFromHeaders_(headers, row);
}

function rowToObjectFromHeaders_(headers, row) {
  var obj = {};
  headers.forEach(function(header, index) {
    var value = row[index];
    if (value instanceof Date) {
      if (header === 'date') value = Utilities.formatDate(value, 'GMT+8', 'yyyy-MM-dd');
      else if (header === 'startTime' || header === 'endTime') value = Utilities.formatDate(value, 'GMT+8', 'HH:mm');
      else value = Utilities.formatDate(value, 'GMT+8', 'yyyy-MM-dd HH:mm:ss');
    }
    obj[header] = value;
  });
  return obj;
}

function toNumber_(value) {
  var n = Number(value);
  return isNaN(n) ? 0 : n;
}

function timeToMinutes_(time) {
  var parts = String(time).split(':');
  return Number(parts[0]) * 60 + Number(parts[1]);
}

function makeId_(prefix) {
  return prefix + Utilities.formatDate(new Date(), 'GMT+8', 'yyyyMMddHHmmss') + Math.floor(Math.random() * 10000);
}
