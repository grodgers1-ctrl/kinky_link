import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { PipelineBoard } from "@/components/pipeline/pipeline-board"

export default async function PipelinePage() {
  const session = await auth()
  if (!session?.user) redirect("/")

  return (
    <div className="space-y-6">
      <h1 className="text-h2 font-bold text-brand-secondary">Pipeline</h1>
      <PipelineBoard />
    </div>
  )
}
