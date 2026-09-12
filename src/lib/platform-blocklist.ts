// Platform domains that verify fine (they really do link to the competitor)
// but are worthless for outreach: app stores, social profiles, UGC, review
// aggregators, and SEO/data profiles. Filtered at the candidate stage so they
// never consume a page fetch or a Moz DA row. Subdomain-aware:
// ie.trustpilot.com is covered by trustpilot.com.
//
// Deliberately NOT blocked: medium.com / substack.com / dev.to (an author
// there can be pitched), forums, blogs of any size.

const PLATFORM_DOMAINS: readonly string[] = [
  // App stores
  "play.google.com",
  "apps.apple.com",
  "itunes.apple.com",
  "appgrooves.com",
  "apkpure.com",
  // Social / UGC
  "x.com",
  "twitter.com",
  "facebook.com",
  "linkedin.com",
  "instagram.com",
  "tiktok.com",
  "pinterest.com",
  "threads.net",
  "youtube.com",
  "vimeo.com",
  "reddit.com",
  "quora.com",
  // Code / dev platforms
  "github.com",
  "gitlab.com",
  "bitbucket.org",
  "stackoverflow.com",
  "npmjs.com",
  // Review aggregators & scam-checkers (pay-to-play or no editorial contact)
  "trustpilot.com",
  "g2.com",
  "capterra.com",
  "getapp.com",
  "softwareadvice.com",
  "saasworthy.com",
  "scamadviser.com",
  "sitejabber.com",
  "producthunt.com",
  "alternativeto.net",
  "slant.co",
  "sourceforge.net",
  "crozdesk.com",
  // Company data / SEO profiles
  "crunchbase.com",
  "semrush.com",
  "ahrefs.com",
  "similarweb.com",
  "builtwith.com",
  "cbinsights.com",
  "tracxn.com",
  "ipaddress.com",
  // Reference
  "wikipedia.org",
  "wikidata.org",
]

const PLATFORM_SET = new Set(PLATFORM_DOMAINS)

/** True when `domain` is (or is a subdomain of) a blocked platform domain. */
export function isPlatformDomain(domain: string): boolean {
  const d = domain.toLowerCase()
  for (const p of PLATFORM_SET) {
    if (d === p || d.endsWith(`.${p}`)) return true
  }
  return false
}
