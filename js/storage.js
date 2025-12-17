// ==================== //
// LocalStorage管理
// ==================== //

const STORAGE_KEYS = {
    ATTENDANCE: 'attendance_records',
    WORK_REPORTS: 'work_reports',
    NIGHT_SHIFTS: 'night_shifts',
    TEAM_INSTRUCTIONS: 'team_instructions',
    NIGHT_SHIFT_DRAFTS: 'night_shift_drafts'
};

// Google Apps Script Web App URL (ユーザーが設定)
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxkEar9PLQb3RnQVNbiunxT79wLfYWNj6qt18rCP4wbhs-21Wjk0xbqskBiZuFNOAhCog/exec'; // ここにデプロイしたURLを貼り付ける

// データを保存
async function saveData(key, data) {
    try {
        // 現在のユーザーを取得（デフォルト値として使用）
        const currentUser = localStorage.getItem('current_user') || '未設定';

        // データ内にuserNameがあればそれを優先、なければ現在のユーザー設定を使用
        const userName = data.userName || currentUser;

        const record = {
            ...data,
            userName: userName,
            id: Date.now(),
            timestamp: new Date().toISOString()
        };

        // ローカルストレージに保存（キャッシュ/オフライン用）
        const existingData = getData(key) || [];
        existingData.push(record);
        localStorage.setItem(key, JSON.stringify(existingData));

        // GASに送信
        if (GAS_API_URL) {
            try {
                await fetch(GAS_API_URL, {
                    method: 'POST',
                    mode: 'no-cors', // GASへのPOSTはno-corsが必要
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        action: 'saveData',
                        data: {
                            ...record,
                            category: getCategoryByKey(key) // キーからカテゴリー名を推測
                        }
                    })
                });
                console.log('GASへの保存成功');
            } catch (e) {
                console.error('GASへの保存失敗:', e);
                // 失敗した場合の再送処理などは今回は省略
            }
        }

        return true;
    } catch (error) {
        console.error('データ保存エラー:', error);
        return false;
    }
}

// データを更新 (編集用)
function updateData(key, id, newData) {
    try {
        const list = getData(key);
        // idは数値として比較
        const index = list.findIndex(item => item.id == id);

        if (index !== -1) {
            // 既存データと新データをマージ (IDとTimestampは維持するか、Timestampは更新するか要件次第だが、修正なので維持が良いかも)
            // ただし、ユーザーが修正したということは「修正履歴」としてTimestamp更新もありうるが、
            // 今回は「間違ってしまった場合に修正」なので、IDはそのまま、内容は更新とする
            list[index] = {
                ...list[index],
                ...newData
            };

            localStorage.setItem(key, JSON.stringify(list));
            return true;
        }
        return false;
    } catch (error) {
        console.error('データ更新エラー:', error);
        return false;
    }
}

// キーからカテゴリー名を判定するヘルパー
function getCategoryByKey(key) {
    switch (key) {
        case STORAGE_KEYS.ATTENDANCE: return '勤怠';
        case STORAGE_KEYS.WORK_REPORTS: return '作業報告';
        case STORAGE_KEYS.NIGHT_SHIFTS: return '夜勤申請';
        case STORAGE_KEYS.TEAM_INSTRUCTIONS: return '夜勤メンバー指示';
        default: return 'その他';
    }
}

// データを取得
function getData(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('データ取得エラー:', error);
        return [];
    }
}

// 今月のデータを取得
function getCurrentMonthData(key) {
    const allData = getData(key);
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    return allData.filter(item => {
        const itemDate = new Date(item.timestamp);
        return itemDate.getFullYear() === currentYear &&
            itemDate.getMonth() === currentMonth;
    });
}

// 日付範囲でデータを取得
function getDataByDateRange(key, startDate, endDate) {
    const allData = getData(key);
    const fromDate = new Date(startDate);
    const toDate = new Date(endDate);

    return allData.filter(item => {
        const itemDate = new Date(item.timestamp);
        const itemDateOnly = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());
        return itemDateOnly >= fromDate && itemDateOnly <= toDate;
    });
}

