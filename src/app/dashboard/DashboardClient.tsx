'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { DIETARY_PREFERENCE_LABELS } from '@/lib/types'
import type { UserProfile, DietaryPreference } from '@/lib/types'

interface Props {
  profile: UserProfile | null
  recentPlan: {
    id: string
    week_start_date: string
    created_at: string
    is_favorite: boolean
  } | null
}

export default function DashboardClient({ profile, recentPlan }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const handleGeneratePlan = async () => {
    setGenerating(true)
    setError(null)

    try {
      const response = await fetch('/api/generate-meal-plan', {
        method: 'POST',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to generate meal plan')
      }

      const data = await response.json()
      router.push(`/meal-plan/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setGenerating(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-primary-600">Coach Hill&apos;s FuelRx</h1>
          <div className="flex items-center gap-4">
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
                  Generating your plan...
                </span>
              ) : (
                'Generate Meal Plan'
              )}
            </button>
            {generating && (
              <p className="text-sm text-gray-500 mt-3 text-center">
                This may take 30-60 seconds
              </p>
            )}
          </div>

          {/* Recent plan card */}
          <div className="card">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">
              {recentPlan ? 'Your Latest Plan' : 'No Plans Yet'}
            </h3>
            {recentPlan ? (
              <>
                <p className="text-gray-600 mb-2">
                  Week of {new Date(recentPlan.week_start_date).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
                <p className="text-sm text-gray-500 mb-6">
                  Created {new Date(recentPlan.created_at).toLocaleDateString()}
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
              <Link
                href="/onboarding"
                className="text-primary-600 hover:text-primary-700 text-sm font-medium"
              >
                Edit
              </Link>
            </div>

            {profile ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Daily Macros</p>
                  <div className="space-y-1">
                    <p className="font-medium">
                      {profile.target_calories} kcal
                    </p>
                    <p className="text-sm text-gray-600">
                      P: {profile.target_protein}g | C: {profile.target_carbs}g | F: {profile.target_fat}g
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-gray-500 mb-1">Dietary Preferences</p>
                  <p className="font-medium">
                    {profile.dietary_prefs
                      .map((pref: DietaryPreference) => DIETARY_PREFERENCE_LABELS[pref])
                      .join(', ')}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-500 mb-1">Meals Per Day</p>
                  <p className="font-medium">{profile.meals_per_day} meals</p>
                </div>

                <div>
                  <p className="text-sm text-gray-500 mb-1">Max Prep Time</p>
                  <p className="font-medium">{profile.prep_time} minutes</p>
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
      </main>
    </div>
  )
}
