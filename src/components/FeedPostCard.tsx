'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { SocialFeedPost, ValidatedMealIngredient } from '@/lib/types'
import { CUSTOM_MEAL_PREP_TIME_OPTIONS } from '@/lib/types'

interface Props {
  post: SocialFeedPost
  onSave: (postId: string) => Promise<void>
  onUnsave: (postId: string) => Promise<void>
}

export default function FeedPostCard({ post, onSave, onUnsave }: Props) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isSaved, setIsSaved] = useState(post.is_saved || false)
  const [saving, setSaving] = useState(false)

  const authorName = post.author?.display_name || post.author?.name || 'Anonymous'
  const prepTimeLabel = CUSTOM_MEAL_PREP_TIME_OPTIONS.find(
    o => o.value === post.prep_time
  )?.label

  const mealTypeColors: Record<string, string> = {
    breakfast: 'bg-yellow-100 text-yellow-800',
    lunch: 'bg-teal-100 text-teal-800',
    dinner: 'bg-blue-100 text-blue-800',
    snack: 'bg-purple-100 text-purple-800',
  }

  const handleToggleSave = async () => {
    setSaving(true)
    try {
      if (isSaved) {
        await onUnsave(post.id)
        setIsSaved(false)
      } else {
        await onSave(post.id)
        setIsSaved(true)
      }
    } catch (error) {
      console.error('Error toggling save:', error)
    }
    setSaving(false)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
      if (diffHours === 0) {
        const diffMins = Math.floor(diffMs / (1000 * 60))
        return diffMins <= 1 ? 'Just now' : `${diffMins}m ago`
      }
      return `${diffHours}h ago`
    } else if (diffDays === 1) {
      return 'Yesterday'
    } else if (diffDays < 7) {
      return `${diffDays}d ago`
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
  }

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/community/users/${post.user_id}`}
            className="font-medium text-gray-900 hover:text-primary-600"
          >
            {authorName}
          </Link>
          <span className="text-sm text-gray-500">{formatDate(post.created_at)}</span>
        </div>
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${
            post.source_type === 'custom_meal'
              ? 'bg-green-100 text-green-800'
              : 'bg-blue-100 text-blue-800'
          }`}
        >
          {post.source_type === 'custom_meal' ? 'Custom' : 'Favorite'}
        </span>
      </div>

      {/* Meal Content */}
      <div
        className="cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex gap-4">
          {post.image_url && (
            <div className="relative w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
              <Image
                src={post.image_url}
                alt={post.meal_name}
                fill
                className="object-cover"
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {post.meal_type && (
                <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${mealTypeColors[post.meal_type] || 'bg-gray-100 text-gray-800'}`}>
                  {post.meal_type}
                </span>
              )}
              {prepTimeLabel && (
                <span className="text-xs text-gray-500">{prepTimeLabel}</span>
              )}
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{post.meal_name}</h3>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="text-gray-600">
                <span className="font-medium">{post.calories}</span> kcal
              </span>
              <span className="text-blue-600">
                <span className="font-medium">{post.protein}g</span> protein
              </span>
              <span className="text-orange-600">
                <span className="font-medium">{post.carbs}g</span> carbs
              </span>
              <span className="text-purple-600">
                <span className="font-medium">{post.fat}g</span> fat
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Ingredients */}
            {post.ingredients && post.ingredients.length > 0 && (
              <div>
                <h5 className="font-medium text-gray-900 mb-2">Ingredients</h5>
                <ul className="space-y-1">
                  {(post.ingredients as ValidatedMealIngredient[]).map((ing, idx) => (
                    <li key={idx} className="text-sm text-gray-600">
                      {ing.amount} {ing.unit} {ing.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Instructions */}
            {post.instructions && post.instructions.length > 0 && (
              <div>
                <h5 className="font-medium text-gray-900 mb-2">Instructions</h5>
                <ol className="space-y-2">
                  {post.instructions.map((step, idx) => (
                    <li key={idx} className="text-sm text-gray-600">
                      <span className="font-medium text-gray-700">{idx + 1}.</span> {step}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <svg
            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          {isExpanded ? 'Show less' : 'Show more'}
        </button>

        <button
          onClick={handleToggleSave}
          disabled={saving}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
            isSaved
              ? 'bg-primary-100 text-primary-700 hover:bg-primary-200'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {saving ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg
              className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`}
              fill={isSaved ? 'currentColor' : 'none'}
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
              />
            </svg>
          )}
          {isSaved ? 'Saved' : 'Save to My Meals'}
        </button>
      </div>
    </div>
  )
}
