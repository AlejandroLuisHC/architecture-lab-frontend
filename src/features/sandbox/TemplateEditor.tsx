import type { ChangeEvent } from 'react';
import type { TemplateDiagnostic } from './cloudformation';

type Props = {
    source: string;
    edited: boolean;
    diagnostics: TemplateDiagnostic[];
    error: string;
    onSourceChange: (source: string) => void;
    onImportFile: (file: File) => void;
    onApply: () => void;
    onExport: () => void;
    onDiscard: () => void;
};

export default function TemplateEditor({
    source,
    edited,
    diagnostics,
    error,
    onSourceChange,
    onImportFile,
    onApply,
    onExport,
    onDiscard,
}: Props) {
    function selectFile(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (file) onImportFile(file);
        event.target.value = '';
    }

    return (
        <section className="template-page" aria-labelledby="template-title">
            <div className="service-page__breadcrumbs">
                <span>Architecture</span>
                <span aria-hidden="true">›</span>
                <strong>CloudFormation template</strong>
            </div>
            <header className="template-page__header">
                <div>
                    <span className="eyebrow">INFRASTRUCTURE AS CODE</span>
                    <h1 id="template-title">CloudFormation YAML</h1>
                    <p>
                        Edit or import a template. Apply a valid document to update the console architecture.
                    </p>
                </div>
                <div className="template-actions">
                    <label className="button button--outline template-upload">
                        Import YAML
                        <input
                            type="file"
                            accept=".yaml,.yml,application/yaml,text/yaml"
                            onChange={selectFile}
                        />
                    </label>
                    <button
                        className="button button--outline"
                        type="button"
                        disabled={edited}
                        onClick={onExport}
                    >
                        Download YAML
                    </button>
                </div>
            </header>
            {edited ? (
                <div className="template-dirty-note" role="status">
                    <span>
                        Source has unapplied edits. Console changes are paused until you apply or discard
                        them.
                    </span>
                    <div>
                        <button className="text-button" type="button" onClick={onDiscard}>
                            Discard edits
                        </button>
                        <button
                            className="button button--primary button--small"
                            type="button"
                            onClick={onApply}
                        >
                            Validate and apply
                        </button>
                    </div>
                </div>
            ) : null}
            <label className="visually-hidden" htmlFor="cloudformation-source">
                CloudFormation YAML source
            </label>
            <textarea
                id="cloudformation-source"
                className="template-source"
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                value={source}
                onChange={(event) => onSourceChange(event.target.value)}
                aria-describedby="template-source-help"
            />
            <p className="template-source-help" id="template-source-help">
                Templates are parsed locally in your browser. Applying a template replaces the open
                architecture after validation.
            </p>
            {error ? (
                <p className="template-error" role="alert">
                    {error}
                </p>
            ) : null}
            {diagnostics.length ? (
                <section className="template-diagnostics" aria-label="Template diagnostics">
                    <h2>
                        Import and export notes <span>{diagnostics.length}</span>
                    </h2>
                    <ul>
                        {diagnostics.map((diagnostic, index) => (
                            <li
                                className={`is-${diagnostic.severity}`}
                                key={`${diagnostic.logicalId ?? 'template'}-${diagnostic.line ?? index}-${index}`}
                            >
                                <span>{diagnostic.severity}</span>
                                {diagnostic.logicalId ? <code>{diagnostic.logicalId}</code> : null}
                                <p>{diagnostic.message}</p>
                                {diagnostic.line ? (
                                    <small>
                                        Line {diagnostic.line}
                                        {diagnostic.column ? `, column ${diagnostic.column}` : ''}
                                    </small>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
        </section>
    );
}
