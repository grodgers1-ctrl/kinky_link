import { auth } from "@/lib/auth"
import { SignInButton } from "@/components/auth/sign-in-button"
import { redirect } from "next/navigation"
import Link from "next/link"

const FEATURES = [
  {
    title: "Works with your AI agent",
    body: "First-class MCP server. Plug linklight into Claude Desktop, Claude Code, or Cursor and your agent can drive campaigns end-to-end. See docs.",
    icon: (
      <path d="M12 2 4 6v6c0 5 3.5 9.7 8 10 4.5-.3 8-5 8-10V6l-8-4Zm0 5a3 3 0 0 1 3 3v1h1v6H8v-6h1v-1a3 3 0 0 1 3-3Zm-1 4h2v-1a1 1 0 0 0-2 0v1Z" />
    ),
  },
  {
    title: "Find prospects fast",
    body: "Keyword-to-SERP discovery with Moz DA baked in. Results are cached across accounts so common searches are instant.",
    icon: (
      <path d="M11 4a7 7 0 1 0 4.9 12.02L21 21.12l1.12-1.12-5.1-5.1A7 7 0 0 0 11 4Zm-5 7a5 5 0 1 1 10 0 5 5 0 0 1-10 0Z" />
    ),
  },
  {
    title: "AI drafts in one click",
    body: "Generate a first-pass outreach email with tone control. Every draft ships with a spam score so you catch trigger words before Gmail does.",
    icon: (
      <path d="M12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2Z" />
    ),
  },
  {
    title: "Sends from your Gmail",
    body: "No fake SMTP. Uses your own inbox via Google OAuth so replies come back where you already work.",
    icon: (
      <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm8 8L4 6.5V6l8 5 8-5v.5L12 12Z" />
    ),
  },
  {
    title: "Follow-ups on autopilot",
    body: "Build multi-step sequences with reply detection. When someone responds, the thread pauses automatically.",
    icon: (
      <path d="M12 3v3a6 6 0 0 1 6 6h3l-4 4-4-4h3a4 4 0 0 0-4-4V3Zm-1 18v-3a6 6 0 0 1-6-6H2l4-4 4 4H7a4 4 0 0 0 4 4v3h0Z" />
    ),
  },
  {
    title: "Track what lands",
    body: "Opens, clicks, replies, live links — all on one dashboard. Drag prospects through a pipeline as deals progress.",
    icon: (
      <path d="M3 3v18h18v-2H5V3H3Zm4 12h2v-6H7v6Zm4 0h2V7h-2v8Zm4 0h2v-4h-2v4Z" />
    ),
  },
  {
    title: "Backlink health, from GSC",
    body: "Pulls the links you've already earned from Search Console, checks they're still live, and flags when they drop out of Google's index.",
    icon: (
      <path d="M10.6 13.4a5 5 0 0 1 0-7.07l3-3a5 5 0 0 1 7.07 7.08l-1.5 1.5-1.42-1.42 1.5-1.5a3 3 0 1 0-4.24-4.24l-3 3a3 3 0 0 0 0 4.24l-1.4 1.42ZM13.4 10.6a5 5 0 0 1 0 7.07l-3 3a5 5 0 1 1-7.07-7.08l1.5-1.5 1.42 1.42-1.5 1.5a3 3 0 1 0 4.24 4.24l3-3a3 3 0 0 0 0-4.24l1.4-1.42Z" />
    ),
  },
]

const STEPS = [
  {
    n: "01",
    title: "Connect your agent",
    body: "Sign in, generate an API key, paste one snippet into Claude Desktop / Claude Code / Cursor. 60 seconds.",
  },
  {
    n: "02",
    title: "Prompt the work",
    body: "\"Find 20 SEO blog prospects, draft personalized outreach, save as drafts.\" The agent chains tools, you review.",
  },
  {
    n: "03",
    title: "Approve and send",
    body: "Every send needs your tap. Replies land in your Gmail. Backlinks show up in Search Console automatically.",
  },
]

function FeatureIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary">
      <svg
        className="h-5 w-5 text-brand-secondary"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        {children}
      </svg>
    </div>
  )
}

