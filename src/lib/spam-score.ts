export type IssueSeverity = 1 | 2 | 3
export type Grade = "A" | "B" | "C" | "D" | "F"

export interface Issue {
  rule: string
  severity: IssueSeverity
  message: string
}

export interface SpamScoreInput {
  subject: string
  bodyHtml: string
  bodyText?: string
  hasUnsubscribe?: boolean
}

export interface SpamScoreResult {
  score: number
  grade: Grade
  issues: Issue[]
}

const SUBJECT_TRIGGER_WORDS = [
  "free", "guaranteed", "act now", "winner", "100%", "risk-free", "urgent",
  "click here", "limited time", "make money", "cash", "earn", "prize", "credit",
  "cheap", "buy now", "order now", "offer expires", "no cost", "no fees",
  "double your", "extra income", "financial freedom", "no obligation",
  "amazing", "congratulations", "hurry", "instant", "miracle", "revolutionary",
  "sale", "special promotion", "unlimited", "winner", "exclusive deal",
  "lowest price", "increase sales", "increase traffic",
]

const BODY_TRIGGER_WORDS = [
  "act now", "call now", "click here", "click below", "buy direct", "for only",
  "credit card offers", "double your income", "make money fast", "no catch",
  "no purchase necessary", "no strings attached", "risk-free", "satisfaction guaranteed",
  "unsecured credit", "work from home", "click this link", "increase your ranking",
]

const HAS_MERGE_TAG = /\{\{[^}]+\}\}/

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function countMatches(haystack: string, needles: string[]): string[] {
  const hits: string[] = []
  const lower = haystack.toLowerCase()
  for (const n of needles) {
    if (lower.includes(n)) hits.push(n)
  }
  return hits
}

function countUppercaseRatio(s: string): number {
  const letters = s.replace(/[^a-zA-Z]/g, "")
  if (!letters) return 0
  const upper = letters.replace(/[^A-Z]/g, "").length
  return upper / letters.length
}

function countAllCapsWords(s: string): number {
  const words = s.split(/\s+/).filter((w) => w.length >= 3 && /^[A-Z]+$/.test(w))
  return words.length
}

function countLinks(html: string): number {
  const matches = html.match(/<a\s[^>]*href=/gi)
  return matches ? matches.length : 0
}

function htmlByteRatio(html: string): number {
  if (!html) return 0
  const text = stripHtml(html)
  if (!text) return 1
  const markupBytes = html.length - text.length
  return Math.max(0, Math.min(1, markupBytes / html.length))
}

