import { auth } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/db"
import { redirect } from "next/navigation"
import { TemplateLibrary } from "@/components/templates/template-library"
import { TemplateEditor } from "@/components/templates/template-editor"

export default async function TemplatesPage() {
  const session = await auth()
  if (!session?.user) redirect("/")

  const { data: templates } = await supabaseAdmin
    .from("templates")
    .select("*")
    .or(`user_id.eq.${session.user.id},is_seed.eq.true`)
    .order("is_seed", { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-h2 font-bold text-brand-secondary">Templates</h1>
      </div>
      <TemplateLibrary templates={templates || []} />
    </div>
  )
}
