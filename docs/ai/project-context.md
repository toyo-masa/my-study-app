# Project Context

## プロジェクト概要
my-study-app は、問題集・統合セット・学習履歴・復習管理を扱う学習アプリである。  
主な利用目的は、PC / スマートフォンから問題演習・暗記・復習を継続しやすくすること。

## 基本方針
- 既存ユーザーのデータ互換性を壊さない
- UI は日本語中心で、既存画面のトーンに合わせる
- 単純な新規実装より、既存部品の再利用を優先する
- クラウド同期とローカル利用の両方を意識する
- 日付・復習ロジックはローカル日付基準を守る

## 技術スタック
- Frontend: React + TypeScript + Vite
- Backend: Vercel Functions (`api/`)
- DB: Neon PostgreSQL
- Local Storage: Dexie / IndexedDB
- Routing: React Router
- Markdown / Math: react-markdown, remark-math, rehype-katex
- Animation/UI: framer-motion, lucide-react

## 主な責務
- `src/db.ts`
  - データアクセスのFacade
  - クラウド/ローカル切替の中心
- `src/cloudApi.ts`
  - `/api/*` 呼び出しの窓口
- `api/*.ts`
  - サーバーAPI
  - 認証・所有権チェック・DBアクセス
- `src/types/index.ts`
  - 共有型定義

## 実装で特に注意するポイント
- Cloud Sync 判定は既存設計に合わせる
- API では認証と所有権チェックを必須とする
- 500系レスポンスで内部例外の詳細を返さない
- `nextDue` は `YYYY-MM-DD` のローカル日付基準で扱う
- `toISOString().slice(0, 10)` を日付計算に使わない
- 問題集未発見表示や学習画面の共通UIは既存共通部品を優先する

## 品質確認の基本
- 変更後は最低限:
  - `npx eslint <変更ファイル...>`
  - `npm run build`
- 大きい変更では必要に応じて:
  - `npm run lint`

## リリース運用
ユーザー影響がある変更では、最終報告前に以下を実施する。
- `package.json` の version 更新
- `src/pages/ReleaseNotesRoute.tsx` への追記