// 全データをクリア
function clearAllData() {
    if (confirm('全てのデータを削除しますか？この操作は取り消せません。')) {
        localStorage.clear();
        alert('データを削除しました');
        return true;
    }
    return false;
}

// ==================== //
// 下書き管理機能
// ==================== //

// 下書きを保存
function saveDraft(data) {
    try {
        const drafts = getDrafts();
        const draft = {
            ...data,
            id: Date.now(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: data.status || 'draft' // 提供されたステータスを使用、なければ 'draft'
        };
        drafts.push(draft);
        localStorage.setItem(STORAGE_KEYS.NIGHT_SHIFT_DRAFTS, JSON.stringify(drafts));
        return draft.id;
    } catch (error) {
        console.error('下書き保存エラー:', error);
        return null;
    }
}

// 全下書きを取得
function getDrafts() {
    try {
        const data = localStorage.getItem(STORAGE_KEYS.NIGHT_SHIFT_DRAFTS);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('下書き取得エラー:', error);
        return [];
    }
}

// 特定の下書きを取得
function getDraft(id) {
    const drafts = getDrafts();
    return drafts.find(draft => draft.id === id);
}

// 下書きを更新
function updateDraft(id, data) {
    try {
        const drafts = getDrafts();
        const index = drafts.findIndex(draft => draft.id === id);
        if (index !== -1) {
            drafts[index] = {
                ...drafts[index],
                ...data,
                updatedAt: new Date().toISOString()
            };
            localStorage.setItem(STORAGE_KEYS.NIGHT_SHIFT_DRAFTS, JSON.stringify(drafts));
            return true;
        }
        return false;
    } catch (error) {
        console.error('下書き更新エラー:', error);
        return false;
    }
}

// 下書きを削除
function deleteDraft(id) {
    try {
        const drafts = getDrafts();
        const filtered = drafts.filter(draft => draft.id !== id);
        localStorage.setItem(STORAGE_KEYS.NIGHT_SHIFT_DRAFTS, JSON.stringify(filtered));
        return true;
    } catch (error) {
        console.error('下書き削除エラー:', error);
        return false;
    }
}

// 下書きを完成させて本データに移行
function completeDraft(id) {
    const draft = getDraft(id);
    if (draft && draft.status === 'draft') {
        // 本データとして保存
        const success = saveData(STORAGE_KEYS.NIGHT_SHIFTS, {
            ...draft,
            category: '夜勤申請'
        });

        if (success) {
            // 下書きを削除
            deleteDraft(id);
            return true;
        }
    }
    return false;
}

// ==================== //
// Google Sheets同期機能
// ==================== //

// データを同期（GASから取得）
async function syncData() {
    if (!GAS_API_URL) return { success: false, error: 'API URL未設定' };

    try {
        const currentUser = localStorage.getItem('current_user');
        // ユーザー未選択の場合は同期しない（あるいは全員分取得するかだが、今回は個人用として）
        // 管理者用ページなどで全員分取得するロジックは別途必要
        const targetUser = currentUser || 'all';

        const response = await fetch(`${GAS_API_URL}?action=getData&userName=${targetUser}`);
        const json = await response.json();

        if (json.data) {
            // ローカルストレージをクリアして再構築（簡易実装）
            // ※実際はマージなどが望ましいが、今回は「サーバー正」とする

            // 下書きとユーザー設定は保持
            const drafts = localStorage.getItem(STORAGE_KEYS.NIGHT_SHIFT_DRAFTS);
            const user = localStorage.getItem('current_user');
            const userList = localStorage.getItem('user_list');

            localStorage.clear();

            if (drafts) localStorage.setItem(STORAGE_KEYS.NIGHT_SHIFT_DRAFTS, drafts);
            if (user) localStorage.setItem('current_user', user);
            if (userList) localStorage.setItem('user_list', userList); // 一旦復元

            // ユーザーリストも同期
            await syncUsers();

            // データを振り分け
            json.data.forEach(record => {
                let key = '';
                // カテゴリーからキーを逆引き（簡易的）
                if (record.category === '勤怠' || ['遅刻早退', '有給申請', '代休申請'].includes(record.category)) key = STORAGE_KEYS.ATTENDANCE;
                else if (record.category === '作業報告') key = STORAGE_KEYS.WORK_REPORTS;
                else if (record.category === '夜勤申請') key = STORAGE_KEYS.NIGHT_SHIFTS;
                else if (record.category === '夜勤メンバー指示') key = STORAGE_KEYS.TEAM_INSTRUCTIONS;

                if (key) {
                    const list = JSON.parse(localStorage.getItem(key) || '[]');
                    list.push(record);
                    localStorage.setItem(key, JSON.stringify(list));
                }
            });

            return { success: true, count: json.data.length };
        }
        return { success: false, error: 'データなし' };
    } catch (error) {
        console.error('同期エラー:', error);
        return { success: false, error: error.message };
    }
}

// ユーザーリストを同期（取得）
async function syncUsers() {
    if (!GAS_API_URL) return;

    try {
        const response = await fetch(`${GAS_API_URL}?action=getUsers`);
        const json = await response.json();

        if (json.users && Array.isArray(json.users)) {
            localStorage.setItem('user_list', JSON.stringify(json.users));
            console.log('ユーザーリスト同期成功:', json.users.length);
            return true;
        }
    } catch (error) {
        console.error('ユーザー同期エラー:', error);
    }
    return false;
}

// ユーザーリストを保存（送信）
async function saveUserList(users) {
    localStorage.setItem('user_list', JSON.stringify(users));

    if (GAS_API_URL) {
        try {
            await fetch(GAS_API_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'saveUsers',
                    users: users
                })
            });
            console.log('GASへのユーザーリスト保存成功');
            return true;
        } catch (e) {
            console.error('GASへのユーザーリスト保存失敗:', e);
            return false;
        }
    }
    return true;
}

