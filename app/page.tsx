import ValueCreationDashboard from "@/components/value-creation-dashboard"
import DemoIntro from "@/components/demo-intro"
import { Toaster } from "sonner"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ name?: string }>
}) {
  const { name } = await searchParams
  const isDemo = process.env.DATA_MODE !== "live"

  if (isDemo && !name) {
    return <DemoIntro />
  }

  return (
    <>
      <ValueCreationDashboard />
      <Toaster position="bottom-right" />
    </>
  )
}
