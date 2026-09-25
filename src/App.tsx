import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { ApiError, getLab, getProgress, saveProgress, validateConfiguration } from './api';
import { auth } from './firebase';
import ArchitectureDiagram from './components/ArchitectureDiagram';
import AuthDialog from './components/AuthDialog';
import ConsoleStep from './components/ConsoleStep';
import type { Evaluation, Lab, LabConfiguration, Progress } from './types';

type Screen = 'home' | 'lab' | 'complete';
type SaveStatus = 'guest' | 'loading' | 'saving' | 'saved' | 'error';
type Conflict = Progress | 'stale' | null;

function copyConfiguration(configuration: LabConfiguration): LabConfiguration {
  return structuredClone(configuration);
}

function LabMark() {
  return <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>;
}

function Landing({
  lab,
  configuration,
  onStart,
  cta,
}: {
  lab: Lab;
  configuration: LabConfiguration;
  onStart: () => void;
  cta: string;
}) {
  return (
    <main>
      <section className="hero page-container">
        <div className="hero-copy">
          <div className="hero-pill"><span /> INTERACTIVE CLOUD LEARNING</div>
          <h1>Cloud architecture<br /><em>clicks into place.</em></h1>
          <p className="hero-lede">Learn how a serverless web app fits together. Configure real AWS concepts in a guided simulation, see what breaks, and build your way to a working architecture.</p>
          <div className="hero-actions"><button className="button button--primary button--large" type="button" onClick={onStart}>{cta} <span aria-hidden="true">↗</span></button><span>No AWS account required</span></div>
          <div className="hero-stats"><div><strong>04</strong><span>guided stages</span></div><div><strong>07</strong><span>AWS services</span></div><div><strong>0</strong><span>resources deployed</span></div></div>
        </div>
        <div className="hero-visual">
          <div className="hero-visual__glow" />
          <div className="hero-floating-label"><span className="hero-floating-label__dot" /> YOUR ARCHITECTURE, IN REAL TIME</div>
          <ArchitectureDiagram configuration={configuration} compact />
          <div className="hero-visual__foot"><span>01 / 04</span><span>START WITH THE FRONTEND <span aria-hidden="true">→</span></span></div>
        </div>
      </section>
      <section className="intro-section">
        <div className="page-container intro-grid">
          <div><span className="eyebrow">THE LAB</span><h2>One app.<br />Every connection explained.</h2></div>
          <div className="intro-copy"><p>{lab.description}</p><div className="intro-facts"><span>◷ {lab.duration}</span><span>◇ {lab.level}</span><span>✦ Free to explore</span></div></div>
        </div>
      </section>
      <section className="roadmap-section page-container">
        <div className="section-heading"><div><span className="eyebrow">YOUR LEARNING PATH</span><h2>Build it, step by step.</h2></div><p>Make a decision, check the result, and understand why it matters before moving on.</p></div>
        <div className="roadmap-grid">{lab.steps.map((step) => <div className="roadmap-card" key={step.id}><span>{step.number}</span><h3>{step.title}</h3><p>{step.goal}</p><div>{step.services.join('  ·  ')}</div></div>)}</div>
      </section>
    </main>
  );
}

