import React, { useState } from 'react';
import { cloudApi, type AuthUser } from '../cloudApi';

type AppAuthModalsProps = {
    currentUser: AuthUser | null;
    isLoginModalOpen: boolean;
    setIsLoginModalOpen: (open: boolean) => void;
    isRegisterModalOpen: boolean;
    setIsRegisterModalOpen: (open: boolean) => void;
    setCurrentUser: (user: AuthUser | null) => void;
    setUseCloudSync: (enabled: boolean) => void;
    loadQuizSets: () => Promise<unknown>;
};

export const AppAuthModals: React.FC<AppAuthModalsProps> = ({
    currentUser,
    isLoginModalOpen,
    setIsLoginModalOpen,
    isRegisterModalOpen,
    setIsRegisterModalOpen,
    setCurrentUser,
    setUseCloudSync,
    loadQuizSets,
}) => {
    const [loginUsername, setLoginUsername] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [loginError, setLoginError] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const [registerUsername, setRegisterUsername] = useState('');
    const [registerPassword, setRegisterPassword] = useState('');
    const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState('');
    const [registerError, setRegisterError] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);

    const continueOfflineMode = () => {
        setUseCloudSync(false);
        setIsLoginModalOpen(false);
        setIsRegisterModalOpen(false);
        void loadQuizSets();
    };

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoggingIn(true);
        setLoginError('');
        try {
            const result = await cloudApi.login(loginUsername, loginPassword);
            setCurrentUser(result.user);
            setIsLoginModalOpen(false);
            setLoginUsername('');
            setLoginPassword('');
            setUseCloudSync(true);
            await loadQuizSets();
        } catch (err: unknown) {
            setLoginError(err instanceof Error ? err.message : 'ログインに失敗しました');
        } finally {
            setIsLoggingIn(false);
        }
    };

    const handleRegisterSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setRegisterError('');
        if (registerPassword !== registerPasswordConfirm) {
            setRegisterError('パスワードが一致しません');
            return;
        }
        setIsRegistering(true);
        try {
            const result = await cloudApi.register(registerUsername, registerPassword);
            setCurrentUser(result.user);
            setIsRegisterModalOpen(false);
            setRegisterUsername('');
            setRegisterPassword('');
            setRegisterPasswordConfirm('');
            setUseCloudSync(true);
            await loadQuizSets();
        } catch (err: unknown) {
            setRegisterError(err instanceof Error ? err.message : '登録に失敗しました');
        } finally {
            setIsRegistering(false);
        }
    };

    return (
        <>
            {isLoginModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content login-modal">
                        <div className="modal-header">
                            <h3>ログイン</h3>
                        </div>
                        <div className="modal-body">
                            <p style={{ marginBottom: '1rem' }}>アカウントにログインしてください。</p>
                            <form onSubmit={handleLoginSubmit}>
                                <input
                                    type="text"
                                    className="field-input"
                                    placeholder="ユーザー名"
                                    value={loginUsername}
                                    onChange={(e) => setLoginUsername(e.target.value)}
                                    autoFocus
                                    style={{ marginBottom: '0.75rem' }}
                                />
                                <input
                                    type="password"
                                    className="field-input"
                                    placeholder="パスワード"
                                    value={loginPassword}
                                    onChange={(e) => setLoginPassword(e.target.value)}
                                />
                                {loginError && <p style={{ color: 'var(--danger-color)', fontSize: '0.85rem', marginTop: '0.5rem' }}>{loginError}</p>}
                                <div className="modal-footer" style={{ marginTop: '1.5rem' }}>
                                    {currentUser && <button type="button" className="nav-btn" onClick={() => setIsLoginModalOpen(false)} disabled={isLoggingIn}>キャンセル</button>}
                                    <button type="submit" className="nav-btn action-btn" disabled={isLoggingIn}>
                                        {isLoggingIn ? '認証中...' : 'ログイン'}
                                    </button>
                                </div>
                            </form>
                            <div style={{ textAlign: 'center', marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>アカウントをお持ちでない方は </span>
                                <button
                                    type="button"
                                    style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'underline' }}
                                    onClick={() => {
                                        setIsLoginModalOpen(false);
                                        setIsRegisterModalOpen(true);
                                        setLoginError('');
                                    }}
                                >
                                    新規登録
                                </button>
                            </div>
                            {!currentUser && (
                                <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
                                    <button
                                        type="button"
                                        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem' }}
                                        onClick={continueOfflineMode}
                                    >
                                        オフラインで続ける
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {isRegisterModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content login-modal">
                        <div className="modal-header">
                            <h3>新規登録</h3>
                        </div>
                        <div className="modal-body">
                            <p style={{ marginBottom: '1rem' }}>アカウントを作成してください。</p>
                            <form onSubmit={handleRegisterSubmit}>
                                <input
                                    type="text"
                                    className="field-input"
                                    placeholder="ユーザー名（3文字以上）"
                                    value={registerUsername}
                                    onChange={(e) => setRegisterUsername(e.target.value)}
                                    autoFocus
                                    style={{ marginBottom: '0.75rem' }}
                                />
                                <input
                                    type="password"
                                    className="field-input"
                                    placeholder="パスワード（6文字以上）"
                                    value={registerPassword}
                                    onChange={(e) => setRegisterPassword(e.target.value)}
                                    style={{ marginBottom: '0.75rem' }}
                                />
                                <input
                                    type="password"
                                    className="field-input"
                                    placeholder="パスワード（確認）"
                                    value={registerPasswordConfirm}
                                    onChange={(e) => setRegisterPasswordConfirm(e.target.value)}
                                />
                                {registerError && <p style={{ color: 'var(--danger-color)', fontSize: '0.85rem', marginTop: '0.5rem' }}>{registerError}</p>}
                                <div className="modal-footer" style={{ marginTop: '1.5rem' }}>
                                    {currentUser && <button type="button" className="nav-btn" onClick={() => setIsRegisterModalOpen(false)} disabled={isRegistering}>キャンセル</button>}
                                    <button type="submit" className="nav-btn action-btn" disabled={isRegistering}>
                                        {isRegistering ? '登録中...' : '登録する'}
                                    </button>
                                </div>
                            </form>
                            <div style={{ textAlign: 'center', marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>既にアカウントをお持ちの方は </span>
                                <button
                                    type="button"
                                    style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'underline' }}
                                    onClick={() => {
                                        setIsRegisterModalOpen(false);
                                        setIsLoginModalOpen(true);
                                        setRegisterError('');
                                    }}
                                >
                                    ログイン
                                </button>
                            </div>
                            {!currentUser && (
                                <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
                                    <button
                                        type="button"
                                        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem' }}
                                        onClick={continueOfflineMode}
                                    >
                                        オフラインで続ける
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
