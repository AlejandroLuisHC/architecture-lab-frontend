import type { User } from 'firebase/auth';
import ConsoleStep from '../ConsoleStep';
import type { Evaluation, Lab, LabConfiguration, LabService } from '../../types';

export type GuidedSaveStatus = 'guest' | 'loading' | 'saving' | 'saved' | 'error';

function serviceTone(serviceId: string) {
    if (['lambda', 'ec2'].includes(serviceId)) return 'compute';
    if (['s3', 'efs'].includes(serviceId)) return 'storage';
    if (['dynamodb', 'aurora'].includes(serviceId)) return 'database';
    if (['cloudfront', 'api-gateway', 'vpc'].includes(serviceId)) return 'networking';
    if (['iam', 'cognito'].includes(serviceId)) return 'security';
    if (['cloudwatch', 'cloudtrail'].includes(serviceId)) return 'management';
    return 'integration';
}
export type GuidedConsoleProps = {
    lab: Lab;
    activeService: LabService;
    activeStep: Lab['steps'][number];
    configuration: LabConfiguration;
    selectedServiceId: string;
    serviceSearch: string;
    currentStep: number;
    unlockedThroughStep: number;
    lockedMessage: string;
    guideOpen: boolean;
    mobileGuideOpen: boolean;
    currentEvaluation: Evaluation['steps'][number] | undefined;
    evaluation: Evaluation | null;
    checking: boolean;
    actionError: string;
    saveStatus: GuidedSaveStatus;
    user: User | null;
    onChooseService: (service: LabService) => void;
    onChangeConfiguration: (configuration: LabConfiguration) => void;
    onDismissLocked: () => void;
    onToggleGuide: () => void;
    onCloseMobileGuide: () => void;
    onCloseGuides: () => void;
    onCheckStep: () => void;
    onContinueStep: () => void;
    onRetrySave: () => void;
};

type ServiceCategory = Lab['serviceCatalog'][number];

function ServiceNavigationButton({
    service,
    selected,
    locked,
    onChoose,
}: {
    service: LabService;
    selected: boolean;
    locked: boolean;
    onChoose: (service: LabService) => void;
}) {
    return (
        <button
            className={`service-link ${selected ? 'is-current' : ''} ${locked ? 'is-locked' : ''}`}
            type="button"
            aria-disabled={locked}
            onClick={() => onChoose(service)}
        >
            <span className={`service-link-icon tone-${serviceTone(service.id)}`} aria-hidden="true">
                {service.name.split(' ').at(-1)?.slice(0, 1)}
            </span>
            <span>{service.name}</span>
            <span className="service-lock" aria-hidden="true">
                {locked ? '' : '›'}
            </span>
        </button>
    );
}

function ServiceCategoryNavigation({
    category,
    search,
    selectedServiceId,
    unlockedThroughStep,
    onChoose,
}: {
    category: ServiceCategory;
    search: string;
    selectedServiceId: string;
    unlockedThroughStep: number;
    onChoose: (service: LabService) => void;
}) {
    const query = search.trim().toLowerCase();
    const categoryMatches = category.category.toLowerCase().includes(query);
    const services = category.services.filter(
        (service) => categoryMatches || service.name.toLowerCase().includes(query),
    );
    if (!services.length) return null;
    return (
        <section className="service-category" key={category.category}>
            <h2>{category.category}</h2>
            {services.map((service) => {
                const locked = service.stepIndex === null || service.stepIndex > unlockedThroughStep;
                return (
                    <ServiceNavigationButton
                        key={service.id}
                        service={service}
                        selected={selectedServiceId === service.id}
                        locked={locked}
                        onChoose={onChoose}
                    />
                );
            })}
        </section>
    );
}

function MobileServiceNavigation({
    services,
    search,
    selectedServiceId,
    unlockedThroughStep,
    onChoose,
}: {
    services: LabService[];
    search: string;
    selectedServiceId: string;
    unlockedThroughStep: number;
    onChoose: (service: LabService) => void;
}) {
    const visible = services.filter((service) =>
        service.name.toLowerCase().includes(search.trim().toLowerCase()),
    );
    return (
        <div className="mobile-service-strip" aria-label="Available services">
            {visible.map((service) => {
                const locked = service.stepIndex === null || service.stepIndex > unlockedThroughStep;
                return (
                    <button
                        key={service.id}
                        className={`${selectedServiceId === service.id ? 'is-current' : ''} tone-${serviceTone(service.id)}`}
                        type="button"
                        aria-disabled={locked}
                        onClick={() => onChoose(service)}
                    >
                        {service.name.replace(/^(Amazon |AWS )/, '')}
                        {locked ? ' · locked' : ''}
                    </button>
                );
            })}
        </div>
    );
}

