'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { ValidatedMeal, ValidatedMealIngredient } from '@/lib/types'
import NumericInput from '@/components/NumericInput'
import { compressImage, isValidImageType, formatFileSize } from '@/lib/imageCompression'

interface Props {
  initialMeals: ValidatedMeal[]
}

interface IngredientInput {
  name: string
  amount: string // Combined amount and unit (e.g., "1 cup", "100g")
  calories: number
  protein: number
  carbs: number
  fat: number
  isExpanded: boolean
}

const emptyIngredient: IngredientInput = {
  name: '',
  amount: '',
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  isExpanded: true,
}

export default function CustomMealsClient({ initialMeals }: Props) {
  const [meals, setMeals] = useState<ValidatedMeal[]>(initialMeals)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [mealName, setMealName] = useState('')
  const [ingredients, setIngredients] = useState<IngredientInput[]>([{ ...emptyIngredient }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedMealId, setExpandedMealId] = useState<string | null>(null)

  // Image upload state
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [compressionInfo, setCompressionInfo] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Share with community checkbox
  const [shareWithCommunity, setShareWithCommunity] = useState(false)

  // Quick Add mode - enter total macros directly without ingredients
  const [isQuickAddMode, setIsQuickAddMode] = useState(false)
  const [quickMacros, setQuickMacros] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 })

  // Calculate totals from ingredients or use quick macros
  const ingredientTotals = ingredients.reduce(
    (acc, ing) => ({
      calories: acc.calories + (ing.calories || 0),
      protein: acc.protein + (ing.protein || 0),
      carbs: acc.carbs + (ing.carbs || 0),
      fat: acc.fat + (ing.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
  const totals = isQuickAddMode ? quickMacros : ingredientTotals

  const toggleIngredientExpanded = (index: number) => {
    const updated = [...ingredients]
    updated[index] = { ...updated[index], isExpanded: !updated[index].isExpanded }
    setIngredients(updated)
  }

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

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImageError(null)
    setCompressionInfo(null)

    // Validate file type
    if (!isValidImageType(file)) {
      setImageError('Please select a JPEG, PNG, or WebP image')
      return
    }

    try {
      const originalSize = file.size

      // Compress the image
      const compressedBlob = await compressImage(file)
      const compressedSize = compressedBlob.size

      // Create a new File from the compressed blob
      const compressedFile = new File([compressedBlob], file.name, {
        type: 'image/jpeg',
      })

      setImageFile(compressedFile)
      setCompressionInfo(
        `Compressed: ${formatFileSize(originalSize)} → ${formatFileSize(compressedSize)} (${Math.round((1 - compressedSize / originalSize) * 100)}% smaller)`
      )

      // Create preview URL
      const previewUrl = URL.createObjectURL(compressedBlob)
      setImagePreview(previewUrl)
    } catch {
      setImageError('Failed to process image. Please try another file.')
    }
  }

  const removeImage = () => {
    setImageFile(null)
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview)
    }
    setImagePreview(null)
    setCompressionInfo(null)
    setImageError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile) return null

    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('image', imageFile)

      const response = await fetch('/api/upload-meal-image', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to upload image')
      }

      const { url } = await response.json()
      return url
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Failed to upload image')
      return null
    } finally {
      setUploadingImage(false)
    }
  }

  const handleSave = async () => {
    setError(null)

    if (!mealName.trim()) {
      setError('Please enter a meal name')
      return
    }

    // In quick add mode, we don't require ingredients
    const validIngredients = ingredients.filter((ing) => ing.name.trim() !== '')
    if (!isQuickAddMode && validIngredients.length === 0) {
      setError('Please add at least one ingredient with a name')
      return
    }

    // In quick add mode, require at least calories to be set
    if (isQuickAddMode && quickMacros.calories === 0) {
      setError('Please enter at least the calorie amount')
      return
    }

    setSaving(true)

    try {
      // Upload image first if one is selected
      let imageUrl: string | null = null
      if (imageFile) {
        imageUrl = await uploadImage()
        // Continue even if image upload fails - meal can be saved without image
      }

      // Build ingredients array - in quick add mode, create a single "whole meal" ingredient
      const ingredientsToSave = isQuickAddMode
        ? [{
            name: mealName.trim(),
            amount: '1',
            unit: 'serving',
            calories: Number(quickMacros.calories) || 0,
            protein: Number(quickMacros.protein) || 0,
            carbs: Number(quickMacros.carbs) || 0,
            fat: Number(quickMacros.fat) || 0,
          }]
        : validIngredients.map((ing) => {
            // Parse combined amount field (e.g., "1 cup" -> amount: "1", unit: "cup")
            const amountParts = ing.amount.trim().split(/\s+/)
            const amount = amountParts[0] || ''
            const unit = amountParts.slice(1).join(' ') || ''
            return {
              name: ing.name.trim(),
              amount,
              unit,
              calories: Number(ing.calories) || 0,
              protein: Number(ing.protein) || 0,
              carbs: Number(ing.carbs) || 0,
              fat: Number(ing.fat) || 0,
            }
          })

      const response = await fetch('/api/custom-meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meal_name: mealName.trim(),
          ingredients: ingredientsToSave,
          image_url: imageUrl,
          share_with_community: shareWithCommunity,
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
      removeImage()
      setShareWithCommunity(false)
      setIsQuickAddMode(false)
      setQuickMacros({ calories: 0, protein: 0, carbs: 0, fat: 0 })
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

            {/* Meal Name */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Meal Name *</label>
              <input
                type="text"
                value={mealName}
                onChange={(e) => setMealName(e.target.value)}
                placeholder="e.g., Protein Oatmeal Bowl"
                className="input text-lg"
              />
            </div>

            {/* Mode Toggle */}
            <div className="flex rounded-lg bg-gray-100 p-1 mb-6">
              <button
                type="button"
                onClick={() => setIsQuickAddMode(false)}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                  !isQuickAddMode
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                With Ingredients
              </button>
              <button
                type="button"
                onClick={() => setIsQuickAddMode(true)}
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                  isQuickAddMode
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Quick Add (Totals Only)
              </button>
            </div>

            {isQuickAddMode ? (
              /* Quick Add Mode - Just enter total macros */
              <div className="space-y-4">
                <p className="text-sm text-gray-500">
                  Enter the total macros for your meal. Perfect for meals where you already know the totals.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-orange-50 rounded-lg p-4">
                    <label className="flex items-center gap-2 text-sm font-medium text-orange-800 mb-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                      </svg>
                      Calories *
                    </label>
                    <NumericInput
                      value={quickMacros.calories}
                      onChange={(val) => setQuickMacros({ ...quickMacros, calories: val })}
                      min={0}
                      className="input text-lg font-semibold"
                    />
                  </div>
                  <div className="bg-blue-50 rounded-lg p-4">
                    <label className="flex items-center gap-2 text-sm font-medium text-blue-800 mb-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      Protein (g)
                    </label>
                    <NumericInput
                      value={quickMacros.protein}
                      onChange={(val) => setQuickMacros({ ...quickMacros, protein: val })}
                      min={0}
                      className="input text-lg font-semibold"
                    />
                  </div>
                  <div className="bg-amber-50 rounded-lg p-4">
                    <label className="flex items-center gap-2 text-sm font-medium text-amber-800 mb-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Carbs (g)
                    </label>
                    <NumericInput
                      value={quickMacros.carbs}
                      onChange={(val) => setQuickMacros({ ...quickMacros, carbs: val })}
                      min={0}
                      className="input text-lg font-semibold"
                    />
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4">
                    <label className="flex items-center gap-2 text-sm font-medium text-purple-800 mb-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                      Fat (g)
                    </label>
                    <NumericInput
                      value={quickMacros.fat}
                      onChange={(val) => setQuickMacros({ ...quickMacros, fat: val })}
                      min={0}
                      className="input text-lg font-semibold"
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* Detailed Ingredients Mode */
              <>
                <p className="text-sm text-gray-500 mb-4">
                  Add each ingredient with its macros. The total will be calculated automatically.
                </p>

                <div className="space-y-3">
                  {ingredients.map((ingredient, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
                      {/* Ingredient Header - Always visible */}
                      <div
                        className={`flex items-center gap-3 p-3 cursor-pointer transition-colors ${
                          ingredient.isExpanded ? 'bg-gray-50' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => toggleIngredientExpanded(index)}
                      >
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${
                            ingredient.isExpanded ? 'rotate-90' : ''
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          {ingredient.name ? (
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 truncate">
                                {ingredient.amount && `${ingredient.amount} `}{ingredient.name}
                              </span>
                              {(ingredient.calories > 0) && (
                                <span className="text-xs text-gray-500 flex-shrink-0">
                                  {ingredient.calories} cal
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">Ingredient {index + 1}</span>
                          )}
                        </div>
                        {ingredients.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              removeIngredient(index)
                            }}
                            className="text-gray-400 hover:text-red-600 p-1 flex-shrink-0"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* Expanded Details */}
                      {ingredient.isExpanded && (
                        <div className="p-4 pt-2 space-y-4 border-t border-gray-100">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Ingredient Name *</label>
                              <input
                                type="text"
                                value={ingredient.name}
                                onChange={(e) => updateIngredient(index, 'name', e.target.value)}
                                placeholder="e.g., Rolled oats"
                                className="input"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Amount (e.g., &quot;1 cup&quot;)</label>
                              <input
                                type="text"
                                value={ingredient.amount}
                                onChange={(e) => updateIngredient(index, 'amount', e.target.value)}
                                placeholder="e.g., 1 cup, 100g"
                                className="input"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>

                          {/* Macros Grid - 2x2 on mobile, 4 columns on desktop */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="bg-orange-50 rounded-lg p-3">
                              <label className="flex items-center gap-1.5 text-xs font-medium text-orange-700 mb-1">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                                </svg>
                                Calories
                              </label>
                              <NumericInput
                                value={ingredient.calories}
                                onChange={(val) => updateIngredient(index, 'calories', val)}
                                min={0}
                                className="input text-sm font-medium"
                              />
                            </div>
                            <div className="bg-blue-50 rounded-lg p-3">
                              <label className="flex items-center gap-1.5 text-xs font-medium text-blue-700 mb-1">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                Protein
                              </label>
                              <NumericInput
                                value={ingredient.protein}
                                onChange={(val) => updateIngredient(index, 'protein', val)}
                                min={0}
                                className="input text-sm font-medium"
                              />
                            </div>
                            <div className="bg-amber-50 rounded-lg p-3">
                              <label className="flex items-center gap-1.5 text-xs font-medium text-amber-700 mb-1">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                Carbs
                              </label>
                              <NumericInput
                                value={ingredient.carbs}
                                onChange={(val) => updateIngredient(index, 'carbs', val)}
                                min={0}
                                className="input text-sm font-medium"
                              />
                            </div>
                            <div className="bg-purple-50 rounded-lg p-3">
                              <label className="flex items-center gap-1.5 text-xs font-medium text-purple-700 mb-1">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                </svg>
                                Fat
                              </label>
                              <NumericInput
                                value={ingredient.fat}
                                onChange={(val) => updateIngredient(index, 'fat', val)}
                                min={0}
                                className="input text-sm font-medium"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  onClick={addIngredient}
                  className="flex items-center gap-2 text-primary-600 hover:text-primary-800 text-sm mt-3 font-medium"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Another Ingredient
                </button>

                {/* Running Totals */}
                <div className="bg-primary-50 rounded-lg p-4 mt-6">
                  <h4 className="text-sm font-medium text-primary-900 mb-3">Meal Totals</h4>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <p className="text-xl sm:text-2xl font-bold text-primary-700">{totals.calories}</p>
                      <p className="text-xs text-primary-600">Cal</p>
                    </div>
                    <div>
                      <p className="text-xl sm:text-2xl font-bold text-primary-700">{totals.protein}g</p>
                      <p className="text-xs text-primary-600">Protein</p>
                    </div>
                    <div>
                      <p className="text-xl sm:text-2xl font-bold text-primary-700">{totals.carbs}g</p>
                      <p className="text-xs text-primary-600">Carbs</p>
                    </div>
                    <div>
                      <p className="text-xl sm:text-2xl font-bold text-primary-700">{totals.fat}g</p>
                      <p className="text-xs text-primary-600">Fat</p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Image Upload */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Meal Photo (optional)
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Add a photo of your meal. Images are automatically compressed to save storage.
              </p>

              {imagePreview ? (
                <div className="relative">
                  <div className="relative w-full h-48 rounded-lg overflow-hidden bg-gray-100">
                    <Image
                      src={imagePreview}
                      alt="Meal preview"
                      fill
                      className="object-cover"
                    />
                  </div>
                  <button
                    onClick={removeImage}
                    className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1 hover:bg-red-700"
                    type="button"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  {compressionInfo && (
                    <p className="text-xs text-green-600 mt-2">{compressionInfo}</p>
                  )}
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-primary-400 transition-colors"
                >
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="mt-2 text-sm text-gray-600">Click to upload a photo</p>
                  <p className="text-xs text-gray-400">JPEG, PNG, WebP up to 5MB</p>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
                onChange={handleImageSelect}
                className="hidden"
              />

              {imageError && (
                <p className="text-sm text-red-600 mt-2">{imageError}</p>
              )}
            </div>

            {/* Share with Community */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shareWithCommunity}
                  onChange={(e) => setShareWithCommunity(e.target.checked)}
                  className="mt-1 h-4 w-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    Share this meal with the community
                  </span>
                  <p className="text-xs text-gray-500 mt-1">
                    Allow FuelRx AI to recommend this meal to other users when generating their meal plans.
                    Your name and personal info will not be shared.
                  </p>
                </div>
              </label>
            </div>

            {/* Form actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateForm(false)
                  setMealName('')
                  setIngredients([{ ...emptyIngredient }])
                  setError(null)
                  removeImage()
                  setShareWithCommunity(false)
                  setIsQuickAddMode(false)
                  setQuickMacros({ calories: 0, protein: 0, carbs: 0, fat: 0 })
                }}
                className="btn-outline flex-1"
                disabled={saving}
              >
                Cancel
              </button>
              <button onClick={handleSave} className="btn-primary flex-1" disabled={saving || uploadingImage}>
                {uploadingImage ? 'Uploading Image...' : saving ? 'Saving...' : 'Save Meal'}
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
                  <div className="flex gap-4">
                    {meal.image_url && (
                      <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                        <Image
                          src={meal.image_url}
                          alt={meal.meal_name}
                          fill
                          className="object-cover"
                        />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-gray-900">{meal.meal_name}</h3>
                        {meal.share_with_community && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            Shared
                          </span>
                        )}
                      </div>
                      <div className="flex gap-4 mt-1 text-sm text-gray-600">
                        <span>{meal.calories} kcal</span>
                        <span>P: {meal.protein}g</span>
                        <span>C: {meal.carbs}g</span>
                        <span>F: {meal.fat}g</span>
                      </div>
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

                {expandedMealId === meal.id && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    {meal.image_url && (
                      <div className="mb-4">
                        <div className="relative w-full h-48 rounded-lg overflow-hidden">
                          <Image
                            src={meal.image_url}
                            alt={meal.meal_name}
                            fill
                            className="object-cover"
                          />
                        </div>
                      </div>
                    )}
                    {meal.ingredients && (
                      <>
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
                      </>
                    )}
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
