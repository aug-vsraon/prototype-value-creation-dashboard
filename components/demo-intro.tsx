"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function DemoIntro() {
  const [name, setName] = useState("")
  const router = useRouter()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      router.push(`/?name=${encodeURIComponent(name.trim())}`)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-[#0D2318] rounded-md flex items-center justify-center">
              <span className="text-white text-sm font-bold">A</span>
            </div>
            <h1 className="text-xl font-semibold text-[#111827]">Impact Scorecard</h1>
          </div>

          <p className="text-sm text-[#6B7280] mb-6">
            Enter the prospect&apos;s company name to generate a personalized demo of the Impact Scorecard.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Logistics"
              className="w-full px-3 py-2 border border-[#E5E7EB] rounded-md text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#16A34A] focus:border-transparent"
              autoFocus
            />
            <button
              type="submit"
              disabled={!name.trim()}
              className="w-full px-4 py-2 bg-[#16A34A] text-white text-sm font-medium rounded-md hover:bg-[#15803D] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Launch Demo
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
