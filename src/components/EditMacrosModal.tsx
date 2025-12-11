'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  isOpen: boolean
  onClose: () => void
  currentValues: {
    target_protein: number
    target_carbs: number
    target_fat: number
    target_calories: number
  }
  onSave: (values: {
    target_protein: number
    target_carbs: number
    target_fat: number
    target_calories: number
  }) => void
}

export default function EditMacrosModal({ isOpen, onClose, currentValues, onSave }: Props) {
  const [protein, setProtein] = useState(currentValues.target_protein)
  const [carbs, setCarbs] = useState(currentValues.target_carbs)
  const [fat, setFat] = useState(currentValues.target_fat)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  // Auto-calculate calories
  const calories = protein * 4 + carbs * 4 + fat * 9

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          target_protein: protein,
          target_carbs: carbs,
          target_fat: fat,
          target_calories: calories,
        })
        .eq('id', user.id)

      if (updateError) throw updateError

      onSave({
        target_protein: protein,
        target_carbs: carbs,
        target_fat: fat,
        target_calories: calories,
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
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Edit Daily Macros</h2>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Protein (g)
            </label>
            <input
              type="number"
              value={protein}
              onChange={(e) => setProtein(Number(e.target.value))}
              min={0}
              max={500}
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Carbs (g)
            </label>
            <input
              type="number"
              value={carbs}
              onChange={(e) => setCarbs(Number(e.target.value))}
              min={0}
              max={800}
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fat (g)
            </label>
            <input
              type="number"
              value={fat}
              onChange={(e) => setFat(Number(e.target.value))}
              min={0}
              max={300}
              className="input"
            />
          </div>

          <div className="bg-gray-50 p-3 rounded-lg">
            <p className="text-sm text-gray-600">
              Calculated Calories: <span className="font-semibold">{calories} kcal</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">
              (Protein × 4) + (Carbs × 4) + (Fat × 9)
            </p>
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
