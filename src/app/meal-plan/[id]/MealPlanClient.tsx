'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { DayPlan, Meal, Ingredient, MealPreferenceType, Macros, CoreIngredients, PrepModeResponse, DailyAssembly, IngredientNutritionUserOverride } from '@/lib/types'
import PrepModeView from '@/components/PrepModeView'
import CoreIngredientsCard from '@/components/CoreIngredientsCard'

interface PrepSessionData {
  id?: string
  sessionName: string
  sessionOrder: number
  estimatedMinutes: number
  instructions: string
  prepItems: PrepModeResponse['prepSessions'][0]['prepItems']
}

interface Props {
  mealPlan: {
    id: string
    week_start_date: string
    title: string | null
    days: DayPlan[]
    grocery_list: Ingredient[]
    is_favorite: boolean
    created_at: string
    core_ingredients?: CoreIngredients | null
  }
}

interface MealPreferencesMap {
  [mealName: string]: MealPreferenceType
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

export default function MealPlanClient({ mealPlan: initialMealPlan }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [mealPlan, setMealPlan] = useState(initialMealPlan)
  const [selectedDay, setSelectedDay] = useState<string>(mealPlan.days[0]?.day || 'monday')
  const [expandedMeal, setExpandedMeal] = useState<string | null>(null)
  const [isFavorite, setIsFavorite] = useState(mealPlan.is_favorite)
  const [togglingFavorite, setTogglingFavorite] = useState(false)

  // Title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(mealPlan.title || '')
  const [savingTitle, setSavingTitle] = useState(false)

  // Meal preferences state
  const [mealPreferences, setMealPreferences] = useState<MealPreferencesMap>({})

  // View mode state (meal view vs prep view)
  const [viewMode, setViewMode] = useState<'meals' | 'prep'>('meals')

  // Prep sessions state
  const [prepSessions, setPrepSessions] = useState<PrepSessionData[]>([])
  const [dailyAssembly, setDailyAssembly] = useState<DailyAssembly>({})
  const [loadingPrepMode, setLoadingPrepMode] = useState(false)

  // Load meal preferences on mount
  useEffect(() => {
    const loadMealPreferences = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('meal_preferences')
        .select('meal_name, preference')
        .eq('user_id', user.id)

      if (data) {
        const prefsMap: MealPreferencesMap = {}
        data.forEach(pref => {
          prefsMap[pref.meal_name] = pref.preference as MealPreferenceType
        })
        setMealPreferences(prefsMap)
      }
    }
    loadMealPreferences()
  }, [supabase])

  // Load prep sessions when switching to prep view
  useEffect(() => {
    const loadPrepSessions = async () => {
      if (viewMode !== 'prep' || prepSessions.length > 0) return

      setLoadingPrepMode(true)
      try {
        const response = await fetch(`/api/meal-plans/${mealPlan.id}/prep-mode`)
        if (response.ok) {
          const data = await response.json()
          setPrepSessions(data.prepSessions || [])
          setDailyAssembly(data.dailyAssembly || {})
        }
      } catch (error) {
        console.error('Error loading prep sessions:', error)
      }
      setLoadingPrepMode(false)
    }
    loadPrepSessions()
  }, [viewMode, mealPlan.id, prepSessions.length])

  const currentDayPlan = mealPlan.days.find(d => d.day === selectedDay)

  const sortedMeals = currentDayPlan?.meals.sort((a, b) => {
    return MEAL_TYPE_ORDER.indexOf(a.type) - MEAL_TYPE_ORDER.indexOf(b.type)
  }) || []

