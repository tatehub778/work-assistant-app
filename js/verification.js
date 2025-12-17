// ==================== //
// CSV照合ロジック (複数ファイル対応版 + 永続化 + GAS同期 + 月別フィルタ + 遅刻履歴)
// ==================== //

const CBO_CACHE_KEY = 'work-assistant-cbo-cache';
let currentCboData = []; // メモリ上に保持
let currentFileCount = 0;
let paidLeaveBalances = {};

document.addEventListener('DOMContentLoaded', () => {
    const uploadArea = document.getElementById('uploadArea');
    const csvInput = document.getElementById('csvInput');
    const monthFilter = document.getElementById('monthFilter');

    // 今月を初期値に設定
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    monthFilter.value = `${y}-${m}`;

    // 月変更イベント
    monthFilter.addEventListener('change', () => {
        refreshView();
    });

    // 保存されたデータがあれば読み込む（サーバー同期含む）
    loadCachedData();

    // ドラッグ＆ドロップイベント
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            processFiles(files);
        }
    });

    csvInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            processFiles(files);
        }
    });
});

async function processFiles(fileList) {
    const loadingEl = document.getElementById('loading');
    const resultsEl = document.getElementById('results');

    loadingEl.style.display = 'block';
    resultsEl.style.display = 'none';

    try {
        const files = Array.from(fileList).filter(f => f.name.endsWith('.csv'));
        if (files.length === 0) {
            alert('CSVファイルが選択されていません');
            loadingEl.style.display = 'none';
            return;
        }

        let allCboData = [];
        let errorMessages = [];
        let totalFilesRead = 0;

        // 全ファイルを並行して読み込む
        const promises = files.map(file => readFile(file));
        const fileResults = await Promise.all(promises);

        fileResults.forEach(res => {
            if (res.error) {
                errorMessages.push(`${res.fileName}: ${res.error}`);
            } else {
                allCboData = allCboData.concat(res.records);
                totalFilesRead++;
            }
        });

        if (totalFilesRead === 0 && errorMessages.length > 0) {
            // 全て失敗
            renderError('全てのファイルの読み込みに失敗しました', errorMessages.join('\n'));
            loadingEl.style.display = 'none';
            return;
        }

        // 保存 & サーバー同期
        await saveCBOData(allCboData, totalFilesRead);

        // メモリ更新
        currentCboData = allCboData;
        currentFileCount = totalFilesRead;

        // 表示更新 (エラー表示も含めて)
        refreshView(errorMessages);

        loadingEl.style.display = 'none';

    } catch (error) {
        console.error(error);
        alert('予期せぬエラーが発生しました: ' + error.message);
        loadingEl.style.display = 'none';
    }
}

// ビューを更新（月フィルタ適用して再表示）
async function refreshView(uploadErrors = []) {
    const month = document.getElementById('monthFilter').value; // YYYY-MM
    if (!month) return;

    // 1. CBO照合
    runComparison(month, uploadErrors);

    // 2. 遅刻履歴取得・表示
    await renderLateHistory(month);
}

// 照合実行
function runComparison(monthStr, errors) {
    const resultsEl = document.getElementById('results');

    // CBOデータを月でフィルタ
    const filteredCboData = currentCboData.filter(d => d.date.startsWith(monthStr));

    // アプリデータを月でフィルタ
    const appData = getAppData(monthStr);

    // 比較実行
    const comparison = compareData(filteredCboData, appData);

    // 表示
    renderResults(comparison, filteredCboData.length, currentFileCount, errors);
    resultsEl.style.display = 'block';
}

