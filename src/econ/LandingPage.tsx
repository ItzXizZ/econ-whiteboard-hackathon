import { useRef } from 'react'
import whiteboardShot from './assets/whiteboard.webp'

const FACTS = [
  { title: 'Zero connection required', body: 'Every answer is generated on the device.' },
  { title: 'Local models', body: 'The AI lives on the hardware your school already has in the room.' },
  { title: 'Student work stays local', body: 'Questions and answers are stored on the device.' },
]

const STEPS = [
  {
    title: 'Install once',
    body: 'Adam and its models are a one-time download. After setup the laptop works with zero connection.',
    icon: (
      <>
        <path d="M12 3v12" />
        <path d="M7 10l5 5 5-5" />
        <path d="M4 20h16" />
      </>
    ),
  },
  {
    title: 'The model runs on the device',
    body: 'A student draws or asks a question and Bonsai-2, a small language model, answers from the laptop itself.',
    icon: (
      <>
        <rect x="6" y="6" width="12" height="12" rx="2" />
        <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
      </>
    ),
  },
  {
    title: 'Students learn anywhere',
    body: 'A classroom, a community hall, a kitchen table. The tutor works the same in each because it carries everything with it.',
    icon: (
      <>
        <path d="M3 20l6-11 4 6 2-3 6 8z" />
        <circle cx="17" cy="5" r="2" />
      </>
    ),
  },
]

const QUESTIONS = [
  {
    q: 'What happens when the signal drops?',
    a: 'The lesson continues exactly where it was. Adam was built for places with zero signal.',
  },
  {
    q: 'Will it run on the computers we have?',
    a: 'Adam runs on an ordinary laptop. We built and tested it on a Windows laptop and a MacBook. Phones nearby can join through the laptop’s hotspot.',
  },
  {
    q: 'Which subjects and languages does it teach?',
    a: 'Introductory economics: supply and demand, production possibilities, currency markets, loanable funds and bond markets. Lessons are in English for now.',
  },
  {
    q: 'Where does student data go?',
    a: 'It stays on the device. Adam works completely offline, and student questions and answers are stored locally.',
  },
]

const COMPARE_ROWS: [string, string, string, string][] = [
  ['Works with no internet', 'Yes', 'Yes', 'No'],
  ['Answers a student’s own questions', 'Yes', 'No', 'Yes'],
  ['Explains a problem step by step', 'Yes', 'Pre-recorded lessons', 'Yes'],
  ['Student data stays on the device', 'Yes', 'Yes', 'No'],
]

export default function LandingPage({ onStart }: { onStart: () => void }) {
  const rootRef = useRef<HTMLDivElement | null>(null)

  const jumpTo = (id: string) => (event: React.MouseEvent) => {
    event.preventDefault()
    rootRef.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="adam-landing" ref={rootRef}>
      <div className="adam-landing-glow is-1" aria-hidden="true" />
      <div className="adam-landing-glow is-2" aria-hidden="true" />
      <div className="adam-landing-glow is-3" aria-hidden="true" />
      <div className="adam-landing-glow is-4" aria-hidden="true" />

      <header className="adam-landing-header">
        <div className="adam-landing-wrap">
          <nav className="adam-landing-nav adam-glass">
            <a href="#top" className="adam-landing-brand" onClick={jumpTo('top')}>
              Adam
            </a>
            <div className="adam-landing-nav-links">
              <a href="#how" onClick={jumpTo('how')}>
                How it works
              </a>
              <a href="#questions" onClick={jumpTo('questions')}>
                For schools
              </a>
              <a href="#compare" onClick={jumpTo('compare')}>
                Compare
              </a>
              <button type="button" className="adam-landing-btn" onClick={onStart}>
                Open Adam
              </button>
            </div>
          </nav>
        </div>

        <div id="top" className="adam-landing-wrap adam-landing-hero">
          <h1>A tutor that works offline.</h1>
          <p>Adam runs entirely on the device.</p>
          <button type="button" className="adam-landing-btn is-large" onClick={onStart}>
            Start learning
          </button>
        </div>

        <div className="adam-landing-wrap adam-landing-shot-wrap">
          <div className="adam-landing-shot adam-glass">
            <img
              src={whiteboardShot}
              alt="Adam's whiteboard: a student draws a supply and demand graph while Adam guides step 6 of 7"
            />
          </div>
        </div>
      </header>

      <section className="adam-landing-wrap adam-landing-section adam-landing-facts">
        {FACTS.map((fact) => (
          <div key={fact.title} className="adam-landing-card adam-glass">
            <div className="adam-landing-card-title">{fact.title}</div>
            <div className="adam-landing-card-body">{fact.body}</div>
          </div>
        ))}
      </section>

      <section id="how" className="adam-landing-wrap adam-landing-section">
        <div className="adam-landing-heading">
          <div className="adam-landing-kicker">How it works</div>
          <h2>Load it once. Teach with it anywhere.</h2>
        </div>
        <div className="adam-landing-steps">
          {STEPS.map((step, i) => (
            <div key={step.title} className="adam-landing-step adam-glass">
              <div className="adam-landing-step-num">{String(i + 1).padStart(2, '0')}</div>
              <svg
                aria-hidden="true"
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#1C1C1F"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {step.icon}
              </svg>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="questions" className="adam-landing-wrap adam-landing-section">
        <div className="adam-landing-faq adam-glass is-strong">
          <div className="adam-landing-faq-intro">
            <div className="adam-landing-kicker">For schools and community programs</div>
            <h2>The questions teachers ask first.</h2>
          </div>
          <div className="adam-landing-faq-list">
            {QUESTIONS.map((item) => (
              <div key={item.q} className="adam-landing-faq-item">
                <h3>{item.q}</h3>
                <p>{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="compare" className="adam-landing-wrap adam-landing-section">
        <div className="adam-landing-heading is-wide">
          <div className="adam-landing-kicker">Compare</div>
          <h2>A tutor that answers back, offline.</h2>
          <p>Offline libraries deliver lessons and cloud tutors answer questions. Adam does both jobs on one device.</p>
        </div>
        <div className="adam-landing-table adam-glass is-strong">
          <table>
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col" className="is-adam">
                  Adam
                </th>
                <th scope="col">Offline content libraries</th>
                <th scope="col">Cloud AI tutors</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map(([label, adam, library, cloud]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td className="is-adam">{adam}</td>
                  <td className={library === 'No' ? 'is-no' : undefined}>{library}</td>
                  <td className={cloud === 'No' ? 'is-no' : undefined}>{cloud}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="adam-landing-wrap adam-landing-section is-cta">
        <div className="adam-landing-cta">
          <div className="adam-landing-cta-copy">
            <h2>Bring a tutor to your community.</h2>
            <p>Open a whiteboard and work through a lesson with Adam. Everything stays on this laptop.</p>
          </div>
          <button type="button" className="adam-landing-btn is-light" onClick={onStart}>
            Open the whiteboard
          </button>
        </div>
      </section>

      <footer className="adam-landing-wrap adam-landing-footer">
        <span className="adam-landing-brand is-small">Adam</span>
        <div>Runs on Bonsai-2 · Speech by Argmax</div>
      </footer>
    </div>
  )
}
