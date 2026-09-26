import type { ArchitectureAnalysis } from '../../types';

type Props = {
    analysis: ArchitectureAnalysis | null;
    analyzing: boolean;
    onAnalyze: () => void;
    onRefreshPrices: () => void;
};

function monthlyRange(analysis: ArchitectureAnalysis): string {
    const { monthlyLow, monthlyHigh } = analysis.estimate;
    if (monthlyLow === null) return 'Not available';
    if (monthlyHigh === null) return `From ${analysis.estimate.currency} ${monthlyLow.toFixed(2)}`;
    if (monthlyLow === monthlyHigh) return `${analysis.estimate.currency} ${monthlyLow.toFixed(2)}`;
    return `${analysis.estimate.currency} ${monthlyLow.toFixed(2)}–${monthlyHigh.toFixed(2)}`;
}

export default function AnalysisPanel({ analysis, analyzing, onAnalyze, onRefreshPrices }: Props) {
    return (
        <section className="sandbox-analysis" aria-labelledby="analysis-title">
            <div className="sandbox-analysis__header">
                <div>
                    <span className="eyebrow">ARCHITECTURE REVIEW</span>
                    <h2 id="analysis-title">Review the tradeoffs</h2>
                    <p>Rule-based feedback and indicative public list rates. Nothing is deployed to AWS.</p>
                </div>
                <div className="analysis-actions">
                    <button
                        className="button button--outline"
                        type="button"
                        disabled={analyzing}
                        onClick={onRefreshPrices}
                    >
                        {analyzing ? 'Refreshing…' : 'Refresh prices'}
                    </button>
                    <button
                        className="button button--primary"
                        type="button"
                        disabled={analyzing}
                        onClick={onAnalyze}
                    >
                        {analyzing ? 'Analyzing…' : 'Analyze architecture'} <span aria-hidden="true">→</span>
                    </button>
                </div>
            </div>
            {analysis ? (
                <div className="analysis-results">
                    <article className="analysis-card">
                        <span className="eyebrow">MONTHLY COST · {analysis.estimate.currency}</span>
                        <strong>{monthlyRange(analysis)}</strong>
                        <p>{analysis.estimate.coverage}</p>
                        <small>
                            {analysis.estimate.source}
                            {analysis.estimate.effectiveAt
                                ? ` · effective ${analysis.estimate.effectiveAt.slice(0, 10)}`
                                : ''}
                        </small>
                        <details>
                            <summary>Estimate assumptions</summary>
                            <ul>
                                {analysis.estimate.assumptions.map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                        </details>
                    </article>
                    <article className="analysis-card">
                        <span className="eyebrow">PERFORMANCE EXPECTATION</span>
                        <p>{analysis.performance.summary}</p>
                        <ul>
                            {analysis.performance.assumptions.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    </article>
                    <div className="analysis-findings">
                        <span className="eyebrow">FINDINGS · {analysis.findings.length}</span>
                        {analysis.findings.length ? (
                            analysis.findings.map((finding) => (
                                <article
                                    className={`analysis-finding is-${finding.severity}`}
                                    key={finding.id}
                                >
                                    <span>
                                        {finding.category.toUpperCase()} · {finding.severity.toUpperCase()}
                                    </span>
                                    <h3>{finding.title}</h3>
                                    <p>{finding.explanation}</p>
                                    <strong>Next step: {finding.recommendation}</strong>
                                </article>
                            ))
                        ) : (
                            <p>No findings for the current rules and assumptions.</p>
                        )}
                    </div>
                </div>
            ) : (
                <div className="analysis-empty">
                    <span aria-hidden="true">✳</span>
                    <div>
                        <strong>Analyze this design when you are ready.</strong>
                        <p>
                            We’ll check common design risks and show the pricing coverage for your
                            assumptions.
                        </p>
                    </div>
                </div>
            )}
        </section>
    );
}
