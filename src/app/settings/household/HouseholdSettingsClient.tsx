'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { HouseholdServingsPrefs } from '@/lib/types'
import {
  DAY_OF_WEEK_LABELS,
  DAYS_OF_WEEK,
  MEAL_TYPE_LABELS,
  type MealType
} from '@/lib/types'
import HouseholdServingsEditor from '@/components/HouseholdServingsEditor'

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

  // Check if any household members are configured
  const hasHouseholdMembers = useMemo(() => {
    return DAYS_OF_WEEK.some(day =>
      MEAL_TYPES.some(meal =>
        settings[day][meal].adults > 0 || settings[day][meal].children > 0
      )
    )
  }, [settings])

  const resetAll = () => {
    const resetSettings: HouseholdServingsPrefs = {} as HouseholdServingsPrefs
    DAYS_OF_WEEK.forEach(day => {
      resetSettings[day] = {
        breakfast: { adults: 0, children: 0 },
        lunch: { adults: 0, children: 0 },
        dinner: { adults: 0, children: 0 },
        snacks: { adults: 0, children: 0 },
      }
    })
    setSettings(resetSettings)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({ household_servings: settings })
        .eq('id', user.id)

      if (updateError) throw updateError

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      setError(err?.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

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

          {/* Use the shared component */}
          <HouseholdServingsEditor
            servings={settings}
            onChange={setSettings}
            showQuickActions={true}
          />

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
