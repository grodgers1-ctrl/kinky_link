// scripts/verify-email-cascade.mts
// Runs each provider individually against a well-known domain, then runs the
// cascade. Prints outcomes so it's obvious which providers are configured.
// Run: cd linklight && npx tsx --env-file=.env.local scripts/verify-email-cascade.mts [domain]
import { hunterProvider } from "@/lib/hunter"
import { tombaProvider } from "@/lib/email-providers/tomba"
import { apolloProvider } from "@/lib/email-providers/apollo"
import { contactoutProvider } from "@/lib/email-providers/contactout"
import { findEmailAcrossProviders } from "@/lib/email-cascade"

const domain = process.argv[2] || "stripe.com"
console.log(`Testing providers against ${domain}\n`)

for (const p of [hunterProvider, tombaProvider, apolloProvider, contactoutProvider]) {
  const res = await p.find(domain)
  const status = res.email
    ? `OK  ${res.email}`
    : `SKIP ${res.error || "unknown"}`
  console.log(`  ${p.name.padEnd(12)} ${status}`)
}

console.log(`\nCascade:`)
const cascade = await findEmailAcrossProviders(domain)
if (cascade.email) {
  console.log(`  WINNER: ${cascade.source} → ${cascade.email}`)
} else {
  console.log(`  All providers missed. Attempts:`)
  cascade.attempts.forEach((a) => console.log(`    - ${a.name}: ${a.error || "no email"}`))
}
console.log(`\nCASCADE PASS (any-non-crash)`)
