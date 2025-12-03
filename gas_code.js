// ==========================================
// 現場業務アシスタント - Google Apps Script (GAS) コード
// ==========================================

// スプレッドシートのID（このスクリプトが紐づいているシート）
const SS = SpreadsheetApp.getActiveSpreadsheet();

// シート名の定義
const SHEET_NAMES = {
    DATA: 'Data',
    USERS: 'Users'
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
}

// GETリクエスト処理（データ取得）
function doGet(e) {
    const action = e.parameter.action;

    if (action === 'getUsers') {
        return getUsers();
    } else if (action === 'getData') {
        const userName = e.parameter.userName;
        return getData(userName);
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
        }

        return createJSONOutput({ error: 'Invalid action' });
    } catch (error) {
        return createJSONOutput({ error: error.toString() });
    }
}

// ユーザーリスト取得
function getUsers() {
    const sheet = SS.getSheetByName(SHEET_NAMES.USERS);
    const data = sheet.getDataRange().getValues();
    const users = [];

    // 1行目はヘッダーなのでスキップ
    for (let i = 1; i < data.length; i++) {
        if (data[i][1] === true || data[i][1] === 'true') { // isActiveがtrueのみ
            users.push(data[i][0]);
        }
    }

    return createJSONOutput({ users: users });
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

// ユーザー追加
function addUser(userName) {
    const sheet = SS.getSheetByName(SHEET_NAMES.USERS);
    sheet.appendRow([userName, true]);
    return createJSONOutput({ success: true });
}

// ユーザー削除（論理削除）
function deleteUser(userName) {
    const sheet = SS.getSheetByName(SHEET_NAMES.USERS);
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
        if (data[i][0] === userName) {
            sheet.getRange(i + 1, 2).setValue(false); // isActiveをfalseに
            break;
        }
    }

    return createJSONOutput({ success: true });
}

// JSONレスポンス生成ヘルパー
function createJSONOutput(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
}
