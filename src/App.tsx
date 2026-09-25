import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { ApiError, getLab, getProgress, saveProgress, validateConfiguration } from './api';
import { auth } from './firebase';
import ArchitectureDiagram from './components/ArchitectureDiagram';
import AuthDialog from './components/AuthDialog';
import ConsoleStep from './components/ConsoleStep';
import LandingArchitecture from './components/LandingArchitecture';
import type { Evaluation, Lab, LabConfiguration, LabService, Progress } from './types';

type Screen = 'home' | 'modules' | 'lab' | 'complete';
type Theme = 'light' | 'dark';
type SaveStatus = 'guest' | 'loading' | 'saving' | 'saved' | 'error';
type Conflict = Progress | 'stale' | null;
const THEME_STORAGE_KEY = 'stack-playground.theme.v1';

function getInitialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage can be unavailable in private or restricted browsing contexts.
  }
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function copyConfiguration(configuration: LabConfiguration): LabConfiguration {
  return structuredClone(configuration);
}

function LabMark() {
  return <img className="brand-mark-image" src="/stack-playground-logo.png" alt="" />;
}

function serviceTone(serviceId: string) {
  if (['lambda', 'ec2'].includes(serviceId)) return 'compute';
  if (['s3', 'efs'].includes(serviceId)) return 'storage';
  if (['dynamodb', 'aurora'].includes(serviceId)) return 'database';
  if (['cloudfront', 'api-gateway', 'vpc'].includes(serviceId)) return 'networking';
  if (['iam', 'cognito'].includes(serviceId)) return 'security';
  if (['cloudwatch', 'cloudtrail'].includes(serviceId)) return 'management';
  return 'integration';
}

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button className="theme-toggle" type="button" onClick={onToggle} aria-label={`Switch to ${nextTheme} mode`} aria-pressed={theme === 'dark'} title={`Switch to ${nextTheme} mode`}>
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.7 15.1A8.5 8.5 0 0 1 8.9 3.3 8.6 8.6 0 1 0 20.7 15.1Z" /></svg>
      )}
      <span>{nextTheme === 'dark' ? 'Dark' : 'Light'}</span>
    </button>
  );
}

function LandingConsolePreview() {
  return (
    <div className="landing-console" aria-label="Preview of the simulated cloud console">
      <div className="landing-console__topbar"><span className="mini-brand"><img src="/stack-playground-logo.png" alt="" /><b>STACK PLAYGROUND</b></span><span className="mini-search">⌕ <span>Search services</span></span><span className="mini-region">us-east-1⌄</span><span className="mini-avatar">SP</span></div>
      <div className="landing-console__body">
        <div className="landing-console__sidebar"><span className="mini-sidebar-title">SERVICES</span><div className="mini-service is-selected"><i className="tone-storage">S</i>Amazon S3</div><div className="mini-service"><i className="tone-networking">C</i>CloudFront</div><div className="mini-service"><i className="tone-compute">λ</i>Lambda</div><div className="mini-service is-muted"><i className="tone-database">D</i>DynamoDB <b>LOCKED</b></div><div className="mini-sidebar-note"><i /> SIMULATED ENVIRONMENT</div></div>
        <div className="landing-console__main"><div className="mini-crumb">Cloud services <span>/</span> Amazon S3</div><div className="mini-heading"><span className="mini-service-icon tone-storage">S3</span><div><strong>Amazon S3</strong><small>Store the static files for your web application.</small></div></div><div className="mini-callout"><b>STAGE 01</b><span>Keep the website files private. CloudFront will deliver them to visitors.</span></div><div className="mini-table"><div className="mini-table__head"><b>Resources</b><span>1 resource</span><i>＋ Create bucket</i></div><div className="mini-table__row"><span className="mini-bucket">▱</span><span><b>stack-playground-assets</b><small>Bucket · sandbox resource</small></span><em><i />Configured</em><span>•••</span></div><div className="mini-table__row mini-table__row--ghost"><span className="mini-bucket">▱</span><span><b>Block public access</b><small>Enabled for all public access settings</small></span><em><i />Private</em><span>›</span></div></div><div className="mini-check"><span><i /> Practice state is local</span><b>Check configuration&nbsp; →</b></div></div>
        <div className="landing-console__guide"><span>GUIDED LAB <b>01 / 04</b></span><h3>Build a private origin</h3><p>Set up storage for the site, then connect it to a delivery network.</p><div className="mini-guide-line is-done"><i>✓</i><span><b>Choose a bucket name</b><small>Use a unique name for your site files.</small></span></div><div className="mini-guide-line"><i>2</i><span><b>Block public access</b><small>Keep the origin private by default.</small></span></div><div className="mini-guide-hint">WHY THIS MATTERS <p>Private origins reduce direct exposure. CloudFront gets controlled access.</p></div></div>
      </div>
      <div className="landing-console__foot"><span><i /> SANDBOX PREVIEW</span><span>Nothing here connects to AWS</span></div>
    </div>
  );
}

