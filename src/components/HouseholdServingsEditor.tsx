/**
 * HouseholdServingsEditor
 *
 * Reusable component for editing household serving preferences.
 * Used by both onboarding flow and settings page.
 *
 * This is a "controlled component" - the parent manages the state,
 * and this component just renders the UI and calls onChange when things update.
 */

'use client'

import { useState } from 'react'
import type { HouseholdServingsPrefs, DayOfWeek, MealType } from '@/lib/types'
import { DAY_OF_WEEK_LABELS, DAYS_OF_WEEK, MEAL_TYPE_LABELS } from '@/lib/types'

interface Props {
  servings: HouseholdServingsPrefs
  onChange: (servings: HouseholdServingsPrefs) => void
  showQuickActions?: boolean // Whether to show the "Copy to X" buttons
}

type MealTypeKey = 'breakfast' | 'lunch' | 'dinner' | 'snacks'

const MEAL_TYPES: MealTypeKey[] = ['breakfast', 'lunch', 'dinner', 'snacks']

const getMealTypeLabel = (mealType: MealTypeKey): string => {
  if (mealType === 'snacks') return 'Snacks'
  return MEAL_TYPE_LABELS[mealType as MealType]
}

/**
 * ServingControl - The +/- buttons for adjusting counts
 */
const ServingControl = ({
  value,
  onChange,
  label,
}: {
  value: number
  onChange: (value: number) => void
  label: string
}) => (
  <div className="flex items-center gap-2">
    <span className="text-sm text-gray-600 w-16">{label}</span>
    <button
      type="button"
      onClick={() => onChange(value - 1)}
      disabled={value === 0}
      className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      -
    </button>
    <span className="w-8 text-center font-medium">{value}</span>
    <button
      type="button"
      onClick={() => onChange(value + 1)}
      className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100"
    >
      +
    </button>
  </div>
)

export default function HouseholdServingsEditor({ servings, onChange, showQuickActions = true }: Props) {
  const [activeDay, setActiveDay] = useState<DayOfWeek>('monday')

  // Update a specific serving count
  const updateServing = (
    day: DayOfWeek,
    mealType: MealTypeKey,
    personType: 'adults' | 'children',
    value: number
  ) => {
    onChange({
      ...servings,
      [day]: {
        ...servings[day],
        [mealType]: {
          ...servings[day][mealType],
          [personType]: Math.max(0, value),
        },
      },
    })
  }

  // Copy current day to all weekdays
  const copyDayToWeekdays = (sourceDay: DayOfWeek) => {
    const weekdays: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
    const newServings = { ...servings }
    weekdays.forEach(day => {
      newServings[day] = { ...servings[sourceDay] }
    })
    onChange(newServings)
  }

  // Copy current day to weekend
  const copyDayToWeekend = (sourceDay: DayOfWeek) => {
    const weekend: DayOfWeek[] = ['saturday', 'sunday']
    const newServings = { ...servings }
    weekend.forEach(day => {
      newServings[day] = { ...servings[sourceDay] }
    })
    onChange(newServings)
  }

  // Copy current day to all days
  const copyDayToAll = (sourceDay: DayOfWeek) => {
    const newServings = { ...servings }
    DAYS_OF_WEEK.forEach(day => {
      newServings[day] = { ...servings[sourceDay] }
    })
    onChange(newServings)
  }

  return (
    <div>
      {/* Day tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-1 overflow-x-auto" aria-label="Days">
          {DAYS_OF_WEEK.map(day => {
            const daySettings = servings[day]
            const hasAny = MEAL_TYPES.some(m => daySettings[m].adults > 0 || daySettings[m].children > 0)
            return (
              <button
                key={day}
                type="button"
                onClick={() => setActiveDay(day)}
                className={`whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm transition-colors ${
                  activeDay === day
                    ? 'border-primary-500 text-primary-600'
                    : hasAny
                    ? 'border-transparent text-gray-700 hover:text-gray-900 hover:border-gray-300'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {DAY_OF_WEEK_LABELS[day].slice(0, 3)}
                {hasAny && <span className="ml-1 text-primary-500">*</span>}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Current day settings */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">{DAY_OF_WEEK_LABELS[activeDay]}</h3>

          {/* Quick action buttons */}
          {showQuickActions && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => copyDayToWeekdays(activeDay)}
                className="text-xs text-primary-600 hover:text-primary-700 px-2 py-1 border border-primary-200 rounded hover:bg-primary-50"
              >
                Copy to Weekdays
              </button>
              <button
                type="button"
                onClick={() => copyDayToWeekend(activeDay)}
                className="text-xs text-primary-600 hover:text-primary-700 px-2 py-1 border border-primary-200 rounded hover:bg-primary-50"
              >
                Copy to Weekend
              </button>
              <button
                type="button"
                onClick={() => copyDayToAll(activeDay)}
                className="text-xs text-primary-600 hover:text-primary-700 px-2 py-1 border border-primary-200 rounded hover:bg-primary-50"
              >
                Copy to All
              </button>
            </div>
          )}
        </div>

        {/* Warning about already being counted */}
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-4">
            <div className="flex">
                <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                </div>
                <div className="ml-3">
                    <p className="text-sm text-yellow-700">
                        <strong>You're already included!</strong> Only add <em>additional</em> household members here.
                    </p>
                </div>
            </div>
        </div>

        {/* Meal type controls */}
        <div className="grid gap-4">
          {MEAL_TYPES.map(mealType => (
            <div key={mealType} className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-3">{getMealTypeLabel(mealType)}</h4>
              <div className="flex flex-wrap gap-6">
                <ServingControl
                  value={servings[activeDay][mealType].adults}
                  onChange={(v) => updateServing(activeDay, mealType, 'adults', v)}
                  label="Adults"
                />
                <ServingControl
                  value={servings[activeDay][mealType].children}
                  onChange={(v) => updateServing(activeDay, mealType, 'children', v)}
                  label="Children"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
