// ==================== //
// CSV照合ロジック (複数ファイル対応版 + 永続化 + GAS同期)
// ==================== //

const CBO_CACHE_KEY = 'work-assistant-cbo-cache';

document.addEventListener('DOMContentLoaded', () => {
    const uploadArea = document.getElementById('uploadArea');
    const csvInput = document.getElementById('csvInput');

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

        // データを保存（サーバー同期）
        await saveCBOData(allCboData, totalFilesRead);

        const appData = getAppData();
        const comparison = compareData(allCboData, appData);

        // エラーがあった場合はそれも表示しつつ、成功した分の結果を表示
        renderResults(comparison, allCboData.length, totalFilesRead, errorMessages);

        loadingEl.style.display = 'block';
        resultsEl.style.display = 'block';

    } catch (error) {
        console.error(error);
        alert('予期せぬエラーが発生しました: ' + error.message);
        loadingEl.style.display = 'none';
    }
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
        const success = await saveCBODataToGAS(data, fileCount);
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

    // まずローカルデータを表示
    if (localCache && localCache.data) {
        updateLastSavedUI(localCache.timestamp, 'サーバー確認中...');
        runComparison(localCache.data, localCache.fileCount);
    }

    // サーバーから最新を取得
    const serverData = await fetchCBODataFromGAS();

    // サーバーデータがあり、かつローカルより新しい(またはローカルがない)場合
    if (serverData) {
        // 日付形式を正規化 (GASからDate型として返ってきてISO文字列になっている場合があるため)
        serverData.data = serverData.data.map(item => ({
            ...item,
            date: normalizeDateStr(item.date)
        }));

        const serverTime = new Date(serverData.timestamp).getTime();
        const localTime = localCache ? new Date(localCache.timestamp).getTime() : 0;

        if (serverTime > localTime) {
            // サーバーの方が新しいので更新
            console.log('サーバーから新しいデータを取得しました');
            localStorage.setItem(CBO_CACHE_KEY, JSON.stringify(serverData));
            updateLastSavedUI(serverData.timestamp, 'サーバー同期完了(最新)');
            runComparison(serverData.data, serverData.fileCount);
        } else if (localCache) {
            updateLastSavedUI(localCache.timestamp, 'サーバー同期完了');
        }
    } else {
        if (localCache) updateLastSavedUI(localCache.timestamp, 'サーバー通信エラー');
    }
}

// 日付文字列を正規化 (YYYY-MM-DD形式に統一)
function normalizeDateStr(dateStr) {
    if (!dateStr) return '';
    // すでにYYYY-MM-DD形式ならそのまま (正規表現で簡易チェック)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

    // ISO文字列などをDateオブジェクトにしてから変換
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;

    // ※注意: 単純に getISOString().split('T')[0] だとUTC基準になり、日本時間の深夜が前日になる可能性がある
    // ここではブラウザのローカルタイム(JST想定)でYYYY-MM-DDを作る
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
}

function runComparison(cboData, fileCount) {
    const appData = getAppData();
    const comparison = compareData(cboData, appData);
    renderResults(comparison, cboData.length, fileCount || 1, []);
    document.getElementById('results').style.display = 'block';
}

// 最終更新日時の表示更新
function updateLastSavedUI(isoDate, statusText = '') {
    const date = new Date(isoDate);
    const dateStr = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

    // 既存の表示があれば更新、なければ追加
    let statusEl = document.getElementById('lastSavedStatus');
    if (!statusEl) {
        const uploadArea = document.getElementById('uploadArea');
        statusEl = document.createElement('div');
        statusEl.id = 'lastSavedStatus';
        statusEl.style.marginTop = '10px';
        statusEl.style.fontSize = '12px';
        statusEl.style.color = '#666';
        uploadArea.appendChild(statusEl);

        // クリアボタンも追加
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
                document.getElementById('results').innerHTML = '';
            }
        };
        statusEl.appendChild(clearBtn);
    }

    const statusMsg = statusText ? ` <span style="margin-left:5px; color:#1971c2;">(${statusText})</span>` : '';
    statusEl.childNodes[0].nodeValue = `最終保存: ${dateStr}${statusMsg} `;
}