function Landing({ lab, onStart, cta }: { lab: Lab; onStart: () => void; cta: string }) {
  return (
    <main>
      <section className="landing-hero">
        <div className="page-container landing-hero__inner">
          <div className="landing-copy">
            <span className="hero-kicker"><i /> A HANDS-ON CLOUD LEARNING SPACE</span>
            <h1>Learn how cloud<br />systems <em>fit together.</em></h1>
            <p className="landing-lede">A guided, no-risk place to get your bearings in cloud architecture. Configure a small serverless application, make mistakes, and see how each service connects.</p>
            <div className="landing-actions"><button className="button button--primary button--large" type="button" onClick={onStart}>{cta}<span aria-hidden="true">→</span></button><a className="hero-secondary" href="#learning-path">Explore the learning path <span aria-hidden="true">↓</span></a></div>
            <div className="landing-facts"><div><strong>01</strong><span>beginner lab</span></div><div><strong>04</strong><span>guided stages</span></div><div><strong>0</strong><span>AWS resources created</span></div></div>
          </div>
          <LandingArchitecture />
        </div>
        <div className="hero-bottomline"><span>FIRST LAB</span><b>Build a serverless web app</b><span className="hero-bottomline__sep">·</span><span>Amazon S3</span><span>CloudFront</span><span>API Gateway</span><span>Lambda</span><span>DynamoDB</span><span>CloudWatch</span></div>
      </section>

      <section className="landing-intro"><div className="page-container intro-layout"><div><span className="eyebrow">A PLACE TO PRACTISE, NOT JUST READ</span><h2>Understand the shape<br />of a cloud application.</h2></div><div><p>{lab.description}</p><p>Work in a focused console with the services you need for the current lesson. A guide gives you context, then you make the choices and check your own configuration.</p><div className="intro-meta"><span>{lab.duration}</span><span>{lab.level}</span><span>Guest access</span><span>No AWS account</span></div></div></div></section>

      <section className="practice-method"><div className="page-container practice-method__inner"><div className="practice-method__heading"><span className="eyebrow">HOW THE LAB WORKS</span><h2>Learn by making the connections.</h2><p>Each step adds one piece to the same application. The sandbox checks the choices that matter and explains what to revisit.</p></div><div className="method-steps"><article><span>01 / CONFIGURE</span><h3>Work in the console</h3><p>Create and edit simulated cloud resources. The layout borrows familiar console patterns while staying focused on this lesson.</p></article><article><span>02 / CHECK</span><h3>Get useful feedback</h3><p>Run a configuration check whenever you are ready. You can see what passed, what needs attention, and why.</p></article><article><span>03 / CONNECT</span><h3>See the full picture</h3><p>Finish with a map of the architecture you assembled and a concise explanation of each service’s role.</p></article></div><div className="practice-method__preview"><div className="practice-method__preview-copy"><span className="eyebrow">INSIDE THE SANDBOX</span><h3>A familiar workspace, without the risk.</h3><p>Practise in a focused console with a step-by-step guide. Every change stays simulated in your browser.</p></div><div><div className="preview-note"><span>THE WORKSPACE</span><span>SIMULATED · SAFE TO EXPLORE</span></div><LandingConsolePreview /></div></div></div></section>

      <section className="landing-path page-container" id="learning-path"><div className="section-heading"><div><span className="eyebrow">THE FIRST LEARNING PATH</span><h2>Build in four stages.</h2></div><p>Each stage introduces a connection. Earlier services stay available as your architecture grows.</p></div><div className="path-list">{lab.steps.map((step) => <article className="path-row" key={step.id}><span className="path-number">{step.number}</span><div><h3>{step.title}</h3><p>{step.goal}</p></div><div className="path-services">{step.services.map((service) => <span key={service}>{service}</span>)}</div></article>)}</div><div className="landing-bottom-cta"><div><strong>Ready to open the sandbox?</strong><p>Start as a guest. Your work stays in this browser until you choose to save it.</p></div><button className="button button--primary" type="button" onClick={onStart}>{cta}<span aria-hidden="true">→</span></button></div><p className="landing-disclaimer">Stack Playground is an independent learning project. AWS service names are used for educational reference; no AWS resources are created.</p></section>
    </main>
  );
}

