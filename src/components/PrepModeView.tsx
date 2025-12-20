'use client'

import { useState } from 'react'
import type { PrepItem, DailyAssembly, DayOfWeek, MealType } from '@/lib/types'

interface PrepSession {
  id?: string
  sessionName: string
  sessionOrder: number
  estimatedMinutes: number
  instructions: string
  prepItems: PrepItem[]
}

interface Props {
  prepSessions: PrepSession[]
  dailyAssembly: DailyAssembly
}

const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

const DAYS_ORDER: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

export default function PrepModeView({ prepSessions, dailyAssembly }: Props) {
  const [expandedSession, setExpandedSession] = useState<number | null>(0)
  const [showDailyAssembly, setShowDailyAssembly] = useState(false)

  if (!prepSessions || prepSessions.length === 0) {
    return (
      <div className="card text-center py-8">
        <p className="text-gray-500">No prep sessions available for this meal plan.</p>
        <p className="text-sm text-gray-400 mt-2">
          Prep mode will be generated automatically for new meal plans.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Prep Sessions */}
      <div className="space-y-4">
        {prepSessions.map((session, index) => (
          <div key={session.id || index} className="card">
            <button
              onClick={() => setExpandedSession(expandedSession === index ? null : index)}
              className="w-full text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-bold">
                    {session.sessionOrder}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {session.sessionName}
                    </h3>
                    <p className="text-sm text-gray-500">
                      ~{session.estimatedMinutes} minutes
                    </p>
                  </div>
                </div>
                <svg
                  className={`w-6 h-6 text-gray-400 transition-transform ${
                    expandedSession === index ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {expandedSession === index && (
              <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
                {/* Session Instructions */}
                {session.instructions && (
                  <div className="bg-primary-50 p-4 rounded-lg">
                    <p className="text-sm text-primary-800">
                      <strong>Tip:</strong> {session.instructions}
                    </p>
                  </div>
                )}

                {/* Prep Items */}
                <div className="space-y-3">
                  {session.prepItems.map((item, itemIndex) => (
                    <PrepItemCard key={itemIndex} item={item} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Daily Assembly Toggle */}
      <div className="card">
        <button
          onClick={() => setShowDailyAssembly(!showDailyAssembly)}
          className="w-full text-left flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Daily Assembly Guide</h3>
              <p className="text-sm text-gray-500">Quick instructions for each meal</p>
            </div>
          </div>
          <svg
            className={`w-6 h-6 text-gray-400 transition-transform ${showDailyAssembly ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showDailyAssembly && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="space-y-4">
              {DAYS_ORDER.map((day) => {
                const dayAssembly = dailyAssembly[day]
                if (!dayAssembly) return null

                return (
                  <div key={day} className="border-b border-gray-100 pb-4 last:border-0 last:pb-0">
                    <h4 className="font-semibold text-gray-900 mb-2">{DAY_LABELS[day]}</h4>
                    <div className="space-y-2">
                      {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((mealType) => {
                        const meal = dayAssembly[mealType]
                        if (!meal) return null

                        const mealColors: Record<MealType, string> = {
                          breakfast: 'bg-yellow-100 text-yellow-800',
                          lunch: 'bg-teal-100 text-teal-800',
                          dinner: 'bg-blue-100 text-blue-800',
                          snack: 'bg-purple-100 text-purple-800',
                        }

                        return (
                          <div key={mealType} className="flex items-start gap-3">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize shrink-0 ${mealColors[mealType]}`}>
                              {mealType}
                            </span>
                            <div className="text-sm">
                              <span className="text-gray-500">({meal.time})</span>{' '}
                              <span className="text-gray-700">{meal.instructions}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PrepItemCard({ item }: { item: PrepItem }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h4 className="font-medium text-gray-900">{item.item}</h4>
            <p className="text-sm text-gray-500">{item.quantity}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs bg-primary-100 text-primary-700 px-2 py-1 rounded-full">
              Feeds {item.feeds.length} meals
            </span>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
          {/* Method */}
          {item.method && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">Method</p>
              <p className="text-sm text-gray-700">{item.method}</p>
            </div>
          )}

          {/* Ingredients */}
          {item.ingredients && item.ingredients.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">Ingredients</p>
              <ul className="text-sm text-gray-700 list-disc list-inside">
                {item.ingredients.map((ing, idx) => (
                  <li key={idx}>{ing}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Storage */}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase mb-1">Storage</p>
            <p className="text-sm text-gray-700">{item.storage}</p>
          </div>

          {/* Feeds */}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase mb-1">Feeds These Meals</p>
            <div className="flex flex-wrap gap-2">
              {item.feeds.map((feed, idx) => (
                <span
                  key={idx}
                  className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded"
                >
                  {DAY_LABELS[feed.day]} {feed.meal}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
