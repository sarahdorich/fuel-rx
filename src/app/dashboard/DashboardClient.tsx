'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { DIETARY_PREFERENCE_LABELS, MEAL_TYPE_LABELS, DEFAULT_MEAL_CONSISTENCY_PREFS, PREP_STYLE_LABELS, MEAL_COMPLEXITY_LABELS, DEFAULT_HOUSEHOLD_SERVINGS_PREFS, DAYS_OF_WEEK, DAY_OF_WEEK_LABELS, CHILD_PORTION_MULTIPLIER } from '@/lib/types'
import type { UserProfile, DietaryPreference, MealType, PrepStyle, MealComplexity, HouseholdServingsPrefs, DayOfWeek } from '@/lib/types'
import EditMacrosModal from '@/components/EditMacrosModal'
import EditPreferencesModal from '@/components/EditPreferencesModal'
import EditVarietyModal from '@/components/EditVarietyModal'

interface Props {
  profile: UserProfile | null
  recentPlan: {
    id: string
    week_start_date: string
    created_at: string
    is_favorite: boolean
    title: string | null
  } | null
}

// Progress stage configuration for visual feedback
const PROGRESS_STAGES = {
  ingredients: { label: 'Selecting Ingredients', icon: '🥗', progress: 15 },
  ingredients_done: { label: 'Ingredients Selected', icon: '✓', progress: 25 },
  meals: { label: 'Creating Meals', icon: '🍽️', progress: 35 },
  meals_done: { label: 'Meals Created', icon: '✓', progress: 60 },
  finalizing: { label: 'Building Grocery List & Prep Schedule', icon: '📋', progress: 75 },
  finalizing_done: { label: 'Almost Done', icon: '✓', progress: 90 },
  saving: { label: 'Saving Your Plan', icon: '💾', progress: 95 },
} as const

type ProgressStage = keyof typeof PROGRESS_STAGES

