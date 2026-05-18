'use client'

import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="bg-[#1F3864] text-white px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 bg-[#2E75B6] rounded flex items-center justify-center text-white font-bold text-sm">
            AI
          </div>
          <span className="font-semibold text-lg tracking-tight">Estates AI Tool</span>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="inline-block bg-blue-50 text-[#2E75B6] text-sm font-medium px-4 py-1.5 rounded-full mb-6">
            RIBA Stage 0–1 Feasibility
          </div>

          <h1 className="text-4xl font-bold text-[#1F3864] leading-tight mb-4">
            Generate professional RIBA Stage 1 Feasibility Reports in minutes
          </h1>

          <p className="text-gray-500 text-lg mb-10">
            Answer a guided questionnaire about your construction project. Our AI analyses your inputs and produces a complete, professional feasibility report — ready to share with senior management or funders.
          </p>

          <Link
            href="/questionnaire"
            className="inline-block bg-[#2E75B6] hover:bg-[#1F5C99] text-white font-semibold px-8 py-4 rounded-lg text-lg transition-colors shadow-md"
          >
            Start Questionnaire
          </Link>

          <p className="mt-4 text-sm text-gray-400">Takes approximately 10–15 minutes to complete</p>

          {/* What's included */}
          <div className="mt-16 grid grid-cols-2 gap-4 text-left sm:grid-cols-4">
            {[
              { icon: '⚠️', label: 'Risk Register', desc: 'Colour-coded risk table with mitigations' },
              { icon: '£', label: 'Cost Estimate', desc: 'NRM1 order of cost with ranges' },
              { icon: '📅', label: 'Programme', desc: 'RIBA stage-by-stage timeline' },
              { icon: '📋', label: 'Procurement', desc: 'Route recommendation and contract form' },
            ].map(item => (
              <div key={item.label} className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl mb-2">{item.icon}</div>
                <div className="font-semibold text-[#1F3864] text-sm mb-1">{item.label}</div>
                <div className="text-gray-500 text-xs">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 px-6 py-4 text-center text-xs text-gray-400">
        Indicative at RIBA Stage 0–1 only. Not professional advice. Always verify with a Chartered Quantity Surveyor.
      </footer>
    </div>
  )
}
