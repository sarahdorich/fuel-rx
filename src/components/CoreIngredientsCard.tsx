'use client'

import { useState } from 'react'
import type { CoreIngredients, IngredientCategory } from '@/lib/types'
import { INGREDIENT_CATEGORY_LABELS } from '@/lib/types'

interface Props {
  coreIngredients: CoreIngredients
}

const CATEGORY_COLORS: Record<IngredientCategory, { bg: string; text: string; border: string }> = {
  proteins: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  vegetables: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  fruits: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  grains: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  fats: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  pantry: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
}

const CATEGORY_ICONS: Record<IngredientCategory, React.ReactNode> = {
  proteins: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  vegetables: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  ),
  fruits: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
    </svg>
  ),
  grains: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
    </svg>
  ),
  fats: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  ),
  pantry: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  ),
}

export default function CoreIngredientsCard({ coreIngredients }: Props) {
  const [isExpanded, setIsExpanded] = useState(true)

  const totalItems = Object.values(coreIngredients).flat().length

  const categories: IngredientCategory[] = ['proteins', 'vegetables', 'fruits', 'grains', 'fats', 'pantry']

  return (
    <div className="card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left flex items-center justify-between"
      >
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Core Ingredients</h3>
          <p className="text-sm text-gray-500">
            {totalItems} items selected for this week&apos;s meals
          </p>
        </div>
        <svg
          className={`w-6 h-6 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {categories.map((category) => {
              const items = coreIngredients[category] || []
              if (items.length === 0) return null

              const colors = CATEGORY_COLORS[category]
              const icon = CATEGORY_ICONS[category]

              return (
                <div
                  key={category}
                  className={`p-3 rounded-lg border ${colors.bg} ${colors.border}`}
                >
                  <div className={`flex items-center gap-2 ${colors.text} mb-2`}>
                    {icon}
                    <span className="font-medium text-sm">
                      {INGREDIENT_CATEGORY_LABELS[category]}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {items.map((item, idx) => (
                      <li key={idx} className="text-sm text-gray-700">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