function GuidedServiceNavigation({ props }: { props: GuidedConsoleProps }) {
    const services = props.lab.serviceCatalog.flatMap((category) => category.services);
    const matches =
        services.some((service) =>
            service.name.toLowerCase().includes(props.serviceSearch.trim().toLowerCase()),
        ) ||
        props.lab.serviceCatalog.some((category) =>
            category.category.toLowerCase().includes(props.serviceSearch.trim().toLowerCase()),
        );
    return (
        <>
            <aside className="service-navigation" aria-label="Cloud service navigation">
                <div className="service-nav-head">
                    <img className="service-nav-logo" src="/stack-playground-logo.png" alt="" />
                    <div>
                        <strong>Services</strong>
                        <small>Training workspace</small>
                    </div>
                    <span className="service-nav-region">us-east-1</span>
                </div>
                <div className="service-nav-scroll">
                    {props.lab.serviceCatalog.map((category) => (
                        <ServiceCategoryNavigation
                            key={category.category}
                            category={category}
                            search={props.serviceSearch}
                            selectedServiceId={props.selectedServiceId}
                            unlockedThroughStep={props.unlockedThroughStep}
                            onChoose={props.onChooseService}
                        />
                    ))}
                    {!matches ? (
                        <p className="service-search-empty">No services match “{props.serviceSearch}”.</p>
                    ) : null}
                </div>
                <div className="service-nav-footer">
                    <span className="sandbox-indicator">
                        <i /> SIMULATED ENVIRONMENT
                    </span>
                    <p>Actions are local to this browser. No cloud resources are deployed.</p>
                </div>
            </aside>
            <MobileServiceNavigation
                services={services}
                search={props.serviceSearch}
                selectedServiceId={props.selectedServiceId}
                unlockedThroughStep={props.unlockedThroughStep}
                onChoose={props.onChooseService}
            />
        </>
    );
}

function LearningWorkspace({ props }: { props: GuidedConsoleProps }) {
    return (
        <section className="console-main">
            <div className="workspace-bar">
                <div>
                    <span className="breadcrumb-root">Stack Playground</span>
                    <span aria-hidden="true">/</span>
                    <strong>{props.activeStep.title}</strong>
                </div>
                <div className="workspace-progress">
                    <span>STAGE {String(props.currentStep + 1).padStart(2, '0')} / 04</span>
                    <div>
                        <i
                            style={{
                                width: `${((props.unlockedThroughStep + 1) / props.lab.steps.length) * 100}%`,
                            }}
                        />
                    </div>
                </div>
            </div>
            {props.lockedMessage ? (
                <div className="locked-message" role="status">
                    <span aria-hidden="true">ⓘ</span>
                    {props.lockedMessage}
                    <button type="button" aria-label="Dismiss" onClick={props.onDismissLocked}>
                        ×
                    </button>
                </div>
            ) : null}
            <ConsoleStep
                serviceId={props.activeService.id}
                serviceName={props.activeService.name}
                step={props.activeStep}
                configuration={props.configuration}
                onChange={props.onChangeConfiguration}
            />
            <div className="console-main-footer">
                <span>Independent educational sandbox · not affiliated with AWS</span>
                <button
                    className="guide-toggle guide-toggle--desktop"
                    type="button"
                    aria-expanded={props.guideOpen}
                    onClick={props.onToggleGuide}
                >
                    {props.guideOpen ? 'Hide guide' : 'Show guide'}{' '}
                    <span aria-hidden="true">{props.guideOpen ? '→' : '←'}</span>
                </button>
            </div>
        </section>
    );
}

function EvaluationFeedback({
    evaluation,
    currentStep,
    onContinue,
}: {
    evaluation: Evaluation['steps'][number];
    currentStep: number;
    onContinue: () => void;
}) {
    return (
        <div className={`guide-feedback ${evaluation.passed ? 'is-passed' : ''}`} role="status">
            <strong>{evaluation.passed ? 'Stage complete' : 'Review these checks'}</strong>
            {evaluation.checks.map((item) => (
                <div className={`guide-check ${item.passed ? 'is-passed' : ''}`} key={item.id}>
                    <span aria-hidden="true">{item.passed ? '✓' : '!'}</span>
                    <div>
                        <strong>{item.label}</strong>
                        {!item.passed ? <p>{item.hint}</p> : null}
                    </div>
                </div>
            ))}
            {evaluation.passed ? (
                <button className="button button--dark button--wide" type="button" onClick={onContinue}>
                    {currentStep === 3 ? 'View your architecture' : 'Continue to next stage'}{' '}
                    <span aria-hidden="true">→</span>
                </button>
            ) : null}
        </div>
    );
}

