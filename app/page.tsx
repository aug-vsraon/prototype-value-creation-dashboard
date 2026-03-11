import ValueCreationDashboard from "@/components/value-creation-dashboard"
import { Toaster } from "sonner"

export default function Page() {
  return (
    <>
      <ValueCreationDashboard />
      <Toaster position="bottom-right" />
    </>
  )
}