function Completion({
  configuration,
  user,
  saveStatus,
  onAccount,
  onRetrySave,
  onRestart,
  onReview,
}: {
  configuration: LabConfiguration;
  user: User | null;
  saveStatus: SaveStatus;
  onAccount: () => void;
  onRetrySave: () => void;
  onRestart: () => void;
  onReview: () => void;
}) {
  return (
    <main className="completion page-container">
      <div className="completion-hero"><span className="completion-icon">✓</span><span className="eyebrow">LAB COMPLETE</span><h1>You built a serverless web app.</h1><p>Every service now has a clear job, a secure connection, and a way to surface errors. Here's the architecture you assembled.</p></div>
      <div className="completion-grid"><ArchitectureDiagram configuration={configuration} /><div className="takeaways-card"><span className="eyebrow">WHAT YOU LEARNED</span><h2>Good architecture is a set of thoughtful connections.</h2><ul><li><strong>Deliver safely.</strong> Keep S3 private and let CloudFront serve the site.</li><li><strong>Run on demand.</strong> Route HTTP requests through API Gateway to Lambda.</li><li><strong>Limit access.</strong> Give Lambda only the DynamoDB permissions it needs.</li><li><strong>Stay informed.</strong> Use logs and alarms to spot failures.</li></ul></div></div>
      <div className="completion-actions"><div><strong>{!user ? 'Want to keep this run?' : saveStatus === 'saved' ? 'Your work is saved to your account.' : saveStatus === 'error' ? 'Your work could not be saved yet.' : 'Saving your run…'}</strong><p>{user ? (saveStatus === 'error' ? 'Check your connection and try again.' : 'You can return to your architecture later.') : 'Create an account to save your architecture and continue on another device.'}</p></div><div className="completion-actions__buttons">{!user ? <button className="button button--primary" type="button" onClick={onAccount}>Save this run <span aria-hidden="true">→</span></button> : null}{user && saveStatus === 'error' ? <button className="button button--primary" type="button" onClick={onRetrySave}>Retry save</button> : null}<button className="button button--outline" type="button" onClick={onReview}>Review lab</button><button className="text-button" type="button" onClick={onRestart}>Start again</button></div></div>
    </main>
  );
}