function LearningGuideBody({ props }: { props: GuidedConsoleProps }) {
    return (
        <div className="guide-scroll">
            <div className="guide-objective">
                <span className="guide-label">WHAT YOU ARE BUILDING</span>
                <p>{props.activeStep.goal}</p>
            </div>
            <div className="guide-section">
                <span className="guide-label">WHY IT MATTERS</span>
                <p>{props.activeStep.concept}</p>
            </div>
            <div className="guide-section">
                <span className="guide-label">YOUR TASK</span>
                <ol>
                    {props.activeStep.instructions.map((text) => (
                        <li key={text}>{text}</li>
                    ))}
                </ol>
            </div>
            <div className="guide-service-list">
                <span className="guide-label">SERVICES IN THIS STAGE</span>
                {props.activeStep.services.map((name) => (
                    <span key={name}>{name}</span>
                ))}
            </div>
            <LearningGuideChecks props={props} />
        </div>
    );
}

function LearningGuideChecks({ props }: { props: GuidedConsoleProps }) {
    return (
        <div className="guide-check-area">
            <button
                className="button button--primary button--wide"
                type="button"
                onClick={props.onCheckStep}
                disabled={props.checking}
            >
                {props.checking ? 'Checking configuration…' : 'Check configuration'}{' '}
                <span aria-hidden="true">→</span>
            </button>
            {props.currentEvaluation ? (
                <EvaluationFeedback
                    evaluation={props.currentEvaluation}
                    currentStep={props.currentStep}
                    onContinue={props.onContinueStep}
                />
            ) : null}
            {props.actionError ? (
                <p className="guide-error" role="alert">
                    {props.actionError}
                </p>
            ) : null}
        </div>
    );
}

function LearningGuide({ props }: { props: GuidedConsoleProps }) {
    if (!props.guideOpen && !props.mobileGuideOpen) return null;
    return (
        <>
            <button
                className={`guide-scrim ${props.mobileGuideOpen ? 'is-visible' : ''}`}
                type="button"
                aria-label="Close guide"
                onClick={props.onCloseMobileGuide}
            />
            <aside
                className={`guide-panel ${props.guideOpen ? 'is-open' : ''} ${props.mobileGuideOpen ? 'mobile-open' : ''}`}
                aria-label="Lab guide"
            >
                <div className="guide-panel__header">
                    <div>
                        <span className="eyebrow">STAGE {props.activeStep.number} / 04</span>
                        <h2>{props.activeStep.title}</h2>
                    </div>
                    <button
                        className="icon-button guide-close"
                        type="button"
                        onClick={props.onCloseGuides}
                        aria-label="Close guide"
                    >
                        ×
                    </button>
                </div>
                <LearningGuideBody props={props} />
                <div className="guide-panel__footer">
                    <span>PROGRESS</span>
                    <strong>
                        {props.evaluation?.passedChecks ?? 0} / {props.evaluation?.totalChecks ?? 11} checks
                        passed
                    </strong>
                </div>
            </aside>
        </>
    );
}

function saveStatusLabel(status: GuidedSaveStatus, user: User | null): string {
    if (!user) return 'Guest session · not saved';
    const labels: Record<GuidedSaveStatus, string> = {
        guest: 'Guest session · not saved',
        loading: 'Loading…',
        saving: 'Saving…',
        saved: 'Saved',
        error: 'Save failed',
    };
    return labels[status];
}

function LearningSaveStatus({ props }: { props: GuidedConsoleProps }) {
    return (
        <div className="console-save-status">
            <span className={`save-indicator ${props.saveStatus === 'error' ? 'is-error' : ''}`}>
                <span />
                {saveStatusLabel(props.saveStatus, props.user)}
            </span>
            {props.user && props.saveStatus === 'error' ? (
                <button className="text-button" type="button" onClick={props.onRetrySave}>
                    Retry
                </button>
            ) : null}
        </div>
    );
}

export default function GuidedConsole({ props }: { props: GuidedConsoleProps }) {
    return (
        <main className={`console-shell ${props.guideOpen ? '' : 'guide-collapsed'}`}>
            <GuidedServiceNavigation props={props} />
            <LearningWorkspace props={props} />
            <LearningGuide props={props} />
            <LearningSaveStatus props={props} />
        </main>
    );
}
