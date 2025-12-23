'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { HouseholdServingsPrefs, DayOfWeek, MealType, HouseholdServingCount } from '@/lib/types'
import {
  DAY_OF_WEEK_LABELS,
  DAYS_OF_WEEK,
  MEAL_TYPE_LABELS,
  DEFAULT_HOUSEHOLD_SERVINGS_PREFS
} from '@/lib/types'

interface Props {
  initialSettings: HouseholdServingsPrefs
}

type MealTypeKey = 'breakfast' | 'lunch' | 'dinner' | 'snacks'

const MEAL_TYPES: MealTypeKey[] = ['breakfast', 'lunch', 'dinner', 'snacks']

const getMealTypeLabel = (mealType: MealTypeKey): string => {
  if (mealType === 'snacks') return 'Snacks'
  return MEAL_TYPE_LABELS[mealType as MealType]
}

export default function HouseholdSettingsClient({ initialSettings }: Props) {
  const supabase = createClient()
  const [settings, setSettings] = useState<HouseholdServingsPrefs>(initialSettings)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [activeDay, setActiveDay] = useState<DayOfWeek>('monday')

  // Check if any household members are configured
  const hasHouseholdMembers = useMemo(() => {
    return DAYS_OF_WEEK.some(day =>
      MEAL_TYPES.some(meal =>
        settings[day][meal].adults > 0 || settings[day][meal].children > 0
      )
    )
  }, [settings])

  const updateServing = (
    day: DayOfWeek,
    mealType: MealTypeKey,
    personType: 'adults' | 'children',
    value: number
  ) => {
    setSettings(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [mealType]: {
          ...prev[day][mealType],
          [personType]: Math.max(0, value),
        },
      },
    }))
  }

  const copyDayToWeekdays = (sourceDay: DayOfWeek) => {
    const weekdays: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
    setSettings(prev => {
      const newSettings = { ...prev }
      weekdays.forEach(day => {
        newSettings[day] = { ...prev[sourceDay] }
      })
      return newSettings
    })
  }

  const copyDayToWeekend = (sourceDay: DayOfWeek) => {
    const weekend: DayOfWeek[] = ['saturday', 'sunday']
    setSettings(prev => {
      const newSettings = { ...prev }
      weekend.forEach(day => {
        newSettings[day] = { ...prev[sourceDay] }
      })
      return newSettings
    })
  }

  const copyDayToAll = (sourceDay: DayOfWeek) => {
    setSettings(prev => {
      const newSettings = { ...prev }
      DAYS_OF_WEEK.forEach(day => {
        newSettings[day] = { ...prev[sourceDay] }
      })
      return newSettings
    })
  }

  const resetAll = () => {
    setSettings(DEFAULT_HOUSEHOLD_SERVINGS_PREFS)
  }

  const handleSave = async () => {
    setError(null)
    setSuccess(false)
    setSaving(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('Not authenticated')
      }

      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          household_servings: settings,
        })
        .eq('id', user.id)

      if (updateError) {
        throw new Error(updateError.message)
      }

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-primary-600">Household Servings</h1>
          <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
            Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-800 font-medium">
              Dismiss
            </button>
          </div>
        )}

        {success && (
          <div className="bg-green-50 text-green-600 p-4 rounded-lg mb-6">
            Settings saved successfully! Your next meal plan will include portions for your household.
          </div>
        )}

        <div className="card mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Feeding Your Household</h2>
          <p className="text-gray-600 mb-4">
            Configure how many additional people you&apos;re feeding at each meal. Your macros remain the priority
            &mdash; the meal plan will scale grocery quantities and prep instructions to feed your household.
          </p>
          <p className="text-sm text-gray-500 mb-4">
            <strong>Note:</strong> Children are counted as 0.6x an adult portion. You (the athlete) are automatically counted.
          </p>

          {/* Day tabs */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-1 overflow-x-auto" aria-label="Days">
              {DAYS_OF_WEEK.map(day => {
                const daySettings = settings[day]
                const hasAny = MEAL_TYPES.some(m => daySettings[m].adults > 0 || daySettings[m].children > 0)
                return (
                  <button
                    key={day}
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
            </div>

            <div className="grid gap-4">
              {MEAL_TYPES.map(mealType => (
                <div key={mealType} className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-3">{getMealTypeLabel(mealType)}</h4>
                  <div className="flex flex-wrap gap-6">
                    <ServingControl
                      value={settings[activeDay][mealType].adults}
                      onChange={(v) => updateServing(activeDay, mealType, 'adults', v)}
                      label="Adults"
                    />
                    <ServingControl
                      value={settings[activeDay][mealType].children}
                      onChange={(v) => updateServing(activeDay, mealType, 'children', v)}
                      label="Children"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex justify-between items-center pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={resetAll}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Reset All to Zero
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>

        {/* Summary */}
        {hasHouseholdMembers && (
          <div className="card mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Weekly Summary</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 pr-4 font-medium text-gray-600">Day</th>
                    {MEAL_TYPES.map(meal => (
                      <th key={meal} className="text-center py-2 px-2 font-medium text-gray-600">
                        {getMealTypeLabel(meal)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAYS_OF_WEEK.map(day => (
                    <tr key={day} className="border-b border-gray-100">
                      <td className="py-2 pr-4 font-medium text-gray-900">
                        {DAY_OF_WEEK_LABELS[day].slice(0, 3)}
                      </td>
                      {MEAL_TYPES.map(meal => {
                        const serving = settings[day][meal]
                        const hasServing = serving.adults > 0 || serving.children > 0
                        return (
                          <td key={meal} className="text-center py-2 px-2">
                            {hasServing ? (
                              <span className="text-gray-700">
                                {serving.adults > 0 && `${serving.adults}A`}
                                {serving.adults > 0 && serving.children > 0 && ' + '}
                                {serving.children > 0 && `${serving.children}C`}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              A = Additional Adults, C = Children. You (the athlete) are always counted as 1 adult.
            </p>
          </div>
        )}

        <div className="bg-primary-50 p-4 rounded-lg">
          <p className="text-sm text-primary-800">
            <strong>How it works:</strong> When you generate a meal plan, we&apos;ll tell the AI about your household size.
            This way, prep instructions are written for the actual batch size, and grocery quantities are accurate
            for feeding everyone. Your personal macro targets remain the priority for meal composition.
          </p>
        </div>
      </main>
    </div>
  )
}
