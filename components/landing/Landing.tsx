import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ButtonLink } from "@/components/button/Button";
import { BankMark } from "@/components/brand/BankMark";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { appRequestHref, APP_REQUEST_EMAIL } from "@/lib/app-request";
import { ACCOUNTS, FAQ, REAL_REVIEW, SOCIAL_PROOF, TICKER } from "@/lib/landing/content";
import { Audience } from "./Audience";
import { HeroPlay } from "./HeroPlay";
import { ArrowIcon, BoltIcon, CheckIcon, LockIcon, PhoneIcon } from "./icons";
import { Reveal } from "./Reveal";
import { StatCount } from "./StatCount";
import { StickyCta } from "./StickyCta";
import { Story } from "./Story";
import styles from "./landing.module.css";

const CATEGORIES = [
  { n: "Groceries", c: "var(--b-living)" },
  { n: "Milk tea", c: "var(--b-fun)" },
  { n: "Load", c: "var(--b-invest)" },
  { n: "Tuition", c: "var(--b-sinking)" },
  { n: "Jeep & trike", c: "var(--b-rent)" },
  { n: "Gifts", c: "var(--b-dost)" },
];

const cx = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(" ");
const v = (vars: Record<string, string | number>) => vars as CSSProperties;

/** Hand-drawn marker stroke under a word. `pathLength=1` lets CSS draw it with one dash. */
/** Five stars, drawn. The text alternative is on the figure (score + who). */
function Stars() {
  return (
    <span className={styles.stars} role="img" aria-label="Five stars">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} viewBox="0 0 20 20" width={16} height={16} aria-hidden="true" style={v({ "--i": i })}>
          <path d="M10 1.8l2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L10 14.5l-5.1 2.7 1.1-5.6L1.8 7.7l5.7-.7z" />
        </svg>
      ))}
    </span>
  );
}

function Scribble({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 300 24" preserveAspectRatio="none" aria-hidden="true">
      <path d="M4 16 C 60 6, 120 4, 180 9 S 270 18, 296 8" pathLength={1} />
    </svg>
  );
}

