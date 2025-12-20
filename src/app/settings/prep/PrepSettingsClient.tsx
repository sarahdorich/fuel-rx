'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { PrepStyle, MealComplexity } from '@/lib/types'
import { PREP_STYLE_LABELS, MEAL_COMPLEXITY_LABELS } from '@/lib/types'

interface Props {
  initialSettings: {
    prep_style: string
    breakfast_complexity: string
    lunch_complexity: string
    dinner_complexity: string
  }
}

export default function PrepSettingsClient({ initialSettings }: Props) {
  const supabase = createClient()
  const [prepStyle, setPrepStyle] = useState<PrepStyle>(initialSettings.prep_style as PrepStyle)
  const [breakfastComplexity, setBreakfastComplexity] = useState<MealComplexity>(
    initialSettings.breakfast_complexity as MealComplexity
  )
  const [lunchComplexity, setLunchComplexity] = useState<MealComplexity>(
    initialSettings.lunch_complexity as MealComplexity
  )
  const [dinnerComplexity, setDinnerComplexity] = useState<MealComplexity>(
    initialSettings.dinner_complexity as MealComplexity
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

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
          prep_style: prepStyle,
          breakfast_complexity: breakfastComplexity,
          lunch_complexity: lunchComplexity,
          dinner_complexity: dinnerComplexity,
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-primary-600">Meal Prep Preferences</h1>
          <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
            Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
            Settings saved successfully! Your next meal plan will use these preferences.
          </div>
        )}

        <div className="card mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Prep Style</h2>
          <p className="text-gray-600 mb-4">
            How do you prefer to meal prep? We&apos;ll organize your weekly prep schedule to match your style.
          </p>

          <div className="grid gap-3">
            {(Object.keys(PREP_STYLE_LABELS) as PrepStyle[]).map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => setPrepStyle(style)}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  prepStyle === style
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-semibold text-gray-900">
                  {PREP_STYLE_LABELS[style].title}
                </div>
                <div className="text-sm text-gray-600 mt-1">
                  {PREP_STYLE_LABELS[style].description}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="card mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Meal Complexity</h2>
          <p className="text-gray-600 mb-4">
            What level of cooking effort do you prefer for each meal type?
          </p>

          {/* Breakfast */}
          <div className="mb-6">
            <label className="block font-medium text-gray-900 mb-2">Breakfast</label>
            <div className="grid gap-2">
              {(Object.keys(MEAL_COMPLEXITY_LABELS) as MealComplexity[]).map((complexity) => (
                <button
                  key={complexity}
                  type="button"
                  onClick={() => setBreakfastComplexity(complexity)}
                  className={`p-3 rounded-lg border-2 text-left text-sm transition-all ${
                    breakfastComplexity === complexity
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-semibold">
                    {MEAL_COMPLEXITY_LABELS[complexity].title} ({MEAL_COMPLEXITY_LABELS[complexity].time})
                  </div>
                  <div className="text-gray-600">
                    Example: {MEAL_COMPLEXITY_LABELS[complexity].example}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Lunch */}
          <div className="mb-6">
            <label className="block font-medium text-gray-900 mb-2">Lunch</label>
            <div className="grid gap-2">
              {(Object.keys(MEAL_COMPLEXITY_LABELS) as MealComplexity[]).map((complexity) => (
                <button
                  key={complexity}
                  type="button"
                  onClick={() => setLunchComplexity(complexity)}
                  className={`p-3 rounded-lg border-2 text-left text-sm transition-all ${
                    lunchComplexity === complexity
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-semibold">
                    {MEAL_COMPLEXITY_LABELS[complexity].title} ({MEAL_COMPLEXITY_LABELS[complexity].time})
                  </div>
                  <div className="text-gray-600">
                    Example: {MEAL_COMPLEXITY_LABELS[complexity].example}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Dinner */}
          <div className="mb-6">
            <label className="block font-medium text-gray-900 mb-2">Dinner</label>
            <div className="grid gap-2">
              {(Object.keys(MEAL_COMPLEXITY_LABELS) as MealComplexity[]).map((complexity) => (
                <button
                  key={complexity}
                  type="button"
                  onClick={() => setDinnerComplexity(complexity)}
                  className={`p-3 rounded-lg border-2 text-left text-sm transition-all ${
                    dinnerComplexity === complexity
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-semibold">
                    {MEAL_COMPLEXITY_LABELS[complexity].title} ({MEAL_COMPLEXITY_LABELS[complexity].time})
                  </div>
                  <div className="text-gray-600">
                    Example: {MEAL_COMPLEXITY_LABELS[complexity].example}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary w-full"
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>

        <div className="bg-primary-50 p-4 rounded-lg">
          <p className="text-sm text-primary-800">
            <strong>Note:</strong> These preferences will be used when generating your next meal plan.
            Your existing meal plans will not be affected.
          </p>
        </div>
      </main>
    </div>
  )
}