function ModuleSelector({ lab, onStart }: { lab: Lab; onStart: () => void }) {
  return <main className="module-page page-container"><div className="module-intro"><span className="eyebrow">LEARNING MODULES</span><h1>Choose a place to start.</h1><p>One guided module is ready now. More cloud topics will be added as new labs are built.</p></div><div className="module-grid"><button className="module-card module-card--active" type="button" onClick={onStart}><span className="module-card__top"><span>MODULE 01</span><span className="module-available"><i /> AVAILABLE</span></span><span className="module-card__icon" aria-hidden="true">01</span><strong>{lab.title}</strong><span className="module-card__description">{lab.description}</span><span className="module-card__meta">{lab.level}<span>·</span>{lab.duration}<span>·</span>4 stages</span><span className="module-card__action">Open module <b aria-hidden="true">→</b></span></button>{['Cloud networking', 'Identity and permissions', 'Containers and deployment'].map((name, index) => <div className="module-card module-card--locked" key={name} aria-disabled="true"><span className="module-card__top"><span>MODULE 0{index + 2}</span><span className="module-coming">COMING LATER</span></span><span className="module-card__icon module-card__icon--muted" aria-hidden="true">↗</span><strong>{name}</strong><span className="module-card__description">A future guided sandbox for developers building cloud foundations.</span><span className="module-card__meta">Beginner · Guided practice</span><span className="module-card__action">Not available yet</span></div>)}</div><p className="module-disclaimer">This independent educational sandbox refers to cloud services by name. It is not affiliated with or endorsed by Amazon Web Services.</p></main>;
}

function Completion({ configuration, user, saveStatus, onAccount, onRetrySave, onRestart, onReview }: {
  configuration: LabConfiguration;
  user: User | null;
  saveStatus: SaveStatus;
  onAccount: () => void;
  onRetrySave: () => void;
  onRestart: () => void;
  onReview: () => void;
}) {
  return <main className="completion page-container"><div className="completion-hero"><span className="completion-icon">✓</span><span className="eyebrow">LAB COMPLETE</span><h1>You built a serverless web app.</h1><p>Review the architecture you assembled and the role each service plays in it.</p></div><div className="completion-grid"><ArchitectureDiagram configuration={configuration} /><div className="takeaways-card"><span className="eyebrow">WHAT YOU LEARNED</span><h2>Cloud architecture is about making the connections work.</h2><ul><li><strong>Deliver safely.</strong> Keep S3 private and let CloudFront serve the site.</li><li><strong>Run on demand.</strong> Route HTTP requests through API Gateway to Lambda.</li><li><strong>Limit access.</strong> Give Lambda only the DynamoDB permissions it needs.</li><li><strong>Stay informed.</strong> Use CloudWatch logs and alarms to notice failures.</li></ul></div></div><div className="completion-actions"><div><strong>{!user ? 'Want to keep this run?' : saveStatus === 'saved' ? 'Your work is saved to your account.' : saveStatus === 'error' ? 'Your work could not be saved yet.' : 'Saving your run…'}</strong><p>{user ? (saveStatus === 'error' ? 'Check your connection and try again.' : 'You can return to your architecture later.') : 'Create an account to save your architecture and continue on another device.'}</p></div><div className="completion-actions__buttons">{!user ? <button className="button button--primary" type="button" onClick={onAccount}>Save this run <span aria-hidden="true">→</span></button> : null}{user && saveStatus === 'error' ? <button className="button button--primary" type="button" onClick={onRetrySave}>Retry save</button> : null}<button className="button button--outline" type="button" onClick={onReview}>Review lab</button><button className="text-button" type="button" onClick={onRestart}>Start again</button></div></div></main>;
}

