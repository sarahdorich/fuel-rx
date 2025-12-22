import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PrepViewClient from './PrepViewClient'
import type { PrepSession, DailyAssembly } from '@/lib/types'

export default async function PrepViewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  // Get user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch meal plan
  const { data: mealPlan, error: planError } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (planError || !mealPlan) {
    redirect('/dashboard')
  }

  // Fetch prep sessions
  const { data: prepSessions } = await supabase
    .from('prep_sessions')
    .select('*')
    .eq('meal_plan_id', id)
    .order('display_order', { ascending: true })

  // Fetch user profile for prep preferences
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('prep_style')
    .eq('id', user.id)
    .single()

  // Extract daily_assembly from prep sessions (it's stored in the first session with data)
  let dailyAssembly: DailyAssembly | undefined
  if (prepSessions && prepSessions.length > 0) {
    for (const session of prepSessions) {
      if (session.daily_assembly && Object.keys(session.daily_assembly).length > 0) {
        dailyAssembly = session.daily_assembly as DailyAssembly
        break
      }
    }
  }

  return (
    <PrepViewClient
      mealPlan={mealPlan}
      prepSessions={(prepSessions || []) as PrepSession[]}
      prepStyle={profile?.prep_style || 'mixed'}
      dailyAssembly={dailyAssembly}
    />
  )
}
