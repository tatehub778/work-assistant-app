// ==========================================
// 現場業務アシスタント - Google Apps Script (GAS) コード
// ==========================================

// スプレッドシートのID（このスクリプトが紐づいているシート）
const SS = SpreadsheetApp.getActiveSpreadsheet();

// シート名の定義
const SHEET_NAMES = {
    DATA: 'Data',
    USERS: 'Users',
    LATE_CHECKS: 'LateChecks',
    PAID_LEAVE: 'PaidLeaveBalance',
    CBO_DATA: 'CBO_Data'
};

// 初期セットアップ（初回のみ実行）
function setup() {
    const sheets = SS.getSheets();
    const existingNames = sheets.map(s => s.getName());

    // Dataシート作成
    if (!existingNames.includes(SHEET_NAMES.DATA)) {
        const sheet = SS.insertSheet(SHEET_NAMES.DATA);
        sheet.appendRow(['id', 'timestamp', 'userName', 'category', 'data_json']); // ヘッダー
    }

    // Usersシート作成
    if (!existingNames.includes(SHEET_NAMES.USERS)) {
        const sheet = SS.insertSheet(SHEET_NAMES.USERS);
        sheet.appendRow(['userName', 'isActive']); // ヘッダー
        // デフォルトユーザーを追加
        sheet.appendRow(['田中太郎', true]);
        sheet.appendRow(['佐藤花子', true]);
        sheet.appendRow(['鈴木一郎', true]);
    }

    // LateChecksシート作成
    if (!existingNames.includes(SHEET_NAMES.LATE_CHECKS)) {
        const sheet = SS.insertSheet(SHEET_NAMES.LATE_CHECKS);
        sheet.appendRow(['Date', 'EmployeeName', 'Timestamp']);
    }

    // PaidLeaveBalanceシート作成
    if (!existingNames.includes(SHEET_NAMES.PAID_LEAVE)) {
        const sheet = SS.insertSheet(SHEET_NAMES.PAID_LEAVE);
        sheet.appendRow(['EmployeeName', 'RemainingDays', 'LastUpdated']);
    }

    // CBO_Dataシート作成
    if (!existingNames.includes(SHEET_NAMES.CBO_DATA)) {
        const sheet = SS.insertSheet(SHEET_NAMES.CBO_DATA);
        // ヘッダーはsaveCBODataで管理されるが、初期作成時にもある程度入れておく
        sheet.getRange(1, 1).setValue('UpdatedAt');
    }
}

// GETリクエスト処理（データ取得）
function doGet(e) {
    const action = e.parameter.action;

    if (action === 'getUsers') {
        return getUsers();
    } else if (action === 'getData') {
        const userName = e.parameter.userName;
        return getData(userName);
    } else if (action === 'getLateChecks') {
        const date = e.parameter.date;
        return getLateChecks(date);
    } else if (action === 'getLateChecksMonthly') {
        const month = e.parameter.month;
        return getLateChecksMonthly(month);
    } else if (action === 'getPaidLeaveBalance') {
        return getPaidLeaveBalance();
    } else if (action === 'getCBOData') {
        return getCBOData();
    }

    return createJSONOutput({ error: 'Invalid action' });
}

// POSTリクエスト処理（データ保存）
function doPost(e) {
    try {
        const params = JSON.parse(e.postData.contents);
        const action = params.action;

        if (action === 'saveData') {
            return saveData(params.data);
        } else if (action === 'addUser') {
            return addUser(params.userName);
        } else if (action === 'deleteUser') {
            return deleteUser(params.userName);
        } else if (action === 'saveLateCheck') {
            return saveLateCheck(params.date, params.employees);
        } else if (action === 'savePaidLeaveBalance') {
            return savePaidLeaveBalance(params.balances);
        } else if (action === 'saveCBOData') {
            return saveCBOData(params.cboData, params.fileCount);
        }

        return createJSONOutput({ error: 'Invalid action' });
    } catch (error) {
        return createJSONOutput({ error: error.toString() });
    }
}



// ==========================================
// CBOデータ機能
// ==========================================