  const toggleFavorite = async () => {
    setTogglingFavorite(true)
    const newValue = !isFavorite

    try {
      const response = await fetch(`/api/meal-plans/${mealPlan.id}/favorite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_favorite: newValue }),
      })

      if (response.ok) {
        setIsFavorite(newValue)
      }
    } catch (error) {
      console.error('Error toggling favorite:', error)
    }
    setTogglingFavorite(false)
  }

  const saveTitle = async () => {
    setSavingTitle(true)
    const { error } = await supabase
      .from('meal_plans')
      .update({ title: titleValue || null })
      .eq('id', mealPlan.id)

    if (!error) {
      setMealPlan({ ...mealPlan, title: titleValue || null })
      setIsEditingTitle(false)
    }
    setSavingTitle(false)
  }

  const updateMealMacros = async (dayIndex: number, mealIndex: number, newMacros: Macros) => {
    const updatedDays = [...mealPlan.days]
    const day = updatedDays[dayIndex]
    const meal = day.meals[mealIndex]

    // Update the meal's macros
    meal.macros = { ...newMacros }

    // Recalculate daily totals
    day.daily_totals.calories = day.meals.reduce((sum, m) => sum + m.macros.calories, 0)
    day.daily_totals.protein = day.meals.reduce((sum, m) => sum + m.macros.protein, 0)
    day.daily_totals.carbs = day.meals.reduce((sum, m) => sum + m.macros.carbs, 0)
    day.daily_totals.fat = day.meals.reduce((sum, m) => sum + m.macros.fat, 0)

    // Save to database
    const { error: planError } = await supabase
      .from('meal_plans')
      .update({ plan_data: updatedDays })
      .eq('id', mealPlan.id)

    if (planError) {
      return false
    }

    // Save to validated_meals_by_user for future meal plan generation
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase
        .from('validated_meals_by_user')
        .upsert({
          user_id: user.id,
          meal_name: meal.name,
          calories: newMacros.calories,
          protein: newMacros.protein,
          carbs: newMacros.carbs,
          fat: newMacros.fat,
        }, {
          onConflict: 'user_id,meal_name',
        })
    }

    setMealPlan({ ...mealPlan, days: updatedDays })
    return true
  }

  const updateIngredientInMeal = async (
    dayIndex: number,
    mealIndex: number,
    ingredientIndex: number,
    newIngredient: Ingredient
  ) => {
    const updatedDays = [...mealPlan.days]
    const day = updatedDays[dayIndex]
    const meal = day.meals[mealIndex]

    // Update the ingredient
    meal.ingredients[ingredientIndex] = { ...newIngredient }

    // Recalculate meal macros from ingredient totals
    const newMealMacros = meal.ingredients.reduce(
      (totals, ing) => ({
        calories: totals.calories + (ing.calories || 0),
        protein: totals.protein + (ing.protein || 0),
        carbs: totals.carbs + (ing.carbs || 0),
        fat: totals.fat + (ing.fat || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    )

    // Round to reasonable precision
    meal.macros = {
      calories: Math.round(newMealMacros.calories),
      protein: Math.round(newMealMacros.protein * 10) / 10,
      carbs: Math.round(newMealMacros.carbs * 10) / 10,
      fat: Math.round(newMealMacros.fat * 10) / 10,
    }

    // Recalculate daily totals
    day.daily_totals = day.meals.reduce(
      (totals, m) => ({
        calories: totals.calories + m.macros.calories,
        protein: totals.protein + m.macros.protein,
        carbs: totals.carbs + m.macros.carbs,
        fat: totals.fat + m.macros.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    )

    // Save to database
    const { error: planError } = await supabase
      .from('meal_plans')
      .update({ plan_data: updatedDays })
      .eq('id', mealPlan.id)

    if (planError) {
      console.error('Error saving meal plan:', planError)
      return false
    }

    // Also update validated_meals_by_user with the new macros and ingredient nutrition
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase
        .from('validated_meals_by_user')
        .upsert({
          user_id: user.id,
          meal_name: meal.name,
          calories: meal.macros.calories,
          protein: meal.macros.protein,
          carbs: meal.macros.carbs,
          fat: meal.macros.fat,
          ingredients: meal.ingredients.map(ing => ({
            name: ing.name,
            amount: ing.amount,
            unit: ing.unit,
            calories: ing.calories || 0,
            protein: ing.protein || 0,
            carbs: ing.carbs || 0,
            fat: ing.fat || 0,
          })),
        }, {
          onConflict: 'user_id,meal_name',
        })
    }

    setMealPlan({ ...mealPlan, days: updatedDays })
    return true
  }

  const toggleMealPreference = async (mealName: string, preference: MealPreferenceType) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const currentPref = mealPreferences[mealName]

    if (currentPref === preference) {
      // Remove preference if clicking the same button
      const { error } = await supabase
        .from('meal_preferences')
        .delete()
        .eq('user_id', user.id)
        .eq('meal_name', mealName)

      if (!error) {
        const newPrefs = { ...mealPreferences }
        delete newPrefs[mealName]
        setMealPreferences(newPrefs)
      }
    } else {
      // Upsert preference
      const { error } = await supabase
        .from('meal_preferences')
        .upsert({
          user_id: user.id,
          meal_name: mealName,
          preference: preference,
        }, {
          onConflict: 'user_id,meal_name',
        })

      if (!error) {
        setMealPreferences({ ...mealPreferences, [mealName]: preference })
      }
    }
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
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  placeholder="Enter meal plan title..."
                  className="input-field text-xl font-bold"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveTitle()
                    if (e.key === 'Escape') {
                      setTitleValue(mealPlan.title || '')
                      setIsEditingTitle(false)
                    }
                  }}
                />
                <button
                  onClick={saveTitle}
                  disabled={savingTitle}
                  className="px-3 py-1 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50"
                >
                  {savingTitle ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setTitleValue(mealPlan.title || '')
                    setIsEditingTitle(false)
                  }}
                  className="px-3 py-1 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-900">
                  {mealPlan.title || 'Meal Plan'}
                </h1>
                <button
                  onClick={() => setIsEditingTitle(true)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                  title="Edit title"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              </div>
            )}
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
              href={`/prep-view/${mealPlan.id}`}
              className="btn-outline"
            >
              Prep Schedule
            </Link>
            <Link
              href={`/grocery-list/${mealPlan.id}`}
              className="btn-primary"
            >
              Grocery List
            </Link>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setViewMode('meals')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'meals'
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Meal View
          </button>
          <button
            onClick={() => setViewMode('prep')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'prep'
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            Prep View
          </button>
        </div>

        {/* Core Ingredients (shown in both views) */}
        {mealPlan.core_ingredients && (
          <div className="mb-6">
            <CoreIngredientsCard coreIngredients={mealPlan.core_ingredients} />
          </div>
        )}

        {viewMode === 'meals' ? (
          <>
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
                      {Math.round(currentDayPlan.daily_totals.calories)}
                    </p>
                    <p className="text-sm text-gray-500">Calories</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-blue-600">
                      {Math.round(currentDayPlan.daily_totals.protein)}g
                    </p>
                    <p className="text-sm text-gray-500">Protein</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-orange-600">
                      {Math.round(currentDayPlan.daily_totals.carbs)}g
                    </p>
                    <p className="text-sm text-gray-500">Carbs</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-purple-600">
                      {Math.round(currentDayPlan.daily_totals.fat)}g
                    </p>
                    <p className="text-sm text-gray-500">Fat</p>
                  </div>
                </div>
              </div>
            )}

            {/* Meals */}
            <div className="space-y-4">
              {sortedMeals.map((meal, index) => {
                const dayIndex = mealPlan.days.findIndex(d => d.day === selectedDay)
                const mealIndex = currentDayPlan?.meals.findIndex(m => m === meal) ?? index
                return (
                  <MealCard
                    key={`${meal.name}-${index}`}
                    meal={meal}
                    isExpanded={expandedMeal === `${meal.name}-${index}`}
                    onToggle={() =>
                      setExpandedMeal(
                        expandedMeal === `${meal.name}-${index}` ? null : `${meal.name}-${index}`
                      )
                    }
                    preference={mealPreferences[meal.name]}
                    onLike={() => toggleMealPreference(meal.name, 'liked')}
                    onDislike={() => toggleMealPreference(meal.name, 'disliked')}
                    onMacrosChange={(newMacros) => updateMealMacros(dayIndex, mealIndex, newMacros)}
                    onIngredientChange={(ingredientIndex, newIngredient) =>
                      updateIngredientInMeal(dayIndex, mealIndex, ingredientIndex, newIngredient)
                    }
                    mealPlanId={mealPlan.id}
                  />
                )
              })}
            </div>
          </>
        ) : (
          /* Prep Mode View */
          loadingPrepMode ? (
            <div className="card text-center py-8">
              <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-gray-500">Loading prep mode...</p>
            </div>
          ) : (
            <PrepModeView prepSessions={prepSessions} dailyAssembly={dailyAssembly} />
          )
        )}
      </main>
    </div>
  )
}

function MealCard({
  meal,
  isExpanded,
  onToggle,
  preference,
  onLike,
  onDislike,
  onMacrosChange,
  onIngredientChange,
  mealPlanId,
}: {
  meal: Meal
  isExpanded: boolean
  onToggle: () => void
  preference?: MealPreferenceType
  onLike: () => void
  onDislike: () => void
  onMacrosChange: (macros: Macros) => Promise<boolean>
  onIngredientChange: (ingredientIndex: number, newIngredient: Ingredient) => Promise<boolean>
  mealPlanId: string
}) {
  const [isEditingMacros, setIsEditingMacros] = useState(false)
  const [macrosValue, setMacrosValue] = useState({
    calories: meal.macros.calories.toString(),
    protein: meal.macros.protein.toString(),
    carbs: meal.macros.carbs.toString(),
    fat: meal.macros.fat.toString(),
  })
  const [savingMacros, setSavingMacros] = useState(false)
  const [editingIngredientIndex, setEditingIngredientIndex] = useState<number | null>(null)
  const [savingIngredient, setSavingIngredient] = useState(false)

  const mealTypeColors: Record<string, string> = {
    breakfast: 'bg-yellow-100 text-yellow-800',
    lunch: 'bg-teal-100 text-teal-800',
    dinner: 'bg-blue-100 text-blue-800',
    snack: 'bg-purple-100 text-purple-800',
  }

  const resetMacrosValue = () => {
    setMacrosValue({
      calories: meal.macros.calories.toString(),
      protein: meal.macros.protein.toString(),
      carbs: meal.macros.carbs.toString(),
      fat: meal.macros.fat.toString(),
    })
  }

  const handleSaveMacros = async () => {
    const newMacros = {
      calories: parseInt(macrosValue.calories, 10),
      protein: parseInt(macrosValue.protein, 10),
      carbs: parseInt(macrosValue.carbs, 10),
      fat: parseInt(macrosValue.fat, 10),
    }

    // Validate all values
    if (Object.values(newMacros).some(v => isNaN(v) || v < 0)) {
      resetMacrosValue()
      setIsEditingMacros(false)
      return
    }

    setSavingMacros(true)
    const success = await onMacrosChange(newMacros)
    if (success) {
      setIsEditingMacros(false)
    } else {
      resetMacrosValue()
    }
    setSavingMacros(false)
  }

  const MacroInput = ({
    label,
    value,
    onChange,
    color
  }: {
    label: string
    value: string
    onChange: (v: string) => void
    color: string
  }) => {
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.target.value
      // Allow empty or digits only
      if (rawValue === '' || /^\d*$/.test(rawValue)) {
        onChange(rawValue)
      }
    }

    return (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={handleInputChange}
          className={`w-16 px-2 py-1 border border-gray-300 rounded text-sm ${color}`}
          onClick={(e) => e.stopPropagation()}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') handleSaveMacros()
            if (e.key === 'Escape') {
              resetMacrosValue()
              setIsEditingMacros(false)
            }
          }}
        />
        <span className={`text-sm ${color}`}>{label}</span>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <button
          onClick={onToggle}
          className="flex-1 text-left"
        >
          <div className="flex items-center gap-3 mb-2">
            <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${mealTypeColors[meal.type]}`}>
              {meal.type}
            </span>
            <span className="text-sm text-gray-500">
              {meal.prep_time_minutes} min prep
            </span>
          </div>
          <h4 className="text-lg font-semibold text-gray-900">{meal.name}</h4>
          {isEditingMacros ? (
            <div className="flex flex-wrap items-center gap-3 mt-2" onClick={(e) => e.stopPropagation()}>
              <MacroInput
                label="kcal"
                value={macrosValue.calories}
                onChange={(v) => setMacrosValue({ ...macrosValue, calories: v })}
                color="text-gray-600"
              />
              <MacroInput
                label="g protein"
                value={macrosValue.protein}
                onChange={(v) => setMacrosValue({ ...macrosValue, protein: v })}
                color="text-blue-600"
              />
              <MacroInput
                label="g carbs"
                value={macrosValue.carbs}
                onChange={(v) => setMacrosValue({ ...macrosValue, carbs: v })}
                color="text-orange-600"
              />
              <MacroInput
                label="g fat"
                value={macrosValue.fat}
                onChange={(v) => setMacrosValue({ ...macrosValue, fat: v })}
                color="text-purple-600"
              />
              <div className="flex gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleSaveMacros()
                  }}
                  disabled={savingMacros}
                  className="px-2 py-1 bg-primary-600 text-white rounded text-xs hover:bg-primary-700 disabled:opacity-50"
                >
                  {savingMacros ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    resetMacrosValue()
                    setIsEditingMacros(false)
                  }}
                  className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              className="flex flex-wrap gap-4 mt-2 text-sm cursor-pointer group"
              onClick={(e) => {
                e.stopPropagation()
                setIsEditingMacros(true)
              }}
              title="Click to edit macros"
            >
              <span className="text-gray-600">
                <span className="font-medium">{Math.round(meal.macros.calories)}</span> kcal
              </span>
              <span className="text-blue-600">
                <span className="font-medium">{Math.round(meal.macros.protein)}g</span> protein
              </span>
              <span className="text-orange-600">
                <span className="font-medium">{Math.round(meal.macros.carbs)}g</span> carbs
              </span>
              <span className="text-purple-600">
                <span className="font-medium">{Math.round(meal.macros.fat)}g</span> fat
              </span>
              <svg className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 self-center" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>
          )}
        </button>

        {/* Like/Dislike and Expand buttons */}
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onLike()
            }}
            className={`p-2 rounded-full transition-colors ${
              preference === 'liked'
                ? 'bg-green-100 text-green-600'
                : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
            }`}
            title="Like this meal"
          >
            <svg className="w-5 h-5" fill={preference === 'liked' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDislike()
            }}
            className={`p-2 rounded-full transition-colors ${
              preference === 'disliked'
                ? 'bg-red-100 text-red-600'
                : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
            }`}
            title="Dislike this meal"
          >
            <svg className="w-5 h-5" fill={preference === 'disliked' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018c.163 0 .326.02.485.06L17 4m-7 10v2a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
            </svg>
          </button>
          <button
            onClick={onToggle}
            className="p-2"
          >
            <svg
              className={`w-6 h-6 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Ingredients with Nutrition */}
            <div>
              <h5 className="font-medium text-gray-900 mb-2">
                Ingredients
                <span className="text-xs text-gray-400 font-normal ml-2">(click to edit nutrition)</span>
              </h5>
              <ul className="space-y-2">
                {meal.ingredients.map((ing, idx) => (
                  <IngredientRow
                    key={idx}
                    ingredient={ing}
                    isEditing={editingIngredientIndex === idx}
                    isSaving={savingIngredient && editingIngredientIndex === idx}
                    onStartEdit={() => setEditingIngredientIndex(idx)}
                    onCancelEdit={() => setEditingIngredientIndex(null)}
                    onSave={async (updatedIng) => {
                      setSavingIngredient(true)
                      const success = await onIngredientChange(idx, updatedIng)
                      if (success) {
                        setEditingIngredientIndex(null)
                      }
                      setSavingIngredient(false)
                    }}
                    mealName={meal.name}
                    mealPlanId={mealPlanId}
                  />
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

// Ingredient row component with inline editing
function IngredientRow({
  ingredient,
  isEditing,
  isSaving,
  onStartEdit,
  onCancelEdit,
  onSave,
  mealName,
  mealPlanId,
}: {
  ingredient: Ingredient
  isEditing: boolean
  isSaving: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: (updatedIngredient: Ingredient) => Promise<void>
  mealName: string
  mealPlanId: string
}) {
  const [editValues, setEditValues] = useState({
    calories: ingredient.calories?.toString() || '0',
    protein: ingredient.protein?.toString() || '0',
    carbs: ingredient.carbs?.toString() || '0',
    fat: ingredient.fat?.toString() || '0',
  })

  const hasNutritionData = ingredient.calories !== undefined

  const handleSave = async () => {
    const newCalories = parseFloat(editValues.calories) || 0
    const newProtein = parseFloat(editValues.protein) || 0
    const newCarbs = parseFloat(editValues.carbs) || 0
    const newFat = parseFloat(editValues.fat) || 0

    // Save to user overrides API
    try {
      await fetch('/api/ingredient-overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredient_name: ingredient.name,
          serving_size: parseFloat(ingredient.amount) || 1,
          serving_unit: ingredient.unit,
          original_calories: ingredient.calories,
          original_protein: ingredient.protein,
          original_carbs: ingredient.carbs,
          original_fat: ingredient.fat,
          override_calories: newCalories,
          override_protein: newProtein,
          override_carbs: newCarbs,
          override_fat: newFat,
          meal_plan_id: mealPlanId,
          meal_name: mealName,
        }),
      })
    } catch (error) {
      console.error('Error saving ingredient override:', error)
    }

    // Update local state
    await onSave({
      ...ingredient,
      calories: newCalories,
      protein: newProtein,
      carbs: newCarbs,
      fat: newFat,
    })
  }

  if (isEditing) {
    return (
      <li className="text-sm bg-gray-50 rounded-lg p-3 border border-gray-200">
        <div className="font-medium text-gray-900 mb-2">
          {ingredient.amount} {ingredient.unit} {ingredient.name}
        </div>
        <div className="grid grid-cols-4 gap-2 mb-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Calories</label>
            <input
              type="number"
              value={editValues.calories}
              onChange={(e) => setEditValues({ ...editValues, calories: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              step="0.1"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Protein</label>
            <input
              type="number"
              value={editValues.protein}
              onChange={(e) => setEditValues({ ...editValues, protein: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              step="0.1"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Carbs</label>
            <input
              type="number"
              value={editValues.carbs}
              onChange={(e) => setEditValues({ ...editValues, carbs: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              step="0.1"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Fat</label>
            <input
              type="number"
              value={editValues.fat}
              onChange={(e) => setEditValues({ ...editValues, fat: e.target.value })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              step="0.1"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-3 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={onCancelEdit}
            className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </li>
    )
  }

  return (
    <li
      className="text-sm text-gray-600 p-2 hover:bg-gray-50 rounded cursor-pointer group transition-colors"
      onClick={onStartEdit}
    >
      <div className="flex justify-between items-start">
        <span>{ingredient.amount} {ingredient.unit} {ingredient.name}</span>
        <svg className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 flex-shrink-0 ml-2 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </div>
      {hasNutritionData && (
        <div className="flex gap-3 text-xs text-gray-400 mt-1">
          <span>{ingredient.calories} cal</span>
          <span className="text-blue-400">{ingredient.protein}g P</span>
          <span className="text-orange-400">{ingredient.carbs}g C</span>
          <span className="text-purple-400">{ingredient.fat}g F</span>
        </div>
      )}
    </li>
  )
}
