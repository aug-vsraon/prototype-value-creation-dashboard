import ValueCreationDashboard from "@/components/value-creation-dashboard"
import DemoIntro from "@/components/demo-intro"
import { Toaster } from "sonner"

export default async function Page({ searchParams }: { searchParams: Promise<{ name?: string }> }) {
  const { name } = await searchParams

  if (!name) {
    return <DemoIntro />
  }

  return (
    <>
      <ValueCreationDashboard demoName={name} />
      <Toaster position="bottom-right" />
    </>
  )
}
