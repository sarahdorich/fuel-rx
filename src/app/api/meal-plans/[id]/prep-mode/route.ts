import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generatePrepModeForExistingPlan } from '@/lib/claude'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: mealPlanId } = await params

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify user owns this meal plan
  const { data: mealPlan, error: planError } = await supabase
    .from('meal_plans')
    .select('id, user_id')
    .eq('id', mealPlanId)
    .single()

  if (planError || !mealPlan) {
    return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 })
  }

  if (mealPlan.user_id !== user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Check if prep sessions already exist for this plan
  const { data: existingSessions } = await supabase
    .from('prep_sessions')
    .select('id')
    .eq('meal_plan_id', mealPlanId)
    .limit(1)

  if (existingSessions && existingSessions.length > 0) {
    // Return existing prep sessions
    const { data: prepSessions } = await supabase
      .from('prep_sessions')
      .select('*')
      .eq('meal_plan_id', mealPlanId)
      .order('session_order', { ascending: true })

    return NextResponse.json({
      prepSessions: prepSessions?.map(s => ({
        sessionName: s.session_name,
        sessionOrder: s.session_order,
        estimatedMinutes: s.estimated_minutes,
        instructions: s.instructions,
        prepItems: s.prep_items,
      })),
      dailyAssembly: prepSessions?.[0]?.daily_assembly || {},
    })
  }

  try {
    // Generate prep mode analysis
    const prepModeData = await generatePrepModeForExistingPlan(mealPlanId, user.id)

    // Save prep sessions to database
    const prepSessionInserts = prepModeData.prepSessions.map(session => ({
      meal_plan_id: mealPlanId,
      session_name: session.sessionName,
      session_order: session.sessionOrder,
      estimated_minutes: session.estimatedMinutes,
      prep_items: session.prepItems,
      feeds_meals: session.prepItems.flatMap(item => item.feeds),
      instructions: session.instructions,
      daily_assembly: prepModeData.dailyAssembly,
    }))

    if (prepSessionInserts.length > 0) {
      const { error: prepError } = await supabase
        .from('prep_sessions')
        .insert(prepSessionInserts)

      if (prepError) {
        console.error('Error saving prep sessions:', prepError)
        // Continue anyway, return the generated data
      }
    }

    return NextResponse.json(prepModeData)
  } catch (error) {
    console.error('Error generating prep mode:', error)
    return NextResponse.json(
      { error: 'Failed to generate prep mode analysis' },
      { status: 500 }
    )
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { id: mealPlanId } = await params

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify user owns this meal plan
  const { data: mealPlan, error: planError } = await supabase
    .from('meal_plans')
    .select('id, user_id')
    .eq('id', mealPlanId)
    .single()

  if (planError || !mealPlan) {
    return NextResponse.json({ error: 'Meal plan not found' }, { status: 404 })
  }

  if (mealPlan.user_id !== user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Get existing prep sessions
  const { data: prepSessions, error: sessionsError } = await supabase
    .from('prep_sessions')
    .select('*')
    .eq('meal_plan_id', mealPlanId)
    .order('session_order', { ascending: true })

  if (sessionsError) {
    return NextResponse.json({ error: 'Failed to fetch prep sessions' }, { status: 500 })
  }

  if (!prepSessions || prepSessions.length === 0) {
    return NextResponse.json({ prepSessions: [], dailyAssembly: {} })
  }

  return NextResponse.json({
    prepSessions: prepSessions.map(s => ({
      id: s.id,
      sessionName: s.session_name,
      sessionOrder: s.session_order,
      estimatedMinutes: s.estimated_minutes,
      instructions: s.instructions,
      prepItems: s.prep_items,
    })),
    dailyAssembly: prepSessions[0]?.daily_assembly || {},
  })
}