// CBOデータ取得
function getCBOData() {
    let sheet = SS.getSheetByName(SHEET_NAMES.CBO_DATA);
    if (!sheet) return createJSONOutput({ data: [], timestamp: null });

    const lastRow = sheet.getLastRow();
    if (lastRow < 3) return createJSONOutput({ data: [], timestamp: null }); // ヘッダーのみ

    // タイムスタンプ取得 (A1セル)
    const timestamp = sheet.getRange(1, 2).getValue();
    // Data取得 (3行目から)
    const dataRange = sheet.getRange(3, 1, lastRow - 2, 4).getValues();
    // [date, userName, type, detail]

    // オブジェクト配列に戻す
    const records = dataRange.map(row => ({
        date: row[0],
        userName: row[1],
        type: row[2],
        detail: row[3]
    }));

    return createJSONOutput({
        data: records,
        timestamp: timestamp,
        fileCount: sheet.getRange(1, 4).getValue() || 1
    });
}

// CBOデータ保存
function saveCBOData(cboData, fileCount) {
    let sheet = SS.getSheetByName(SHEET_NAMES.CBO_DATA);
    if (!sheet) {
        sheet = SS.insertSheet(SHEET_NAMES.CBO_DATA);
    }

    // シートクリア
    sheet.clear();

    // メタデータ保存 (1行目: Timestamp)
    const now = new Date();
    sheet.getRange(1, 1).setValue('UpdatedAt');
    sheet.getRange(1, 2).setValue(now.toISOString());
    sheet.getRange(1, 3).setValue('FileCount');
    sheet.getRange(1, 4).setValue(fileCount);

    // ヘッダー (2行目)
    sheet.getRange(2, 1, 1, 4).setValues([['date', 'userName', 'type', 'detail']]);

    // データ保存 (3行目以降)
    if (cboData && cboData.length > 0) {
        // [date, userName, type, detail] の配列に変換
        const rows = cboData.map(d => [d.date, d.userName, d.type, d.detail]);
        sheet.getRange(3, 1, rows.length, 4).setValues(rows);
    }

    return createJSONOutput({ success: true, timestamp: now.toISOString() });
}

// ユーザーリスト取得
function getUsers() {
    let sheet = SS.getSheetByName(SHEET_NAMES.USERS);
    if (!sheet) {
        sheet = SS.insertSheet(SHEET_NAMES.USERS);
        sheet.appendRow(['userName', 'updatedAt']);
        sheet.appendRow(['田中太郎', new Date()]);
        sheet.appendRow(['佐藤花子', new Date()]);
        return createJSONOutput({ users: ['田中太郎', '佐藤花子'] });
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
        return createJSONOutput({ users: [] });
    }

    // 2行目から最終行までのA列(ユーザー名)を取得
    const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    const users = data.map(row => row[0]).filter(u => u !== '');

    return createJSONOutput({ users: users });
}

// ユーザーリスト保存 (一括更新)
function saveUsers(users) {
    let sheet = SS.getSheetByName(SHEET_NAMES.USERS);
    if (!sheet) {
        sheet = SS.insertSheet(SHEET_NAMES.USERS);
        sheet.appendRow(['userName', 'updatedAt']);
    }

    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
        // 既存データをクリア
        sheet.getRange(2, 1, lastRow - 1, 2).clearContent();
    }

    if (users && users.length > 0) {
        const timestamp = new Date();
        const rows = users.map(user => [user, timestamp]);
        sheet.getRange(2, 1, rows.length, 2).setValues(rows);
    }

    return createJSONOutput({ success: true });
}

// データ取得
function getData(userName) {
    const sheet = SS.getSheetByName(SHEET_NAMES.DATA);
    const data = sheet.getDataRange().getValues();
    const result = [];

    // 1行目はヘッダーなのでスキップ
    for (let i = 1; i < data.length; i++) {
        const row = data[i];
        // ユーザー名が一致、または管理者の場合は全データ（ここでは簡易的に全員取得可能にするか、パラメータで制御）
        // 今回は「自分のデータ」を取得する想定。userNameが'all'なら全員。
        if (userName === 'all' || row[2] === userName) {
            try {
                const json = JSON.parse(row[4]);
                result.push(json);
            } catch (e) {
                // JSONパースエラーは無視
            }
        }
    }

    return createJSONOutput({ data: result });
}

// データ保存
function saveData(record) {
    const sheet = SS.getSheetByName(SHEET_NAMES.DATA);

    // ID, Timestamp, UserName, Category, JSON string
    sheet.appendRow([
        record.id,
        record.timestamp,
        record.userName,
        record.category,
        JSON.stringify(record)
    ]);

    return createJSONOutput({ success: true });
}


// ==========================================
// 遅刻チェック機能
// ==========================================