// ファイル単体の読み込みとパース
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

// CBOのCSVパース
function parseCBOCSV(content) {
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

        // 有給チェック (ハイフンや0は無視)
        if (idx.paid >= 0 && values[idx.paid] && values[idx.paid] !== '-' && values[idx.paid] !== '0') {
            records.push({ date: formattedDate, userName: normalizedName, type: '有給', detail: values[idx.paid] });
        }
        // 代休チェック (ハイフンや0は無視)
        if (idx.comp >= 0 && values[idx.comp] && values[idx.comp] !== '-' && values[idx.comp] !== '0') {
            records.push({ date: formattedDate, userName: normalizedName, type: '代休', detail: values[idx.comp] });
        }
        // 遅刻チェック (数値が入っていれば)
        if (idx.late >= 0 && values[idx.late] && values[idx.late] !== '-') {
            const val = parseFloat(values[idx.late]);
            if (val > 0) {
                records.push({ date: formattedDate, userName: normalizedName, type: '遅刻', detail: values[idx.late] + 'h' });
            }
        }
        // 早退チェック
        if (idx.early >= 0 && values[idx.early] && values[idx.early] !== '-') {
            const val = parseFloat(values[idx.early]);
            if (val > 0) {
                records.push({ date: formattedDate, userName: normalizedName, type: '早退', detail: values[idx.early] + 'h' });
            }
        }
        // 中抜けチェック
        if (idx.break >= 0 && values[idx.break] && values[idx.break] !== '-') {
            const val = parseFloat(values[idx.break]);
            if (val > 0) {
                records.push({ date: formattedDate, userName: normalizedName, type: '中抜け', detail: values[idx.break] + 'h' });
            }
        }
    });

    return { records: records };
}

function getAppData() {
    const attendance = getData(STORAGE_KEYS.ATTENDANCE);
    const lateEarly = attendance.filter(d => ['遅刻', '早退', '中抜け'].includes(d.type) || d.category === '遅刻早退');
    const paidLeave = attendance.filter(d => d.type === '有給' || d.category === '有給申請');
    const compLeave = attendance.filter(d => d.type === '代休' || d.category === '代休申請');

    return [...lateEarly, ...paidLeave, ...compLeave].map(d => ({
        ...d,
        userName: normalizeName(d.userName),
    }));
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
        matches: []
    };

    cboData.forEach(cRecord => {
        const match = appData.find(aRecord =>
            aRecord.date === cRecord.date &&
            aRecord.userName === cRecord.userName &&
            (aRecord.type.includes(cRecord.type) || cRecord.type.includes(aRecord.type))
        );

        if (match) {
            results.matches.push({ cbo: cRecord, app: match });
        } else {
            results.missingInApp.push(cRecord);
        }
    });

    appData.forEach(aRecord => {
        const alreadyMatched = results.matches.some(m => m.app.id === aRecord.id);
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
    infoCard.innerHTML = `📊 <strong>${fileCount}</strong> ファイルから <strong>${count}</strong> 件の対象レコードを抽出しました。`;
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
            const date = item.date || item.cbo?.date || item.app?.date;
            const name = item.userName || item.cbo?.userName || item.app?.userName;
            const type = item.type || (item.cbo ? item.cbo.type : item.app.type);
            let detail = '';
            if (item.cbo) detail += `CSV: ${item.cbo.detail} `;
            if (item.app) detail += `App: ${item.app.reason || ''} ${item.app.minutes ? item.app.minutes + '分' : ''}`;
            if (!item.cbo && !item.app) detail = item.detail || item.reason || '';

            return `<tr>
                                <td>${date}</td>
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
    createSection('✅ 照合OK', results.matches, 'success', 'badge-match', 'OK');

    if (results.missingInApp.length === 0 && results.missingInCSV.length === 0 && results.matches.length === 0) {
        container.innerHTML += '<div style="padding:20px; text-align:center;">照合対象データなし</div>';
    }
}
