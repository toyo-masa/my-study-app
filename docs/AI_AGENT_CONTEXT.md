# AI Agent向けコンテキスト - QAアプリ

最終更新: 2026-02-22 (JST)

この文書は、現時点のリポジトリ実装から確認できた事実のみを記載しています。

## 1) プロジェクト概要

- `package.json` のプロジェクト名は `qa`。
- フロントエンドは React + TypeScript + Vite。
- バックエンドは Vercel Functions（`api/` 配下）。
- DBドライバは `@neondatabase/serverless`（Neon上のPostgreSQL接続）。
- 本スレッド上の所有者情報として、「個人用の問題集アプリで、Vercelデプロイ、データはNeon格納」と明示済み。

主な参照ファイル:
- `package.json`
- `src/main.tsx`
- `vercel.json`
- `api/*.ts`

## 2) 実行アーキテクチャ

### 2.1 フロントエンド構成

- ルート描画は `BrowserRouter` + `AppProvider` + `App`。
- Vercel Analytics / Speed Insights を `main.tsx` で読み込み。
- 主要ルート:
  - `/`
  - `/distribution-sim`
  - `/quiz/:id`
  - `/quiz/:id/manage`
  - `/quiz/:id/study`
  - `/quiz/:id/memorization`

参照ファイル:
- `src/main.tsx`
- `src/App.tsx`

### 2.2 Vercelルーティング

- `vercel.json` の rewrite:
  - `/api/(.*)` -> `/api/$1`
  - `/distribution-sim` -> `/index.html`
  - `/quiz/(.*)` -> `/index.html`
- これにより SPA の深いURLアクセスを維持。

参照ファイル:
- `vercel.json`

### 2.3 データアクセスモード

- データ層は2モード:
  - ローカル: Dexie + IndexedDB
  - クラウド: `/api/*` 経由
- 切替条件: `localStorage["useCloudSync"] === "true"`
- `src/db.ts` の主要関数は上記フラグで分岐。

参照ファイル:
- `src/db.ts`
- `src/cloudApi.ts`

## 3) 認証・セッション

- セッションCookie名: `auth_session`
- Cookie属性:
  - `httpOnly: true`
  - `sameSite: strict`
  - `path: /`
  - `secure: process.env.NODE_ENV === 'production'`
- ログイン時に `sessions` テーブルへトークンを保存。
- 新規登録時はユーザー作成後、自動ログイン用セッションを作成。
- ログアウト時はセッション削除 + Cookie失効。
- API側はCookieからトークンを取得し、`sessions.expires_at > NOW()` の条件で `user_id` を解決。

参照ファイル:
- `api/login.ts`
- `api/register.ts`
- `api/logout.ts`
- `api/_auth.ts`
- `api/me.ts`

## 4) サーバー側DBスキーマ

スキーマ初期化エンドポイント: `/api/init`（GET/POST）

作成対象テーブル:
- `users`
- `sessions`
- `quiz_sets`
- `questions`
- `histories`
- `review_schedules`
- `review_logs`

主な列:
- `quiz_sets`: `type`, `is_deleted`, `is_archived`, `tags(jsonb)`, `user_id`
- `questions`: `options(jsonb)`, `correct_answers(jsonb)`
- `histories`: 回答/メモ/自信度などのjsonb列、`memorization_detail(jsonb)`, `user_id`
- `review_schedules`: 復習間隔・次回日付・`user_id`
- `review_logs`: 正誤/自信度/間隔/次回日付/メモ/セッション情報・`user_id`

参照ファイル:
- `api/init.ts`

## 5) フロントの型・ローカル永続化

型定義の要点:
- `QuizSetType`: `"quiz" | "memorization"`
- `ConfidenceLevel`: `"low" | "high"`
- `HistoryMode`: `"normal" | "review_wrong" | "review_weak" | "review_weak_strict"`

Dexie DB:
- DB名: `StudyAppDB`
- テーブル:
  - `quizSets`
  - `questions`
  - `histories`
  - `reviewSchedules`
  - `reviewLogs`

利用しているLocalStorageキー:
- `useCloudSync`
- `theme`
- `accentColor`
- `suspendedSession_<quizSetId>`
- `quizSetSettings_<quizSetId>`

参照ファイル:
- `src/types/index.ts`
- `src/db.ts`
- `src/utils/quizSettings.ts`
- `src/App.tsx`

## 6) 実装済み機能

### 6.1 問題集/暗記カード一覧管理

- 問題集・暗記カードの作成:
  - 空セット作成
  - CSVインポート作成
