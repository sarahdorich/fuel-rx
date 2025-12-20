'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { PrepSession, PrepTask, PrepStyle, DayOfWeek, PrepItem } from '@/lib/types'
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
      description: `${item.item}${item.quantity ? ` (${item.quantity})` : ''}${item.method ? ` - ${item.method}` : ''}`,
      estimated_minutes: Math.round((session.estimated_minutes || 30) / session.prep_items.length),
      meal_ids: item.feeds?.map(f => `meal_${f.day}_${f.meal}`) || [],
      completed: false,
    }))
  }

  return []
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
                          <div className="space-y-3">
                            {tasks.map((task) => (
                              <div
                                key={task.id}
                                className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200"
                              >
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

                                {/* Task Details */}
                                <div className="flex-1 min-w-0">
                                  <p
                                    className={`text-gray-900 ${
                                      completedTasks.has(task.id) ? 'line-through text-gray-500' : ''
                                    }`}
                                  >
                                    {task.description}
                                  </p>
                                  {task.estimated_minutes > 0 && (
                                    <p className="text-sm text-gray-500 mt-1">
                                      ~{task.estimated_minutes} min
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
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
