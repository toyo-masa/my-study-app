import { useMemo, useState } from 'react';
import { BackButton } from './BackButton';
import { LoanSimCharts } from './loanSim/LoanSimCharts';
import { LoanSimComparison } from './loanSim/LoanSimComparison';
import { LoanSimForm } from './loanSim/LoanSimForm';
import { LoanSimPropertyLinks } from './loanSim/LoanSimPropertyLinks';
import { LoanSimScheduleTable } from './loanSim/LoanSimScheduleTable';
import { LoanSimSummary } from './loanSim/LoanSimSummary';
import { calculateLoanSimulation } from '../features/loanSim/calculator';
import {
    deleteLoanSimSavedPreset,
    deleteLoanSimSavedPropertyLink,
    isLoanSimPropertyLinkUrlValid,
    loadLoanSimSavedPresets,
    loadLoanSimSavedPropertyLinks,
    upsertLoanSimSavedPreset,
    upsertLoanSimSavedPropertyLink,
} from '../features/loanSim/storage';
import type { LoanSimInputs, LoanSimSavedPreset, LoanSimSavedPropertyLink } from '../features/loanSim/types';

type LoanSimProps = {
    onBack: () => void;
};

function buildCurrentYearMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function createDefaultInputs(): LoanSimInputs {
    return {
        propertyPrice: 48_000_000,
        downPayment: 8_000_000,
        loanAmount: 40_000_000,
        isLoanAmountManual: false,
        annualIncome: 8_500_000,
        currentAge: 35,
        retirementAge: 65,
        annualRate: 1.2,
        repaymentYears: 35,
        repaymentType: 'equal-payment',
        initialSavingsBalance: 4_000_000,
        monthlySavings: 50_000,
        savingsAnnualRate: 2,
        bonusRepayment: 100_000,
        monthlyFixedCost: 25_000,
        startYearMonth: buildCurrentYearMonth(),
    };
}

function detectEmbeddedMode(): boolean {
    if (typeof window === 'undefined') {
        return false;
    }

    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('embedded') === '1') {
        return true;
    }

    try {
        return window.self !== window.top;
    } catch {
        return true;
    }
}

