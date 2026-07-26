import { google } from "googleapis"
import crypto from "crypto"

interface SendEmailParams {
  to: string
  subject: string
  bodyHtml: string
  bodyText: string
  accessToken: string
  refreshToken: string
  inReplyTo?: string
  references?: string
}

export async function sendGmailEmail(params: SendEmailParams) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET
  )
  oauth2Client.setCredentials({
    access_token: params.accessToken,
    refresh_token: params.refreshToken,
  })

  const gmail = google.gmail({ version: "v1", auth: oauth2Client })

  const boundary = `boundary_${crypto.randomUUID()}`
  const headers = [
    `To: ${params.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(params.subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ]

  if (params.inReplyTo) {
    headers.push(`In-Reply-To: ${params.inReplyTo}`)
    headers.push(`References: ${params.references || params.inReplyTo}`)
  }

  const body = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    params.bodyText,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    params.bodyHtml,
    `--${boundary}--`,
  ].join("\r\n")

  const fullMessage = [...headers, "", body].join("\r\n")
  const encodedMessage = Buffer.from(fullMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodedMessage },
  })

  return response.data
}

export function injectTrackedLinks(html: string, messageId: string, baseUrl: string): string {
  return html.replace(/href="(https?:\/\/[^"]+)"/g, (_match, url) => {
    const encodedUrl = encodeURIComponent(url)
    return `href="${baseUrl}/api/track/click/${messageId}?url=${encodedUrl}"`
  })
}

export function injectTrackingPixel(html: string, messageId: string, baseUrl: string): string {
  const pixel = `<img src="${baseUrl}/api/track/open/${messageId}" width="1" height="1" style="display:none;" alt=""/>`
  if (html.includes("</body>")) return html.replace("</body>", `${pixel}</body>`)
  return html + pixel
}
