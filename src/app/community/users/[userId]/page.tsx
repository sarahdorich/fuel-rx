import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import UserProfileClient from './UserProfileClient'

interface Props {
  params: Promise<{ userId: string }>
}

export default async function UserProfilePage({ params }: Props) {
  const { userId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if viewing own profile
  if (userId === user.id) {
    redirect('/settings/social')
  }

  return <UserProfileClient userId={userId} currentUserId={user.id} />
}
