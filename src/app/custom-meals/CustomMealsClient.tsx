'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ValidatedMeal, ValidatedMealIngredient } from '@/lib/types'

interface Props {
  initialMeals: ValidatedMeal[]
}

interface IngredientInput {
  name: string
  amount: string
  unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

const emptyIngredient: IngredientInput = {
  name: '',
  amount: '',
  unit: '',
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
}

export default function CustomMealsClient({ initialMeals }: Props) {
  const [meals, setMeals] = useState<ValidatedMeal[]>(initialMeals)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [mealName, setMealName] = useState('')
  const [ingredients, setIngredients] = useState<IngredientInput[]>([{ ...emptyIngredient }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedMealId, setExpandedMealId] = useState<string | null>(null)

  // Calculate totals from ingredients
  const totals = ingredients.reduce(
    (acc, ing) => ({
      calories: acc.calories + (ing.calories || 0),
      protein: acc.protein + (ing.protein || 0),
      carbs: acc.carbs + (ing.carbs || 0),
      fat: acc.fat + (ing.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )

  const addIngredient = () => {
    setIngredients([...ingredients, { ...emptyIngredient }])
  }

  const removeIngredient = (index: number) => {
    if (ingredients.length > 1) {
      setIngredients(ingredients.filter((_, i) => i !== index))
    }
  }

  const updateIngredient = (index: number, field: keyof IngredientInput, value: string | number) => {
    const updated = [...ingredients]
    updated[index] = { ...updated[index], [field]: value }
    setIngredients(updated)
  }

  const handleSave = async () => {
    setError(null)

    if (!mealName.trim()) {
      setError('Please enter a meal name')
      return
    }

    const validIngredients = ingredients.filter((ing) => ing.name.trim() !== '')
    if (validIngredients.length === 0) {
      setError('Please add at least one ingredient with a name')
      return
    }

    setSaving(true)

    try {
      const response = await fetch('/api/custom-meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meal_name: mealName.trim(),
          ingredients: validIngredients.map((ing) => ({
            name: ing.name.trim(),
            amount: ing.amount.trim(),
            unit: ing.unit.trim(),
            calories: Number(ing.calories) || 0,
            protein: Number(ing.protein) || 0,
            carbs: Number(ing.carbs) || 0,
            fat: Number(ing.fat) || 0,
          })),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save meal')
      }

      const savedMeal = await response.json()

      // Update the meals list
      const existingIndex = meals.findIndex((m) => m.meal_name === savedMeal.meal_name)
      if (existingIndex >= 0) {
        const updated = [...meals]
        updated[existingIndex] = savedMeal
        setMeals(updated)
      } else {
        setMeals([savedMeal, ...meals])
      }

      // Reset form
      setMealName('')
      setIngredients([{ ...emptyIngredient }])
      setShowCreateForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save meal')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (mealId: string) => {
    if (!confirm('Are you sure you want to delete this meal?')) return

    try {
      const response = await fetch(`/api/custom-meals?id=${mealId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete meal')
      }

      setMeals(meals.filter((m) => m.id !== mealId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete meal')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-primary-600">My Custom Meals</h1>
          <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
            Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-800 font-medium">
              Dismiss
            </button>
          </div>
        )}

        {/* Create new meal button or form */}
        {!showCreateForm ? (
          <button onClick={() => setShowCreateForm(true)} className="btn-primary mb-8">
            + Create New Meal
          </button>
        ) : (
          <div className="card mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Create Custom Meal</h2>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Meal Name *</label>
              <input
                type="text"
                value={mealName}
                onChange={(e) => setMealName(e.target.value)}
                placeholder="e.g., Protein Oatmeal Bowl"
                className="input"
              />
            </div>

            <h3 className="text-lg font-medium text-gray-900 mb-3">Ingredients</h3>
            <p className="text-sm text-gray-500 mb-4">
              Add each ingredient with its macros. The total meal macros will be calculated automatically.
            </p>

            <div className="space-y-4">
              {ingredients.map((ingredient, index) => (
                <div key={index} className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-medium text-gray-700">Ingredient {index + 1}</span>
                    {ingredients.length > 1 && (
                      <button
                        onClick={() => removeIngredient(index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="col-span-3 sm:col-span-1">
                      <label className="block text-xs text-gray-500 mb-1">Name *</label>
                      <input
                        type="text"
                        value={ingredient.name}
                        onChange={(e) => updateIngredient(index, 'name', e.target.value)}
                        placeholder="e.g., Rolled oats"
                        className="input text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Amount</label>
                      <input
                        type="text"
                        value={ingredient.amount}
                        onChange={(e) => updateIngredient(index, 'amount', e.target.value)}
                        placeholder="e.g., 1"
                        className="input text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Unit</label>
                      <input
                        type="text"
                        value={ingredient.unit}
                        onChange={(e) => updateIngredient(index, 'unit', e.target.value)}
                        placeholder="e.g., cup"
                        className="input text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Calories *</label>
                      <input
                        type="number"
                        value={ingredient.calories || ''}
                        onChange={(e) => updateIngredient(index, 'calories', Number(e.target.value))}
                        min={0}
                        className="input text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Protein (g) *</label>
                      <input
                        type="number"
                        value={ingredient.protein || ''}
                        onChange={(e) => updateIngredient(index, 'protein', Number(e.target.value))}
                        min={0}
                        className="input text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Carbs (g) *</label>
                      <input
                        type="number"
                        value={ingredient.carbs || ''}
                        onChange={(e) => updateIngredient(index, 'carbs', Number(e.target.value))}
                        min={0}
                        className="input text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Fat (g) *</label>
                      <input
                        type="number"
                        value={ingredient.fat || ''}
                        onChange={(e) => updateIngredient(index, 'fat', Number(e.target.value))}
                        min={0}
                        className="input text-sm"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button onClick={addIngredient} className="text-primary-600 hover:text-primary-800 text-sm mt-3">
              + Add Another Ingredient
            </button>

            {/* Totals */}
            <div className="bg-primary-50 p-4 rounded-lg mt-6">
              <h4 className="text-sm font-medium text-primary-900 mb-2">Meal Totals</h4>
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-primary-700">{totals.calories}</p>
                  <p className="text-xs text-primary-600">Calories</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary-700">{totals.protein}g</p>
                  <p className="text-xs text-primary-600">Protein</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary-700">{totals.carbs}g</p>
                  <p className="text-xs text-primary-600">Carbs</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary-700">{totals.fat}g</p>
                  <p className="text-xs text-primary-600">Fat</p>
                </div>
              </div>
            </div>

            {/* Form actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateForm(false)
                  setMealName('')
                  setIngredients([{ ...emptyIngredient }])
                  setError(null)
                }}
                className="btn-outline flex-1"
                disabled={saving}
              >
                Cancel
              </button>
              <button onClick={handleSave} className="btn-primary flex-1" disabled={saving}>
                {saving ? 'Saving...' : 'Save Meal'}
              </button>
            </div>
          </div>
        )}

        {/* Saved meals list */}
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Custom Meals</h2>

        {meals.length === 0 ? (
          <div className="card text-center text-gray-500">
            <p>You haven&apos;t created any custom meals yet.</p>
            <p className="text-sm mt-1">
              Custom meals will be saved and can be used by the AI when generating meal plans.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {meals.map((meal) => (
              <div key={meal.id} className="card">
                <div
                  className="flex justify-between items-start cursor-pointer"
                  onClick={() => setExpandedMealId(expandedMealId === meal.id ? null : meal.id)}
                >
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{meal.meal_name}</h3>
                    <div className="flex gap-4 mt-1 text-sm text-gray-600">
                      <span>{meal.calories} kcal</span>
                      <span>P: {meal.protein}g</span>
                      <span>C: {meal.carbs}g</span>
                      <span>F: {meal.fat}g</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(meal.id)
                      }}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Delete
                    </button>
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform ${
                        expandedMealId === meal.id ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {expandedMealId === meal.id && meal.ingredients && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Ingredients</h4>
                    <div className="space-y-2">
                      {(meal.ingredients as ValidatedMealIngredient[]).map((ing, idx) => (
                        <div key={idx} className="flex justify-between text-sm bg-gray-50 p-2 rounded">
                          <span className="text-gray-900">
                            {ing.amount && `${ing.amount} `}
                            {ing.unit && `${ing.unit} `}
                            {ing.name}
                          </span>
                          <span className="text-gray-500">
                            {ing.calories} cal | P:{ing.protein}g C:{ing.carbs}g F:{ing.fat}g
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