// 遅刻履歴表示
async function renderLateHistory(monthStr) {
    const container = document.getElementById('lateHistoryResults');
    container.style.display = 'block';
    container.innerHTML = '<p style="text-align:center;">⌛ 遅刻履歴を取得中...</p>';

    // GASから取得
    const checks = await Storage.getLateChecksMonthly(monthStr);

    container.innerHTML = ''; // クリア

    if (!checks || checks.length === 0) {
        // データなしの場合でも枠は出すかどうか...今回は出しておく
        // container.innerHTML = '<div class="result-card"><div class="result-header">遅刻記録</div><div class="result-content">データなし</div></div>';
        return;
    }

    // ユーザー毎に集計
    // { "田中": ["2024-12-15", "2024-12-17"], ... }
    const grouped = {};
    checks.forEach(c => {
        if (!grouped[c.userName]) grouped[c.userName] = [];
        grouped[c.userName].push(c.date);
    });

    // 日付順にソートして重複除去（念のため）
    Object.keys(grouped).forEach(user => {
        grouped[user] = [...new Set(grouped[user])].sort();
    });

    const card = document.createElement('div');
    card.className = 'result-card';
    card.innerHTML = `
        <div class="result-header warning"><span>⏰ ${monthStr} 遅刻記録一覧</span></div>
        <div class="result-content">
            <table class="diff-table">
                <thead><tr><th style="width:30%">氏名</th><th>遅刻日</th><th>回数</th></tr></thead>
                <tbody>
                    ${Object.keys(grouped).map(user => {
        const dates = grouped[user].map(d => {
            // 日付のみ見やすく (MM/DD)
            const dateParts = d.split('-');
            return `${dateParts[1]}/${dateParts[2]}`;
        }).join(', ');
        return `<tr>
                            <td style="font-weight:bold;">${user}</td>
                            <td>${dates}</td>
                            <td style="text-align:center;">${grouped[user].length}</td>
                        </tr>`;
    }).join('')}
                </tbody>
            </table>
        </div>
    `;
    container.appendChild(card);
}


// データを保存
async function saveCBOData(data, fileCount) {
    const cache = {
        timestamp: new Date().toISOString(),
        data: data,
        fileCount: fileCount
    };
    try {
        localStorage.setItem(CBO_CACHE_KEY, JSON.stringify(cache));
        updateLastSavedUI(cache.timestamp, '保存中...');

        // サーバー同期
        const success = await Storage.saveCBODataToGAS(data, fileCount);
        if (success) {
            updateLastSavedUI(cache.timestamp, 'サーバー同期完了');
        } else {
            updateLastSavedUI(cache.timestamp, 'サーバー同期失敗(ローカル保存済)');
        }
    } catch (e) {
        console.error('保存に失敗しました（容量オーバーの可能性があります）', e);
    }
}

// データを読み込み
async function loadCachedData() {
    let localCache = null;
    try {
        const json = localStorage.getItem(CBO_CACHE_KEY);
        if (json) {
            localCache = JSON.parse(json);
        }
    } catch (e) {
        console.error('キャッシュ読み込みエラー', e);
    }

    // まずローカルデータで初期化
    if (localCache && localCache.data) {
        currentCboData = localCache.data;
        currentFileCount = localCache.fileCount;
        updateLastSavedUI(localCache.timestamp, 'サーバー確認中...');
        refreshView();
    }

    // 有給残日数を取得 (並行して行う)
    Storage.getPaidLeaveBalance().then(balances => {
        console.log('有給残データ取得:', balances); // DEBUG
        if (balances) {
            // キー（氏名）を正規化して保存
            const normalizedMap = {};
            Object.keys(balances).forEach(key => {
                const normalizedKey = normalizeName(key);
                normalizedMap[normalizedKey] = balances[key];
            });
            paidLeaveBalances = normalizedMap;
            refreshView(); // 残日数反映のため再描画
        }
    });

    // サーバーから最新を取得
    const serverData = await Storage.fetchCBODataFromGAS();

    if (serverData) {
        serverData.data = serverData.data.map(item => ({
            ...item,
            date: normalizeDateStr(item.date)
        }));

        const serverTime = new Date(serverData.timestamp).getTime();
        const localTime = localCache ? new Date(localCache.timestamp).getTime() : 0;

        if (serverTime > localTime) {
            console.log('サーバーから新しいデータを取得しました');
            localStorage.setItem(CBO_CACHE_KEY, JSON.stringify(serverData));
            updateLastSavedUI(serverData.timestamp, 'サーバー同期完了(最新)');

            // データ更新して再描画
            currentCboData = serverData.data;
            currentFileCount = serverData.fileCount;
            refreshView();

        } else if (localCache) {
            updateLastSavedUI(localCache.timestamp, 'サーバー同期完了');
        }
    } else {
        if (localCache) updateLastSavedUI(localCache.timestamp, 'サーバー通信エラー');
    }
}

