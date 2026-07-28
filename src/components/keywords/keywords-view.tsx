"use client"
import { useState } from "react"
import { GscKeywords } from "./gsc-keywords"
import { KeywordIdeas } from "./keyword-ideas"
import { SavedKeywords } from "./saved-keywords"

const TABS = [
  { id: "gsc", label: "GSC Keywords" },
  { id: "ideas", label: "Keyword Ideas" },
  { id: "saved", label: "Saved Keywords" },
]

export function KeywordsView({ sites }: { sites: { id: string; url: string }[] }) {
  const [activeTab, setActiveTab] = useState("gsc")

  return (
    <div>
      <div className="border-b border-[#DCDDDE]">
        <nav className="flex gap-6">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium ${
                activeTab === tab.id
                  ? "border-b-2 border-brand-accent text-brand-accent"
                  : "text-[#575858] hover:text-brand-secondary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="mt-6">
        {activeTab === "gsc" && <GscKeywords sites={sites} />}
        {activeTab === "ideas" && <KeywordIdeas />}
        {activeTab === "saved" && <SavedKeywords />}
      </div>
    </div>
  )
}
