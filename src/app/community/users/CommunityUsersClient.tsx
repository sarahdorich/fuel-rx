'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import type { SocialUser } from '@/lib/types'

export default function CommunityUsersClient() {
  const [users, setUsers] = useState<SocialUser[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)

  const fetchUsers = useCallback(async (pageNum: number, searchTerm: string, append = false) => {
    if (pageNum === 1) {
      setLoading(true)
    } else {
      setLoadingMore(true)
    }
    setError(null)

    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: '20',
      })
      if (searchTerm) {
        params.set('search', searchTerm)
      }

      const response = await fetch(`/api/community/users?${params}`)

      if (!response.ok) {
        throw new Error('Failed to fetch users')
      }

      const data = await response.json()

      if (append) {
        setUsers(prev => [...prev, ...data.users])
      } else {
        setUsers(data.users)
      }
      setHasMore(data.hasMore)
      setPage(pageNum)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers(1, search)
  }, [search, fetchUsers])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setUsers([])
  }

  const handleLoadMore = () => {
    if (hasMore && !loadingMore) {
      fetchUsers(page + 1, search, true)
    }
  }

  const handleFollow = async (userId: string) => {
    try {
      const response = await fetch(`/api/users/${userId}/follow`, {
        method: 'POST',
      })

      if (response.ok) {
        setUsers(users.map(u =>
          u.id === userId ? { ...u, is_following: true } : u
        ))
      }
    } catch (error) {
      console.error('Error following user:', error)
    }
  }

  const handleUnfollow = async (userId: string) => {
    try {
      const response = await fetch(`/api/users/${userId}/follow`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setUsers(users.map(u =>
          u.id === userId ? { ...u, is_following: false } : u
        ))
      }
    } catch (error) {
      console.error('Error unfollowing user:', error)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-primary-600">Find People</h1>
          <div className="flex items-center gap-4">
            <Link href="/community" className="text-gray-600 hover:text-gray-900">
              Feed
            </Link>
            <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name..."
              className="input flex-1"
            />
            <button type="submit" className="btn-primary">
              Search
            </button>
          </div>
        </form>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
            {error}
            <button
              onClick={() => fetchUsers(1, search)}
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
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gray-200 rounded-full" />
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                    <div className="h-3 bg-gray-200 rounded w-1/4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : users.length === 0 ? (
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
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {search ? 'No users found' : 'No community members yet'}
            </h3>
            <p className="text-gray-500">
              {search
                ? 'Try a different search term.'
                : 'Be the first to invite friends to FuelRx!'}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {users.map(user => (
                <div key={user.id} className="card">
                  <div className="flex items-center justify-between">
                    <Link
                      href={`/community/users/${user.id}`}
                      className="flex items-center gap-4 flex-1 min-w-0"
                    >
                      <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-lg font-semibold text-primary-600">
                          {(user.display_name || user.name || 'A')[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-medium text-gray-900 truncate hover:text-primary-600">
                          {user.display_name || user.name || 'Anonymous'}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {user.post_count || 0} shared meal{user.post_count !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </Link>
                    <button
                      onClick={() => user.is_following
                        ? handleUnfollow(user.id)
                        : handleFollow(user.id)
                      }
                      className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                        user.is_following
                          ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          : 'bg-primary-600 text-white hover:bg-primary-700'
                      }`}
                    >
                      {user.is_following ? 'Following' : 'Follow'}
                    </button>
                  </div>
                </div>
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
