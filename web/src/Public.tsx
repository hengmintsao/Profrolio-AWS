import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, config, publicMedia } from './api';
import { Blocks, External } from './Content';
import type { PublicProject } from './types';

function Header() {
  const [mobile, setMobile] = useState(
    () => window.matchMedia?.('(max-width: 800px)').matches ?? false,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null),
    navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 800px)');
    if (!media) return;
    const resize = () => {
      setMobile(media.matches);
      setMenuOpen(false);
    };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  useEffect(() => {
    if (
      mobile &&
      !menuOpen &&
      navigation.current?.contains(document.activeElement)
    )
      toggle.current?.focus();
    if (!mobile && document.activeElement === toggle.current)
      navigation.current?.querySelector<HTMLAnchorElement>('a')?.focus();
  }, [mobile, menuOpen]);
  function closeMenu() {
    if (mobile) {
      setMenuOpen(false);
      toggle.current?.focus();
    }
  }
  return (
    <header
      className="site-header"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && mobile && menuOpen) {
          event.preventDefault();
          closeMenu();
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setMenuOpen(false);
      }}
    >
      <a className="site-identity" href="/" aria-label="Henry Tsao — home">
        <span className="identity-name">Henry Tsao</span>
      </a>
      <button
        ref={toggle}
        type="button"
        className="menu-toggle"
        hidden={!mobile}
        aria-controls="primary-navigation"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span>{menuOpen ? 'Close' : 'Menu'}</span>
        <span className="menu-icon" aria-hidden="true">
          <span />
          <span />
        </span>
      </button>
      <nav
        ref={navigation}
        id="primary-navigation"
        aria-label="Main navigation"
        hidden={mobile && !menuOpen}
      >
        {[
          ['/#about', 'About'],
          ['/#work', 'Work'],
          ['/#experience', 'Experience'],
        ].map(([url, label]) => (
          <a key={url} href={url} onClick={closeMenu}>
            {label}
          </a>
        ))}
        <a href="/contact" className="nav-contact" onClick={closeMenu}>
          Let’s talk <span aria-hidden="true">↗</span>
        </a>
      </nav>
    </header>
  );
}
function SectionLabel({ number, label }: { number: string; label: string }) {
  return (
    <p className="section-label">
      <span className="section-index" aria-hidden="true">
        {number}
      </span>
      <span>{label}</span>
      <span className="section-rule" aria-hidden="true" />
    </p>
  );
}
function Footer() {
  return (
    <footer>
      <a className="brand" href="/">
        Henry Tsao
      </a>
      <div>
        <External url="https://github.com/hengmintsao">GitHub</External>
        <External url="https://www.linkedin.com/in/hengmin-tsao-3b3403239/">
          LinkedIn
        </External>
      </div>
    </footer>
  );
}
function useProjects() {
  const [items, setItems] = useState<PublicProject[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        let cursor: string | null = null;
        const all: PublicProject[] = [],
          seen = new Set<string>();
        do {
          const r: { items: PublicProject[]; nextCursor: string | null } =
            await api(
              `/public/projects${cursor ? '?cursor=' + encodeURIComponent(cursor) : ''}`,
            );
          all.push(...r.items);
          cursor = r.nextCursor;
          if (cursor && seen.has(cursor))
            throw Error('Invalid project pagination');
          if (cursor) seen.add(cursor);
        } while (cursor);
        if (active)
          setItems(
            [...new Map(all.map((item) => [item.id, item])).values()].sort(
              (a, b) =>
                a.displayOrder - b.displayOrder || a.id.localeCompare(b.id),
            ),
          );
      } catch {
        if (active)
          setError(
            'Project case studies are temporarily unavailable. Please try again later.',
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  return { items, error, loading };
}
function ProjectCard({ project }: { project: PublicProject }) {
  return (
    <article className="project-card">
      <a
        className="project-image"
        aria-label={'Read case study: ' + project.title}
        href={'/projects/' + encodeURIComponent(project.slug)}
      >
        {project.coverMediaId ? (
          <img
            src={publicMedia(project.slug, project.coverMediaId)}
            alt={project.coverAlt}
          />
        ) : (
          <span className="project-placeholder" aria-hidden="true">
            {project.title.slice(0, 1)}
          </span>
        )}
      </a>
      <div className="project-meta">{project.tags.join(' / ')}</div>
      <h3>
        <a href={'/projects/' + encodeURIComponent(project.slug)}>
          {project.title} ↗
        </a>
      </h3>
      <p>{project.summary}</p>
      <div className="chips">
        {project.technologies.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <a
        className="text-link project-detail-link"
        href={'/projects/' + encodeURIComponent(project.slug)}
      >
        Read case study <span aria-hidden="true">→</span>
      </a>
    </article>
  );
}
function Projects({ state }: { state: ReturnType<typeof useProjects> }) {
  const { items, error, loading } = state;
  const shown = items;
  return (
    <section
      className="section work-section"
      id="work"
      aria-labelledby="work-title"
    >
      <div className="section-heading">
        <div>
          <SectionLabel number="02" label="Work" />
          <h2 id="work-title">Projects, built with purpose.</h2>
          <p className="work-intro">
            Explore the projects below. Open a case study for the context,
            decisions, and implementation, or visit the earlier live project.
          </p>
        </div>
      </div>
      {loading ? (
        <p role="status">Loading projects…</p>
      ) : error ? (
        <p className="notice" role="status">
          {error} The earlier work below remains available.
        </p>
      ) : !shown.length ? (
        <p className="notice">
          New case studies are on the way. Explore my earlier full-stack project
          below.
        </p>
      ) : (
        <div className="project-grid">
          {shown.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
      <article className="legacy-card">
        <div>
          <p className="eyebrow">EARLIER FULL-STACK WORK</p>
          <h3>Airline-Point Website</h3>
          <p>
            A full-stack exploration of airline ticket costs and mileage
            earning, built with React, Express, and MongoDB. This earlier
            project is planned for a future rebuild.
          </p>
          <div className="chips">
            <span>React</span>
            <span>Express</span>
            <span>MongoDB</span>
            <span>Cypress</span>
          </div>
          <External url="https://airline-point-website.vercel.app">
            Explore the earlier project
          </External>
        </div>
        <a
          className="legacy-preview"
          href="https://airline-point-website.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open Airline-Point Website (new tab)"
        >
          <img
            src="/airline-point-home.png"
            alt="Airline-Point homepage with an airport background and welcome heading"
            width={2523}
            height={1407}
            loading="lazy"
          />
        </a>
      </article>
    </section>
  );
}
function Home({ projects }: { projects: ReturnType<typeof useProjects> }) {
  return (
    <>
      <section className="hero">
        <h1>
          Business insight.
          <br />
          <em>Full-stack</em> delivery.
        </h1>
        <div className="hero-bottom">
          <p>
            I connect business questions with thoughtful software — bringing
            airline revenue analysis experience into full-stack development,
            cloud architecture, and DevOps.
          </p>
          <a className="button" href="#work">
            Explore my work <span>↘</span>
          </a>
        </div>
      </section>
      <AboutSection />
      <Projects state={projects} />
      <EmploymentHistory />
      <section className="section capability">
        <SectionLabel number="04" label="Toolkit, with context" />
        <div className="capability-grid">
          <div>
            <span>01 / BUILD</span>
            <h3>Full-stack engineering</h3>
            <p>React · TypeScript · Node.js · APIs · SQL & MongoDB</p>
          </div>
          <div>
            <span>02 / ANALYZE</span>
            <h3>Business analysis</h3>
            <p>
              Excel PivotTables · Formulas · VBA automation
              <br />
              SQL & Power BI
            </p>
          </div>
          <div>
            <span>03 / DELIVER</span>
            <h3>Cloud & DevOps</h3>
            <p>AWS · Serverless · Infrastructure as code · CI/CD</p>
          </div>
        </div>
      </section>
      <ContactCallout />
    </>
  );
}
const employmentHistory = [
  {
    id: 'ontario-devops',
    employer: 'Ontario Government',
    country: 'Canada',
    role: 'DevOps Engineer co-op',
    start: '2025-09',
    startLabel: 'Sep 2025',
    end: '2026-04',
    endLabel: 'Apr 2026',
    description:
      'Supported GitLab upgrades, Jenkins CI/CD automation, full-stack development, REST APIs, MySQL database changes, testing, and production deployments.',
  },
  {
    id: 'eva-business-analyst',
    employer: 'EVA AIR',
    country: 'Taiwan',
    role: 'Business Analyst',
    start: '2020-01',
    startLabel: 'Jan 2020',
    end: '2023-07',
    endLabel: 'Jul 2023',
    description:
      'Analyzed demand, revenue, forecasting, pricing, and route performance using Amadeus 1A data to support business planning and revenue optimization.',
    caseStudy: '/experience/airline-revenue',
  },
  {
    id: 'eva-sales',
    employer: 'EVA AIR',
    country: 'Taiwan',
    role: 'Sales',
    start: '2019-02',
    startLabel: 'Feb 2019',
    end: '2019-12',
    endLabel: 'Dec 2019',
    description:
      'Managed group travel requests, monitored travel-agent performance, prepared sales reports and incentive targets, and maintained agency relationships through market analysis and regular engagement.',
  },
  {
    id: 'eva-ground-staff',
    employer: 'EVA AIR',
    country: 'Taiwan',
    role: 'Ground Staff',
    start: '2017-02',
    startLabel: 'Feb 2017',
    end: '2019-02',
    endLabel: 'Feb 2019',
    description:
      'Handled passenger check-in, boarding, baggage, flight documentation, and customer service while coordinating airport ground operations.',
  },
];
function EmploymentHistory() {
  return (
    <section
      className="section employment-section"
      id="experience"
      aria-labelledby="experience-title"
    >
      <SectionLabel number="03" label="Experience in practice" />
      <div className="employment-heading">
        <h2 id="experience-title">Employment history.</h2>
        <p>
          From airline operations and commercial analysis to software delivery
          and DevOps.
        </p>
      </div>
      <ol
        className="employment-timeline"
        aria-label="Employment history, most recent first"
      >
        {employmentHistory.map((job) => (
          <li key={job.id}>
            <article aria-labelledby={job.id + '-title'}>
              <p className="employment-dates">
                <time dateTime={job.start}>{job.startLabel}</time>
                <span aria-hidden="true"> — </span>
                <span className="sr-only"> to </span>
                <time dateTime={job.end}>{job.endLabel}</time>
              </p>
              <p className="employment-employer">{job.employer}</p>
              <p className="employment-location">
                <span className="employment-country">
                  <svg
                    aria-hidden="true"
                    focusable="false"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" />
                    <circle cx="12" cy="10" r="2.5" />
                  </svg>
                  <span className="sr-only">Location: </span>
                  {job.country}
                </span>
              </p>
              <h3 id={job.id + '-title'}>{job.role}</h3>
              <p className="employment-description">{job.description}</p>
              {job.caseStudy && (
                <a
                  className="text-link employment-case-study"
                  href={job.caseStudy}
                >
                  Explore my revenue analysis approach{' '}
                  <span aria-hidden="true">↗</span>
                </a>
              )}
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}
function ContactCallout() {
  return (
    <section className="contact-callout">
      <div className="section contact-callout-inner">
        <SectionLabel number="05" label="Let’s connect" />
        <h2>
          A business challenge.
          <br />A product idea.
          <br />
          <em>Let’s talk.</em>
        </h2>
        <a href="/contact" className="button">
          Start a conversation ↗
        </a>
      </div>
    </section>
  );
}
const airlineSteps = [
  {
    id: 'commercial-question',
    title: 'Start with the commercial question',
    text: 'Was a route building revenue at the expected pace? I reviewed total revenue, cabin sales, load factors, and historical patterns to understand where performance needed attention.',
  },
  {
    id: 'booking-comparison',
    title: 'Compare booking progress',
    text: 'Future departures were compared with the prior-year equivalent at a comparable booking stage. This helped distinguish a slower booking pace from differences in the available reporting dates.',
  },
  {
    id: 'reporting-workflow',
    title: 'Make recurring reporting easier',
    text: 'PivotTables and Excel formulas shaped the analysis into usable reports. VBA updated the latest available reporting date and selected future departure periods alongside the prior-year comparison, reducing repetitive daily preparation.',
  },
  {
    id: 'commercial-decisions',
    title: 'Translate findings into decisions',
    text: 'The analysis informed whether prices or cabin allocation strategies needed adjustment to keep the product competitive and visible while supporting stable revenue growth.',
  },
];
function Airline() {
  return (
    <article
      className="section experience-page"
      aria-labelledby="airline-title"
    >
      <a className="experience-back" href="/#about">
        ← About Henry
      </a>
      <header className="experience-hero">
        <div>
          <p className="eyebrow">AIRLINE REVENUE ANALYSIS</p>
          <h1 id="airline-title">Reading the pace behind the revenue.</h1>
          <p className="lede">
            Supporting route pricing and cabin sales strategy through historical
            data, comparable booking progress, and repeatable Excel reporting.
          </p>
        </div>
        <aside
          className="experience-summary"
          aria-label="Experience at a glance"
        >
          <p className="eyebrow">AT A GLANCE</p>
          <h2>Route performance analysis</h2>
          <dl>
            <div>
              <dt>Signals</dt>
              <dd>Total revenue, cabin sales, load factor</dd>
            </div>
            <div>
              <dt>Tools used</dt>
              <dd>Excel, PivotTables, formulas, VBA</dd>
            </div>
            <div>
              <dt>Decisions supported</dt>
              <dd>Pricing, cabin strategy, product exposure</dd>
            </div>
          </dl>
        </aside>
      </header>
      <div className="experience-story">
        <nav className="experience-index" aria-label="Analysis approach">
          <p className="eyebrow">THE APPROACH</p>
          {airlineSteps.map((step, index) => (
            <a key={step.id} href={'#' + step.id}>
              <span aria-hidden="true">0{index + 1}</span>
              {step.title}
            </a>
          ))}
        </nav>
        <div className="experience-steps">
          {airlineSteps.map((step, index) => (
            <section
              className="experience-step"
              id={step.id}
              key={step.id}
              aria-labelledby={step.id + '-title'}
            >
              <span className="step-number" aria-hidden="true">
                0{index + 1}
              </span>
              <div>
                <h2 id={step.id + '-title'}>{step.title}</h2>
                <p>{step.text}</p>
              </div>
            </section>
          ))}
        </div>
      </div>
      <aside className="experience-note">
        <p>
          This case study describes my working approach without confidential
          airline data or quantified performance claims. SQL and Power BI are
          foundational skills; they were not tools used in this role.
        </p>
      </aside>
      <section
        className="experience-next"
        aria-labelledby="experience-next-title"
      >
        <div>
          <h2 id="experience-next-title">
            Business context, carried into the build.
          </h2>
          <p>Explore how I apply that perspective to software.</p>
        </div>
        <a className="button" href="/#work">
          Explore my work ↗
        </a>
      </section>
    </article>
  );
}
function AboutSection() {
  return (
    <section
      className="intro section about-section"
      id="about"
      aria-labelledby="about-title"
    >
      <SectionLabel number="01" label="About Henry" />
      <div className="about-overview">
        <div>
          <h2 id="about-title">
            Commercial curiosity.
            <br />
            Engineering mindset.
          </h2>
          <p className="about-lede">
            A business perspective, brought into software.
          </p>
        </div>
        <img
          className="about-portrait"
          src="/henry-tsao.jpg"
          alt="Henry Tsao seated outdoors in a park"
          width={1477}
          height={1108}
        />
      </div>
      <div className="intro-columns">
        <p>
          I’m Hengmin Tsao. You can call me Henry. 6+ years in aviation industry
          across ground operations, sales and revenue management. This
          experience taught me to read the business behind the numbers. Today, I
          bring that same curiosity to building clear, reliable digital
          experiences.
        </p>
        <div>
          <h3>Business analysis</h3>
          <p>
            I connect historical revenue, cabin sales, and load factors with the
            commercial questions behind pricing and product decisions.
          </p>
        </div>
        <div>
          <h3>Software delivery</h3>
          <p>
            I enjoy understanding why a problem matters, working through its
            constraints, and connecting interfaces, APIs, data, and cloud
            infrastructure into a useful product.
          </p>
        </div>
      </div>
      <div className="about-links">
        <External url="https://github.com/hengmintsao">GitHub</External>
        <External url="https://www.linkedin.com/in/hengmin-tsao-3b3403239/">
          LinkedIn
        </External>
      </div>
    </section>
  );
}
function HomeEntry({
  legacyAbout = false,
  legacyWork = false,
}: {
  legacyAbout?: boolean;
  legacyWork?: boolean;
}) {
  const projects = useProjects();
  const initialTarget = useRef(
    legacyAbout ? 'about' : legacyWork ? 'work' : location.hash.slice(1),
  );
  useEffect(() => {
    if (legacyAbout) history.replaceState({}, '', '/#about');
    if (legacyWork) history.replaceState({}, '', '/#work');
  }, [legacyAbout, legacyWork]);
  useEffect(() => {
    const target = initialTarget.current;
    if (!['about', 'work', 'experience'].includes(target)) return;
    if (target === 'experience' && projects.loading) return;
    const frame = requestAnimationFrame(() => {
      if (location.hash === '#' + target)
        document.getElementById(target)?.scrollIntoView?.({ block: 'start' });
      initialTarget.current = '';
    });
    return () => cancelAnimationFrame(frame);
  }, [projects.loading]);
  return <Home projects={projects} />;
}
function Contact() {
  const [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!config().contactUrl) {
      setStatus(
        'The contact form is not connected in this preview. Please connect through LinkedIn.',
      );
      return;
    }
    const form = e.currentTarget,
      values = Object.fromEntries(new FormData(form));
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch(config().contactUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (response.status !== 202)
        throw Error('Your message could not be accepted. Please try again.');
      setStatus('Your message has been accepted. Thank you for reaching out.');
      form.reset();
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section narrow">
      <p className="eyebrow">CONTACT</p>
      <h1>
        Let’s build
        <br />a useful connection.
      </h1>
      <p className="lede">
        Have a role, project, or business problem in mind? I’d like to hear
        about it.
      </p>
      <form onSubmit={submit} className="contact-form">
        <fieldset disabled={busy}>
          <label>
            Name
            <input name="name" maxLength={100} required autoComplete="name" />
          </label>
          <label>
            Email
            <input
              name="email"
              type="email"
              maxLength={254}
              required
              autoComplete="email"
            />
          </label>
          <label>
            Phone (optional)
            <input name="phone" maxLength={40} autoComplete="tel" />
          </label>
          <label>
            Message
            <textarea
              name="message"
              maxLength={2000}
              minLength={10}
              rows={6}
              required
            />
          </label>
          <label className="honeypot" aria-hidden="true">
            Website
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
          <button className="button">
            {busy ? 'Sending…' : 'Send message ↗'}
          </button>
        </fieldset>
        <p role="status">{status}</p>
      </form>
      <External url="https://www.linkedin.com/in/hengmin-tsao-3b3403239/">
        Connect on LinkedIn
      </External>
    </section>
  );
}
function Detail({ slug }: { slug: string }) {
  const [project, setProject] = useState<PublicProject>(),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setError('');
    setProject(undefined);
    api<{ project: PublicProject }>(
      `/public/projects/${encodeURIComponent(slug)}`,
    )
      .then((r) => {
        if (active) setProject(r.project);
      })
      .catch(() => {
        if (active)
          setError(
            'This project is unavailable. Please return to all projects.',
          );
      });
    return () => {
      active = false;
    };
  }, [slug]);
  return (
    <section className="section narrow">
      {error ? (
        <p role="alert">{error}</p>
      ) : !project ? (
        <p role="status">Loading project…</p>
      ) : (
        <>
          <a href="/#work">← Back to work</a>
          <p className="eyebrow">{project.tags.join(' / ')}</p>
          <h1>{project.title}</h1>
          <p className="lede">{project.summary}</p>
          {project.coverMediaId && (
            <img
              className="cover"
              src={publicMedia(slug, project.coverMediaId)}
              alt={project.coverAlt}
            />
          )}
          <div className="chips">
            {project.technologies.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
          <Blocks blocks={project.blocks} slug={slug} />
          <div className="actions">
            <External url={project.demoUrl}>Live project</External>
            <External url={project.repositoryUrl}>Source code</External>
          </div>
        </>
      )}
    </section>
  );
}
export function PublicSite({ path }: { path: string }) {
  let slug = '';
  try {
    slug = decodeURIComponent(path.slice(10));
  } catch {}
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header />
      <main id="main">
        {path === '/' ? (
          <HomeEntry />
        ) : path === '/projects' || path === '/projects/' ? (
          <HomeEntry legacyWork />
        ) : path.startsWith('/projects/') && slug ? (
          <Detail slug={slug} />
        ) : path === '/experience/airline-revenue' ? (
          <Airline />
        ) : path === '/about' || path === '/about/' ? (
          <HomeEntry legacyAbout />
        ) : path === '/contact' ? (
          <Contact />
        ) : (
          <section className="section narrow">
            <p className="eyebrow">404</p>
            <h1>That page isn’t here.</h1>
            <a href="/">Return home ↗</a>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
