interface MergeData {
  first_name?: string
  company?: string
  domain?: string
  topic?: string
  their_article?: string
  our_site?: string
  our_url?: string
  sender_name?: string
  [key: string]: string | undefined
}

export function renderTemplate(template: string, data: MergeData): string {
  let result = template
  for (const [key, value] of Object.entries(data)) {
    if (value) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value)
    }
  }
  result = result.replace(/\{\{(\w+)\}\}/g, "")
  return result
}

export function getSampleMergeData(): MergeData {
  return {
    first_name: "Alex",
    company: "Acme Corp",
    domain: "example.com",
    topic: "SEO best practices",
    their_article: "10 SEO Tips for 2025",
    our_site: "MyBlog",
    our_url: "https://myblog.com/guide",
    sender_name: "Jamie",
  }
}