// CBOデータを保存（送信）
async function saveCBODataToGAS(data, fileCount) {
    if (!GAS_API_URL) return false;

    try {
        await fetch(GAS_API_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'saveCBOData',
                cboData: data,
                fileCount: fileCount
            })
        });
        console.log('GASへのCBOデータ保存成功');
        return true;
    } catch (e) {
        console.error('GASへのCBOデータ保存失敗:', e);
        return false;
    }
}

// CBOデータを取得
async function fetchCBODataFromGAS() {
    if (!GAS_API_URL) return null;

    try {
        const response = await fetch(`${GAS_API_URL}?action=getCBOData`);
        const json = await response.json();

        if (json.data && Array.isArray(json.data)) {
            return {
                data: json.data,
                timestamp: json.timestamp, // ISO string
                fileCount: json.fileCount || 1
            };
        }
    } catch (e) {
        console.error('GASからのCBOデータ取得失敗:', e);
    }
    return null;
}

// ==================== //
// バックアップ・復元機能
// ==================== //

// 全データをエクスポート用オブジェクトとして取得
function exportAllData() {
    const exportData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        data: {}
    };

    // 定義されている全てのキーのデータを取得
    Object.values(STORAGE_KEYS).forEach(key => {
        const rawData = localStorage.getItem(key);
        if (rawData) {
            exportData.data[key] = JSON.parse(rawData);
        }
    });

    // ユーザー設定も保存
    const currentUser = localStorage.getItem('current_user');
    if (currentUser) {
        exportData.data['current_user'] = currentUser;
    }

    return JSON.stringify(exportData, null, 2);
}

// データをインポート
function importData(jsonString) {
    try {
        const importObj = JSON.parse(jsonString);

        // バージョンチェックなどは将来的にここで行う

        if (!importObj.data) {
            throw new Error('無効なデータ形式です');
        }

        // データを復元
        Object.keys(importObj.data).forEach(key => {
            const value = importObj.data[key];

            if (key === 'current_user') {
                localStorage.setItem('current_user', value);
            } else if (typeof value === 'object') {
                localStorage.setItem(key, JSON.stringify(value));
            }
        });

        return { success: true, count: Object.keys(importObj.data).length };
    } catch (error) {
        console.error('インポートエラー:', error);
        return { success: false, error: error.message };
    }
}
