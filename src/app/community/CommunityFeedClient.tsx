'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import FeedPostCard from '@/components/FeedPostCard'
import type { SocialFeedPost } from '@/lib/types'

interface Props {
  socialEnabled: boolean
  userName: string
}

type FilterType = 'all' | 'following'

export default function CommunityFeedClient({ socialEnabled, userName }: Props) {
  const [posts, setPosts] = useState<SocialFeedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterType>('all')
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)

  const fetchFeed = useCallback(async (pageNum: number, currentFilter: FilterType, append = false) => {
    if (pageNum === 1) {
      setLoading(true)
    } else {
      setLoadingMore(true)
    }
    setError(null)

    try {
      const response = await fetch(
        `/api/social-feed?page=${pageNum}&limit=20&filter=${currentFilter}`
      )

      if (!response.ok) {
        throw new Error('Failed to fetch feed')
      }

      const data = await response.json()

      if (append) {
        setPosts(prev => [...prev, ...data.posts])
      } else {
        setPosts(data.posts)
      }
      setHasMore(data.hasMore)
      setPage(pageNum)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feed')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    if (socialEnabled) {
      fetchFeed(1, filter)
    }
  }, [socialEnabled, filter, fetchFeed])

  const handleFilterChange = (newFilter: FilterType) => {
    if (newFilter !== filter) {
      setFilter(newFilter)
      setPosts([])
    }
  }

  const handleLoadMore = () => {
    if (hasMore && !loadingMore) {
      fetchFeed(page + 1, filter, true)
    }
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

  if (!socialEnabled) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <h1 className="text-2xl font-bold text-primary-600">Community Feed</h1>
            <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
              Back to Dashboard
            </Link>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <div className="card">
            <svg
              className="w-16 h-16 text-gray-300 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Join the FuelRx Community
            </h2>
            <p className="text-gray-600 mb-6">
              Enable the social feed to discover meals from other users, share your creations,
              and connect with people who share your nutrition goals.
            </p>
            <Link href="/settings/social" className="btn-primary inline-block">
              Enable Social Feed
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-primary-600">Community Feed</h1>
          <div className="flex items-center gap-4">
            <Link href="/community/users" className="text-gray-600 hover:text-gray-900">
              Browse Users
            </Link>
            <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filter Tabs */}
        <div className="flex rounded-lg bg-gray-100 p-1 mb-6">
          <button
            onClick={() => handleFilterChange('all')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
              filter === 'all'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            All Meals
          </button>
          <button
            onClick={() => handleFilterChange('following')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
              filter === 'following'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Following
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
            {error}
            <button
              onClick={() => fetchFeed(1, filter)}
              className="ml-2 text-red-800 font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="card animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-4" />
                <div className="h-6 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
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
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {filter === 'following' ? 'No meals from people you follow' : 'No meals in the feed yet'}
            </h3>
            <p className="text-gray-500 mb-4">
              {filter === 'following'
                ? 'Follow some users to see their shared meals here.'
                : 'Be the first to share a meal with the community!'}
            </p>
            {filter === 'following' && (
              <Link href="/community/users" className="btn-primary inline-block">
                Find People to Follow
              </Link>
            )}
          </div>
        ) : (
          <>
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

            {hasMore && (
              <div className="mt-6 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="btn-outline"
                >
                  {loadingMore ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
