'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { DayPlan, Meal, Ingredient } from '@/lib/types'

interface Props {
  mealPlan: {
    id: string
    week_start_date: string
    days: DayPlan[]
    grocery_list: Ingredient[]
    is_favorite: boolean
    created_at: string
  }
}

const DAY_LABELS: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

const MEAL_TYPE_ORDER = ['breakfast', 'lunch', 'dinner', 'snack']

export default function MealPlanClient({ mealPlan }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [selectedDay, setSelectedDay] = useState<string>(mealPlan.days[0]?.day || 'monday')
  const [expandedMeal, setExpandedMeal] = useState<string | null>(null)
  const [isFavorite, setIsFavorite] = useState(mealPlan.is_favorite)
  const [togglingFavorite, setTogglingFavorite] = useState(false)

  const currentDayPlan = mealPlan.days.find(d => d.day === selectedDay)

  const sortedMeals = currentDayPlan?.meals.sort((a, b) => {
    return MEAL_TYPE_ORDER.indexOf(a.type) - MEAL_TYPE_ORDER.indexOf(b.type)
  }) || []

  const toggleFavorite = async () => {
    setTogglingFavorite(true)
    const newValue = !isFavorite

    const { error } = await supabase
      .from('meal_plans')
      .update({ is_favorite: newValue })
      .eq('id', mealPlan.id)

    if (!error) {
      setIsFavorite(newValue)
    }
    setTogglingFavorite(false)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <Link href="/dashboard" className="text-2xl font-bold text-primary-600">
            Coach Hill&apos;s FuelRx
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
              Dashboard
            </Link>
            <Link href="/history" className="text-gray-600 hover:text-gray-900">
              My Plans
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Plan header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Meal Plan
            </h1>
            <p className="text-gray-600">
              Week of {new Date(mealPlan.week_start_date).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={toggleFavorite}
              disabled={togglingFavorite}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                isFavorite
                  ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              <svg
                className={`w-5 h-5 ${isFavorite ? 'fill-current' : ''}`}
                fill={isFavorite ? 'currentColor' : 'none'}
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                />
              </svg>
              {isFavorite ? 'Favorited' : 'Favorite'}
            </button>
            <Link
              href={`/grocery-list/${mealPlan.id}`}
              className="btn-primary"
            >
              View Grocery List
            </Link>
          </div>
        </div>

        {/* Day selector */}
        <div className="flex overflow-x-auto gap-2 mb-6 pb-2">
          {mealPlan.days.map((day) => (
            <button
              key={day.day}
              onClick={() => setSelectedDay(day.day)}
              className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
                selectedDay === day.day
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {DAY_LABELS[day.day]}
            </button>
          ))}
        </div>

        {/* Daily totals */}
        {currentDayPlan && (
          <div className="card mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              {DAY_LABELS[selectedDay]} Daily Totals
            </h3>
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-primary-600">
                  {currentDayPlan.daily_totals.calories}
                </p>
                <p className="text-sm text-gray-500">Calories</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">
                  {currentDayPlan.daily_totals.protein}g
                </p>
                <p className="text-sm text-gray-500">Protein</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-600">
                  {currentDayPlan.daily_totals.carbs}g
                </p>
                <p className="text-sm text-gray-500">Carbs</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-purple-600">
                  {currentDayPlan.daily_totals.fat}g
                </p>
                <p className="text-sm text-gray-500">Fat</p>
              </div>
            </div>
          </div>
        )}

        {/* Meals */}
        <div className="space-y-4">
          {sortedMeals.map((meal, index) => (
            <MealCard
              key={`${meal.name}-${index}`}
              meal={meal}
              isExpanded={expandedMeal === `${meal.name}-${index}`}
              onToggle={() =>
                setExpandedMeal(
                  expandedMeal === `${meal.name}-${index}` ? null : `${meal.name}-${index}`
                )
              }
            />
          ))}
        </div>
      </main>
    </div>
  )
}

function MealCard({
  meal,
  isExpanded,
  onToggle,
}: {
  meal: Meal
  isExpanded: boolean
  onToggle: () => void
}) {
  const mealTypeColors: Record<string, string> = {
    breakfast: 'bg-yellow-100 text-yellow-800',
    lunch: 'bg-teal-100 text-teal-800',
    dinner: 'bg-blue-100 text-blue-800',
    snack: 'bg-purple-100 text-purple-800',
  }

  return (
    <div className="card">
      <button
        onClick={onToggle}
        className="w-full text-left"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${mealTypeColors[meal.type]}`}>
                {meal.type}
              </span>
              <span className="text-sm text-gray-500">
                {meal.prep_time_minutes} min prep
              </span>
            </div>
            <h4 className="text-lg font-semibold text-gray-900">{meal.name}</h4>
            <div className="flex gap-4 mt-2 text-sm">
              <span className="text-gray-600">
                <span className="font-medium">{meal.macros.calories}</span> kcal
              </span>
              <span className="text-blue-600">
                <span className="font-medium">{meal.macros.protein}g</span> protein
              </span>
              <span className="text-orange-600">
                <span className="font-medium">{meal.macros.carbs}g</span> carbs
              </span>
              <span className="text-purple-600">
                <span className="font-medium">{meal.macros.fat}g</span> fat
              </span>
            </div>
          </div>
          <svg
            className={`w-6 h-6 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Ingredients */}
            <div>
              <h5 className="font-medium text-gray-900 mb-2">Ingredients</h5>
              <ul className="space-y-1">
                {meal.ingredients.map((ing, idx) => (
                  <li key={idx} className="text-sm text-gray-600">
                    {ing.amount} {ing.unit} {ing.name}
                  </li>
                ))}
              </ul>
            </div>

            {/* Instructions */}
            <div>
              <h5 className="font-medium text-gray-900 mb-2">Instructions</h5>
              <ol className="space-y-2">
                {meal.instructions.map((step, idx) => (
                  <li key={idx} className="text-sm text-gray-600">
                    <span className="font-medium text-gray-700">{idx + 1}.</span> {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
