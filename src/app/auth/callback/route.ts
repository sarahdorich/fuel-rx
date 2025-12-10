import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? '/onboarding'

  // Handle error responses from Supabase (e.g., expired email links)
  const errorParam = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')
  if (errorParam) {
    const message = errorDescription || errorParam
    console.error('Auth callback error from Supabase:', message)
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(message)}`
    )
  }

  const supabase = await createClient()

  // Handle email confirmation via token hash (e.g., signup, magic link, password recovery)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as 'signup' | 'email' | 'recovery' | 'invite' | 'magiclink' | 'email_change',
      token_hash,
    })
    if (error) {
      console.error('Auth verify OTP error:', error.message, error)
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error.message)}`
      )
    }
    return NextResponse.redirect(`${origin}${next}`)
  }

  // Handle OAuth or PKCE flow via code
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('Auth callback error:', error.message, error)
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error.message)}`
      )
    }
    return NextResponse.redirect(`${origin}${next}`)
  }

  // No valid auth parameters provided
  return NextResponse.redirect(`${origin}/login?error=No+authorization+code+provided`)
}
