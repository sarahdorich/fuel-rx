'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { IngredientPreferenceWithDetails, IngredientCategoryType, IngredientRecord } from '@/lib/types'

interface Props {
  initialPreferences: IngredientPreferenceWithDetails[]
}

const CATEGORY_LABELS: Record<IngredientCategoryType, string> = {
  protein: 'Proteins',
  vegetable: 'Vegetables',
  fruit: 'Fruits',
  grain: 'Grains & Starches',
  fat: 'Fats & Nuts',
  dairy: 'Dairy',
  pantry: 'Pantry Items',
  other: 'Other',
}

const CATEGORY_COLORS: Record<IngredientCategoryType, string> = {
  protein: 'bg-red-100 text-red-800 border-red-200',
  vegetable: 'bg-green-100 text-green-800 border-green-200',
  fruit: 'bg-orange-100 text-orange-800 border-orange-200',
  grain: 'bg-amber-100 text-amber-800 border-amber-200',
  fat: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  dairy: 'bg-blue-100 text-blue-800 border-blue-200',
  pantry: 'bg-purple-100 text-purple-800 border-purple-200',
  other: 'bg-gray-100 text-gray-800 border-gray-200',
}

export default function IngredientSettingsClient({ initialPreferences }: Props) {
  const [preferences, setPreferences] = useState(initialPreferences)
  const [filterType, setFilterType] = useState<'all' | 'liked' | 'disliked'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<IngredientRecord[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)

  const filteredPreferences = preferences.filter(pref => {
    const matchesFilter = filterType === 'all' || pref.preference === filterType
    const matchesSearch = pref.ingredient_name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesFilter && matchesSearch
  })

  const likedPreferences = filteredPreferences.filter(p => p.preference === 'liked')
  const dislikedPreferences = filteredPreferences.filter(p => p.preference === 'disliked')

  const groupByCategory = (prefs: IngredientPreferenceWithDetails[]) => {
    const grouped: Record<string, IngredientPreferenceWithDetails[]> = {}
    prefs.forEach(pref => {
      const category = pref.category || 'other'
      if (!grouped[category]) {
        grouped[category] = []
      }
      grouped[category].push(pref)
    })
    return grouped
  }

  const handleSearch = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    try {
      const response = await fetch(`/api/ingredients?search=${encodeURIComponent(query)}&limit=20`)
      if (response.ok) {
        const data = await response.json()
        // Filter out ingredients that already have preferences
        const existingIds = new Set(preferences.map(p => p.ingredient_id))
        setSearchResults(data.filter((ing: IngredientRecord) => !existingIds.has(ing.id)))
      }
    } catch (error) {
      console.error('Error searching ingredients:', error)
    }
    setIsSearching(false)
  }

  const handleAddPreference = async (ingredient: IngredientRecord, preference: 'liked' | 'disliked') => {
    try {
      const response = await fetch('/api/ingredient-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredient_id: ingredient.id,
          preference: preference,
        }),
      })

      if (response.ok) {
        const newPref: IngredientPreferenceWithDetails = {
          id: '', // Will be set by the API
          user_id: '',
          ingredient_id: ingredient.id,
          preference: preference,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ingredient_name: ingredient.name,
          name_normalized: ingredient.name_normalized,
          category: ingredient.category,
        }
        setPreferences([...preferences, newPref])
        setSearchResults(searchResults.filter(r => r.id !== ingredient.id))
      }
    } catch (error) {
      console.error('Error adding preference:', error)
    }
  }

  const handleTogglePreference = async (pref: IngredientPreferenceWithDetails) => {
    const newPreference = pref.preference === 'liked' ? 'disliked' : 'liked'

    try {
      const response = await fetch('/api/ingredient-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredient_id: pref.ingredient_id,
          preference: newPreference,
        }),
      })

      if (response.ok) {
        setPreferences(preferences.map(p =>
          p.ingredient_id === pref.ingredient_id
            ? { ...p, preference: newPreference }
            : p
        ))
      }
    } catch (error) {
      console.error('Error toggling preference:', error)
    }
  }

  const handleRemovePreference = async (pref: IngredientPreferenceWithDetails) => {
    try {
      const response = await fetch(`/api/ingredient-preferences?ingredient_id=${pref.ingredient_id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setPreferences(preferences.filter(p => p.ingredient_id !== pref.ingredient_id))
      }
    } catch (error) {
      console.error('Error removing preference:', error)
    }
  }

  const renderPreferenceCard = (pref: IngredientPreferenceWithDetails) => (
    <div
      key={pref.ingredient_id}
      className={`flex items-center justify-between p-3 rounded-lg border ${
        CATEGORY_COLORS[pref.category as IngredientCategoryType || 'other']
      }`}
    >
      <span className="font-medium">{pref.ingredient_name}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleTogglePreference(pref)}
          className={`p-1.5 rounded-full transition-colors ${
            pref.preference === 'liked'
              ? 'bg-green-200 text-green-700 hover:bg-green-300'
              : 'bg-red-200 text-red-700 hover:bg-red-300'
          }`}
          title={pref.preference === 'liked' ? 'Switch to dislike' : 'Switch to like'}
        >
          {pref.preference === 'liked' ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018c.163 0 .326.02.485.06L17 4m-7 10v2a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
            </svg>
          )}
        </button>
        <button
          onClick={() => handleRemovePreference(pref)}
          className="p-1.5 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          title="Remove preference"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )

  const renderCategorySection = (prefs: IngredientPreferenceWithDetails[], title: string, emptyMessage: string) => {
    const grouped = groupByCategory(prefs)
    const categories = Object.keys(grouped).sort()

    if (prefs.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          {emptyMessage}
        </div>
      )
    }

    return (
      <div className="space-y-6">
        {categories.map(category => (
          <div key={category}>
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              {CATEGORY_LABELS[category as IngredientCategoryType] || category}
            </h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {grouped[category].map(renderPreferenceCard)}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-primary-600">Ingredient Preferences</h1>
          <Link href="/settings" className="text-gray-600 hover:text-gray-900">
            Back to Settings
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Info Card */}
        <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 mb-6">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-primary-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm text-primary-800">
                <strong>How it works:</strong> Your ingredient preferences help personalize your meal plans.
                Liked ingredients will be favored, and disliked ingredients will be avoided when generating new meal plans.
              </p>
              <p className="text-sm text-primary-700 mt-1">
                You can also like/dislike ingredients directly from the meal plan view by clicking on them.
              </p>
            </div>
          </div>
        </div>

        {/* Add Ingredient Button */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filterType === 'all'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All ({preferences.length})
            </button>
            <button
              onClick={() => setFilterType('liked')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filterType === 'liked'
                  ? 'bg-green-600 text-white'
                  : 'bg-green-50 text-green-600 hover:bg-green-100'
              }`}
            >
              Liked ({preferences.filter(p => p.preference === 'liked').length})
            </button>
            <button
              onClick={() => setFilterType('disliked')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filterType === 'disliked'
                  ? 'bg-red-600 text-white'
                  : 'bg-red-50 text-red-600 hover:bg-red-100'
              }`}
            >
              Disliked ({preferences.filter(p => p.preference === 'disliked').length})
            </button>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Ingredient
          </button>
        </div>

        {/* Search within current preferences */}
        {preferences.length > 5 && (
          <div className="mb-6">
            <input
              type="text"
              placeholder="Search your preferences..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field w-full"
            />
          </div>
        )}

        {/* Preferences Display */}
        {filterType === 'all' ? (
          <div className="grid md:grid-cols-2 gap-8">
            {/* Liked Column */}
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-green-100 rounded-lg">
                  <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Liked Ingredients</h3>
              </div>
              {renderCategorySection(likedPreferences, 'Liked', 'No liked ingredients yet. Like ingredients from your meal plans to see them here.')}
            </div>

            {/* Disliked Column */}
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-red-100 rounded-lg">
                  <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018c.163 0 .326.02.485.06L17 4m-7 10v2a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Disliked Ingredients</h3>
              </div>
              {renderCategorySection(dislikedPreferences, 'Disliked', 'No disliked ingredients yet. Dislike ingredients to exclude them from future meal plans.')}
            </div>
          </div>
        ) : (
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {filterType === 'liked' ? 'Liked Ingredients' : 'Disliked Ingredients'}
            </h3>
            {renderCategorySection(
              filteredPreferences,
              filterType === 'liked' ? 'Liked' : 'Disliked',
              filterType === 'liked'
                ? 'No liked ingredients yet.'
                : 'No disliked ingredients yet.'
            )}
          </div>
        )}

        {/* Add Ingredient Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden">
              <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">Add Ingredient Preference</h2>
                <button
                  onClick={() => {
                    setShowAddModal(false)
                    setSearchResults([])
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-4">
                <input
                  type="text"
                  placeholder="Search for an ingredient..."
                  className="input-field w-full"
                  autoFocus
                  onChange={(e) => handleSearch(e.target.value)}
                />
                {isSearching && (
                  <div className="text-center py-4 text-gray-500">
                    Searching...
                  </div>
                )}
                <div className="mt-4 max-h-64 overflow-y-auto">
                  {searchResults.length > 0 ? (
                    <div className="space-y-2">
                      {searchResults.map((ingredient) => (
                        <div
                          key={ingredient.id}
                          className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
                        >
                          <div>
                            <span className="font-medium text-gray-900">{ingredient.name}</span>
                            {ingredient.category && (
                              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                                CATEGORY_COLORS[ingredient.category as IngredientCategoryType]
                              }`}>
                                {CATEGORY_LABELS[ingredient.category as IngredientCategoryType]}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAddPreference(ingredient, 'liked')}
                              className="p-2 rounded-full bg-green-50 text-green-600 hover:bg-green-100"
                              title="Like"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleAddPreference(ingredient, 'disliked')}
                              className="p-2 rounded-full bg-red-50 text-red-600 hover:bg-red-100"
                              title="Dislike"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018c.163 0 .326.02.485.06L17 4m-7 10v2a2 2 0 002 2h.095c.5 0 .905-.405.905-.905 0-.714.211-1.412.608-2.006L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      {isSearching ? '' : 'Type to search for ingredients...'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