/** The public landing page at "/" (Persuade mode). Server-rendered; the playground, story, tabs, count and reveals are client islands. */
export function Landing({ people }: { people: number }) {
  return (
    <div className={styles.page}>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>

      <header className={styles.nav}>
        <div className={styles.navIn}>
          <Link href="/" className={styles.brand} aria-label="Salin home">
            <Image src="/logo.png" alt="" width={26} height={24} priority />
            <span>Salin</span>
          </Link>
          <nav className={styles.links} aria-label="Page sections">
            <a href="#how">How it works</a>
            <a href="#who">Who it&apos;s for</a>
            <a href="#features">Features</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className={styles.navActs}>
            <ThemeToggle />
            <Link href="/sign-in" className={styles.signIn}>
              Sign in
            </Link>
            <ButtonLink variant="primary" href="/sign-up" className={styles.navCta}>
              Start free
            </ButtonLink>
          </div>
        </div>
      </header>

      <main id="main">
        {/* ================= hero */}
        <section className={styles.hero} aria-labelledby="hero-h">
          <div className={styles.ruled} aria-hidden="true" />
          <div className={styles.heroCopy}>
            <p className={cx(styles.pill, styles.in)} style={v({ "--n": 0 })}>
              <span className={styles.live} aria-hidden="true" />
              {people}+ people already giving every peso a job
            </p>
            <h1 id="hero-h" className={styles.in} style={v({ "--n": 1 })}>
              Know what&apos;s fine to spend{" "}
              <span className={styles.today}>
                today.
                <Scribble className={styles.scribble} />
              </span>
            </h1>
            <p className={cx(styles.lede, styles.in)} style={v({ "--n": 2 })}>
              Allowance, stipend, first paycheck or three side gigs: tell Salin what you have and when more is coming. Every morning you get one honest number, and every peso gets a job.
            </p>
            <div className={cx(styles.ctas, styles.in)} style={v({ "--n": 3 })} data-hero-cta>
              <ButtonLink variant="primary" href="/sign-up" className={styles.big} data-testid="landing-cta">
                Start tracking for free <ArrowIcon width={18} height={18} />
              </ButtonLink>
              <a className={styles.textLink} href="#how">
                See how it works
              </a>
            </div>
            <ul className={cx(styles.fine, styles.in)} style={v({ "--n": 4 })}>
              <li>
                <CheckIcon width={15} height={15} /> Free, no credit card
              </li>
              <li>
                <CheckIcon width={15} height={15} /> Set up in 2 minutes
              </li>
              <li>
                <CheckIcon width={15} height={15} /> No bank login, ever
              </li>
            </ul>
            <figure className={cx(styles.micro, styles.in)} style={v({ "--n": 5 })}>
              <Stars />
              <blockquote>&ldquo;{REAL_REVIEW.short}&rdquo;</blockquote>
              <figcaption>
                {REAL_REVIEW.score} from a UP Tacloban student
              </figcaption>
            </figure>
          </div>
          <HeroPlay />
        </section>

        {/* ================= ticker */}
        <div className={styles.ticker} aria-hidden="true">
          <div className={styles.tickTrack}>
            {[0, 1].map((copy) => (
              <div key={copy} className={styles.tickSet}>
                {TICKER.map((t) => (
                  <span key={t.t} className={styles.tick} style={v({ "--c": t.c })}>
                    <i />
                    {t.t}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ================= works with */}
        <section className={styles.works} aria-labelledby="works-h">
          <Reveal className={styles.worksIn}>
            <h2 id="works-h" className={styles.worksH}>
              Keep track of the money in the accounts you already use
            </h2>
            <ul className={styles.banks}>
              {ACCOUNTS.map((a, i) => (
                <li key={a.name} style={v({ "--i": i })}>
                  <BankMark name={a.name} size="lg" className={styles.bankMark} />
                  <b>{a.name}</b>
                  <small>{a.kind}</small>
                </li>
              ))}
            </ul>
            <p className={styles.worksNote}>Add them by name. No login, no linking. Salin isn&apos;t affiliated with these banks or wallets.</p>
          </Reveal>
        </section>

        {/* ================= who */}
        <section id="who" className={styles.section} aria-labelledby="who-h">
          <Reveal className={styles.head}>
            <p className={styles.kicker}>Made for how you actually get money</p>
            <h2 id="who-h">
              Whatever comes in, <em>there&apos;s a number for today.</em>
            </h2>
          </Reveal>
          <Reveal delay={80}>
            <Audience />
          </Reveal>
        </section>

        {/* ================= how (scroll story) */}
        <section id="how" className={styles.deep} aria-labelledby="how-h">
          <div className={styles.deepIn}>
            <Reveal className={styles.head}>
              <p className={styles.kicker}>How it works</p>
              <h2 id="how-h">Two minutes to set up. Then a number every morning.</h2>
            </Reveal>
            <Story />
          </div>
        </section>

        {/* ================= features (bento) */}
        <section id="features" className={styles.section} aria-labelledby="feat-h">
          <Reveal className={styles.head}>
            <p className={styles.kicker}>What you get</p>
            <h2 id="feat-h">
              Simple on the surface. <em>Plenty underneath.</em>
            </h2>
          </Reveal>

          <div className={styles.bento}>
            <Reveal as="article" spotlight className={cx(styles.tile, styles.tLog)}>
              <div className={styles.tileTxt}>
                <span className={styles.tIcon}>
                  <BoltIcon width={20} height={20} />
                </span>
                <h3>Log it in five seconds</h3>
                <p>Amount, category, done. Log it the moment it happens and your number stays true.</p>
              </div>
              <div className={styles.logSheet} aria-hidden="true">
                <div className={styles.logAmt}>₱180</div>
                <div className={styles.logRow}>
                  <span>
                    <i style={v({ "--c": "var(--b-living)" })} /> Lunch
                  </span>
                  <span>Today, 12:40</span>
                </div>
                <div className={styles.logBtn}>
                  <span className={styles.logIdle}>Log it</span>
                  <span className={styles.logDone}>
                    <CheckIcon width={15} height={15} /> Logged · ₱214 a day left
                  </span>
                </div>
              </div>
            </Reveal>

            <Reveal as="article" spotlight className={cx(styles.tile, styles.tNum)} delay={60}>
              <div className={styles.tileTxt}>
                <h3>A number for every day</h3>
                <p>Your spending money is shared over the days until more arrives. Underspend and tomorrow grows.</p>
              </div>
              <div className={styles.dotsBig} aria-hidden="true">
                <b>
                  About <em>₱214</em> a day
                </b>
                <div>
                  {Array.from({ length: 21 }, (_, i) => (
                    <i key={i} data-past={i < 4 ? "" : undefined} style={v({ "--i": i })} />
                  ))}
                </div>
              </div>
            </Reveal>

            <Reveal as="article" spotlight className={cx(styles.tile, styles.tBuckets)} delay={120}>
              <div className={styles.tileTxt}>
                <h3>Every peso has a job</h3>
                <p>Buckets keep spending, savings and set-aside money apart, so you always know what&apos;s free.</p>
              </div>
              <div className={styles.ribbons} aria-hidden="true">
                {(
                  [
                    ["Spending", "var(--b-living)", 0.9],
                    ["Fun", "var(--b-fun)", 0.45],
                    ["Emergency", "var(--b-emergency)", 0.7],
                    ["Invest", "var(--b-invest)", 0.38],
                    ["Tax", "var(--b-tax)", 0.25],
                  ] as const
                ).map(([n, c, h], i) => (
                  <div key={n} style={v({ "--c": c, "--h": h, "--d": `${i * 70}ms` })}>
                    <i />
                    <span>{n}</span>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal as="article" spotlight className={cx(styles.tile, styles.tCats)} delay={60}>
              <div className={styles.tileTxt}>
                <h3>Categories that sound like your life</h3>
                <p>Not &ldquo;Discretionary&rdquo;. Milk tea, load and jeep fare. Make your own, and move any of them to another bucket.</p>
              </div>
              <div className={styles.chips} aria-hidden="true">
                {CATEGORIES.map((c, i) => (
                  <span key={c.n} style={v({ "--c": c.c, "--d": `${i * 60}ms` })}>
                    <i /> {c.n}
                  </span>
                ))}
                <span className={styles.chipAdd}>+ New</span>
              </div>
            </Reveal>

            <Reveal as="article" spotlight className={cx(styles.tile, styles.tMove)} delay={120}>
              <div className={styles.tileTxt}>
                <h3>It tells you what to send where</h3>
                <p>When money arrives, Salin lists the transfers. You send them in your bank app, then tick them. It never moves your money.</p>
              </div>
              <ul className={styles.moves} aria-hidden="true">
                {[
                  ["Send ₱300 to MariBank", "Kept aside"],
                  ["Send ₱500 to GCash", "Spending"],
                  ["Keep ₱700 in Cash", "Already there"],
                ].map(([a, b], i) => (
                  <li key={a} style={v({ "--d": `${450 + i * 380}ms` })}>
                    <span className={styles.box}>
                      <CheckIcon width={13} height={13} />
                    </span>
                    <span>
                      <b>{a}</b>
                      <small>{b}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal as="article" spotlight className={cx(styles.tile, styles.tReview)} delay={60}>
              <div className={styles.tileTxt}>
                <h3>Five minutes a week</h3>
                <p>Look back, fix one thing, close the week.</p>
              </div>
              <div className={styles.week} aria-hidden="true">
                {["Every peso has a job", "Transfers made", "Spending above zero"].map((t, i) => (
                  <span key={t} style={v({ "--d": `${300 + i * 260}ms` })}>
                    <i>
                      <CheckIcon width={12} height={12} />
                    </i>
                    {t}
                  </span>
                ))}
                <span className={styles.weekStamp}>Week closed</span>
              </div>
            </Reveal>

            <Reveal as="article" className={cx(styles.tile, styles.tPrivate)} delay={120}>
              <div className={styles.tileTxt}>
                <span className={styles.tIcon}>
                  <LockIcon width={20} height={20} />
                </span>
                <h3>Private by design</h3>
                <p>No bank login, ever. Your numbers belong to your account, and only you can read them.</p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ================= social proof */}
        <section className={styles.proof} aria-labelledby="proof-h" data-testid="social-proof">
          <div className={styles.proofIn}>
            <Reveal className={styles.proofHead}>
              <p className={styles.kicker}>Real people, real money</p>
              <h2 id="proof-h" className={styles.statWrap}>
                <StatCount value={people} />
                <span className={styles.statL}>{SOCIAL_PROOF.label}, and counting.</span>
              </h2>
              <div className={styles.faces} aria-hidden="true">
                {SOCIAL_PROOF.quotes.map((q) => (
                  <span key={q.name} style={v({ "--c": q.hue })}>
                    {q.name.slice(0, 1)}
                  </span>
                ))}
                <span className={styles.facesMore}>+{Math.max(0, people - SOCIAL_PROOF.quotes.length)}</span>
              </div>
            </Reveal>

            <div className={styles.quotes}>
              <Reveal as="figure" className={cx(styles.quote, styles.quoteBig)} style={v({ "--c": "var(--sun)" })} >
                <div className={styles.realTop}>
                  <Stars />
                  <span className={styles.score}>{REAL_REVIEW.score}</span>
                  <span className={styles.realTag}>{REAL_REVIEW.source}</span>
                </div>
                <blockquote>{REAL_REVIEW.quote}</blockquote>
                <figcaption>
                  <span className={styles.avatar} aria-hidden="true">
                    UP
                  </span>
                  <span>
                    <b>{REAL_REVIEW.who}</b>
                    <small>Tested Salin on the web</small>
                  </span>
                </figcaption>
              </Reveal>
              {SOCIAL_PROOF.quotes.map((q, i) => (
                <Reveal as="figure" key={q.name} className={styles.quote} delay={((i + 1) % 3) * 90} style={v({ "--c": q.hue })}>
                  <span className={styles.qMark} aria-hidden="true">
                    &ldquo;
                  </span>
                  <blockquote>{q.quote}</blockquote>
                  <figcaption>
                    <span className={styles.avatar} aria-hidden="true">
                      {q.name.slice(0, 1)}
                    </span>
                    <span>
                      <b>{q.name}</b>
                      <small>{q.role}</small>
                    </span>
                  </figcaption>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ================= phone app */}
        <section className={styles.section} aria-labelledby="app-h">
          <Reveal className={styles.appBand}>
            <div className={styles.appIcon}>
              <PhoneIcon width={28} height={28} />
            </div>
            <div>
              <h2 id="app-h">Salin on your phone</h2>
              <p>Log on the go with the Android app. Same account, so everything shows up here too. For now it&apos;s shared by request.</p>
            </div>
            <ButtonLink variant="soft" href={appRequestHref()} data-testid="landing-app-request">
              Request the Android app
            </ButtonLink>
          </Reveal>
        </section>

        {/* ================= faq */}
        <section id="faq" className={cx(styles.section, styles.faqWrap)} aria-labelledby="faq-h">
          <Reveal className={styles.faqHead}>
            <p className={styles.kicker}>Questions</p>
            <h2 id="faq-h">The short answers.</h2>
            <p className={styles.faqMore}>
              Something else? <a href={`mailto:${APP_REQUEST_EMAIL}`}>Email us</a>.
            </p>
          </Reveal>
          <Reveal className={styles.faq} delay={80}>
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>
                  {f.q}
                  <i aria-hidden="true" />
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </Reveal>
        </section>

        {/* ================= final cta */}
        <section className={styles.final} aria-labelledby="final-h" data-final-cta>
          <div className={styles.finalGhost} aria-hidden="true">
            ₱214
          </div>
          <Reveal className={styles.finalIn}>
            <h2 id="final-h">Ready to feel good about your money?</h2>
            <p>Join students, workers and everyday planners who start each day knowing what&apos;s fine to spend.</p>
            <div className={styles.finalActs}>
              <ButtonLink variant="primary" href="/sign-up" className={cx(styles.big, styles.finalBtn)} data-testid="landing-cta-final">
                Start free <ArrowIcon width={18} height={18} />
              </ButtonLink>
              <a className={styles.finalLink} href={appRequestHref()}>
                Request the Android app
              </a>
            </div>
          </Reveal>
        </section>
      </main>

      <StickyCta />

      <footer className={styles.foot}>
        <div className={styles.footIn}>
          <nav aria-label="Footer">
            <Link href="/sign-in">Sign in</Link>
            <Link href="/sign-up">Start free</Link>
            <a href={`mailto:${APP_REQUEST_EMAIL}`}>Contact</a>
          </nav>
          <p>Know what&apos;s left. Give every peso a job.</p>
        </div>
        <p className={styles.wordmark} aria-hidden="true">
          salin
        </p>
      </footer>
    </div>
  );
}
