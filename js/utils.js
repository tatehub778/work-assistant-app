// ==================== //
// ユーティリティ関数
// ==================== //

// LINEにコピーする関数
function copyToLineAndOpen(text) {
    // クリップボードにコピー
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text)
            .then(() => {
                showCopySuccess();
                // LINEアプリを開く（モバイルの場合）
                setTimeout(() => {
                    window.location.href = `line://msg/text/${encodeURIComponent(text)}`;
                }, 500);
            })
            .catch(err => {
                // フォールバック：テキストエリアを使用
                fallbackCopyToClipboard(text);
            });
    } else {
        fallbackCopyToClipboard(text);
    }
}

// フォールバック：クリップボードコピー
function fallbackCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();

    try {
        document.execCommand('copy');
        showCopySuccess();
        setTimeout(() => {
            window.location.href = `line://msg/text/${encodeURIComponent(text)}`;
        }, 500);
    } catch (err) {
        alert('コピーに失敗しました。手動でコピーしてください。\n\n' + text);
    }

    document.body.removeChild(textArea);
}

// コピー成功の表示
function showCopySuccess() {
    const successDiv = document.createElement('div');
    successDiv.className = 'copy-success';
    successDiv.textContent = '✅ LINEに投稿する文章をコピーしました';
    document.body.appendChild(successDiv);

    setTimeout(() => {
        successDiv.remove();
    }, 2000);
}

// 日付をフォーマット
function formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
}

// 今日の日付を取得（YYYY-MM-DD形式）
function getTodayString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// CSVに変換
function convertToCSV(data, headers) {
    const csvRows = [];

    // ヘッダー行
    csvRows.push(headers.join(','));

    // データ行
    data.forEach(row => {
        const values = headers.map(header => {
            const value = row[header] || '';
            // カンマやダブルクォートを含む場合はエスケープ
            return `"${String(value).replace(/"/g, '""')}"`;
        });
        csvRows.push(values.join(','));
    });

    return csvRows.join('\n');
}

// CSVダウンロード
function downloadCSV(csvContent, filename) {
    // BOM付きUTF-8で保存（Excelで文字化けしないように）
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();

    // メモリ解放
    URL.revokeObjectURL(link.href);
}
