'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  DIETARY_PREFERENCE_LABELS,
  PREP_TIME_OPTIONS,
  MEALS_PER_DAY_OPTIONS,
} from '@/lib/types'
import type { DietaryPreference, PrepTime, MealsPerDay } from '@/lib/types'

interface Props {
  isOpen: boolean
  onClose: () => void
  currentValues: {
    dietary_prefs: DietaryPreference[]
    meals_per_day: MealsPerDay
    prep_time: PrepTime
  }
  onSave: (values: {
    dietary_prefs: DietaryPreference[]
    meals_per_day: MealsPerDay
    prep_time: PrepTime
  }) => void
}

export default function EditPreferencesModal({ isOpen, onClose, currentValues, onSave }: Props) {
  const [dietaryPrefs, setDietaryPrefs] = useState<DietaryPreference[]>(currentValues.dietary_prefs)
  const [mealsPerDay, setMealsPerDay] = useState<MealsPerDay>(currentValues.meals_per_day)
  const [prepTime, setPrepTime] = useState<PrepTime>(currentValues.prep_time)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  const toggleDietaryPref = (pref: DietaryPreference) => {
    if (pref === 'no_restrictions') {
      setDietaryPrefs(['no_restrictions'])
    } else {
      const withoutNoRestrictions = dietaryPrefs.filter(p => p !== 'no_restrictions')
      if (withoutNoRestrictions.includes(pref)) {
        const newPrefs = withoutNoRestrictions.filter(p => p !== pref)
        setDietaryPrefs(newPrefs.length === 0 ? ['no_restrictions'] : newPrefs)
      } else {
        setDietaryPrefs([...withoutNoRestrictions, pref])
      }
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          dietary_prefs: dietaryPrefs,
          meals_per_day: mealsPerDay,
          prep_time: prepTime,
        })
        .eq('id', user.id)

      if (updateError) throw updateError

      onSave({
        dietary_prefs: dietaryPrefs,
        meals_per_day: mealsPerDay,
        prep_time: prepTime,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Edit Preferences</h2>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {/* Dietary Preferences */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Dietary Preferences
            </label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(DIETARY_PREFERENCE_LABELS) as DietaryPreference[]).map((pref) => (
                <button
                  key={pref}
                  type="button"
                  onClick={() => toggleDietaryPref(pref)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    dietaryPrefs.includes(pref)
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {DIETARY_PREFERENCE_LABELS[pref]}
                </button>
              ))}
            </div>
          </div>

          {/* Meals Per Day */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Meals Per Day
            </label>
            <div className="flex gap-2">
              {MEALS_PER_DAY_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMealsPerDay(option)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    mealsPerDay === option
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {/* Prep Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Prep Time
            </label>
            <div className="flex flex-wrap gap-2">
              {PREP_TIME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPrepTime(option.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    prepTime === option.value
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="btn-outline flex-1"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="btn-primary flex-1"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