export function scoreEmail(input: SpamScoreInput): SpamScoreResult {
  const issues: Issue[] = []
  const subject = input.subject || ""
  const html = input.bodyHtml || ""
  const text = input.bodyText || stripHtml(html)

  // ---- Subject rules ----
  if (subject.length > 0 && countUppercaseRatio(subject) > 0.5) {
    issues.push({
      rule: "subject_all_caps",
      severity: 3,
      message: "Subject is mostly uppercase — Gmail flags this hard.",
    })
  }

  const bangs = (subject.match(/!/g) || []).length
  if (bangs >= 2) {
    issues.push({
      rule: "subject_exclamations",
      severity: 2,
      message: `Subject has ${bangs} exclamation marks. Aim for zero.`,
    })
  }

  if (/[$€£]/.test(subject)) {
    issues.push({
      rule: "subject_currency",
      severity: 2,
      message: "Currency symbols in the subject line trigger spam filters.",
    })
  }

  if (subject.length > 0 && (subject.length < 3 || subject.length > 70)) {
    issues.push({
      rule: "subject_length",
      severity: 1,
      message:
        subject.length < 3
          ? "Subject is too short."
          : `Subject is ${subject.length} chars — keep it under 70.`,
    })
  }

  const subjectHits = countMatches(subject, SUBJECT_TRIGGER_WORDS)
  for (const w of subjectHits) {
    issues.push({
      rule: `subject_trigger:${w}`,
      severity: 2,
      message: `Subject contains spam trigger phrase "${w}".`,
    })
  }

  if (/^(re|fwd):/i.test(subject.trim())) {
    issues.push({
      rule: "subject_fake_reply",
      severity: 3,
      message: "Using Re:/Fwd: on a cold email is a dark pattern and hurts deliverability.",
    })
  }

  // ---- Body rules ----
  const wordCount = text.split(/\s+/).filter(Boolean).length

  if (wordCount === 0) {
    issues.push({ rule: "body_empty", severity: 3, message: "Email body is empty." })
  } else if (wordCount < 30) {
    issues.push({
      rule: "body_too_short",
      severity: 1,
      message: `Only ${wordCount} words — cold emails under 30 words look templated.`,
    })
  } else if (wordCount > 500) {
    issues.push({
      rule: "body_too_long",
      severity: 1,
      message: `${wordCount} words — recipients skim; aim for under 500.`,
    })
  }

  const markupRatio = htmlByteRatio(html)
  if (markupRatio > 0.7) {
    issues.push({
      rule: "body_html_heavy",
      severity: 2,
      message: "Email is more markup than text — plain-looking emails deliver better.",
    })
  }

  const linkCount = countLinks(html)
  if (linkCount > 3) {
    issues.push({
      rule: "body_link_count",
      severity: 2,
      message: `${linkCount} links in a cold email — keep it to 1-2.`,
    })
  }

  if (wordCount > 0 && linkCount / wordCount > 0.02) {
    issues.push({
      rule: "body_link_density",
      severity: 2,
      message: "High link-to-text ratio. Trim links or add more copy.",
    })
  }

  if (html && !text.trim()) {
    issues.push({
      rule: "body_image_only",
      severity: 3,
      message: "No text content detected — image-only emails go straight to spam.",
    })
  }

  if (HAS_MERGE_TAG.test(html) || HAS_MERGE_TAG.test(subject)) {
    issues.push({
      rule: "unrendered_merge_tag",
      severity: 3,
      message: "Unrendered {{merge tag}} present — recipient will see the raw placeholder.",
    })
  }

  const bodyCaps = countAllCapsWords(text)
  if (bodyCaps > 2) {
    issues.push({
      rule: "body_caps_words",
      severity: 2,
      message: `${bodyCaps} ALL-CAPS words in body — reads like shouting to filters.`,
    })
  }

  if (/[!?]{3,}|\.{4,}/.test(text)) {
    issues.push({
      rule: "body_repeated_punct",
      severity: 1,
      message: "Repeated punctuation (!!!, ????, .....) hurts deliverability.",
    })
  }

  const bodyHits = countMatches(text, BODY_TRIGGER_WORDS)
  for (const w of bodyHits) {
    issues.push({
      rule: `body_trigger:${w}`,
      severity: 2,
      message: `Body contains spam trigger phrase "${w}".`,
    })
  }

  // ---- Structural rules ----
  const hasUnsub =
    input.hasUnsubscribe ??
    /unsubscribe|opt[- ]?out|reply\s+.*(stop|remove)/i.test(text)
  if (!hasUnsub) {
    issues.push({
      rule: "missing_unsubscribe",
      severity: 3,
      message: "No unsubscribe or opt-out mechanism found.",
    })
  }

  if (html && !input.bodyText) {
    issues.push({
      rule: "missing_plain_text",
      severity: 2,
      message: "No plain-text alternative — HTML-only emails are more likely to be marked spam.",
    })
  }

  const signaturePattern = /(thanks|thank you|regards|best|cheers|sincerely)[,\s]/i
  if (text && !signaturePattern.test(text)) {
    issues.push({
      rule: "missing_signoff",
      severity: 1,
      message: "No sign-off detected (Thanks, Regards, Best, ...).",
    })
  }

  // ---- Score ----
  const raw = issues.reduce((s, i) => s + i.severity, 0)
  const score = Math.max(0, Math.min(10, 10 - raw * 0.5))
  const grade: Grade =
    score >= 8 ? "A" : score >= 6 ? "B" : score >= 4 ? "C" : score >= 2 ? "D" : "F"

  return { score: Math.round(score * 10) / 10, grade, issues }
}