function getLateChecks(dateStr) {
    const sheet = SS.getSheetByName(SHEET_NAMES.LATE_CHECKS);
    if (!sheet) return createJSONOutput({ checks: [] });

    const data = sheet.getDataRange().getValues();
    const checks = [];

    // 1行目はヘッダー
    for (let i = 1; i < data.length; i++) {
        // Dateオブジェクトまたは文字列として日付比較
        const rowDate = new Date(data[i][0]);
        const targetDate = new Date(dateStr);

        // 日付が一致するか確認 (YYYY-MM-DD)
        if (formatDate(rowDate) === formatDate(targetDate)) {
            checks.push(data[i][1]); // 社員名
        }
    }

    return createJSONOutput({ checks: checks });
}

function getLateChecksMonthly(monthStr) {
    const sheet = SS.getSheetByName(SHEET_NAMES.LATE_CHECKS);
    if (!sheet) return createJSONOutput({ checks: [] });

    const data = sheet.getDataRange().getValues();
    const checks = [];

    // 1行目はヘッダー
    for (let i = 1; i < data.length; i++) {
        const rowDate = new Date(data[i][0]);
        // YYYY-MM形式で比較
        const y = rowDate.getFullYear();
        const m = String(rowDate.getMonth() + 1).padStart(2, '0');
        const ym = `${y}-${m}`;

        if (ym === monthStr) {
            checks.push({
                date: formatDate(rowDate),
                userName: data[i][1]
            });
        }
    }

    return createJSONOutput({ checks: checks });
}

function saveLateCheck(dateStr, employees) {
    let sheet = SS.getSheetByName(SHEET_NAMES.LATE_CHECKS);
    if (!sheet) {
        sheet = SS.insertSheet(SHEET_NAMES.LATE_CHECKS);
        sheet.appendRow(['Date', 'EmployeeName', 'Timestamp']);
    }

    // 指定日の既存データを削除（上書きのため）
    const data = sheet.getDataRange().getValues();

    // 削除対象の行インデックスを収集
    const rowsToDelete = [];
    for (let i = data.length - 1; i >= 1; i--) {
        const rowDate = new Date(data[i][0]);
        const targetDate = new Date(dateStr);
        if (formatDate(rowDate) === formatDate(targetDate)) {
            rowsToDelete.push(i + 1);
        }
    }

    // 削除実行 (下から順に削除しないとずれるが、deleteRowは1行ずつなので注意)
    // GASのdeleteRowは重いので、本来はfilterしてsetValuesし直すのが良いが、件数が少ないと仮定
    rowsToDelete.forEach(row => sheet.deleteRow(row));

    // 新しいデータを追加
    const timestamp = new Date();
    employees.forEach(emp => {
        sheet.appendRow([dateStr, emp, timestamp]);
    });

    return createJSONOutput({ success: true });
}


// ==========================================
// 有給残日数管理機能
// ==========================================

function getPaidLeaveBalance() {
    const sheet = SS.getSheetByName(SHEET_NAMES.PAID_LEAVE);
    if (!sheet) return createJSONOutput({ balances: {} });

    const data = sheet.getDataRange().getValues();
    const balances = {};

    // 1行目はヘッダー
    for (let i = 1; i < data.length; i++) {
        const name = data[i][0];
        const days = data[i][1];
        if (name) {
            balances[name] = days;
        }
    }

    return createJSONOutput({ balances: balances });
}

function savePaidLeaveBalance(balances) {
    let sheet = SS.getSheetByName(SHEET_NAMES.PAID_LEAVE);
    if (!sheet) {
        sheet = SS.insertSheet(SHEET_NAMES.PAID_LEAVE);
        sheet.appendRow(['EmployeeName', 'RemainingDays', 'LastUpdated']);
    }

    // 全データをクリアして再書き込み（シンプルに）
    // ※履歴を残したい場合は別のアプローチが必要だが、今回は現状管理のみ
    sheet.clearContents();
    sheet.appendRow(['EmployeeName', 'RemainingDays', 'LastUpdated']); // ヘッダー再作成

    const timestamp = new Date();
    const rows = [];
    for (const [name, days] of Object.entries(balances)) {
        rows.push([name, days, timestamp]);
    }

    if (rows.length > 0) {
        sheet.getRange(2, 1, rows.length, 3).setValues(rows);
    }

    return createJSONOutput({ success: true });
}

function formatDate(date) {
    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// JSONレスポンス生成ヘルパー
function createJSONOutput(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
}
