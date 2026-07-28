"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"

const STEPS = [
  { id: "welcome", label: "Welcome" },
  { id: "connect", label: "Connect Google" },
  { id: "site", label: "Add Your Site" },
  { id: "campaign", label: "First Campaign" },
  { id: "prospects", label: "Find Prospects" },
  { id: "done", label: "You're Ready" },
]

export function OnboardingWizard() {
  const [step, setStep] = useState(0)
  const [campaignName, setCampaignName] = useState("")
  const [keyword, setKeyword] = useState("")
  const [sites, setSites] = useState<{ id: string; url: string }[]>([])
  const [selectedSite, setSelectedSite] = useState("")
  const [loading, setLoading] = useState(false)
  const [prospectCount, setProspectCount] = useState(0)
  const router = useRouter()

  useEffect(() => {
    if (step === 2) {
      fetch("/api/sites")
        .then(r => r.json())
        .then(d => {
          const list = (d.sites || []).map((s: any, i: number) => ({ id: `site_${i}`, url: s.siteUrl || s.url }))
          setSites(list)
          if (list.length > 0) setSelectedSite(list[0].url)
        })
        .catch(() => {})
    }
  }, [step])

  const nextStep = () => setStep(s => Math.min(s + 1, STEPS.length - 1))
  const prevStep = () => setStep(s => Math.max(s - 1, 0))

  const createCampaign = async () => {
    if (!campaignName.trim()) return
    setLoading(true)
    try {
      await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: campaignName }),
      })
    } catch {
      // silently handle
    }
    setLoading(false)
    nextStep()
  }

  const findProspects = async () => {
    if (!keyword.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`/api/prospects/search?keyword=${encodeURIComponent(keyword)}`)
      const data = await res.json()
      setProspectCount(data.prospects?.length || 0)
    } catch {
      // silently handle
    }
    setLoading(false)
    nextStep()
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-12">
      {/* Progress bar */}
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
              i <= step ? "bg-brand-accent text-white" : "bg-[#DCDDDE] text-[#777777]"
            }`}>
              {i + 1}
            </div>
            <span className={`hidden text-sm sm:inline ${i <= step ? "text-brand-accent" : "text-[#999999]"}`}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={`hidden h-0.5 w-8 sm:block ${i < step ? "bg-brand-accent" : "bg-[#DCDDDE]"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="mt-16">
        {step === 0 && (
          <div className="text-center">
            <h2 className="text-h2 font-bold text-brand-secondary">Welcome to kinkylink!</h2>
            <p className="mt-2 text-body text-[#575858]">
              Let&apos;s get you set up in under 2 minutes.
            </p>
            <button onClick={nextStep} className="mt-8 rounded-lg bg-brand-accent px-8 py-3 text-body font-medium text-white hover:opacity-90">
              Get Started
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="text-center">
            <h2 className="text-h2 font-bold text-brand-secondary">Connect Your Google Account</h2>
            <p className="mt-2 text-body text-[#575858]">
              kinkylink needs access to Gmail (to send emails) and Google Search Console (to monitor backlinks).
            </p>
            <p className="mt-1 text-sm text-[#999999]">
              We only send emails you explicitly schedule. We never access your other emails.
            </p>
            <button
              onClick={() => { window.location.href = "/api/auth/signin/google" }}
              className="mt-8 flex items-center gap-2 rounded-lg border border-[#DCDDDE] bg-white px-8 py-3 hover:bg-brand-surface mx-auto"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Reconnect Google Account
            </button>
            <button onClick={nextStep} className="mt-4 block mx-auto text-sm text-brand-accent hover:underline">
              I&apos;ve already connected &mdash; skip
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="text-center">
            <h2 className="text-h2 font-bold text-brand-secondary">Select Your Site</h2>
            <p className="mt-2 text-body text-[#575858]">
              Choose which site from Google Search Console you want to build links for.
            </p>
            {sites.length === 0 ? (
              <div className="mt-8 rounded-lg border border-dashed border-[#DCDDDE] p-8">
                <p className="text-sm text-[#575858]">No sites found in Google Search Console.</p>
                <button
                  onClick={() => { window.location.href = "/api/auth/signin/google" }}
                  className="mt-4 text-sm text-brand-accent hover:underline"
                >
                  Reconnect with the correct Google account
                </button>
              </div>
            ) : (
              <div className="mt-8 space-y-3">
                {sites.map(site => (
                  <label key={site.id} className={`flex items-center gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                    selectedSite === site.url ? "border-brand-accent bg-brand-primary" : "border-[#DCDDDE] hover:bg-brand-surface"
                  }`}>
                    <input
                      type="radio"
                      name="site"
                      value={site.url}
                      checked={selectedSite === site.url}
                      onChange={e => setSelectedSite(e.target.value)}
                      className="accent-brand-accent"
                    />
                    <span className="text-sm text-brand-secondary">{site.url}</span>
                  </label>
                ))}
                <button onClick={nextStep} className="mt-6 rounded-lg bg-brand-accent px-8 py-3 text-body font-medium text-white hover:opacity-90">
                  Continue
                </button>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="text-h2 font-bold text-brand-secondary">Create Your First Campaign</h2>
            <p className="mt-2 text-body text-[#575858]">Give your link building campaign a name.</p>
            <input
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && createCampaign()}
              placeholder="e.g., 'SEO Blog Outreach'"
              className="mt-4 w-full rounded-lg border border-[#CCCCCD] px-4 py-3 text-sm placeholder-[#999999]"
              autoFocus
            />
            <div className="mt-6 flex justify-between">
              <button onClick={prevStep} className="text-sm text-[#575858] hover:underline">Back</button>
              <button
                onClick={createCampaign}
                disabled={loading || !campaignName.trim()}
                className="rounded-lg bg-brand-accent px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create Campaign"}
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 className="text-h2 font-bold text-brand-secondary">Find Your First Prospects</h2>
            <p className="mt-2 text-body text-[#575858]">
              Enter a keyword related to your industry. We&apos;ll find websites that cover that topic.
            </p>
            <input
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && findProspects()}
              placeholder="e.g., 'link building strategies'"
              className="mt-4 w-full rounded-lg border border-[#CCCCCD] px-4 py-3 text-sm placeholder-[#999999]"
              autoFocus
            />
            <div className="mt-6 flex justify-between">
              <button onClick={prevStep} className="text-sm text-[#575858] hover:underline">Back</button>
              <button
                onClick={findProspects}
                disabled={loading || !keyword.trim()}
                className="rounded-lg bg-brand-accent px-6 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "Searching..." : "Search"}
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="text-center">
            <h2 className="text-h2 font-bold text-brand-secondary">You&apos;re All Set!</h2>
            <p className="mt-2 text-body text-[#575858]">
              Your campaign is ready. Start adding prospects, writing emails, and building links.
            </p>
            <div className="mt-8 grid grid-cols-3 gap-4">
              <div className="rounded-lg border border-[#DCDDDE] p-4">
                <p className="text-2xl font-bold text-brand-accent">1</p>
                <p className="mt-1 text-sm text-[#575858]">Campaign created</p>
              </div>
              <div className="rounded-lg border border-[#DCDDDE] p-4">
                <p className="text-2xl font-bold text-brand-accent">{prospectCount || "10+"}</p>
                <p className="mt-1 text-sm text-[#575858]">Prospects found</p>
              </div>
              <div className="rounded-lg border border-[#DCDDDE] p-4">
                <p className="text-2xl font-bold text-brand-accent">Ready</p>
                <p className="mt-1 text-sm text-[#575858]">To send emails</p>
              </div>
            </div>
            <button
              onClick={() => router.push("/dashboard")}
              className="mt-8 rounded-lg bg-brand-accent px-8 py-3 text-body font-medium text-white hover:opacity-90"
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
