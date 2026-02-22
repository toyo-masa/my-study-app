import React from 'react';
import { ArrowLeft, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type ReleaseNote = {
    version: string;
    date: string;
    improvements: string[];
    fixes: string[];
};

const releaseNotes: ReleaseNote[] = [
    {
        version: '1.6.3',
        date: '2026年2月22日',
        improvements: [
            '中断データ保存のタイミングを調整し、学習画面から戻る操作時の再開判定を安定化しました。',
        ],
        fixes: [
            '回答途中で戻った直後に「中断から再開」が表示されない問題を修正しました。',
        ],
    },
    {
        version: '1.6.2',
        date: '2026年2月22日',
        improvements: [
            'デプロイ環境のルーティング設定を見直し、リリースノートページを直接URLで開けるようにしました。',
        ],
        fixes: [
            'Vercel上で `/release-notes` を直接開くと404になる問題を修正しました。',
        ],
    },
    {
        version: '1.6.1',
        date: '2026年2月22日',
        improvements: [
            '認証関連APIの構成を見直し、Vercel Hobbyプランの関数上限内で安定してデプロイできるようにしました。',
        ],
        fixes: [
            'Vercelビルド時に発生していた reviewLogs/reviewSchedules の型エラーを修正しました。',
            'Serverless Functions 数が上限を超えてデプロイできない問題を修正しました。',
        ],
    },
    {
        version: '1.6.0',
        date: '2026年2月22日',
        improvements: [
            '学習/暗記の中断データをクラウドに保存し、同じアカウントならスマホ・PCどちらからでも再開できるようになりました。',
            '問題集詳細画面で、クラウド上の中断セッションも「再開」対象として判定できるようにしました。',
        ],
        fixes: [
            '端末を切り替えると中断した続きが再開できない不具合を修正しました。',
            '中断セッション保存の安全性を見直し、アカウント外データへの誤操作を防止しました。',
        ],
    },
    {
        version: '1.5.0',
        date: '2026年2月22日',
        improvements: [
            'アプリ内で「現在のバージョン」と「リリースノート」を確認できるようになりました。',
            '学習ルート/暗記ルートの画面構成を共通化し、画面遷移時の表示の安定性を高めました。',
            'APIの型定義を整理し、保守性と安全性を向上させました。',
        ],
        fixes: [
            '学習完了時に復習間隔が初期値に戻ってしまう問題を修正しました。',
            '復習日の計算がタイムゾーン影響でずれる問題を修正しました。',
            '日本語入力（IME）確定時に意図せずタグ追加が走る問題を修正しました。',
            'ローディング画面でテーマ反映が不安定になる問題を修正しました。',
        ],
    },
    {
        version: '1.4.0',
        date: '2026年2月22日',
        improvements: [
            '復習ログ・復習スケジュール取得を最適化し、表示速度を改善しました。',
            '問題管理画面にカテゴリフィルタを追加し、大量問題でも探しやすくしました。',
            '問題インポートや管理操作でローディング表示・通知・楽観更新を強化しました。',
        ],
        fixes: [
            '未回答の問題が不正解として集計される不具合を修正しました。',
            'セッション中断後の再開時に経過時間が正しく引き継がれない不具合を修正しました。',
            '問題一覧の並び順が不安定になる不具合を修正し、作成順で安定表示するようにしました。',
        ],
    },
    {
        version: '1.3.0',
        date: '2026年2月22日',
        improvements: [
            'タグ管理、アーカイブ、ゴミ箱（復元/完全削除）を追加し、問題集の整理がしやすくなりました。',
            '学習中の「見直しマーク」機能を追加し、復習対象を明確にできるようになりました。',
            'Vercelリライトルールを整理し、深いURLからの表示安定性を改善しました。',
        ],
        fixes: [
            'タグ追加後に入力欄のクリアが遅れる不具合を修正しました。',
            '学習開始時に前回セッション状態が混在しやすい問題を修正し、新規開始の挙動を安定化しました。',
            '管理画面周辺の軽微な表示・操作不整合を修正しました。',
        ],
    },
    {
        version: '1.2.0',
        date: '2026年2月21日',
        improvements: [
            'クラウド同期（Vercel + Neon）に対応し、ログインで学習データを端末間共有できるようになりました。',
            'ログイン/登録/ログアウトを含むアカウント機能を追加しました。',
            '問題一括追加・復習スケジュール一括更新APIを追加し、処理性能を改善しました。',
        ],
        fixes: [
            '認証失敗時に初期化が不安定になる問題を修正しました。',
            '開発環境のAPIプロキシ設定不備による接続不良を修正しました。',
            '暗記問題で選択肢1件のみの場合に保存できない不具合を修正しました。',
        ],
    },
    {
        version: '1.1.0',
        date: '2026年2月21日',
        improvements: [
            '分布シミュレーターを追加し、ホームから起動できるようになりました。',
            'モバイル/タブレット向けのレスポンシブ対応とレイアウト調整を進めました。',
            '数式表示（KaTeX）やアニメーション表現を強化し、閲覧体験を改善しました。',
        ],
        fixes: [
            'セッション再開時に削除済み問題が混在する不具合を修正しました。',
            '問題インポート中にモーダルを誤って閉じてしまう操作不整合を修正しました。',
            'ホーム/詳細画面のボタン配置の崩れなど、UIの軽微な不具合を修正しました。',
        ],
    },
    {
        version: '1.0.0',
        date: '2026年2月21日',
        improvements: [
            '問題集アプリの初回リリース（ローカル保存ベース）を公開しました。',
            '基本機能として、問題演習・暗記学習・履歴保存を提供開始しました。',
        ],
        fixes: [
            '初回リリースのため、個別の不具合修正項目はありません。',
        ],
    },
];

const cardStyle: React.CSSProperties = {
    background: 'var(--surface-color)',
    padding: '1.5rem',
    borderRadius: '12px',
    border: '1px solid var(--border-color)',
    marginBottom: '1.5rem',
    width: '100%',
};

const sectionTitleStyle: React.CSSProperties = {
    fontSize: '1.1rem',
    marginTop: '1rem',
    marginBottom: '0.5rem',
};

export const ReleaseNotesRoute: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div
            className="home-page"
            style={{
                alignItems: 'flex-start',
                padding: '2rem',
                maxWidth: '800px',
                margin: '0 auto',
                background: 'var(--bg-color)',
                minHeight: '100vh',
                width: '100%',
            }}
        >
            <button className="nav-btn" onClick={() => navigate('/')} style={{ marginBottom: '2rem' }}>
                <ArrowLeft size={16} /> 戻る
            </button>

            <h1
                style={{
                    fontSize: '2rem',
                    marginBottom: '2rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    color: 'var(--text-color)',
                }}
            >
                <Clock size={28} /> リリースノート
            </h1>

            {releaseNotes.map((note, index) => (
                <div key={note.version} className="release-card" style={{ ...cardStyle, marginBottom: index === releaseNotes.length - 1 ? 0 : cardStyle.marginBottom }}>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '1rem',
                            borderBottom: '1px solid var(--border-color)',
                            paddingBottom: '0.75rem',
                        }}
                    >
                        <h2
                            style={{
                                fontSize: '1.5rem',
                                margin: 0,
                                color: index === 0 ? 'var(--primary-color)' : 'var(--text-color)',
                            }}
                        >
                            v{note.version}
                        </h2>
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{note.date}</span>
                    </div>

                    <div style={{ color: 'var(--text-color)', lineHeight: 1.6 }}>
                        <h3 style={sectionTitleStyle}>✨ 新機能・改善</h3>
                        <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }}>
                            {note.improvements.map(item => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>

                        <h3 style={sectionTitleStyle}>🐛 バグ修正</h3>
                        <ul style={{ paddingLeft: '1.5rem', marginBottom: 0 }}>
                            {note.fixes.map(item => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            ))}

            <div
                style={{
                    textAlign: 'center',
                    width: '100%',
                    marginTop: '3rem',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem',
                }}
            >
                現在のバージョン: v{__APP_VERSION__}
            </div>
        </div>
    );
};