export default function DashboardClient({ profile: initialProfile, recentPlan }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [profile, setProfile] = useState(initialProfile)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progressStage, setProgressStage] = useState<ProgressStage | null>(null)
  const [progressMessage, setProgressMessage] = useState<string>('')

  // Modal states
  const [showMacrosModal, setShowMacrosModal] = useState(false)
  const [showPreferencesModal, setShowPreferencesModal] = useState(false)
  const [showVarietyModal, setShowVarietyModal] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const handleGeneratePlan = async () => {
    setGenerating(true)
    setError(null)
    setProgressStage(null)
    setProgressMessage('Starting...')

    try {
      const response = await fetch('/api/generate-meal-plan-stream', {
        method: 'POST',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to generate meal plan')
      }

      // Handle SSE stream
      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response stream')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse SSE events from buffer
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        let eventType = ''
        let eventData = ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7)
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6)

            if (eventType && eventData) {
              try {
                const data = JSON.parse(eventData)

                if (eventType === 'progress') {
                  setProgressStage(data.stage as ProgressStage)
                  setProgressMessage(data.message)
                } else if (eventType === 'complete') {
                  router.push(`/meal-plan/${data.id}`)
                  return
                } else if (eventType === 'error') {
                  throw new Error(data.error)
                }
              } catch (parseError) {
                console.error('Error parsing SSE data:', parseError)
              }
            }

            eventType = ''
            eventData = ''
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setGenerating(false)
      setProgressStage(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-primary-600">Coach Hill&apos;s FuelRx</h1>
          <div className="flex items-center gap-4">
            <Link href="/community" className="text-gray-600 hover:text-gray-900">
              Community
            </Link>
            <Link href="/custom-meals" className="text-gray-600 hover:text-gray-900">
              My Meals
            </Link>
            <Link href="/history" className="text-gray-600 hover:text-gray-900">
              My Plans
            </Link>
            <button
              onClick={handleLogout}
              className="text-gray-600 hover:text-gray-900"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">
            Welcome{profile?.name ? `, ${profile.name}` : ''}!
          </h2>
          <p className="text-gray-600 mt-1">
            Ready to fuel your training with personalized meal plans.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Generate new plan card */}
          <div className="card">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">
              Generate New Meal Plan
            </h3>
            <p className="text-gray-600 mb-6">
              Create a new 7-day meal plan based on your macro targets and preferences.
              All meals feature healthy, whole foods.
            </p>
            <button
              onClick={handleGeneratePlan}
              disabled={generating}
              className="btn-primary w-full"
            >
              {generating ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Generating...
                </span>
              ) : (
                'Generate Meal Plan'
              )}
            </button>
            {generating && (
              <div className="mt-4 space-y-3">
                {/* Progress bar */}
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-primary-600 h-2 rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${progressStage ? PROGRESS_STAGES[progressStage]?.progress || 5 : 5}%`,
                    }}
                  />
                </div>

                {/* Current stage message */}
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700">
                    {progressStage && PROGRESS_STAGES[progressStage] ? (
                      <span className="flex items-center justify-center gap-2">
                        <span>{PROGRESS_STAGES[progressStage].icon}</span>
                        <span>{PROGRESS_STAGES[progressStage].label}</span>
                      </span>
                    ) : (
                      'Starting...'
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {progressMessage}
                  </p>
                </div>

                {/* Stage indicators */}
                <div className="flex justify-between items-center text-xs text-gray-400 px-1">
                  <span className={progressStage && PROGRESS_STAGES[progressStage]?.progress >= 25 ? 'text-primary-600' : ''}>
                    Ingredients
                  </span>
                  <span className={progressStage && PROGRESS_STAGES[progressStage]?.progress >= 60 ? 'text-primary-600' : ''}>
                    Meals
                  </span>
                  <span className={progressStage && PROGRESS_STAGES[progressStage]?.progress >= 90 ? 'text-primary-600' : ''}>
                    Prep Plan
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Recent plan card */}
          <div className="card">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">
              {recentPlan ? (recentPlan.title || 'Your Latest Plan') : 'No Plans Yet'}
            </h3>
            {recentPlan ? (
              <>
                <p className="text-gray-600 mb-2">
                  Week of {new Date(recentPlan.week_start_date + 'T00:00:00').toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
                <p className="text-sm text-gray-500 mb-6">
                  Created {new Date(recentPlan.created_at).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
                </p>
                <div className="flex gap-3">
                  <Link
                    href={`/meal-plan/${recentPlan.id}`}
                    className="btn-primary flex-1 text-center"
                  >
                    View Plan
                  </Link>
                  <Link
                    href={`/grocery-list/${recentPlan.id}`}
                    className="btn-outline flex-1 text-center"
                  >
                    Grocery List
                  </Link>
                </div>
              </>
            ) : (
              <p className="text-gray-600">
                Generate your first meal plan to get started!
              </p>
            )}
          </div>

          {/* Profile summary card */}
          <div className="card md:col-span-2">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-semibold text-gray-900">
                Your Profile
              </h3>
              <div className="flex gap-4">
                <Link
                  href="/settings"
                  className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                >
                  All Settings
                </Link>
                <Link
                  href="/onboarding"
                  className="text-gray-400 hover:text-gray-600 text-sm"
                >
                  Full Setup
                </Link>
              </div>
            </div>

            {profile ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm text-gray-500">Daily Macros</p>
                    <button
                      onClick={() => setShowMacrosModal(true)}
                      className="text-primary-600 hover:text-primary-700 text-xs font-medium"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium">
                      {profile.target_calories} kcal
                    </p>
                    <p className="text-sm text-gray-600">
                      P: {profile.target_protein}g | C: {profile.target_carbs}g | F: {profile.target_fat}g
                    </p>
                  </div>
                </div>

                <div className="sm:col-span-1 lg:col-span-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm text-gray-500">Preferences</p>
                    <button
                      onClick={() => setShowPreferencesModal(true)}
                      className="text-primary-600 hover:text-primary-700 text-xs font-medium"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1">
                    <p className="font-medium">
                      {profile.dietary_prefs
                        .map((pref: DietaryPreference) => DIETARY_PREFERENCE_LABELS[pref])
                        .join(', ')}
                    </p>
                    <p className="text-sm text-gray-600">
                      {profile.meals_per_day} meals/day
                    </p>
                    <p className="text-sm text-gray-600">
                      {profile.prep_time} min prep
                    </p>
                  </div>
                </div>

                <div className="sm:col-span-2 lg:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm text-gray-500">Meal Variety</p>
                    <button
                      onClick={() => setShowVarietyModal(true)}
                      className="text-primary-600 hover:text-primary-700 text-xs font-medium"
                    >
                      Edit
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(MEAL_TYPE_LABELS) as MealType[]).map((mealType) => {
                      const prefs = profile.meal_consistency_prefs ?? DEFAULT_MEAL_CONSISTENCY_PREFS;
                      const isConsistent = prefs[mealType] === 'consistent';
                      return (
                        <span
                          key={mealType}
                          className={`px-3 py-1 rounded-full text-sm ${
                            isConsistent
                              ? 'bg-primary-100 text-primary-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {MEAL_TYPE_LABELS[mealType]}: {isConsistent ? 'Same Daily' : 'Varied'}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="sm:col-span-1 lg:col-span-1">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm text-gray-500">Prep Style</p>
                    <Link
                      href="/settings/prep"
                      className="text-primary-600 hover:text-primary-700 text-xs font-medium"
                    >
                      Edit
                    </Link>
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-sm">
                      {PREP_STYLE_LABELS[profile.prep_style as PrepStyle]?.title || 'Mixed/Flexible'}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                      <span className="bg-gray-100 px-2 py-0.5 rounded">
                        B: {MEAL_COMPLEXITY_LABELS[profile.breakfast_complexity as MealComplexity]?.title || 'Minimal'}
                      </span>
                      <span className="bg-gray-100 px-2 py-0.5 rounded">
                        L: {MEAL_COMPLEXITY_LABELS[profile.lunch_complexity as MealComplexity]?.title || 'Minimal'}
                      </span>
                      <span className="bg-gray-100 px-2 py-0.5 rounded">
                        D: {MEAL_COMPLEXITY_LABELS[profile.dinner_complexity as MealComplexity]?.title || 'Full Recipe'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="sm:col-span-1 lg:col-span-1">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm text-gray-500">Household</p>
                    <Link
                      href="/settings/household"
                      className="text-primary-600 hover:text-primary-700 text-xs font-medium"
                    >
                      Edit
                    </Link>
                  </div>
                  {(() => {
                    const servings = profile.household_servings ?? DEFAULT_HOUSEHOLD_SERVINGS_PREFS;
                    const mealTypes = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;

                    // Check if any household members configured
                    const hasHousehold = DAYS_OF_WEEK.some(day =>
                      mealTypes.some(meal => servings[day]?.[meal]?.adults > 0 || servings[day]?.[meal]?.children > 0)
                    );

                    if (!hasHousehold) {
                      return (
                        <p className="text-sm text-gray-500">
                          Just you (the athlete)
                        </p>
                      );
                    }

                    // Calculate total people served across the week
                    let totalAdults = 0;
                    let totalChildren = 0;
                    DAYS_OF_WEEK.forEach(day => {
                      mealTypes.forEach(meal => {
                        totalAdults += servings[day]?.[meal]?.adults || 0;
                        totalChildren += servings[day]?.[meal]?.children || 0;
                      });
                    });

                    return (
                      <div className="text-sm">
                        <p className="font-medium text-gray-900">
                          + {totalAdults > 0 ? `${totalAdults} adult meals` : ''}{totalAdults > 0 && totalChildren > 0 ? ', ' : ''}{totalChildren > 0 ? `${totalChildren} child meals` : ''}/week
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          (varies by day)
                        </p>
                      </div>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <p className="text-gray-600">
                <Link href="/onboarding" className="text-primary-600 hover:underline">
                  Complete your profile
                </Link>{' '}
                to get personalized meal plans.
              </p>
            )}
          </div>
        </div>

        {/* Edit Modals */}
        {profile && (
          <>
            <EditMacrosModal
              isOpen={showMacrosModal}
              onClose={() => setShowMacrosModal(false)}
              currentValues={{
                target_protein: profile.target_protein,
                target_carbs: profile.target_carbs,
                target_fat: profile.target_fat,
                target_calories: profile.target_calories,
              }}
              onSave={(values) => {
                setProfile({ ...profile, ...values })
              }}
            />
            <EditPreferencesModal
              isOpen={showPreferencesModal}
              onClose={() => setShowPreferencesModal(false)}
              currentValues={{
                dietary_prefs: profile.dietary_prefs,
                meals_per_day: profile.meals_per_day,
                prep_time: profile.prep_time,
              }}
              onSave={(values) => {
                setProfile({ ...profile, ...values })
              }}
            />
            <EditVarietyModal
              isOpen={showVarietyModal}
              onClose={() => setShowVarietyModal(false)}
              currentValues={profile.meal_consistency_prefs ?? DEFAULT_MEAL_CONSISTENCY_PREFS}
              onSave={(values) => {
                setProfile({ ...profile, meal_consistency_prefs: values })
              }}
            />
          </>
        )}
      </main>
    </div>
  )
}
