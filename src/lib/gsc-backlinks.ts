import { supabaseAdmin } from "@/lib/db"

interface BacklinkRecord {
  source_url: string
  target_url: string
  anchor_text?: string
  first_seen?: string
  last_seen?: string
}

export async function fetchGscLinksApi(
  siteUrl: string,
  accessToken: string
): Promise<BacklinkRecord[]> {
  try {
    const response = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/links`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!response.ok) {
      console.error("GSC links API error:", response.status, await response.text())
      return []
    }

    const data = await response.json()
    const linkGroups = data.linkGroups || []
    const backlinks: BacklinkRecord[] = []

    for (const group of linkGroups) {
      const sourceUrl = group.sourceUrl || ""
      const targetUrl = group.targetUrl || siteUrl

      if (!sourceUrl) continue

      const sourceDomain = extractDomain(sourceUrl)
      const ourDomain = extractDomain(siteUrl)
      if (sourceDomain === ourDomain) continue

      const samples = group.samples || []
      if (samples.length > 0) {
        for (const sample of samples) {
          backlinks.push({
            source_url: sample.sourceUrl || sourceUrl,
            target_url: sample.targetUrl || targetUrl,
            anchor_text: group.anchor || sample.anchor || null,
            first_seen: group.firstSeen || getDateString(90),
            last_seen: group.lastSeen || getDateString(0),
          })
        }
      } else {
        backlinks.push({
          source_url: sourceUrl,
          target_url: targetUrl,
          anchor_text: group.anchor || null,
          first_seen: group.firstSeen || getDateString(90),
          last_seen: group.lastSeen || getDateString(0),
        })
      }
    }

    return backlinks
  } catch (error) {
    console.error("GSC links API fetch error:", error)
    return []
  }
}

export async function syncBacklinksToDb(
  userId: string,
  siteId: string,
  siteUrl: string,
  accessToken: string
) {
  const backlinks = await fetchGscLinksApi(siteUrl, accessToken)

  if (backlinks.length === 0) return { new: 0, total: 0 }

  let newCount = 0
  let skipCount = 0

  for (const bl of backlinks) {
    const { data: existing } = await supabaseAdmin
      .from("backlinks")
      .select("id")
      .eq("user_id", userId)
      .eq("source_url", bl.source_url)
      .eq("target_url", bl.target_url)
      .maybeSingle()

    if (existing) {
      await supabaseAdmin
        .from("backlinks")
        .update({ last_seen: bl.last_seen || getDateString(0), updated_at: new Date().toISOString() })
        .eq("id", existing.id)
      skipCount++
    } else {
      await supabaseAdmin
        .from("backlinks")
        .insert({
          user_id: userId,
          site_id: siteId,
          source_url: bl.source_url,
          target_url: bl.target_url,
          anchor_text: bl.anchor_text || null,
          first_seen: bl.first_seen || getDateString(90),
          last_seen: bl.last_seen || getDateString(0),
        })
      newCount++
    }
  }

  return { new: newCount, total: skipCount + newCount }
}

function getDateString(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().split("T")[0]
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "")
  } catch {
    return url
  }
}
