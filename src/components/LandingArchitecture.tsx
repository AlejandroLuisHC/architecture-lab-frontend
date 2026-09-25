import { useEffect, useRef, type PointerEvent } from 'react';

type ServiceNodeProps = {
  x: number;
  y: number;
  tone: string;
  category: string;
  title: string;
  detail: string;
  icon: string;
};

function ServiceNode({ x, y, tone, category, title, detail, icon }: ServiceNodeProps) {
  return (
    <g className={`architecture-map__node architecture-map__node--${tone}`} transform={`translate(${x} ${y})`}>
      <rect className="architecture-map__node-surface" width="164" height="76" rx="7" />
      <circle className="architecture-map__node-icon" cx="25" cy="27" r="15" />
      <text className="architecture-map__node-icon-label" x="25" y="30" textAnchor="middle">{icon}</text>
      <text className="architecture-map__node-category" x="49" y="22">{category}</text>
      <text className="architecture-map__node-title" x="49" y="40">{title}</text>
      <text className="architecture-map__node-detail" x="14" y="63">{detail}</text>
    </g>
  );
}

export default function LandingArchitecture() {
  const visualRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const visibleRef = useRef(false);

  useEffect(() => {
    const visual = visualRef.current;
    if (!visual || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !window.matchMedia('(min-width: 701px) and (pointer: fine)').matches) return;

    const updateScrollPosition = () => {
      if (!visibleRef.current || frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        const bounds = visual.getBoundingClientRect();
        const viewportCenter = window.innerHeight / 2;
        const visualCenter = bounds.top + bounds.height / 2;
        const offset = Math.max(-9, Math.min(9, (viewportCenter - visualCenter) * 0.025));
        visual.style.setProperty('--scroll-offset', `${offset.toFixed(2)}px`);
        visual.style.setProperty('--scroll-offset-slow', `${(offset * -0.42).toFixed(2)}px`);
      });
    };

    const observer = new IntersectionObserver(([entry]) => {
      visibleRef.current = entry.isIntersecting;
      if (entry.isIntersecting) updateScrollPosition();
    }, { rootMargin: '120px 0px' });

    observer.observe(visual);
    window.addEventListener('scroll', updateScrollPosition, { passive: true });
    window.addEventListener('resize', updateScrollPosition, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', updateScrollPosition);
      window.removeEventListener('resize', updateScrollPosition);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !window.matchMedia('(min-width: 701px) and (pointer: fine)').matches) return;
    const visual = visualRef.current;
    if (!visual) return;
    const bounds = visual.getBoundingClientRect();
    const horizontal = ((event.clientX - bounds.left) / bounds.width - 0.5) * 8;
    const vertical = ((event.clientY - bounds.top) / bounds.height - 0.5) * 8;
    visual.style.setProperty('--pointer-x', `${horizontal.toFixed(2)}px`);
    visual.style.setProperty('--pointer-y', `${vertical.toFixed(2)}px`);
    visual.style.setProperty('--pointer-x-slow', `${(horizontal * -0.42).toFixed(2)}px`);
    visual.style.setProperty('--pointer-y-slow', `${(vertical * -0.42).toFixed(2)}px`);
  }

  function resetPointerPosition() {
    const visual = visualRef.current;
    visual?.style.setProperty('--pointer-x', '0px');
    visual?.style.setProperty('--pointer-y', '0px');
    visual?.style.setProperty('--pointer-x-slow', '0px');
    visual?.style.setProperty('--pointer-y-slow', '0px');
  }

  return (
    <div
      className="landing-architecture"
      ref={visualRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointerPosition}
      aria-label="A visual map of the serverless web application in this lab"
    >
      <div className="landing-architecture__header">
        <div><span>ARCHITECTURE MAP</span><strong>A small app. A clear path through the cloud.</strong></div>
        <span className="landing-architecture__status"><i /> SANDBOX</span>
      </div>
      <div className="landing-architecture__canvas">
        <div className="landing-architecture__glow" aria-hidden="true" />
        <div className="landing-architecture__diagram">
          <svg viewBox="0 0 920 550" role="img" aria-labelledby="landing-map-title landing-map-description">
            <title id="landing-map-title">Serverless web application architecture</title>
            <desc id="landing-map-description">A browser retrieves static files through CloudFront, which signs requests to a private Amazon S3 origin using Origin Access Control. The browser also calls API Gateway; configure CORS for the site origin when they are cross-origin. API Gateway needs permission to invoke Lambda. Lambda uses an IAM execution role scoped to required DynamoDB and CloudWatch Logs actions. CloudWatch Logs stores function output and an alarm watches errors.</desc>
            <defs>
              <pattern id="architecture-map-grid" width="28" height="28" patternUnits="userSpaceOnUse">
                <path d="M 28 0 L 0 0 0 28" className="architecture-map__grid-line" fill="none" />
              </pattern>
              <marker id="architecture-map-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L0,6 L7,3 z" className="architecture-map__arrow" />
              </marker>
            </defs>
            <rect width="920" height="550" fill="url(#architecture-map-grid)" />
            <text className="architecture-map__lane" x="250" y="48">STATIC CONTENT · PRIVATE S3 ORIGIN</text>
            <text className="architecture-map__lane" x="250" y="300">DYNAMIC REQUESTS · CORS WHEN CROSS-ORIGIN</text>
            <path className="architecture-map__route" d="M178 248 C213 248 215 118 250 118" markerEnd="url(#architecture-map-arrow)" />
            <path className="architecture-map__route" d="M414 118 H500" markerEnd="url(#architecture-map-arrow)" />
            <path className="architecture-map__route" d="M178 248 C213 248 215 368 250 368" markerEnd="url(#architecture-map-arrow)" />
            <path className="architecture-map__route" d="M414 368 H500" markerEnd="url(#architecture-map-arrow)" />
            <path className="architecture-map__route" d="M664 368 H740" markerEnd="url(#architecture-map-arrow)" />
            <path className="architecture-map__route architecture-map__route--role" d="M582 455 V406" />
            <path className="architecture-map__route architecture-map__route--support" d="M664 368 C710 368 700 493 740 493" markerEnd="url(#architecture-map-arrow)" />
            <path className="architecture-map__flow" d="M178 248 C213 248 215 118 250 118" />
            <path className="architecture-map__flow architecture-map__flow--slow" d="M414 118 H500" />
            <path className="architecture-map__flow architecture-map__flow--reverse" d="M178 248 C213 248 215 368 250 368" />
            <path className="architecture-map__flow architecture-map__flow--slow" d="M414 368 H500" />
            <path className="architecture-map__flow architecture-map__flow--reverse" d="M664 368 H740" />
            <path className="architecture-map__flow architecture-map__flow--support architecture-map__flow--slow" d="M664 368 C710 368 700 493 740 493" />
            <text className="architecture-map__relationship" x="592" y="446">execution role</text>
            <ServiceNode x={14} y={210} tone="entry" category="ENTRY POINT" title="Browser" detail="Web application" icon="WEB" />
            <ServiceNode x={250} y={80} tone="delivery" category="DELIVERY" title="CloudFront" detail="Edge cache · OAC" icon="CDN" />
            <ServiceNode x={500} y={80} tone="storage" category="STORAGE" title="Amazon S3" detail="Private bucket" icon="S3" />
            <ServiceNode x={250} y={330} tone="integration" category="HTTP ENTRY" title="API Gateway" detail="CORS if cross-origin" icon="API" />
            <ServiceNode x={500} y={330} tone="compute" category="COMPUTE" title="AWS Lambda" detail="Uses scoped IAM role" icon="λ" />
            <ServiceNode x={740} y={330} tone="database" category="DATABASE" title="DynamoDB" detail="Stores application data" icon="DB" />
            <ServiceNode x={500} y={455} tone="security" category="LAMBDA ROLE" title="AWS IAM" detail="Table + logs · scoped" icon="IAM" />
            <ServiceNode x={740} y={455} tone="management" category="OBSERVABILITY" title="CloudWatch" detail="Logs + Errors alarm" icon="LOG" />
          </svg>
        </div>
      </div>
      <div className="landing-architecture__footer"><span><i /> No AWS resources are created</span><span className="landing-architecture__footnote">Starter pattern · grant API invoke access; add auth + throttling before production</span><span>01 LAB <b>·</b> 07 SERVICES <b>·</b> 0 DEPLOYMENTS</span></div>
    </div>
  );
}
