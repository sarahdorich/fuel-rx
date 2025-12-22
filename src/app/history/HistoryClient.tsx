'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface MealPlanSummary {
  id: string
  week_start_date: string
  title: string | null
  is_favorite: boolean
  created_at: string
}

interface Props {
  mealPlans: MealPlanSummary[]
}

export default function HistoryClient({ mealPlans: initialPlans }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [mealPlans, setMealPlans] = useState(initialPlans)
  const [filter, setFilter] = useState<'all' | 'favorites'>('all')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const filteredPlans = filter === 'favorites'
    ? mealPlans.filter(p => p.is_favorite)
    : mealPlans

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this meal plan?')) return

    setDeletingId(id)
    const { error } = await supabase
      .from('meal_plans')
      .delete()
      .eq('id', id)

    if (!error) {
      setMealPlans(prev => prev.filter(p => p.id !== id))
    }
    setDeletingId(null)
  }

  const toggleFavorite = async (id: string, currentValue: boolean) => {
    const { error } = await supabase
      .from('meal_plans')
      .update({ is_favorite: !currentValue })
      .eq('id', id)

    if (!error) {
      setMealPlans(prev =>
        prev.map(p =>
          p.id === id ? { ...p, is_favorite: !currentValue } : p
        )
      )
    }
  }

  if (mealPlans.length === 0) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-600 mb-4">You haven&apos;t created any meal plans yet.</p>
        <Link href="/dashboard" className="btn-primary">
          Create Your First Plan
        </Link>
      </div>
    )
  }

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'all'
              ? 'bg-primary-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          All Plans ({mealPlans.length})
        </button>
        <button
          onClick={() => setFilter('favorites')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'favorites'
              ? 'bg-primary-600 text-white'
              : 'bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          Favorites ({mealPlans.filter(p => p.is_favorite).length})
        </button>
      </div>

      {/* Plans list */}
      {filteredPlans.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-gray-600">No favorite plans yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPlans.map(plan => (
            <div key={plan.id} className="card">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {plan.title || `Week of ${new Date(plan.week_start_date).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}`}
                    </h3>
                    {plan.is_favorite && (
                      <svg
                        className="w-5 h-5 text-yellow-500 fill-current"
                        viewBox="0 0 24 24"
                      >
                        <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    Week of {new Date(plan.week_start_date).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })} &middot; Created {new Date(plan.created_at).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleFavorite(plan.id, plan.is_favorite)}
                    className="p-2 text-gray-400 hover:text-yellow-500 transition-colors"
                    title={plan.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <svg
                      className={`w-5 h-5 ${plan.is_favorite ? 'fill-current text-yellow-500' : ''}`}
                      fill={plan.is_favorite ? 'currentColor' : 'none'}
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
                  </button>

                  <Link
                    href={`/meal-plan/${plan.id}`}
                    className="btn-primary text-sm"
                  >
                    View
                  </Link>

                  <Link
                    href={`/grocery-list/${plan.id}`}
                    className="btn-outline text-sm"
                  >
                    Grocery List
                  </Link>

                  <button
                    onClick={() => handleDelete(plan.id)}
                    disabled={deletingId === plan.id}
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    title="Delete plan"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