- アクティブ / ゴミ箱 / アーカイブの3状態管理。
- 論理削除・復元・完全削除・アーカイブ・アーカイブ解除。
- タグによるフィルタ表示。
- CSV仕様とAI向け変換指示をコピーできるヘルプUIあり。

参照ファイル:
- `src/pages/HomeRoute.tsx`
- `src/components/HomePage.tsx`
- `src/components/HelpModal.tsx`

### 6.2 問題管理（セット単位）

- 問題の追加/編集/削除
- CSVファイル取り込み
- CSVテキスト貼り付け取り込み
- セット名変更
- タグ追加/削除
- 管理画面内カテゴリフィルタ
- 問題文/解説は Markdown + KaTeX 表示対応

参照ファイル:
- `src/components/QuestionManager.tsx`
- `src/components/MarkdownText.tsx`
- `src/utils/csvParser.ts`

### 6.3 学習モード（選択式）

- 詳細画面から開始。
- 中断セッションの再開（localStorage）対応。
- 問題ごとのメモ・自信度・見直し運用あり。
- 完了時に `histories` へ記録。
- 完了時に間隔反復スケジュールを一括更新。
- 復習再テスト:
  - 不正解のみ
  - 不正解 + 自信なし

参照ファイル:
- `src/pages/QuizDetailRoute.tsx`
- `src/pages/StudyRoute.tsx`
- `src/components/QuestionView.tsx`
- `src/components/TestResult.tsx`

### 6.4 暗記モード

- 暗記カード用フローを別実装。
- 各カードを「覚えた/覚えていない」で自己判定。
- 結果は `histories.memorizationDetail` に保存。
- 中断/再開対応あり。

参照ファイル:
- `src/pages/MemorizationRoute.tsx`
- `src/components/MemorizationView.tsx`

### 6.5 追加ユーティリティアプリ

- ホームにアプリランチャーあり。
- 現在のランチャー対象は分布シミュレーション1件。
- ルートは `/distribution-sim`。

参照ファイル:
- `src/components/AppLauncher.tsx`
- `src/pages/DistributionRoute.tsx`
- `src/components/DistributionSimulator.tsx`

## 7) 間隔反復ロジック

次回間隔:
- 不正解: `1日`
- 正解 + 自信なし: `max(1, round(currentInterval * 1.3))`
- 正解 + 確信: `max(3, round(currentInterval * 2.5))`

日付形式:
- `YYYY-MM-DD`

参照ファイル:
- `src/utils/spacedRepetition.ts`

## 8) API一覧（現実装）

認証:
- `POST /api/login`
- `POST /api/register`
- `POST /api/logout`
- `GET /api/me`

初期化:
- `GET|POST /api/init`

問題集/問題:
- `GET|POST|PUT|DELETE /api/quizSets`
- `GET|POST|PUT|DELETE /api/questions`
- `POST /api/questionsBulk`

履歴/復習:
- `GET|POST /api/histories`
- `GET|POST|PUT|DELETE /api/reviewSchedules`
- `POST /api/reviewSchedulesBulk`
- `GET|POST|DELETE /api/reviewLogs`

認証適用範囲:
- login/register/init を除くデータ系APIは、実装上セッションCookie前提。

参照ファイル:
- `api/quizSets.ts`
- `api/questions.ts`
- `api/questionsBulk.ts`
- `api/histories.ts`
- `api/reviewSchedules.ts`
- `api/reviewSchedulesBulk.ts`
- `api/reviewLogs.ts`

## 9) 初期起動時挙動

- 起動時:
  - Cloud Sync有効なら `/api/me` でユーザー確認
  - 問題集一覧読み込み
  - 問題集が0件なら `public/sample_questions.csv` を読み込み、`sample_questions` 名で初期投入

参照ファイル:
- `src/contexts/AppContext.tsx`
- `public/sample_questions.csv`

## 10) 開発設定

- `npm scripts`:
  - `dev`
  - `build`
  - `lint`
  - `preview`
- Vite開発時は `/api` を `http://127.0.0.1:3001` にプロキシ（`VITE_API_PROXY_TARGET` で上書き可能）。
- APIはDB接続文字列として `DATABASE_URL` または `POSTGRES_URL` を参照。
- `package.json` 上、テスト実行用スクリプトは未定義。

参照ファイル:
- `package.json`
- `vite.config.ts`
- `api/*.ts`

## 11) 現在のリポジトリ補足

- `README.md` はViteテンプレート内容のままで、現アプリ仕様の説明には未更新。
- `ReviewDashboard` / `ReviewSession` はコンポーネント実装は存在するが、現行ルーティング経路では使用されていない。

参照ファイル:
- `README.md`
- `src/components/ReviewDashboard.tsx`
- `src/components/ReviewSession.tsx`
- `src/App.tsx`