// 日付文字列を正規化
function normalizeDateStr(dateStr) {
    if (!dateStr) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
}

function getAppData(monthStr) {
    const attendance = Storage.getData(STORAGE_KEYS.ATTENDANCE);

    // 月でフィルタ & カテゴリ補正
    const monthlyData = attendance.filter(d => {
        if (!d.timestamp) return false;
        return d.timestamp.startsWith(monthStr);
    }).map(d => {
        // カテゴリが「勤怠」または不明の場合の補正
        if (d.category === '勤怠' || !d.category) {
            if (d.leaveDate) return { ...d, category: '代休申請' };
            if (d.startDate || (d.days && d.reason)) return { ...d, category: '有給申請' };
            if (d.type || d.minutes) return { ...d, category: '遅刻早退' };
        }
        return d;
    });

    const lateEarly = monthlyData.filter(d => ['遅刻', '早退', '中抜け'].includes(d.type) || d.category === '遅刻早退');
    const paidLeave = monthlyData.filter(d => d.type === '有給' || d.category === '有給申請');
    const compLeave = monthlyData.filter(d => d.type === '代休' || d.category === '代休申請');

    return [...lateEarly, ...paidLeave, ...compLeave].map(d => {
        let type = d.type;
        if (!type) {
            if (d.category === '有給申請') type = '有給';
            else if (d.category === '代休申請') type = '代休';
            else if (d.category === '遅刻早退') type = '遅刻'; // フォールバック
        }

        let dateStr = d.date; // 遅刻早退などはこれ
        if (!dateStr) {
            if (d.category === '有給申請') dateStr = d.startDate;
            else if (d.category === '代休申請') dateStr = d.leaveDate;
            else if (d.timestamp) dateStr = d.timestamp.split('T')[0];
        }

        // 比較用の数値（分単位または日数）
        let amount = 0;
        if (['有給', '代休'].includes(type)) {
            amount = d.days || 1; // 日数
        } else {
            amount = parseInt(d.minutes || 0, 10); // 分
        }

        return {
            ...d,
            type: type,
            amount: amount,
            userName: normalizeName(d.userName),
            date: normalizeDateStr(dateStr)
        };
    });
}

function normalizeName(name) {
    if (!name) return '';
    let n = name.replace(/[\s　]/g, '');
    return n.replace(/\d+$/, '');
}

function compareData(cboData, appData) {
    const results = {
        missingInApp: [],
        missingInCSV: [],
        matches: [],        // 完全一致
        timeMismatches: []  // 時間ずれ
    };

    cboData.forEach(cRecord => {
        const match = appData.find(aRecord =>
            aRecord.date === cRecord.date &&
            aRecord.userName === cRecord.userName &&
            (aRecord.type.includes(cRecord.type) || cRecord.type.includes(aRecord.type))
        );

        if (match) {
            // 時間・日数の比較
            const cAmount = cRecord.amount || 0;
            const aAmount = match.amount || 0;
            let isMismatch = false;

            if (['有給', '代休'].includes(cRecord.type)) {
                // 日数比較 (0.1日以上の差)
                if (Math.abs(cAmount - aAmount) >= 0.1) isMismatch = true;
            } else {
                // 時間比較 (5分以上の差)
                if (Math.abs(cAmount - aAmount) >= 5) isMismatch = true;
            }

            if (isMismatch) {
                results.timeMismatches.push({ cbo: cRecord, app: match, diff: aAmount - cAmount });
            } else {
                results.matches.push({ cbo: cRecord, app: match });
            }
        } else {
            results.missingInApp.push(cRecord);
        }
    });

    appData.forEach(aRecord => {
        const alreadyMatched = results.matches.some(m => m.app.id === aRecord.id) ||
            results.timeMismatches.some(m => m.app.id === aRecord.id);
        if (!alreadyMatched) {
            results.missingInCSV.push(aRecord);
        }
    });

    return results;
}

