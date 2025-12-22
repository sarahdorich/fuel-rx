'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { PrepSession, PrepTask, PrepStyle, DayOfWeek, PrepItem, CookingTemps, CookingTimes } from '@/lib/types'
import { PREP_STYLE_LABELS } from '@/lib/types'

// Helper to get tasks from session - either from new prep_tasks or old prep_items
function getSessionTasks(session: PrepSession): PrepTask[] {
  // First try the new prep_tasks format
  if (session.prep_tasks?.tasks && session.prep_tasks.tasks.length > 0) {
    return session.prep_tasks.tasks
  }

  // Fall back to converting prep_items to PrepTask format
  if (session.prep_items && session.prep_items.length > 0) {
    return session.prep_items.map((item: PrepItem, index: number) => ({
      id: `legacy_${session.id}_${index}`,
      description: `${item.item}${item.quantity ? ` (${item.quantity})` : ''}`,
      detailed_steps: item.method ? [item.method] : [],
      estimated_minutes: Math.round((session.estimated_minutes || 30) / session.prep_items.length),
      meal_ids: item.feeds?.map(f => `meal_${f.day}_${f.meal}`) || [],
      completed: false,
    }))
  }

  return []
}

// Format cooking temps for display
function formatCookingTemps(temps: CookingTemps | undefined): string[] {
  if (!temps) return []
  const formatted: string[] = []
  if (temps.oven) formatted.push(`Oven: ${temps.oven}`)
  if (temps.stovetop) formatted.push(`Stovetop: ${temps.stovetop}`)
  if (temps.grill) formatted.push(`Grill: ${temps.grill}`)
  if (temps.internal_temp) formatted.push(`Internal: ${temps.internal_temp}`)
  return formatted
}

// Format cooking times for display
function formatCookingTimes(times: CookingTimes | undefined): string[] {
  if (!times) return []
  const formatted: string[] = []
  if (times.prep_time) formatted.push(`Prep: ${times.prep_time}`)
  if (times.cook_time) formatted.push(`Cook: ${times.cook_time}`)
  if (times.rest_time) formatted.push(`Rest: ${times.rest_time}`)
  return formatted
}

interface PrepViewClientProps {
  mealPlan: {
    id: string
    week_start_date: string
    plan_data: unknown
  }
  prepSessions: PrepSession[]
  prepStyle: string
}

