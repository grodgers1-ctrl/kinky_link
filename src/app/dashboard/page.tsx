import { auth } from "@/lib/auth"

export default async function DashboardPage() {
  const session = await auth()
  return (
    <div>
      <h1 className="text-h2 font-bold text-brand-secondary">
        Welcome, {session?.user?.name}
      </h1>
      <p className="mt-2 text-body text-[#575858]">
        Connect your site to get started finding prospects and building links.
      </p>
    </div>
  )
}