function renderError(message, debugInfo) {
    const container = document.getElementById('results');
    container.style.display = 'block';
    container.innerHTML = `<div class="result-card"><div class="result-header error">❌ 解析エラー</div><div class="result-content"><p>${message}</p><pre style="background:#eee;padding:10px;">${debugInfo}</pre></div></div>`;
}

function renderResults(results, count, fileCount, errors) {
    const container = document.getElementById('results');
    container.innerHTML = '';

    if (errors && errors.length > 0) {
        const errorCard = document.createElement('div');
        errorCard.className = 'result-card';
        errorCard.innerHTML = `
            <div class="result-header error"><span>⚠️ 一部のファイルでエラー</span></div>
            <div class="result-content"><ul>${errors.map(e => `<li>${e}</li>`).join('')}</ul></div>
        `;
        container.appendChild(errorCard);
    }

    const infoCard = document.createElement('div');
    infoCard.style.cssText = 'margin-bottom:20px; padding:10px; background:#e7f5ff; border-radius:8px; color:#1971c2;';
    infoCard.innerHTML = `📊 <strong>${count}</strong> 件のCBOデータ（${fileCount}ファイル）と照合しました。`;
    container.appendChild(infoCard);

    const createSection = (title, items, typeClass, badgeClass, badgeLabel) => {
        if (items.length === 0) return;
        const card = document.createElement('div');
        card.className = 'result-card';
        card.innerHTML = `
            <div class="result-header ${typeClass}"><span>${title} (${items.length}件)</span></div>
            <div class="result-content">
                <table class="diff-table">
                    <thead><tr><th>日付</th><th>氏名</th><th>内容</th><th>詳細/理由</th><th>状態</th></tr></thead>
                    <tbody>
                        ${items.map(item => {
            const date = item.date || (item.cbo ? item.cbo.date : item.app.date);
            const shortDate = date ? date.substring(5).replace('-', '/') : '';
            const name = item.userName || (item.cbo ? item.cbo.userName : item.app.userName);
            const type = item.type || (item.cbo ? item.cbo.type : item.app.type);

            // 詳細表示ロジック
            let detail = '';

            // 1. マッチ系 (matches / timeMismatches) → CBOとAppの両方がある
            if (item.cbo && item.app) {
                detail += `CSV: ${item.cbo.detail} / `;
                if (['有給', '代休'].includes(type) || type.includes('有給') || type.includes('代休')) {
                    const days = item.app.amount || 1;
                    detail += `App: ${days === 0.5 ? '0.5' : days}日`;
                } else {
                    detail += `App: ${item.app.minutes}分`;
                }
                if (item.app.reason) detail += ` (${item.app.reason})`;

                // 差分表示(時間ずれの場合)
                /*
                // ユーザー要望により差分数値は表示しない（単位違いで混乱するため）
                if (item.diff) {
                    const diffVal = Math.abs(item.diff);
                    if (['有給', '代休'].includes(type)) {
                        detail += ` <span style="color:#d6336c; font-weight:bold;">(差:${diffVal.toFixed(1)}日)</span>`;
                    } else {
                        detail += ` <span style="color:#d6336c; font-weight:bold;">(差:${Math.round(diffVal)}分)</span>`;
                    }
                }
                */
            }
            // 2. アプリ未報告 (CBOのみ)
            else if (item.cbo || (!item.app && item.detail)) {
                const cboItem = item.cbo || item;
                detail = cboItem.detail || '';
            }
            // 3. CBO未反映 (アプリのみ)
            else if (item.app || (!item.cbo && item.amount !== undefined)) {
                const appItem = item.app || item;
                if (['有給', '代休'].includes(type) || type.includes('有給') || type.includes('代休')) {
                    const days = appItem.amount || 1;
                    detail += `${days === 0.5 ? '0.5' : days}日 `;
                } else {
                    if (appItem.minutes) detail += `${appItem.minutes}分 `;
                }
                if (appItem.reason) detail += appItem.reason;
                if (!detail) detail = appItem.detail || appItem.note || '';
            }

            // 有給残日数表示（Appデータがある場合）
            if (type && type.includes('有給')) {
                const balance = paidLeaveBalances[name];
                if (balance !== undefined) {
                    detail += ` <span style="color:#d6336c; font-weight:bold;">(残:${balance}日)</span>`;
                }
            }

            return `<tr>
                                <td>${shortDate}</td>
                                <td>${name}</td>
                                <td>${type}</td>
                                <td style="font-size:0.9em; color:#666;">${detail}</td>
                                <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
                            </tr>`;
        }).join('')}
                    </tbody>
                </table>
            </div>`;
        container.appendChild(card);
    };

    createSection('⚠️ アプリ未報告 (CBOのみ存在)', results.missingInApp, 'error', 'badge-missing-app', '未報告');
    createSection('⚠️ CBO未反映 (アプリのみ存在)', results.missingInCSV, 'warning', 'badge-missing-csv', '未反映');
    createSection('🕒 時間ずれ (要確認)', results.timeMismatches, 'warning', 'badge-missing-csv', '時間ずれ');
    createSection('✅ 照合OK', results.matches, 'success', 'badge-match', 'OK');

    if (results.missingInApp.length === 0 && results.missingInCSV.length === 0 && results.matches.length === 0 && results.timeMismatches.length === 0) {
        container.innerHTML += '<div style="padding:20px; text-align:center; color:#666;">この月の照合対象データはありません</div>';
    }
}