export default async function Home() {
  const session = await auth()

  if (session?.user) {
    redirect("/dashboard")
  }

  return (
    <div className="bg-brand-surface">
      <header className="border-b border-[#DCDDDE] bg-brand-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <img src="/brand/kinklink_logo.png" alt="" className="h-7 w-auto" />
            <span className="text-lg font-semibold text-brand-secondary">kinkylink</span>
          </div>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/pricing" className="text-[#575858] hover:text-brand-secondary">
              Pricing
            </Link>
            <Link
              href="#features"
              className="hidden text-[#575858] hover:text-brand-secondary sm:inline"
            >
              Features
            </Link>
            <Link
              href="/docs/mcp"
              className="hidden text-[#575858] hover:text-brand-secondary sm:inline"
            >
              Docs
            </Link>
            <Link
              href="#signin"
              className="rounded-lg bg-brand-secondary px-3 py-1.5 text-brand-white hover:bg-[#1f0066]"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-20 md:pt-28">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-brand-accent">
              The MCP server for SEO
            </p>
            <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-brand-secondary sm:text-5xl">
              Give your AI agent backlink superpowers.
            </h1>
            <p className="mt-4 text-lg text-[#575858]">
              Plug linklight into Claude Desktop, Claude Code, or Cursor. Your agent
              finds prospects, drafts outreach, and monitors backlinks — you approve
              and send. Dashboard included, but the agent is the point.
            </p>

            <div className="mt-6 overflow-hidden rounded-xl border border-[#DCDDDE] bg-brand-secondary p-4 font-mono text-sm text-brand-white shadow-sm">
              <div className="flex items-center gap-2 pb-3 text-xs text-[#8B8FBB]">
                <span className="inline-block h-2 w-2 rounded-full bg-brand-accent" />
                <span>Claude</span>
              </div>
              <p><span className="text-[#8B8FBB]">&gt;</span> Find 20 SaaS directories for indie tools</p>
              <p className="mt-1 text-brand-primary">&#10003; 20 prospects added to campaign &ldquo;Q4 launch&rdquo;</p>
              <p className="mt-3"><span className="text-[#8B8FBB]">&gt;</span> Draft personalised outreach for each</p>
              <p className="mt-1 text-brand-primary">&#10003; 20 drafts ready — average spam score A</p>
              <p className="mt-3"><span className="text-[#8B8FBB]">&gt;</span> Track approvals</p>
              <p className="mt-1 text-brand-primary">&#10003; Monitoring inbox for replies</p>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-4 text-sm">
              <Link
                href="/docs/mcp"
                className="rounded-lg bg-brand-accent px-4 py-2 font-medium text-white hover:opacity-90"
              >
                Get your MCP endpoint &rarr;
              </Link>
              <span className="text-[#575858]">or sign in for the dashboard →</span>
            </div>
          </div>

          <div id="signin" className="mx-auto w-full max-w-md">
            <div className="rounded-2xl border border-[#DCDDDE] bg-brand-white p-8 shadow-sm">
              <div className="text-center">
                <img
                  src="/brand/kinklink_logo.png"
                  alt="kinkylink"
                  className="mx-auto h-14 w-auto"
                />
                <h2 className="mt-4 text-xl font-semibold text-brand-secondary">
                  Get started free
                </h2>
                <p className="mt-1 text-sm text-[#575858]">
                  7-day trial. No credit card required.
                </p>
              </div>

              <div className="mt-6">
                <SignInButton session={null} />
              </div>

              <p className="mt-4 text-center text-xs text-[#999999]">
                By continuing you agree to let kinkylink send emails on your behalf and
                read Search Console data. You can revoke access anytime.
              </p>
            </div>
            <p className="mt-4 text-center text-xs text-[#999999]">
              Already a customer? Just{" "}
              <Link href="#signin" className="text-brand-accent hover:underline">
                sign in with Google
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      <section id="features" className="border-t border-[#DCDDDE] bg-brand-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold text-brand-secondary sm:text-3xl">
              Everything you need to build links,
              <br className="hidden sm:inline" />
              nothing you don&apos;t.
            </h2>
            <p className="mt-3 text-[#575858]">
              Built for the operator who&apos;s doing SEO on their own site — not
              an agency running fifty accounts.
            </p>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-[#DCDDDE] bg-brand-surface/40 p-5 transition-colors hover:bg-brand-surface"
              >
                <FeatureIcon>{f.icon}</FeatureIcon>
                <h3 className="mt-4 text-base font-semibold text-brand-secondary">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#575858]">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[#DCDDDE]">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-semibold text-brand-secondary sm:text-3xl">
            How it works
          </h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="border-t border-brand-secondary/10 pt-4">
                <span className="font-mono text-xs text-brand-accent">{s.n}</span>
                <h3 className="mt-2 text-lg font-semibold text-brand-secondary">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm text-[#575858]">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[#DCDDDE] bg-brand-primary">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 py-12 text-center">
          <h2 className="text-2xl font-semibold text-brand-secondary">
            Ready to give your agent the job?
          </h2>
          <p className="max-w-lg text-sm text-[#575858]">
            Sign in, get your MCP endpoint, and your agent can be building links inside two minutes.
          </p>
          <div className="mt-2 w-full max-w-xs">
            <SignInButton session={null} />
          </div>
        </div>
      </section>

      <footer className="border-t border-[#DCDDDE] bg-brand-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-xs text-[#999999] sm:flex-row">
          <div className="flex items-center gap-2">
            <img src="/brand/kinklink_logo.png" alt="" className="h-4 w-auto opacity-70" />
            <span>&copy; {new Date().getFullYear()} kinkylink</span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/pricing" className="hover:text-brand-secondary">
              Pricing
            </Link>
            <Link href="#features" className="hover:text-brand-secondary">
              Features
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
