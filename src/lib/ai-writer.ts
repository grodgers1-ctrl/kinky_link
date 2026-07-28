import OpenAI from "openai"

let _openai: OpenAI | null = null
function getOpenai() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured")
  }
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return _openai
}

interface AiDraftParams {
  topic: string
  articleTitle?: string
  siteName?: string
  prospectName?: string
  tone: "friendly" | "professional" | "direct"
  campaignType: "outreach" | "guest_post" | "resource_page" | "skyscraper" | "link_reclamation"
}

const SYSTEM_PROMPTS: Record<string, string> = {
  friendly: "You are a warm, personable link building specialist. Write conversational emails that build genuine rapport. Use natural language and a human touch.",
  professional: "You are a polished marketing professional. Write concise, well-structured outreach emails that demonstrate competence and respect for the recipient's time.",
  direct: "You are a direct, no-nonsense business developer. Write short, value-focused emails that get straight to the point. Respect busy people's time.",
}

const CAMPAIGN_PROMPTS: Record<string, string> = {
  outreach: "Write an outreach email asking the recipient to link to the sender's content. Mention appreciation for the recipient's work first.",
  guest_post: "Write a guest post pitch email. Propose a specific topic that would add value to the recipient's audience. Mention writing credentials briefly.",
  resource_page: "Write an email suggesting the sender's resource be added to the recipient's existing resource page. Explain why it's useful for their readers.",
  skyscraper: "Write an email about an enhanced version of a topic the recipient has already covered. Frame it as a useful supplement, not a replacement.",
  link_reclamation: "Write a broken link replacement email. Politely notify them of a broken link on their page and offer the sender's content as a replacement.",
}

export async function generateEmailDraft(params: AiDraftParams): Promise<{
  subject: string
  bodyHtml: string
  bodyText: string
}> {
  const campaignInstructions = CAMPAIGN_PROMPTS[params.campaignType] || CAMPAIGN_PROMPTS.outreach
  const systemPrompt = SYSTEM_PROMPTS[params.tone] || SYSTEM_PROMPTS.friendly

  const userPrompt = `Write a link building outreach email.

Context:
- Topic: ${params.topic}
- Their article title: ${params.articleTitle || "(not specified)"}
- Your site name: ${params.siteName || "(your website)"}
- Recipient name: ${params.prospectName || "(unknown)"}

Campaign type: ${params.campaignType}
Instructions: ${campaignInstructions}

Format your response as JSON with two fields:
{
  "subject": "The email subject line (max 10 words)",
  "body": "The email body as plain text, suitable for both HTML and text versions. Use {{first_name}}, {{site_name}} etc. as merge tags where appropriate."
}

Keep the body under 150 words. Do not use markdown formatting.`

  try {
    const response = await getOpenai().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 400,
      response_format: { type: "json_object" },
    })

    const content = response.choices[0]?.message?.content
    if (!content) throw new Error("No response from AI")

    const parsed = JSON.parse(content)
    const bodyText = parsed.body || ""
    const bodyHtml = bodyText
      .split("\n\n")
      .map((p: string) => `<p>${p.trim()}</p>`)
      .join("\n")
      .replace(/\n/g, "<br/>")

    return {
      subject: parsed.subject || `Let's collaborate on ${params.topic}`,
      bodyHtml,
      bodyText,
    }
  } catch (error: any) {
    console.error("AI write error:", error)
    throw new Error("Failed to generate email draft")
  }
}

const userUsage = new Map<string, { count: number; date: string }>()

export function checkAiUsage(userId: string, maxPerDay: number = 5): boolean {
  const today = new Date().toISOString().split("T")[0]
  const record = userUsage.get(userId)

  if (!record || record.date !== today) {
    userUsage.set(userId, { count: 1, date: today })
    return true
  }

  if (record.count >= maxPerDay) return false

  record.count++
  return true
}

export function getAiUsageRemaining(userId: string, maxPerDay: number = 5): number {
  const today = new Date().toISOString().split("T")[0]
  const record = userUsage.get(userId)
  if (!record || record.date !== today) return maxPerDay
  return Math.max(0, maxPerDay - record.count)
}
