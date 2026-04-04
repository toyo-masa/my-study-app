# src/AGENTS.md

この配下では、フロントエンド実装時に以下を優先する。

## 1. 基本方針
- まず既存 component / hook / util の再利用を検討する
- 画面単位で大きく作り直す前に、既存フローへの差分追加で済まないか確認する
- UI文言は既存トーン（日本語中心）に合わせる
- props や state を必要以上に広げない

## 2. 優先して確認すべき既存部品
- `src/components/NotFoundView.tsx`
- `src/components/QuizSessionLayout.tsx`
- `src/hooks/useActiveQuizSetFromRoute.ts`
- `src/db.ts`
- `src/cloudApi.ts`
- `src/types/index.ts`

## 3. 実装ルール
- ルートの `:id` 依存の問題は既存 hook の利用を先に検討する
- 共通レイアウトがある画面は、新規レイアウトを増やす前に既存共通化を確認する
- 既存スタイルとの整合を崩す独自実装を避ける
- 一時的な UI デバッグ表示を残さない

## 4. 状態管理・データ取得
- データアクセスは既存のFacadeや API 呼び出し経由を優先する
- 画面側で API 実装詳細を持ちすぎない
- クラウド/ローカル切替に関わるときは `src/db.ts` の責務を優先する

## 5. 動作確認
- 変更箇所に関係する画面表示
- ボタン押下後の遷移
- 読み込み中 / 空状態 / エラー時
- 既存画面との回帰影響