export default function App() {
  const [lab, setLab] = useState<Lab | null>(null);
  const [configuration, setConfiguration] = useState<LabConfiguration | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [currentStep, setCurrentStep] = useState(0);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [checkedStep, setCheckedStep] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
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
  const draftRef = useRef({ configuration, currentStep, guestTouched, screen });
  const previousUserRef = useRef(false);
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const saveSequenceRef = useRef(0);

  useEffect(() => {
    draftRef.current = { configuration, currentStep, guestTouched, screen };
  }, [configuration, currentStep, guestTouched, screen]);

  useEffect(() => {
    let cancelled = false;
    setLoadError('');
    getLab().then((loaded) => {
      if (cancelled) return;
      setLab(loaded);
      setConfiguration(copyConfiguration(loaded.initialConfiguration));
    }).catch((error: unknown) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Could not load the lab.');
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (nextUser) => {
      if (!nextUser && previousUserRef.current) {
        setConfiguration((current) => lab ? copyConfiguration(lab.initialConfiguration) : current);
        setCurrentStep(0);
        setEvaluation(null);
        setCheckedStep(null);
        setScreen('home');
        setGuestTouched(false);
        setCompletedAt(null);
      }
      previousUserRef.current = Boolean(nextUser);
      setUser(nextUser);
      if (!nextUser) {
        setHydrated(false);
        setSaveStatus('guest');
      }
    });
  }, [lab]);

  useEffect(() => {
    if (!user || !lab) return;
    let cancelled = false;
    setHydrated(false);
    setSaveStatus('loading');

    user.getIdToken().then(getProgress).then((saved) => {
      if (cancelled) return;
      const draft = draftRef.current;
      if (saved && draft.guestTouched) {
        setConflict(saved);
        return;
      }
      if (saved) {
        setConfiguration(copyConfiguration(saved.configuration));
        setCurrentStep(saved.currentStep);
        setCompletedAt(saved.completedAt);
      }
      setGuestTouched(false);
      setHydrated(true);
      setSaveStatus('saved');
    }).catch((error: unknown) => {
      if (cancelled) return;
      if (error instanceof ApiError && error.code === 'LAB_VERSION_MISMATCH') {
        setConflict('stale');
      } else {
        setActionError(error instanceof Error ? error.message : 'Could not load saved progress.');
        setSaveStatus('error');
      }
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
        if (sequence === saveSequenceRef.current) {
          setSaveStatus('saved');
          setCompletedAt(saved.completedAt);
        }
      }).catch((error: unknown) => {
        if (sequence === saveSequenceRef.current) {
          setSaveStatus('error');
          setActionError(error instanceof Error ? error.message : 'Could not save progress.');
        }
      });
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [user, lab, configuration, currentStep, hydrated, conflict, saveRetry]);

  function retryAccountSync() {
    setActionError('');
    if (hydrated) setSaveRetry((value) => value + 1);
    else window.location.reload();
  }

  function changeConfiguration(next: LabConfiguration) {
    setConfiguration(next);
    setEvaluation(null);
    setCheckedStep(null);
    setActionError('');
    if (!user) setGuestTouched(true);
  }

  function navigateToStep(index: number) {
    setCurrentStep(index);
    setCheckedStep(null);
    setScreen('lab');
    if (!user) setGuestTouched(true);
  }

  async function checkStep() {
    if (!configuration) return;
    setChecking(true);
    setActionError('');
    try {
      const result = await validateConfiguration(configuration);
      setEvaluation(result);
      setCheckedStep(currentStep);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not check this stage.');
    } finally {
      setChecking(false);
    }
  }

  function continueStep() {
    if (!evaluation?.steps[currentStep].passed) return;
    if (currentStep < 3) {
      navigateToStep(currentStep + 1);
    } else if (evaluation.complete) {
      setCompletedAt(new Date().toISOString());
      setScreen('complete');
    } else {
      const firstIncomplete = evaluation.steps.findIndex((step) => !step.passed);
      if (firstIncomplete >= 0) navigateToStep(firstIncomplete);
      setActionError('An earlier stage needs attention before the lab is complete.');
    }
  }

  function resetLab() {
    if (!lab) return;
    setConfiguration(copyConfiguration(lab.initialConfiguration));
    setCurrentStep(0);
    setEvaluation(null);
    setCheckedStep(null);
    setCompletedAt(null);
    setScreen('lab');
    if (!user) setGuestTouched(true);
  }

  function useSavedRun(saved: Progress) {
    setConfiguration(copyConfiguration(saved.configuration));
    setCurrentStep(saved.currentStep);
    setCompletedAt(saved.completedAt);
    setGuestTouched(false);
    setConflict(null);
    setHydrated(true);
    setSaveStatus('saved');
    setScreen(saved.completedAt ? 'complete' : 'lab');
  }

  function keepCurrentRun() {
    setConflict(null);
    setGuestTouched(false);
    setHydrated(true);
    setSaveStatus('saving');
  }

  if (!lab || !configuration) {
    return <div className="loading-screen"><LabMark /><h1>Architecture Lab</h1>{loadError ? <><p>{loadError}</p><button className="button button--primary" onClick={() => window.location.reload()}>Try again</button></> : <p>Loading your lab…</p>}</div>;
  }

  const cta = completedAt ? 'View your result' : currentStep > 0 ? 'Continue lab' : 'Launch the lab';
  const activeStep = lab.steps[currentStep];

  return (
    <div className="app-shell">
      <header className="site-header"><div className="page-container site-header__inner"><button className="brand" type="button" onClick={() => setScreen('home')}><LabMark /><span>architecture<span className="brand-light">lab</span><small>LEARN BY BUILDING</small></span></button><nav aria-label="Main navigation"><button className={screen === 'home' ? 'is-active' : ''} type="button" onClick={() => setScreen('home')}>Overview</button><button className={screen !== 'home' ? 'is-active' : ''} type="button" onClick={() => setScreen(completedAt ? 'complete' : 'lab')}>The lab</button></nav><div className="header-actions">{user ? <><span className="header-email" title={user.email ?? undefined}>{user.email}</span><button className="header-account" type="button" onClick={() => { if (auth) void signOut(auth); }}>Sign out</button></> : <button className="header-account" type="button" onClick={() => setAuthOpen(true)}>Sign in <span aria-hidden="true">↗</span></button>}</div></div></header>

      {screen === 'home' ? <Landing lab={lab} configuration={configuration} cta={cta} onStart={() => setScreen(completedAt ? 'complete' : 'lab')} /> : null}

      {screen === 'lab' ? (
        <main className="workspace page-container">
          <div className="workspace-topline"><div><span className="eyebrow">HANDS-ON LAB / AWS</span><h1>Build a serverless web app</h1></div><div className="save-controls"><span className={`save-indicator ${saveStatus === 'error' ? 'is-error' : ''}`}><span />{user ? saveStatus === 'saved' ? 'Saved to your account' : saveStatus === 'saving' ? 'Saving progress…' : saveStatus === 'loading' ? 'Loading progress…' : hydrated ? 'Progress could not be saved' : 'Progress could not be loaded' : 'Guest mode · progress is not saved'}</span>{user && saveStatus === 'error' ? <button className="text-button" type="button" onClick={retryAccountSync}>Retry</button> : null}</div></div>
          <div className="workspace-layout">
            <aside className="stage-sidebar" aria-label="Lab stages"><div className="stage-sidebar__header"><span>YOUR PATH</span><strong>{String(currentStep + 1).padStart(2, '0')} / 04</strong></div><div className="stage-list">{lab.steps.map((step, index) => <button className={`stage-item ${index === currentStep ? 'is-current' : ''} ${evaluation?.steps[index].passed ? 'is-complete' : ''}`} type="button" key={step.id} onClick={() => navigateToStep(index)}><span className="stage-item__number">{evaluation?.steps[index].passed ? '✓' : step.number}</span><span><strong>{step.title}</strong><small>{step.services.join(' · ')}</small></span><span className="stage-item__arrow">›</span></button>)}</div><div className="sidebar-note"><span>✦</span><strong>Safe to experiment</strong><p>This lab runs as a simulation. You can change any choice without deploying or paying for AWS resources.</p></div></aside>
            <ConsoleStep step={activeStep} index={currentStep} configuration={configuration} evaluation={evaluation} showFeedback={checkedStep === currentStep} checking={checking} onChange={changeConfiguration} onCheck={checkStep} onContinue={continueStep} />
            <aside className="workspace-right"><ArchitectureDiagram configuration={configuration} /><div className="right-note"><span className="eyebrow">A QUICK REMINDER</span><p>Configure the services on this stage, then check your work. Feedback will explain what to improve.</p></div></aside>
          </div>
        </main>
      ) : null}

      {screen === 'complete' ? <Completion configuration={configuration} user={user} saveStatus={saveStatus} onAccount={() => setAuthOpen(true)} onRetrySave={retryAccountSync} onRestart={resetLab} onReview={() => navigateToStep(0)} /> : null}

      {actionError ? <div className="toast" role="alert"><span>{actionError}</span><button type="button" onClick={() => setActionError('')} aria-label="Dismiss message">×</button></div> : null}

      <footer className="site-footer"><div className="page-container"><span>architecture lab</span><span>A hands-on learning experience · No real cloud resources created</span></div></footer>

      {authOpen ? <AuthDialog onClose={() => setAuthOpen(false)} /> : null}

      {conflict ? <div className="dialog-backdrop"><div className="dialog-card conflict-card" role="dialog" aria-modal="true" aria-labelledby="conflict-title"><div className="dialog-symbol" aria-hidden="true">↺</div><span className="eyebrow">SAVED PROGRESS</span><h2 id="conflict-title">{conflict === 'stale' ? 'Your saved run needs a fresh start' : 'Choose where to continue'}</h2><p className="dialog-intro">{conflict === 'stale' ? 'The lab has changed since your last visit. Start this version to save progress again.' : 'This account has an earlier run. You can load it or keep the run you started as a guest.'}</p>{conflict !== 'stale' ? <button className="button button--primary button--wide" type="button" onClick={() => useSavedRun(conflict)}>Continue saved run <span aria-hidden="true">→</span></button> : null}<button className="button button--outline button--wide" type="button" onClick={keepCurrentRun}>{conflict === 'stale' ? 'Start this version' : 'Keep current run'}</button></div></div> : null}
    </div>
  );
}