function updateLastSavedUI(isoDate, statusText = '') {
    const date = new Date(isoDate);
    const dateStr = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

    let statusEl = document.getElementById('lastSavedStatus');
    if (!statusEl) {
        const uploadArea = document.getElementById('uploadArea');
        statusEl = document.createElement('div');
        statusEl.id = 'lastSavedStatus';
        statusEl.style.marginTop = '10px';
        statusEl.style.fontSize = '12px';
        statusEl.style.color = '#666';
        uploadArea.appendChild(statusEl);

        const clearBtn = document.createElement('a');
        clearBtn.href = '#';
        clearBtn.textContent = '【保存データをクリア】';
        clearBtn.style.marginLeft = '10px';
        clearBtn.style.color = '#d6336c';
        clearBtn.style.cursor = 'pointer';
        clearBtn.style.textDecoration = 'underline';
        clearBtn.onclick = (e) => {
            e.preventDefault();
            if (confirm('保存された照合用データを削除しますか？')) {
                localStorage.removeItem(CBO_CACHE_KEY);
                statusEl.remove();
                currentCboData = [];
                currentFileCount = 0;
                refreshView();
            }
        };
        statusEl.appendChild(clearBtn);
    }

    const statusMsg = statusText ? ` <span style="margin-left:5px; color:#1971c2;">(${statusText})</span>` : '';
    statusEl.childNodes[0].nodeValue = `最終保存: ${dateStr}${statusMsg} `;
}

