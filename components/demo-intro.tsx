"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function DemoIntro() {
  const [name, setName] = useState("")
  const router = useRouter()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    router.push(`/?name=${encodeURIComponent(trimmed)}`)
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-[#E5E7EB] p-8 flex flex-col items-center gap-6"
      >
        {/* Augment icon */}
        <div className="w-14 h-14 rounded-full bg-[#0D2318] flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <mask id="introMask" style={{ maskType: "luminance" }} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
              <path d="M32 16C32 7.16344 24.8366 0 16 0C7.16344 0 0 7.16344 0 16C0 24.8366 7.16344 32 16 32C24.8366 32 32 24.8366 32 16Z" fill="white" />
            </mask>
            <g mask="url(#introMask)">
              <path fillRule="evenodd" clipRule="evenodd" d="M15.9996 4.12061C15.1507 4.12061 13.9566 6.09853 13.154 9.1299C10.443 7.5539 8.2001 6.99964 7.59981 7.59995C6.9995 8.20024 7.55376 10.4432 9.12979 13.1542C6.0982 13.9568 4.12012 15.1509 4.12012 15.9999C4.12012 16.8489 6.0982 18.043 9.12978 18.8456C7.55376 21.5566 6.9995 23.7996 7.5998 24.3999C8.20009 25.0002 10.443 24.4459 13.154 22.87C13.9565 25.9014 15.1506 27.8794 15.9996 27.8794C16.8486 27.8794 18.0427 25.9013 18.8453 22.8698C21.5564 24.4459 23.7995 25.0002 24.3998 24.3999C25.0001 23.7996 24.4458 21.5566 22.8697 18.8455C25.901 18.0429 27.8789 16.8488 27.8789 15.9999C27.8789 15.151 25.901 13.9569 22.8697 13.1543C24.4458 10.4432 25.0001 8.20022 24.3998 7.59992C23.7995 6.9996 21.5564 7.55391 18.8452 9.13002C18.0427 6.09857 16.8486 4.12061 15.9996 4.12061ZM15.9999 19.9598C18.1868 19.9598 19.9597 18.1869 19.9597 16C19.9597 13.813 18.1868 12.0401 15.9999 12.0401C13.8129 12.0401 12.04 13.813 12.04 16C12.04 18.1869 13.8129 19.9598 15.9999 19.9598Z" fill="white" />
            </g>
          </svg>
        </div>

        <div className="text-center">
          <h1 className="text-xl font-semibold text-[#111827]">Impact Scorecard</h1>
          <p className="text-sm text-[#6B7280] mt-1">Enter the prospect name to start the demo</p>
        </div>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Acme Logistics"
          autoFocus
          className="w-full px-4 py-2.5 border border-[#E5E7EB] rounded-lg text-sm text-[#111827] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#16A34A] focus:border-transparent"
        />

        <button
          type="submit"
          disabled={!name.trim()}
          className="w-full py-2.5 rounded-lg text-sm font-medium text-white bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Start Demo
        </button>
      </form>
    </div>
  )
}
