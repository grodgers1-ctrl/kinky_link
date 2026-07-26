import * as crypto from "crypto"

const MOZ_ACCESS_ID = process.env.MOZ_ACCESS_ID!
const MOZ_SECRET_KEY = process.env.MOZ_SECRET_KEY!

interface MozResult {
  domainAuthority: number | null
  linkingDomains: number | null
}

export async function getMozMetrics(domain: string): Promise<MozResult> {
  if (!MOZ_ACCESS_ID || !MOZ_SECRET_KEY) {
    return { domainAuthority: null, linkingDomains: null }
  }

  const expiresAt = Math.floor(Date.now() / 1000) + 300
  const stringToSign = `${MOZ_ACCESS_ID}\n${expiresAt}`
  const signature = crypto
    .createHmac("sha1", MOZ_SECRET_KEY)
    .update(stringToSign)
    .digest("base64")

  try {
    const response = await fetch(
      `https://lsapi.seomoz.com/v2/url_metrics?url=${encodeURIComponent(domain)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-moz-access-id": MOZ_ACCESS_ID,
          "x-moz-expires": expiresAt.toString(),
          "x-moz-signature": signature,
        },
        body: JSON.stringify({ target: domain, scope: "all", limit: 1 }),
      }
    )

    if (!response.ok) return { domainAuthority: null, linkingDomains: null }

    const data = await response.json()
    return {
      domainAuthority: data.da || null,
      linkingDomains: data.ueid || null,
    }
  } catch {
    return { domainAuthority: null, linkingDomains: null }
  }
}