// ファイル読み込み処理は変更なし
function readFile(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsArrayBuffer(file);

        reader.onload = (e) => {
            try {
                const buffer = e.target.result;
                let decoder = new TextDecoder('shift-jis');
                let csvContent = decoder.decode(buffer);

                if (!csvContent.includes('日付') && !csvContent.includes('報告者')) {
                    decoder = new TextDecoder('utf-8');
                    const utf8Content = decoder.decode(buffer);
                    if (utf8Content.includes('日付')) {
                        csvContent = utf8Content;
                    }
                }

                const parseResult = parseCBOCSV(csvContent);
                if (parseResult.error) {
                    resolve({ fileName: file.name, error: parseResult.error, records: [] });
                } else {
                    resolve({ fileName: file.name, error: null, records: parseResult.records });
                }
            } catch (err) {
                resolve({ fileName: file.name, error: err.message, records: [] });
            }
        };
        reader.onerror = () => resolve({ fileName: file.name, error: '読み込み失敗', records: [] });
    });
}

function parseCBOCSV(content) {
    // 既存のパースロジック（そのままコピー）
    const lines = content.split(/\r\n|\n/).map(line => line.trim()).filter(line => line);
    if (lines.length === 0) return { error: 'ファイルが空です', records: [] };

    let headerLineIndex = -1;
    let headers = [];
    const dateKw = '日付';
    const nameKw = '報告者';

    for (let i = 0; i < Math.min(lines.length, 10); i++) {
        const row = lines[i].split(',').map(h => h.replace(/"/g, '').trim());
        if (row.includes(dateKw) && row.includes(nameKw)) {
            headerLineIndex = i;
            headers = row;
            break;
        }
    }

    if (headerLineIndex === -1) {
        return { error: 'ヘッダー「日付」「報告者」が見つかりません' };
    }

    const idx = {
        date: headers.indexOf('日付'),
        name: headers.indexOf('報告者'),
        late: headers.findIndex(h => h.includes('遅刻')),
        early: headers.findIndex(h => h.includes('早退')),
        break: headers.findIndex(h => h.includes('中抜け')),
        paid: headers.findIndex(h => h === '有給' || h.includes('有給')),
        comp: headers.findIndex(h => h === '代休' || h.includes('代休'))
    };

    const records = [];

    lines.slice(headerLineIndex + 1).forEach(line => {
        const values = line.split(',').map(v => v.replace(/"/g, '').trim());
        if (values.length <= idx.name) return;

        let dateStr = values[idx.date];
        const dateObj = new Date(dateStr);
        if (isNaN(dateObj.getTime())) return;
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        const formattedDate = `${y}-${m}-${d}`;

        const rawName = values[idx.name];
        const normalizedName = normalizeName(rawName);

        if (idx.paid >= 0 && values[idx.paid] && values[idx.paid] !== '-' && values[idx.paid] !== '0') {
            const val = parseFloat(values[idx.paid]);
            records.push({ date: formattedDate, userName: normalizedName, type: '有給', detail: values[idx.paid], amount: isNaN(val) ? 1 : val });
        }
        if (idx.comp >= 0 && values[idx.comp] && values[idx.comp] !== '-' && values[idx.comp] !== '0') {
            const val = parseFloat(values[idx.comp]);
            records.push({ date: formattedDate, userName: normalizedName, type: '代休', detail: values[idx.comp], amount: isNaN(val) ? 1 : val });
        }
        if (idx.late >= 0 && values[idx.late] && values[idx.late] !== '-') {
            const val = parseFloat(values[idx.late]);
            if (val > 0) records.push({ date: formattedDate, userName: normalizedName, type: '遅刻', detail: values[idx.late] + 'h', amount: val * 60 });
        }
        if (idx.early >= 0 && values[idx.early] && values[idx.early] !== '-') {
            const val = parseFloat(values[idx.early]);
            if (val > 0) records.push({ date: formattedDate, userName: normalizedName, type: '早退', detail: values[idx.early] + 'h', amount: val * 60 });
        }
        if (idx.break >= 0 && values[idx.break] && values[idx.break] !== '-') {
            const val = parseFloat(values[idx.break]);
            if (val > 0) records.push({ date: formattedDate, userName: normalizedName, type: '中抜け', detail: values[idx.break] + 'h', amount: val * 60 });
        }
    });

    return { records: records };
}
