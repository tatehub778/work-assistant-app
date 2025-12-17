// ==================== //
// 自動ログインチェック
// ==================== //
function checkAutoLogin() {
    // index.htmlページでのみチェック（他のページでは不要）
    const isIndexPage = window.location.pathname.endsWith('index.html') ||
        window.location.pathname.endsWith('/') ||
        window.location.pathname === '/work-assistant-app/' ||
        !window.location.pathname.includes('pages/');

    if (isIndexPage) {
        const currentUser = localStorage.getItem('current_user');
        if (!currentUser) {
            // ユーザー未選択の場合、ユーザー選択ページへリダイレクト
            window.location.href = 'pages/user-select.html';
        }
    }
}

// ==================== //
// 日付表示の更新
// ==================== //
function updateCurrentDate() {
    const dateElement = document.getElementById('currentDate');
    if (dateElement) {
        const today = new Date();
        const options = {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
        };
        dateElement.textContent = `今日：${today.toLocaleDateString('ja-JP', options)}`;
    }
}

// ==================== //
// 現在のユーザー表示
// ==================== //
function updateCurrentUser() {
    const currentUser = localStorage.getItem('current_user');
    const userDisplay = document.getElementById('currentUserDisplay');
    const userNameSpan = document.getElementById('currentUserName');

    if (currentUser && userDisplay && userNameSpan) {
        userNameSpan.textContent = currentUser;
        userDisplay.style.display = 'block';
    } else if (userDisplay) {
        // ユーザー設定がない場合も表示しないか、あるいは「ユーザー設定なし」と表示するか
        // 今回の要望では「都度選択」なので、ヘッダーの表示は控えめにするか、非表示で良い
        userDisplay.style.display = 'none';
    }
}

// ページ読み込み時に実行
document.addEventListener('DOMContentLoaded', () => {
    // checkAutoLogin(); // 自動ログインチェックを無効化
    updateCurrentDate();
    updateCurrentUser();
});

// ==================== //
// PWA インストール
// ==================== //
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('Service Worker registered successfully:', registration.scope);
            })
            .catch(error => {
                console.log('Service Worker registration failed:', error);
            });
    });
}

// 同期ボタン
document.addEventListener('DOMContentLoaded', () => {
    const syncBtn = document.getElementById('syncBtn');
    if (syncBtn) {
        syncBtn.addEventListener('click', async () => {
            if (!confirm('サーバーから最新データを取得しますか？')) return;

            syncBtn.textContent = '🔄 通信中...';
            syncBtn.disabled = true;

            // storage.jsのsyncDataを呼び出す（グローバルスコープにある前提）
            if (typeof syncData === 'function') {
                const result = await syncData();
                if (result.success) {
                    alert(`✅ 同期完了 (${result.count}件)`);
                    location.reload();
                } else {
                    alert(`❌ 同期失敗: ${result.error}`);
                }
            } else {
                alert('同期機能が読み込まれていません');
            }

            syncBtn.textContent = '🔄 同期';
            syncBtn.disabled = false;
        });
    }
});
