import { auth } from "@/lib/auth"
import { SignInButton } from "@/components/auth/sign-in-button"
import { redirect } from "next/navigation"

export default async function Home() {
  const session = await auth()

  if (session?.user) {
    redirect("/dashboard")
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-brand-surface px-4">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-brand-white p-8 shadow-lg">
        <div className="text-center">
          <img
            src="/brand/kinklink_logo.png"
            alt="kinkylink"
            className="mx-auto h-16 w-auto"
          />
          <h1 className="mt-4 text-display font-bold tracking-tight text-brand-secondary">
            kinkylink
          </h1>
          <p className="mt-2 text-body text-[#575858]">
            Premium link management for side hustles
          </p>
        </div>

        <div className="flex justify-center">
          <SignInButton session={null} />
        </div>

        <p className="text-center text-caption text-[#999999]">
          Sign in with Google to get started
        </p>
      </div>
    </div>
  )
}
