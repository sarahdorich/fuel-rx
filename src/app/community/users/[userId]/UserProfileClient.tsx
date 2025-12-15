'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import FeedPostCard from '@/components/FeedPostCard'
import type { SocialUser, SocialFeedPost } from '@/lib/types'

interface Props {
  userId: string
  currentUserId: string
}

export default function UserProfileClient({ userId, currentUserId }: Props) {
  const [profile, setProfile] = useState<SocialUser | null>(null)
  const [posts, setPosts] = useState<SocialFeedPost[]>([])
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [loadingPosts, setLoadingPosts] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [following, setFollowing] = useState(false)
  const [togglingFollow, setTogglingFollow] = useState(false)

  const fetchProfile = useCallback(async () => {
    setLoadingProfile(true)
    try {
      const response = await fetch(`/api/users/${userId}`)
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('This user profile is private')
        }
        throw new Error('Failed to load profile')
      }
      const data = await response.json()
      setProfile(data)
      setFollowing(data.is_following || false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile')
    } finally {
      setLoadingProfile(false)
    }
  }, [userId])

  const fetchPosts = useCallback(async () => {
    setLoadingPosts(true)
    try {
      // Fetch posts from this specific user
      const response = await fetch(`/api/social-feed?page=1&limit=50&filter=all`)
      if (!response.ok) {
        throw new Error('Failed to load posts')
      }
      const data = await response.json()
      // Filter to only this user's posts (since we're fetching all)
      // In a production app, you'd add a user filter to the API
      const userPosts = data.posts.filter((p: SocialFeedPost) => p.user_id === userId)
      setPosts(userPosts)
    } catch (err) {
      console.error('Error loading posts:', err)
    } finally {
      setLoadingPosts(false)
    }
  }, [userId])

  useEffect(() => {
    fetchProfile()
    fetchPosts()
  }, [fetchProfile, fetchPosts])

  const handleToggleFollow = async () => {
    setTogglingFollow(true)
    try {
      const method = following ? 'DELETE' : 'POST'
      const response = await fetch(`/api/users/${userId}/follow`, { method })

      if (response.ok) {
        setFollowing(!following)
        setProfile(prev => prev ? {
          ...prev,
          follower_count: (prev.follower_count || 0) + (following ? -1 : 1),
        } : null)
      }
    } catch (error) {
      console.error('Error toggling follow:', error)
    }
    setTogglingFollow(false)
  }

  const handleSave = async (postId: string) => {
    const response = await fetch(`/api/social-feed/${postId}/save`, {
      method: 'POST',
    })
    if (!response.ok) {
      throw new Error('Failed to save meal')
    }
  }

  const handleUnsave = async (postId: string) => {
    const response = await fetch(`/api/social-feed/${postId}/save`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      throw new Error('Failed to unsave meal')
    }
  }

  if (loadingProfile) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="h-8 bg-gray-200 rounded w-1/4 animate-pulse" />
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="card animate-pulse">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-gray-200 rounded-full" />
              <div>
                <div className="h-6 bg-gray-200 rounded w-32 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-24" />
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <h1 className="text-2xl font-bold text-primary-600">User Profile</h1>
            <Link href="/community" className="text-gray-600 hover:text-gray-900">
              Back to Feed
            </Link>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="card text-center py-12">
            <svg
              className="w-12 h-12 text-gray-300 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">{error}</h3>
            <Link href="/community" className="text-primary-600 hover:text-primary-800">
              Return to Feed
            </Link>
          </div>
        </main>
      </div>
    )
  }

  const displayName = profile?.display_name || profile?.name || 'Anonymous'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-primary-600">{displayName}</h1>
          <div className="flex items-center gap-4">
            <Link href="/community" className="text-gray-600 hover:text-gray-900">
              Feed
            </Link>
            <Link href="/community/users" className="text-gray-600 hover:text-gray-900">
              Browse Users
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Profile Card */}
        <div className="card mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center">
                <span className="text-2xl font-semibold text-primary-600">
                  {displayName[0].toUpperCase()}
                </span>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{displayName}</h2>
                <div className="flex gap-4 mt-1 text-sm text-gray-600">
                  <span><strong>{profile?.post_count || 0}</strong> meals</span>
                  <span><strong>{profile?.follower_count || 0}</strong> followers</span>
                  <span><strong>{profile?.following_count || 0}</strong> following</span>
                </div>
              </div>
            </div>
            <button
              onClick={handleToggleFollow}
              disabled={togglingFollow}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                following
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : 'bg-primary-600 text-white hover:bg-primary-700'
              }`}
            >
              {togglingFollow ? '...' : following ? 'Following' : 'Follow'}
            </button>
          </div>
        </div>

        {/* Posts */}
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Shared Meals</h3>

        {loadingPosts ? (
          <div className="space-y-4">
            {[1, 2].map(i => (
              <div key={i} className="card animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-4" />
                <div className="h-6 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-gray-500">
              {displayName} hasn&apos;t shared any meals yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map(post => (
              <FeedPostCard
                key={post.id}
                post={post}
                onSave={handleSave}
                onUnsave={handleUnsave}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