export function LoanSim({ onBack }: LoanSimProps) {
    const [mode, setMode] = useState<'single' | 'compare'>('single');
    const [inputs, setInputs] = useState<LoanSimInputs>(() => createDefaultInputs());
    const [savedPresets, setSavedPresets] = useState<LoanSimSavedPreset[]>(() => loadLoanSimSavedPresets(createDefaultInputs()));
    const [savedPropertyLinks, setSavedPropertyLinks] = useState<LoanSimSavedPropertyLink[]>(() => loadLoanSimSavedPropertyLinks());
    const [selectedPresetId, setSelectedPresetId] = useState('');
    const [isPresetManagementOpen, setIsPresetManagementOpen] = useState(false);
    const [presetName, setPresetName] = useState('');
    const [presetStatus, setPresetStatus] = useState<string | null>(null);
    const [propertyLinkTitle, setPropertyLinkTitle] = useState('');
    const [propertyLinkUrl, setPropertyLinkUrl] = useState('');
    const [propertyLinkStatus, setPropertyLinkStatus] = useState<string | null>(null);
    const embedded = useMemo(() => detectEmbeddedMode(), []);
    const result = useMemo(() => calculateLoanSimulation(inputs), [inputs]);

    const handleChange = <K extends keyof LoanSimInputs>(key: K, value: LoanSimInputs[K]) => {
        setInputs((current) => ({
            ...current,
            [key]: value,
        }));
    };

    const handleReset = () => {
        setInputs(createDefaultInputs());
        setSelectedPresetId('');
        setPresetName('');
        setPresetStatus(null);
    };

    const handlePresetNameChange = (value: string) => {
        setPresetName(value);

        if (!selectedPresetId) {
            return;
        }

        const selectedPreset = savedPresets.find((preset) => preset.id === selectedPresetId);
        if (!selectedPreset || selectedPreset.name !== value) {
            setSelectedPresetId('');
        }
    };

    const handleSavePreset = () => {
        const trimmedName = presetName.trim();
        if (!trimmedName) {
            setPresetStatus('保存名を入力してください。');
            return;
        }

        const existed = savedPresets.some((preset) => preset.name === trimmedName);
        const nextPresets = upsertLoanSimSavedPreset(savedPresets, trimmedName, inputs);
        const selectedPreset = nextPresets.find((preset) => preset.name === trimmedName) ?? null;
        setSavedPresets(nextPresets);
        setSelectedPresetId(selectedPreset?.id ?? '');
        setPresetName(trimmedName);
        setPresetStatus(existed ? `「${trimmedName}」を上書き保存しました。` : `「${trimmedName}」を保存しました。`);
    };

    const handleSelectPreset = (presetId: string) => {
        if (!presetId) {
            setSelectedPresetId('');
            setPresetStatus(null);
            return;
        }

        const targetPreset = savedPresets.find((preset) => preset.id === presetId);
        if (!targetPreset) {
            setPresetStatus('保存した条件が見つかりませんでした。');
            return;
        }

        setInputs({ ...targetPreset.inputs });
        setSelectedPresetId(targetPreset.id);
        setPresetName(targetPreset.name);
        setPresetStatus(`「${targetPreset.name}」を読み込みました。`);
    };

    const handleDeletePreset = (presetId: string) => {
        const targetPreset = savedPresets.find((preset) => preset.id === presetId);
        if (!targetPreset) {
            setPresetStatus('削除対象の条件が見つかりませんでした。');
            return;
        }

        const nextPresets = deleteLoanSimSavedPreset(savedPresets, presetId);
        setSavedPresets(nextPresets);
        if (selectedPresetId === targetPreset.id) {
            setSelectedPresetId('');
        }
        if (presetName === targetPreset.name) {
            setPresetName('');
        }
        if (nextPresets.length === 0) {
            setIsPresetManagementOpen(false);
        }
        setPresetStatus(`「${targetPreset.name}」を削除しました。`);
    };

    const handleSavePropertyLink = () => {
        const trimmedTitle = propertyLinkTitle.trim();
        const trimmedUrl = propertyLinkUrl.trim();

        if (!trimmedTitle) {
            setPropertyLinkStatus('物件名やメモを入力してください。');
            return;
        }
        if (!trimmedUrl) {
            setPropertyLinkStatus('URL を入力してください。');
            return;
        }
        if (!isLoanSimPropertyLinkUrlValid(trimmedUrl)) {
            setPropertyLinkStatus('URL は http または https で始まる形式で入力してください。');
            return;
        }

        const existed = savedPropertyLinks.some((link) => link.url === trimmedUrl);
        const nextLinks = upsertLoanSimSavedPropertyLink(savedPropertyLinks, trimmedTitle, trimmedUrl);
        setSavedPropertyLinks(nextLinks);
        setPropertyLinkTitle('');
        setPropertyLinkUrl('');
        setPropertyLinkStatus(existed ? `リンクを上書き保存しました。` : 'リンクを保存しました。');
    };

    const handleDeletePropertyLink = (id: string) => {
        const targetLink = savedPropertyLinks.find((link) => link.id === id);
        if (!targetLink) {
            setPropertyLinkStatus('削除対象のリンクが見つかりませんでした。');
            return;
        }

        const nextLinks = deleteLoanSimSavedPropertyLink(savedPropertyLinks, id);
        setSavedPropertyLinks(nextLinks);
        setPropertyLinkStatus(`「${targetLink.title}」を削除しました。`);
    };

    return (
        <main className={`content-area loan-sim-page${embedded ? ' is-embedded' : ''}`}>
            <div className="detail-header loan-sim-header">
                {!embedded && <BackButton className="nav-btn" onClick={onBack} label="ホームへ戻る" />}
                <div>
                    <h1>住宅ローン返済シミュレーター</h1>
                    <p className="loan-sim-header-note">
                        単一試算だけでなく、シナリオ比較で返済戦略ごとの純資産差も追えるようにしています。
                    </p>
                </div>
            </div>

            <div className="loan-sim-mode-tabs" role="tablist" aria-label="住宅ローンシミュレーターの表示モード">
                <button
                    type="button"
                    className={`loan-sim-mode-tab ${mode === 'single' ? 'is-active' : ''}`}
                    onClick={() => setMode('single')}
                >
                    単一試算
                </button>
                <button
                    type="button"
                    className={`loan-sim-mode-tab ${mode === 'compare' ? 'is-active' : ''}`}
                    onClick={() => setMode('compare')}
                >
                    シナリオ比較
                </button>
            </div>

            {mode === 'single' ? (
                <>
                    {result.validationIssues.length > 0 && (
                        <section className="loan-sim-alert">
                            <h2>入力値の補正</h2>
                            <ul className="loan-sim-alert-list">
                                {result.validationIssues.map((issue, index) => (
                                    <li key={`${issue.field}-${index}`}>{issue.message}</li>
                                ))}
                            </ul>
                        </section>
                    )}

                    <div className="loan-sim-top-grid">
                        <LoanSimSummary result={result} />
                        <LoanSimForm
                            inputs={inputs}
                            calculatedLoanAmount={result.sanitizedInputs.autoCalculatedLoanAmount}
                            selectedPresetId={selectedPresetId}
                            isPresetManagementOpen={isPresetManagementOpen}
                            presetName={presetName}
                            presetStatus={presetStatus}
                            savedPresets={savedPresets}
                            onChange={handleChange}
                            onPresetNameChange={handlePresetNameChange}
                            onSavePreset={handleSavePreset}
                            onSelectPreset={handleSelectPreset}
                            onDeletePreset={handleDeletePreset}
                            onPresetManagementToggle={setIsPresetManagementOpen}
                            onReset={handleReset}
                        />
                    </div>

                    <LoanSimCharts
                        chartPoints={result.chartPoints}
                        payoffMonthCount={result.summary.payoffMonthCount}
                    />

                    <section className="loan-sim-card">
                        <div className="loan-sim-card-head">
                            <div>
                                <h2>計算ルール</h2>
                                <p>条件の解釈を固定して、比較しやすい形で月次シミュレーションしています。</p>
                            </div>
                        </div>
                        <ul className="loan-sim-info-list">
                            {result.infoMessages.map((message) => (
                                <li key={message}>{message}</li>
                            ))}
                        </ul>
                    </section>

                    <LoanSimScheduleTable rows={result.schedule} />
                </>
            ) : (
                <LoanSimComparison />
            )}

            <LoanSimPropertyLinks
                linkTitle={propertyLinkTitle}
                linkUrl={propertyLinkUrl}
                linkStatus={propertyLinkStatus}
                savedLinks={savedPropertyLinks}
                onLinkTitleChange={setPropertyLinkTitle}
                onLinkUrlChange={setPropertyLinkUrl}
                onSaveLink={handleSavePropertyLink}
                onDeleteLink={handleDeletePropertyLink}
            />
        </main>
    );
}
