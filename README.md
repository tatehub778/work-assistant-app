# 現場業務アシスタントアプリ

家具メーカーの現場社員向け業務効率化アプリです。

## 主な機能

### 勤怠管理
- 遅刻/早退申告
- 有給申請
- 代休申請
- LINEグループへの自動投稿機能

### 作業関連
- 作業報告（iPad対応）
- 夜勤申請シート（iPad対応）
- 夜勤メンバー指示

### データ管理
- 今月の履歴確認
- CSV出力（CBO用）

## 使い方

### ローカルで実行

1. このディレクトリで以下のコマンドを実行：
```powershell
npx -y http-server -p 8080 -c-1
```
**注**: `-c-1` はキャッシュを無効にします（開発時推奨）

2. ブラウザで http://localhost:8080 を開く

### スマートフォンで使用

1. 上記のローカルサーバーを起動
2. 同じWi-Fiネットワークに接続されたスマートフォンでIPアドレスにアクセス
   - PowerShellで `ipconfig` を実行してIPアドレスを確認
   - 例: http://192.168.1.100:3000

### PWAとしてインストール

- iPhone Safari: 共有ボタン → ホーム画面に追加
- Android Chrome: メニュー → ホーム画面に追加

## 技術スタック

- **フロントエンド**: HTML5, CSS3, Vanilla JavaScript
- **データ保存**: LocalStorage
- **PWA対応**: Service Worker, Manifest.json

## ファイル構成

```
work-assistant-app/
├── index.html              # ホーム画面
├── manifest.json           # PWA設定
├── service-worker.js       # オフライン対応
├── css/
│   └── style.css          # スタイル
├── js/
│   ├── app.js             # メインロジック
│   ├── storage.js         # データ管理
│   └── utils.js           # ユーティリティ
├── pages/
│   ├── late-early.html    # 遅刻/早退
│   ├── paid-leave.html    # 有給申請
│   ├── compensatory-leave.html  # 代休申請
│   ├── work-report.html   # 作業報告
│   ├── night-shift.html   # 夜勤申請
│   ├── team-instruction.html  # メンバー指示
│   ├── history.html       # 履歴
│   └── export.html        # CSV出力
└── icons/
    ├── icon-192.svg       # アプリアイコン
    └── icon-512.svg       # アプリアイコン
```

## 注意事項

- クリップボードAPI（コピー機能）はHTTPS環境で動作します
- ローカルホスト（localhost）では動作します
- LINEアプリの起動は端末によって動作が異なります

## 今後の拡張案

- クラウド同期機能
- ユーザー認証
- カメラ連携
- プッシュ通知
