# Decision Log

## 2026-04-04
### Codex運用を AGENTS.md 中心で整理
- Claude Code 風の複雑な command / skill 体系はそのまま持ち込まない
- このリポジトリでは `AGENTS.md` を中心に運用ルールを明文化する
- 補助情報は `docs/ai/*` に置き、Codex が参照しやすい構成にする

### 理由
- この repo にはすでに実務ルールが `AGENTS.md` に集約されている
- 既存ルールを壊さず拡張しやすい
- Codex での実運用では、派手な command 群よりも手順と責務の明文化の方が安定しやすい

### 期待効果
- 実装前の確認漏れを減らす
- Cloud/Local や API 認可周りの事故を減らす
- 変更後の verify と release note 更新を習慣化できる