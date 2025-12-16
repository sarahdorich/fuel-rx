'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { DietaryPreference, PrepTime, MealsPerDay, OnboardingData, MealType, MealConsistency } from '@/lib/types'
import { DIETARY_PREFERENCE_LABELS, PREP_TIME_OPTIONS, MEALS_PER_DAY_OPTIONS, DEFAULT_MEAL_CONSISTENCY_PREFS, MEAL_TYPE_LABELS } from '@/lib/types'
import NumericInput from '@/components/NumericInput'
import ProfilePhotoUpload from '@/components/ProfilePhotoUpload'

const STEPS = ['basics', 'macros', 'preferences', 'consistency'] as const
type Step = typeof STEPS[number]

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [currentStep, setCurrentStep] = useState<Step>('basics')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState<OnboardingData>({
    name: '',
    weight: null,
    target_protein: 150,
    target_carbs: 200,
    target_fat: 70,
    target_calories: 2000,
    dietary_prefs: ['no_restrictions'],
    meals_per_day: 3,
    prep_time: 30,
    meal_consistency_prefs: { ...DEFAULT_MEAL_CONSISTENCY_PREFS },
    profile_photo_url: null,
  })

  // Auto-calculate calories when macros change
  useEffect(() => {
    const calories = (formData.target_protein * 4) + (formData.target_carbs * 4) + (formData.target_fat * 9)
    setFormData(prev => ({ ...prev, target_calories: calories }))
  }, [formData.target_protein, formData.target_carbs, formData.target_fat])

  const handleNext = () => {
    const stepIndex = STEPS.indexOf(currentStep)
    if (stepIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[stepIndex + 1])
    }
  }

  const handleBack = () => {
    const stepIndex = STEPS.indexOf(currentStep)
    if (stepIndex > 0) {
      setCurrentStep(STEPS[stepIndex - 1])
    }
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        name: formData.name || null,
        weight: formData.weight,
        target_protein: formData.target_protein,
        target_carbs: formData.target_carbs,
        target_fat: formData.target_fat,
        target_calories: formData.target_calories,
        dietary_prefs: formData.dietary_prefs,
        meals_per_day: formData.meals_per_day,
        prep_time: formData.prep_time,
        meal_consistency_prefs: formData.meal_consistency_prefs,
        profile_photo_url: formData.profile_photo_url,
      })
      .eq('id', user.id)

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  const toggleDietaryPref = (pref: DietaryPreference) => {
    setFormData(prev => {
      let newPrefs = [...prev.dietary_prefs]

      if (pref === 'no_restrictions') {
        newPrefs = ['no_restrictions']
      } else {
        newPrefs = newPrefs.filter(p => p !== 'no_restrictions')
        if (newPrefs.includes(pref)) {
          newPrefs = newPrefs.filter(p => p !== pref)
        } else {
          newPrefs.push(pref)
        }
        if (newPrefs.length === 0) {
          newPrefs = ['no_restrictions']
        }
      }

      return { ...prev, dietary_prefs: newPrefs }
    })
  }

  const toggleMealConsistency = (mealType: MealType) => {
    setFormData(prev => ({
      ...prev,
      meal_consistency_prefs: {
        ...prev.meal_consistency_prefs,
        [mealType]: prev.meal_consistency_prefs[mealType] === 'varied' ? 'consistent' : 'varied',
      },
    }))
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary-600">Coach Hill&apos;s FuelRx</h1>
          <h2 className="mt-4 text-xl text-gray-700">Let&apos;s set up your profile</h2>
        </div>

        {/* Progress indicator */}
        <div className="flex justify-center mb-8">
          {STEPS.map((step, index) => (
            <div key={step} className="flex items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-medium ${
                  STEPS.indexOf(currentStep) >= index
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {index + 1}
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={`w-16 h-1 ${
                    STEPS.indexOf(currentStep) > index ? 'bg-primary-600' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="card">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6">
              {error}
            </div>
          )}

          {/* Step 1: Basics */}
          {currentStep === 'basics' && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-gray-900">Basic Information</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Profile Photo (optional)
                </label>
                <ProfilePhotoUpload
                  currentPhotoUrl={formData.profile_photo_url}
                  onPhotoChange={(url) => setFormData({ ...formData, profile_photo_url: url })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name (optional)
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input-field"
                  placeholder="Your name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Weight in lbs (optional)
                </label>
                <NumericInput
                  value={formData.weight || 0}
                  onChange={(val) => setFormData({ ...formData, weight: val || null })}
                  className="input-field"
                  placeholder="e.g., 175"
                  min={0}
                  max={999}
                />
                <p className="mt-1 text-sm text-gray-500">
                  Helps personalize recommendations
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Macros */}
          {currentStep === 'macros' && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-gray-900">Daily Macro Targets</h3>
              <p className="text-gray-600">
                Enter your daily macro goals. Calories will be calculated automatically.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Protein (g)
                  </label>
                  <NumericInput
                    value={formData.target_protein}
                    onChange={(val) => setFormData({ ...formData, target_protein: val })}
                    className="input-field"
                    min={50}
                    max={500}
                    allowEmpty={false}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Carbs (g)
                  </label>
                  <NumericInput
                    value={formData.target_carbs}
                    onChange={(val) => setFormData({ ...formData, target_carbs: val })}
                    className="input-field"
                    min={50}
                    max={600}
                    allowEmpty={false}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fat (g)
                  </label>
                  <NumericInput
                    value={formData.target_fat}
                    onChange={(val) => setFormData({ ...formData, target_fat: val })}
                    className="input-field"
                    min={20}
                    max={300}
                    allowEmpty={false}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Calories (calculated)
                  </label>
                  <input
                    type="text"
                    value={formData.target_calories}
                    className="input-field bg-gray-100"
                    disabled
                  />
                </div>
              </div>

              <div className="bg-primary-50 p-4 rounded-lg">
                <p className="text-sm text-primary-800">
                  <strong>Tip:</strong> Most CrossFit athletes need 1.6-2.2g of protein per kg of body weight.
                  Carbs fuel your WODs, and healthy fats support brain + hormone function.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Preferences */}
          {currentStep === 'preferences' && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-gray-900">Meal Preferences</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Dietary Preferences
                </label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(DIETARY_PREFERENCE_LABELS) as DietaryPreference[]).map((pref) => (
                    <button
                      key={pref}
                      type="button"
                      onClick={() => toggleDietaryPref(pref)}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                        formData.dietary_prefs.includes(pref)
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {DIETARY_PREFERENCE_LABELS[pref]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Meals Per Day
                </label>
                <div className="flex gap-2">
                  {MEALS_PER_DAY_OPTIONS.map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setFormData({ ...formData, meals_per_day: num })}
                      className={`px-6 py-2 rounded-lg text-sm font-medium transition-colors ${
                        formData.meals_per_day === num
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Max Prep Time Per Meal
                </label>
                <div className="flex flex-wrap gap-2">
                  {PREP_TIME_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, prep_time: option.value })}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        formData.prep_time === option.value
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Meal Consistency */}
          {currentStep === 'consistency' && (
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-gray-900">Meal Variety Preferences</h3>
              <p className="text-gray-600">
                Choose which meals you want to keep the same each day vs. vary throughout the week.
                Consistent meals simplify meal prep and grocery shopping.
              </p>

              <div className="space-y-4">
                {(Object.keys(MEAL_TYPE_LABELS) as MealType[]).map((mealType) => (
                  <div
                    key={mealType}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  >
                    <span className="font-medium text-gray-900">
                      {MEAL_TYPE_LABELS[mealType]}
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (formData.meal_consistency_prefs[mealType] !== 'consistent') {
                            toggleMealConsistency(mealType)
                          }
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          formData.meal_consistency_prefs[mealType] === 'consistent'
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        Same Daily
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (formData.meal_consistency_prefs[mealType] !== 'varied') {
                            toggleMealConsistency(mealType)
                          }
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          formData.meal_consistency_prefs[mealType] === 'varied'
                            ? 'bg-primary-600 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        Varied
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-primary-50 p-4 rounded-lg">
                <p className="text-sm text-primary-800">
                  <strong>Tip:</strong> Keeping breakfast, lunch and snacks consistent is a popular choice
                  for athletes who want variety at dinner but easy meal prep for busy days.
                </p>
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="mt-8 flex justify-between">
            {currentStep !== 'basics' ? (
              <button
                type="button"
                onClick={handleBack}
                className="btn-secondary"
              >
                Back
              </button>
            ) : (
              <div />
            )}

            {currentStep !== 'consistency' ? (
              <button
                type="button"
                onClick={handleNext}
                className="btn-primary"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="btn-primary"
              >
                {loading ? 'Saving...' : 'Complete Setup'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