export default function PrepViewClient({
  mealPlan,
  prepSessions,
  prepStyle,
}: PrepViewClientProps) {
  const supabase = createClient()

  // Track which sections are expanded
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(() => {
    // Auto-expand today's or next upcoming prep session
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const todayDay = today.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase() as DayOfWeek

    const todaySession = prepSessions.find(
      (s) => s.prep_for_date === todayStr || s.session_day === todayDay
    )
    return new Set(todaySession ? [todaySession.id] : prepSessions.length > 0 ? [prepSessions[0].id] : [])
  })

  // Track completed tasks - initialize from database
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(() => {
    const completed = new Set<string>()
    prepSessions.forEach(session => {
      const tasks = getSessionTasks(session)
      tasks.forEach(task => {
        if (task.completed) {
          completed.add(task.id)
        }
      })
    })
    return completed
  })

  const toggleSession = (sessionId: string) => {
    const newExpanded = new Set(expandedSessions)
    if (newExpanded.has(sessionId)) {
      newExpanded.delete(sessionId)
    } else {
      newExpanded.add(sessionId)
    }
    setExpandedSessions(newExpanded)
  }

  const toggleTaskComplete = async (sessionId: string, taskId: string) => {
    const newCompleted = new Set(completedTasks)
    const isNowCompleted = !newCompleted.has(taskId)

    if (isNowCompleted) {
      newCompleted.add(taskId)
    } else {
      newCompleted.delete(taskId)
    }
    setCompletedTasks(newCompleted)

    // Update in database
    const session = prepSessions.find((s) => s.id === sessionId)
    if (session && session.prep_tasks?.tasks) {
      const updatedTasks = session.prep_tasks.tasks.map((task) =>
        task.id === taskId ? { ...task, completed: isNowCompleted } : task
      )

      await supabase
        .from('prep_sessions')
        .update({
          prep_tasks: { tasks: updatedTasks },
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
    }
  }

  const getSessionProgress = (session: PrepSession) => {
    const tasks = getSessionTasks(session)
    const totalTasks = tasks.length
    const completedCount = tasks.filter((t) => completedTasks.has(t.id)).length
    return { completed: completedCount, total: totalTasks }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null
    return new Date(dateString + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    })
  }

  const getSessionIcon = (sessionType: string) => {
    switch (sessionType) {
      case 'weekly_batch':
        return '📦'
      case 'night_before':
        return '🌙'
      case 'day_of_morning':
        return '☀️'
      case 'day_of_dinner':
        return '🍽️'
      default:
        return '👨‍🍳'
    }
  }

  // Quick navigation to specific days
  const scrollToDay = (day: string) => {
    const session = prepSessions.find((s) => s.session_day === day)
    if (session) {
      const element = document.getElementById(`session-${session.id}`)
      element?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setExpandedSessions(new Set([session.id]))
    }
  }

  const weekDays: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

  // Calculate overall progress
  const totalTasks = prepSessions.reduce((sum, s) => sum + getSessionTasks(s).length, 0)
  const totalCompleted = completedTasks.size

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-blue-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href={`/meal-plan/${mealPlan.id}`} className="text-primary-600 hover:text-primary-800 text-sm mb-2 inline-block">
            &larr; Back to Meal Plan
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Prep View
          </h1>
          <p className="text-gray-600">
            Week of {new Date(mealPlan.week_start_date + 'T00:00:00').toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Prep Style: <span className="font-medium">{PREP_STYLE_LABELS[prepStyle as PrepStyle]?.title || prepStyle}</span>
          </p>
        </div>

        {/* Overall Progress */}
        {totalTasks > 0 && (
          <div className="card mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">Weekly Progress</h3>
              <span className="text-sm text-gray-600">
                {totalCompleted} of {totalTasks} tasks complete
              </span>
            </div>
            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-400 to-teal-600 transition-all duration-300"
                style={{ width: `${totalTasks > 0 ? (totalCompleted / totalTasks) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Quick Navigation */}
        {prepStyle !== 'traditional_batch' && (
          <div className="card mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Jump to:</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="px-3 py-1.5 text-sm bg-teal-100 text-teal-700 rounded-lg hover:bg-teal-200 transition-colors"
              >
                Top
              </button>
              {weekDays.map((day) => {
                const hasSession = prepSessions.some((s) => s.session_day === day)
                if (!hasSession) return null
                return (
                  <button
                    key={day}
                    onClick={() => scrollToDay(day)}
                    className="px-3 py-1.5 text-sm bg-white border border-gray-200 text-gray-700 rounded-lg hover:border-teal-300 hover:bg-teal-50 transition-colors"
                  >
                    {day.charAt(0).toUpperCase() + day.slice(1)}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Prep Sessions */}
        <div className="space-y-4">
          {prepSessions.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-gray-600 mb-4">
                No prep sessions found for this meal plan.
              </p>
              <p className="text-sm text-gray-500">
                Prep sessions are generated automatically when you create a meal plan.
              </p>
            </div>
          ) : (
            prepSessions.map((session) => {
              const isExpanded = expandedSessions.has(session.id)
              const progress = getSessionProgress(session)
              const isComplete = progress.completed === progress.total && progress.total > 0

              return (
                <div
                  key={session.id}
                  id={`session-${session.id}`}
                  className="card overflow-hidden"
                >
                  {/* Session Header - Clickable */}
                  <button
                    onClick={() => toggleSession(session.id)}
                    className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-start gap-4 flex-1">
                      {/* Icon */}
                      <div className="text-2xl">
                        {getSessionIcon(session.session_type)}
                      </div>

                      {/* Session Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">
                          {session.session_name}
                          {isComplete && (
                            <span className="ml-2 text-green-600 text-sm">✓ Complete</span>
                          )}
                        </h3>

                        {/* Session metadata */}
                        <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                          <div className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>{session.estimated_minutes} min</span>
                          </div>

                          {session.prep_for_date && (
                            <div className="flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <span>{formatDate(session.prep_for_date)}</span>
                            </div>
                          )}

                          {progress.total > 0 && (
                            <div>
                              <span className="font-medium">{progress.completed}</span> of{' '}
                              <span className="font-medium">{progress.total}</span> tasks complete
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Expand/Collapse Icon */}
                      <div className="flex-shrink-0">
                        <svg
                          className={`w-6 h-6 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </button>

                  {/* Session Tasks - Collapsible */}
                  {isExpanded && (() => {
                    const tasks = getSessionTasks(session)
                    return (
                      <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
                        {/* Show instructions if available */}
                        {session.instructions && session.instructions !== `${session.session_type} session${session.session_day ? ` on ${session.session_day}` : ''}` && (
                          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-sm text-blue-800">{session.instructions}</p>
                          </div>
                        )}

                        {tasks.length > 0 ? (
                          <div className="space-y-4">
                            {tasks.map((task) => {
                              const cookingTemps = formatCookingTemps(task.cooking_temps)
                              const cookingTimes = formatCookingTimes(task.cooking_times)
                              const hasDetails = (task.detailed_steps && task.detailed_steps.length > 0) ||
                                cookingTemps.length > 0 ||
                                cookingTimes.length > 0 ||
                                (task.tips && task.tips.length > 0)

                              return (
                                <div
                                  key={task.id}
                                  className={`bg-white rounded-lg border ${
                                    completedTasks.has(task.id) ? 'border-green-200 bg-green-50/50' : 'border-gray-200'
                                  } overflow-hidden`}
                                >
                                  {/* Task Header */}
                                  <div className="flex items-start gap-3 p-4">
                                    {/* Checkbox */}
                                    <button
                                      onClick={() => toggleTaskComplete(session.id, task.id)}
                                      className={`flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-all mt-0.5 ${
                                        completedTasks.has(task.id)
                                          ? 'bg-teal-500 border-teal-500'
                                          : 'border-gray-300 hover:border-teal-400'
                                      }`}
                                    >
                                      {completedTasks.has(task.id) && (
                                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                      )}
                                    </button>

                                    {/* Task Title and Meta */}
                                    <div className="flex-1 min-w-0">
                                      <p
                                        className={`font-medium text-gray-900 ${
                                          completedTasks.has(task.id) ? 'line-through text-gray-500' : ''
                                        }`}
                                      >
                                        {task.description}
                                      </p>

                                      {/* Quick info badges */}
                                      <div className="flex flex-wrap gap-2 mt-2">
                                        {task.estimated_minutes > 0 && (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            {task.estimated_minutes} min
                                          </span>
                                        )}
                                        {cookingTemps.map((temp, i) => (
                                          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                                            </svg>
                                            {temp}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Detailed Steps - expandable section */}
                                  {hasDetails && !completedTasks.has(task.id) && (
                                    <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3">
                                      {/* Step-by-step instructions */}
                                      {task.detailed_steps && task.detailed_steps.length > 0 && (
                                        <div className="mb-3">
                                          <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Steps</h5>
                                          <ol className="space-y-1.5">
                                            {task.detailed_steps.map((step, idx) => (
                                              <li key={idx} className="flex gap-2 text-sm text-gray-700">
                                                <span className="flex-shrink-0 w-5 h-5 bg-teal-100 text-teal-700 rounded-full flex items-center justify-center text-xs font-medium">
                                                  {idx + 1}
                                                </span>
                                                <span>{step}</span>
                                              </li>
                                            ))}
                                          </ol>
                                        </div>
                                      )}

                                      {/* Cooking times breakdown */}
                                      {cookingTimes.length > 0 && (
                                        <div className="mb-3">
                                          <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Timing</h5>
                                          <div className="flex flex-wrap gap-2">
                                            {cookingTimes.map((time, i) => (
                                              <span key={i} className="text-sm text-gray-600">
                                                {time}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* Pro tips */}
                                      {task.tips && task.tips.length > 0 && (
                                        <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-md">
                                          <h5 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1 flex items-center gap-1">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                            </svg>
                                            Pro Tips
                                          </h5>
                                          <ul className="space-y-1">
                                            {task.tips.map((tip, idx) => (
                                              <li key={idx} className="text-xs text-amber-800">
                                                {tip}
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <p className="text-gray-500 text-sm">
                            {session.instructions
                              ? 'This is a quick assembly meal - no prep tasks required!'
                              : 'No prep tasks for this session.'}
                          </p>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )
            })
          )}
        </div>

        {/* Bottom Action */}
        <div className="mt-8 flex gap-4">
          <Link
            href={`/meal-plan/${mealPlan.id}`}
            className="btn-outline flex-1 text-center"
          >
            &larr; Back to Meal Plan
          </Link>
          <Link
            href={`/grocery-list/${mealPlan.id}`}
            className="btn-primary flex-1 text-center"
          >
            View Grocery List &rarr;
          </Link>
        </div>
      </div>
    </div>
  )
}