function serviceStage(service: LabService) {
  return service.stepIndex;
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [lab, setLab] = useState<Lab | null>(null);
  const [configuration, setConfiguration] = useState<LabConfiguration | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [currentStep, setCurrentStep] = useState(0);
  const [unlockedThroughStep, setUnlockedThroughStep] = useState(0);
  const [selectedServiceId, setSelectedServiceId] = useState('s3');
  const [serviceSearch, setServiceSearch] = useState('');
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [checkedStep, setCheckedStep] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [guideOpen, setGuideOpen] = useState(true);
  const [mobileGuideOpen, setMobileGuideOpen] = useState(false);
  const [lockedMessage, setLockedMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [guestTouched, setGuestTouched] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [conflict, setConflict] = useState<Conflict>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('guest');
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [saveRetry, setSaveRetry] = useState(0);
  const draftRef = useRef({ configuration, currentStep, unlockedThroughStep, guestTouched });
  const previousUserRef = useRef(false);
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const saveSequenceRef = useRef(0);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b1220' : '#f5f7fa');
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // The selected theme still applies for this session if storage is unavailable.
    }
  }, [theme]);

  useEffect(() => { draftRef.current = { configuration, currentStep, unlockedThroughStep, guestTouched }; }, [configuration, currentStep, unlockedThroughStep, guestTouched]);

  useEffect(() => { window.scrollTo(0, 0); }, [screen]);

  useEffect(() => {
    let cancelled = false;
    setLoadError('');
    getLab().then((loaded) => {
      if (cancelled) return;
      setLab(loaded);
      setConfiguration(copyConfiguration(loaded.initialConfiguration));
    }).catch((error: unknown) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Could not load the lab.'); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (nextUser) => {
      if (!nextUser && previousUserRef.current) {
        setConfiguration((current) => lab ? copyConfiguration(lab.initialConfiguration) : current);
        setCurrentStep(0); setUnlockedThroughStep(0); setSelectedServiceId('s3'); setEvaluation(null); setCheckedStep(null); setScreen('home'); setGuestTouched(false); setCompletedAt(null);
      }
      previousUserRef.current = Boolean(nextUser);
      setUser(nextUser);
      if (!nextUser) { setHydrated(false); setSaveStatus('guest'); }
    });
  }, [lab]);

  useEffect(() => {
    if (!user || !lab) return;
    let cancelled = false;
    setHydrated(false); setSaveStatus('loading');
    user.getIdToken().then(getProgress).then((saved) => {
      if (cancelled) return;
      const draft = draftRef.current;
      if (saved && draft.guestTouched) { setConflict(saved); return; }
      if (saved) {
        setConfiguration(copyConfiguration(saved.configuration)); setCurrentStep(saved.currentStep); setUnlockedThroughStep(saved.unlockedThroughStep); setCompletedAt(saved.completedAt);
        const defaultService = lab.serviceCatalog.flatMap((category) => category.services).find((service) => service.stepIndex === saved.currentStep);
        if (defaultService) setSelectedServiceId(defaultService.id);
      }
      setGuestTouched(false); setHydrated(true); setSaveStatus('saved');
    }).catch((error: unknown) => {
      if (cancelled) return;
      if (error instanceof ApiError && error.code === 'LAB_VERSION_MISMATCH') setConflict('stale');
      else { setActionError(error instanceof Error ? error.message : 'Could not load saved progress.'); setSaveStatus('error'); }
    });
    return () => { cancelled = true; };
  }, [user, lab]);

  useEffect(() => {
    if (!user || !lab || !configuration || !hydrated || conflict) return;
    const sequence = ++saveSequenceRef.current;
    setSaveStatus('saving');
    const timeout = window.setTimeout(() => {
      saveQueueRef.current = saveQueueRef.current.catch(() => undefined).then(async () => {
        const token = await user.getIdToken();
        return saveProgress(token, lab.version, configuration, currentStep);
      }).then((saved) => {
        if (sequence === saveSequenceRef.current) { setSaveStatus('saved'); setCompletedAt(saved.completedAt); }
      }).catch((error: unknown) => {
        if (sequence === saveSequenceRef.current) { setSaveStatus('error'); setActionError(error instanceof Error ? error.message : 'Could not save progress.'); }
      });
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [user, lab, configuration, currentStep, unlockedThroughStep, hydrated, conflict, saveRetry]);

  function retryAccountSync() {
    setActionError('');
    if (hydrated) setSaveRetry((value) => value + 1);
    else window.location.reload();
  }

  function changeConfiguration(next: LabConfiguration) {
    setConfiguration(next); setEvaluation(null); setCheckedStep(null); setActionError('');
    if (!user) setGuestTouched(true);
  }

  function navigateToStep(index: number) {
    if (index > unlockedThroughStep) return;
    setCurrentStep(index); setCheckedStep(null); setScreen('lab'); setLockedMessage('');
    const firstService = lab?.serviceCatalog.flatMap((category) => category.services).find((service) => service.stepIndex === index);
    if (firstService) setSelectedServiceId(firstService.id);
    if (!user) setGuestTouched(true);
  }

  function chooseService(service: LabService) {
    const stage = serviceStage(service);
    if (stage === null) { setLockedMessage(`${service.name} is not part of this module. It may appear in a future lab.`); return; }
    if (stage > unlockedThroughStep) { setLockedMessage(`${service.name} unlocks after you complete the earlier guided stages.`); return; }
    setSelectedServiceId(service.id); setCurrentStep(stage); setScreen('lab'); setCheckedStep(null); setLockedMessage('');
    if (!user) setGuestTouched(true);
  }

  async function checkStep() {
    if (!configuration || !lab) return;
    setChecking(true); setActionError('');
    try {
      const result = await validateConfiguration(configuration);
      setEvaluation(result); setCheckedStep(currentStep);
      if (result.steps[currentStep].passed) setUnlockedThroughStep((current) => Math.max(current, Math.min(currentStep + 1, lab.steps.length - 1)));
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Could not check this stage.'); }
    finally { setChecking(false); }
  }

  function continueStep() {
    if (!evaluation?.steps[currentStep].passed) return;
    if (currentStep < 3) { navigateToStep(currentStep + 1); return; }
    if (evaluation.complete) { setCompletedAt(new Date().toISOString()); setScreen('complete'); return; }
    const firstIncomplete = evaluation.steps.findIndex((step) => !step.passed);
    if (firstIncomplete >= 0) navigateToStep(Math.min(firstIncomplete, unlockedThroughStep));
  }

  function resetLab() {
    if (!lab) return;
    setConfiguration(copyConfiguration(lab.initialConfiguration)); setCurrentStep(0); setUnlockedThroughStep(0); setSelectedServiceId('s3'); setEvaluation(null); setCheckedStep(null); setCompletedAt(null); setScreen('lab'); setGuestTouched(true);
  }

  function useSavedRun(saved: Progress) {
    setConfiguration(copyConfiguration(saved.configuration)); setCurrentStep(saved.currentStep); setUnlockedThroughStep(saved.unlockedThroughStep); setCompletedAt(saved.completedAt); setGuestTouched(false); setConflict(null); setHydrated(true); setSaveStatus('saved'); setScreen(saved.completedAt ? 'complete' : 'lab');
    const defaultService = lab?.serviceCatalog.flatMap((category) => category.services).find((service) => service.stepIndex === saved.currentStep);
    if (defaultService) setSelectedServiceId(defaultService.id);
  }

  function keepCurrentRun() { setConflict(null); setGuestTouched(false); setHydrated(true); setSaveStatus('saving'); }

  if (!lab || !configuration) return <div className="loading-screen"><LabMark /><h1>Stack Playground</h1>{loadError ? <><p>{loadError}</p><button className="button button--primary" onClick={() => window.location.reload()}>Try again</button></> : <p>Loading your lab…</p>}</div>;

  const activeStep = lab.steps[currentStep];
  const activeService = lab.serviceCatalog.flatMap((category) => category.services).find((service) => service.id === selectedServiceId);
  const currentEvaluation = checkedStep === currentStep ? evaluation?.steps[currentStep] : undefined;
  const cta = completedAt ? 'View your result' : currentStep > 0 ? 'Continue lab' : 'Explore the module';
  const checkButton = <button className="button button--primary button--wide" type="button" onClick={() => { void checkStep(); setMobileGuideOpen(false); }} disabled={checking}>{checking ? 'Checking configuration…' : 'Check configuration'} <span aria-hidden="true">→</span></button>;

  return (
    <div className="app-shell" data-theme={theme}>
      <header className={`site-header ${screen === 'lab' ? 'site-header--console' : ''}`}><div className="page-container site-header__inner"><button className="brand" type="button" onClick={() => setScreen('home')}><LabMark /><span>Stack Playground<small>CLOUD LEARNING SANDBOX</small></span></button>{screen !== 'lab' ? <nav aria-label="Main navigation"><button className={screen === 'home' ? 'is-active' : ''} type="button" onClick={() => setScreen('home')}>Overview</button><button className={screen === 'modules' ? 'is-active' : ''} type="button" onClick={() => setScreen('modules')}>Modules</button></nav> : <div className="console-header-context"><span>LEARNING SANDBOX</span><span className="console-header-divider">/</span><strong>Build a serverless web app</strong></div>}{screen === 'lab' ? <div className="console-header-controls"><label className="console-search"><span aria-hidden="true">⌕</span><input aria-label="Search services" value={serviceSearch} onChange={(event) => setServiceSearch(event.target.value)} placeholder="Search services" /></label><span className="console-region"><small>Region</small><b>us-east-1</b><span aria-hidden="true">⌄</span></span></div> : null}<div className="header-actions">{screen === 'lab' ? <button className="guide-toggle" type="button" aria-expanded={mobileGuideOpen} onClick={() => setMobileGuideOpen(true)}>Guide <span aria-hidden="true">☰</span></button> : null}<ThemeToggle theme={theme} onToggle={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} />{user ? <><span className="header-email" title={user.email ?? undefined}>{user.email}</span><button className="header-account" type="button" onClick={() => { if (auth) void signOut(auth); }}>Sign out</button></> : <button className="header-account" type="button" onClick={() => setAuthOpen(true)}>Sign in</button>}</div></div></header>

      {screen === 'home' ? <Landing lab={lab} cta={cta} onStart={() => setScreen('modules')} /> : null}
      {screen === 'modules' ? <ModuleSelector lab={lab} onStart={() => { setScreen(completedAt ? 'complete' : 'lab'); if (!completedAt) setGuestTouched(true); }} /> : null}

      {screen === 'lab' && activeService ? <main className={`console-shell ${guideOpen ? '' : 'guide-collapsed'}`}>
        <aside className="service-navigation" aria-label="Cloud service navigation"><div className="service-nav-head"><img className="service-nav-logo" src="/stack-playground-logo.png" alt="" /><div><strong>Services</strong><small>Training workspace</small></div><span className="service-nav-region">us-east-1</span></div><div className="service-nav-scroll">{lab.serviceCatalog.map((category) => { const visibleServices = category.services.filter((service) => service.name.toLowerCase().includes(serviceSearch.trim().toLowerCase()) || category.category.toLowerCase().includes(serviceSearch.trim().toLowerCase())); if (!visibleServices.length) return null; return <section className="service-category" key={category.category}><h2>{category.category}</h2>{visibleServices.map((service) => { const stage = service.stepIndex; const locked = stage === null || stage > unlockedThroughStep; const tone = serviceTone(service.id); return <button className={`service-link ${selectedServiceId === service.id ? 'is-current' : ''} ${locked ? 'is-locked' : ''}`} type="button" key={service.id} aria-disabled={locked} onClick={() => chooseService(service)}><span className={`service-link-icon tone-${tone}`} aria-hidden="true">{service.name.split(' ').at(-1)?.slice(0, 1)}</span><span>{service.name}</span><span className="service-lock" aria-hidden="true">{locked ? '' : '›'}</span></button>; })}</section>; })}{!lab.serviceCatalog.some((category) => category.services.some((service) => service.name.toLowerCase().includes(serviceSearch.trim().toLowerCase()) || category.category.toLowerCase().includes(serviceSearch.trim().toLowerCase()))) ? <p className="service-search-empty">No services match “{serviceSearch}”.</p> : null}</div><div className="service-nav-footer"><span className="sandbox-indicator"><i /> SIMULATED ENVIRONMENT</span><p>Actions are local to this browser. No cloud resources are deployed.</p></div></aside>
        <div className="mobile-service-strip" aria-label="Available services">{lab.serviceCatalog.flatMap((category) => category.services).filter((service) => service.name.toLowerCase().includes(serviceSearch.trim().toLowerCase())).map((service) => { const locked = service.stepIndex === null || service.stepIndex > unlockedThroughStep; return <button key={service.id} className={`${selectedServiceId === service.id ? 'is-current' : ''} tone-${serviceTone(service.id)}`} type="button" aria-disabled={locked} onClick={() => chooseService(service)}>{service.name.replace(/^(Amazon |AWS )/, '')}{locked ? ' · locked' : ''}</button>; })}</div>
        <section className="console-main"><div className="workspace-bar"><div><span className="breadcrumb-root">Stack Playground</span><span aria-hidden="true">/</span><strong>{activeStep.title}</strong></div><div className="workspace-progress"><span>STAGE {String(currentStep + 1).padStart(2, '0')} / 04</span><div><i style={{ width: `${((unlockedThroughStep + 1) / lab.steps.length) * 100}%` }} /></div></div></div>{lockedMessage ? <div className="locked-message" role="status"><span aria-hidden="true">ⓘ</span>{lockedMessage}<button type="button" aria-label="Dismiss" onClick={() => setLockedMessage('')}>×</button></div> : null}<ConsoleStep serviceId={activeService.id} serviceName={activeService.name} step={activeStep} configuration={configuration} onChange={changeConfiguration} /><div className="console-main-footer"><span>Independent educational sandbox · not affiliated with AWS</span><button className="guide-toggle guide-toggle--desktop" type="button" aria-expanded={guideOpen} onClick={() => setGuideOpen((open) => !open)}>{guideOpen ? 'Hide guide' : 'Show guide'} <span aria-hidden="true">{guideOpen ? '→' : '←'}</span></button></div></section>
        {guideOpen || mobileGuideOpen ? <><button className={`guide-scrim ${mobileGuideOpen ? 'is-visible' : ''}`} type="button" aria-label="Close guide" onClick={() => setMobileGuideOpen(false)} /><aside className={`guide-panel ${guideOpen ? 'is-open' : ''} ${mobileGuideOpen ? 'mobile-open' : ''}`} aria-label="Lab guide"><div className="guide-panel__header"><div><span className="eyebrow">STAGE {activeStep.number} / 04</span><h2>{activeStep.title}</h2></div><button className="icon-button guide-close" type="button" onClick={() => { setMobileGuideOpen(false); setGuideOpen(false); }} aria-label="Close guide">×</button></div><div className="guide-scroll"><div className="guide-objective"><span className="guide-label">WHAT YOU ARE BUILDING</span><p>{activeStep.goal}</p></div><div className="guide-section"><span className="guide-label">WHY IT MATTERS</span><p>{activeStep.concept}</p></div><div className="guide-section"><span className="guide-label">YOUR TASK</span><ol>{activeStep.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}</ol></div><div className="guide-service-list"><span className="guide-label">SERVICES IN THIS STAGE</span>{activeStep.services.map((name) => <span key={name}>{name}</span>)}</div><div className="guide-check-area">{checkButton}{currentEvaluation ? <div className={`guide-feedback ${currentEvaluation.passed ? 'is-passed' : ''}`} role="status"><strong>{currentEvaluation.passed ? 'Stage complete' : 'Review these checks'}</strong>{currentEvaluation.checks.map((item) => <div className={`guide-check ${item.passed ? 'is-passed' : ''}`} key={item.id}><span aria-hidden="true">{item.passed ? '✓' : '!'}</span><div><strong>{item.label}</strong>{!item.passed ? <p>{item.hint}</p> : null}</div></div>)}{currentEvaluation.passed ? <button className="button button--dark button--wide" type="button" onClick={continueStep}>{currentStep === 3 ? 'View your architecture' : 'Continue to next stage'} <span aria-hidden="true">→</span></button> : null}</div> : null}{actionError ? <p className="guide-error" role="alert">{actionError}</p> : null}</div></div><div className="guide-panel__footer"><span>PROGRESS</span><strong>{evaluation?.passedChecks ?? 0} / {evaluation?.totalChecks ?? 11} checks passed</strong></div></aside></> : null}
        <div className="console-save-status"><span className={`save-indicator ${saveStatus === 'error' ? 'is-error' : ''}`}><span />{user ? saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving…' : saveStatus === 'loading' ? 'Loading…' : 'Save failed' : 'Guest session · not saved'}</span>{user && saveStatus === 'error' ? <button className="text-button" type="button" onClick={retryAccountSync}>Retry</button> : null}</div>
      </main> : null}

      {screen === 'complete' ? <Completion configuration={configuration} user={user} saveStatus={saveStatus} onAccount={() => setAuthOpen(true)} onRetrySave={retryAccountSync} onRestart={resetLab} onReview={() => navigateToStep(0)} /> : null}
      {actionError && screen !== 'lab' ? <div className="toast" role="alert"><span>{actionError}</span><button type="button" onClick={() => setActionError('')} aria-label="Dismiss message">×</button></div> : null}
      {screen !== 'lab' ? <footer className="site-footer"><div className="page-container"><span>Stack Playground</span><span>Independent educational sandbox · No real cloud resources created</span></div></footer> : null}
      {authOpen ? <AuthDialog onClose={() => setAuthOpen(false)} /> : null}
      {conflict ? <div className="dialog-backdrop"><div className="dialog-card conflict-card" role="dialog" aria-modal="true" aria-labelledby="conflict-title"><div className="dialog-symbol" aria-hidden="true">↺</div><span className="eyebrow">SAVED PROGRESS</span><h2 id="conflict-title">{conflict === 'stale' ? 'Your saved run needs a fresh start' : 'Choose where to continue'}</h2><p className="dialog-intro">{conflict === 'stale' ? 'The lab has changed since your last visit. Start this version to save progress again.' : 'This account has an earlier run. You can load it or keep the run you started as a guest.'}</p>{conflict !== 'stale' ? <button className="button button--primary button--wide" type="button" onClick={() => useSavedRun(conflict)}>Continue saved run <span aria-hidden="true">→</span></button> : null}<button className="button button--outline button--wide" type="button" onClick={keepCurrentRun}>{conflict === 'stale' ? 'Start this version' : 'Keep current run'}</button></div></div> : null}
    </div>
  );
}
