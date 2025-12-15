'use client'

import { useState } from 'react'
import Link from 'next/link'

interface Props {
  initialSettings: {
    social_feed_enabled: boolean
    display_name: string | null
    name: string | null
  }
}

export default function SocialSettingsClient({ initialSettings }: Props) {
  const [socialFeedEnabled, setSocialFeedEnabled] = useState(initialSettings.social_feed_enabled)
  const [displayName, setDisplayName] = useState(initialSettings.display_name || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSave = async () => {
    setError(null)
    setSuccess(false)
    setSaving(true)

    try {
      const response = await fetch('/api/social-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          social_feed_enabled: socialFeedEnabled,
          display_name: displayName.trim() || null,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save settings')
      }

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-primary-600">Social Settings</h1>
          <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
            Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-800 font-medium">
              Dismiss
            </button>
          </div>
        )}

        {success && (
          <div className="bg-green-50 text-green-600 p-4 rounded-lg mb-6">
            Settings saved successfully!
          </div>
        )}

        <div className="card">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Community Feed Settings</h2>

          {/* Enable/Disable Toggle */}
          <div className="mb-8">
            <label className="flex items-start gap-4 cursor-pointer">
              <div className="relative mt-1">
                <input
                  type="checkbox"
                  checked={socialFeedEnabled}
                  onChange={(e) => setSocialFeedEnabled(e.target.checked)}
                  className="sr-only"
                />
                <div
                  className={`w-11 h-6 rounded-full transition-colors ${
                    socialFeedEnabled ? 'bg-primary-600' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform mt-0.5 ${
                      socialFeedEnabled ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'
                    }`}
                  />
                </div>
              </div>
              <div>
                <span className="text-base font-medium text-gray-900">
                  Enable Community Feed
                </span>
                <p className="text-sm text-gray-500 mt-1">
                  When enabled, your shared custom meals and favorited meal plan meals will appear in the community feed.
                  You&apos;ll also be able to browse and save meals from other users.
                </p>
              </div>
            </label>
          </div>

          {/* Display Name */}
          <div className="mb-8">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Display Name (optional)
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={initialSettings.name || 'Enter a public display name'}
              maxLength={50}
              className="input"
              disabled={!socialFeedEnabled}
            />
            <p className="text-sm text-gray-500 mt-2">
              This name will be shown to other users in the community feed.
              If not set, your account name ({initialSettings.name || 'not set'}) will be used.
            </p>
          </div>

          {/* Privacy Notice */}
          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-medium text-blue-900 mb-2">Privacy Information</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>Only meals you explicitly mark as &quot;Share with community&quot; will be visible</li>
              <li>Your email address is never shared</li>
              <li>You can disable the community feed at any time</li>
              <li>Disabling will remove all your posts from the feed</li>
            </ul>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary w-full"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        {/* Link to Community */}
        {socialFeedEnabled && (
          <div className="mt-6 text-center">
            <Link href="/community" className="text-primary-600 hover:text-primary-800 font-medium">
              Browse Community Feed &rarr;
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
