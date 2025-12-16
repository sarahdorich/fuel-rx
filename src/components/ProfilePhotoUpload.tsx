'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { compressImage, isValidImageType, formatFileSize } from '@/lib/imageCompression'

interface ProfilePhotoUploadProps {
  currentPhotoUrl: string | null
  onPhotoChange: (url: string | null) => void
  disabled?: boolean
}

export default function ProfilePhotoUpload({
  currentPhotoUrl,
  onPhotoChange,
  disabled = false,
}: ProfilePhotoUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [compressionInfo, setCompressionInfo] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setCompressionInfo(null)

    // Validate file type
    if (!isValidImageType(file)) {
      setError('Please select a valid image file (JPEG, PNG, or WebP)')
      return
    }

    // Check file size (max 10MB before compression)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image is too large. Please select an image under 10MB.')
      return
    }

    setUploading(true)

    try {
      // Compress the image
      const originalSize = file.size
      const compressedBlob = await compressImage(file, {
        maxWidth: 400,
        maxHeight: 400,
        quality: 0.8,
      })

      const compressionPercent = Math.round((1 - compressedBlob.size / originalSize) * 100)
      setCompressionInfo(
        `Compressed from ${formatFileSize(originalSize)} to ${formatFileSize(compressedBlob.size)} (${compressionPercent}% smaller)`
      )

      // Create FormData and upload
      const formData = new FormData()
      formData.append('image', compressedBlob, 'profile-photo.jpg')

      const response = await fetch('/api/upload-profile-photo', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to upload photo')
      }

      const { url } = await response.json()
      onPhotoChange(url)
    } catch (err) {
      console.error('Error uploading photo:', err)
      setError(err instanceof Error ? err.message : 'Failed to upload photo')
    } finally {
      setUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemove = async () => {
    if (!currentPhotoUrl) return

    setUploading(true)
    setError(null)

    try {
      // Extract fileName from URL
      const urlParts = currentPhotoUrl.split('/profile-photos/')
      const fileName = urlParts[1]

      if (fileName) {
        const response = await fetch(`/api/upload-profile-photo?fileName=${encodeURIComponent(fileName)}`, {
          method: 'DELETE',
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Failed to remove photo')
        }
      }

      onPhotoChange(null)
      setCompressionInfo(null)
    } catch (err) {
      console.error('Error removing photo:', err)
      setError(err instanceof Error ? err.message : 'Failed to remove photo')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        {/* Photo preview or placeholder */}
        <div className="relative w-20 h-20 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
          {currentPhotoUrl ? (
            <Image
              src={currentPhotoUrl}
              alt="Profile photo"
              fill
              className="object-cover"
              sizes="80px"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <svg
                className="w-10 h-10"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Upload/Remove buttons */}
        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={handleFileSelect}
            disabled={disabled || uploading}
            className="hidden"
            id="profile-photo-input"
          />
          <label
            htmlFor="profile-photo-input"
            className={`px-4 py-2 text-sm font-medium rounded-lg cursor-pointer transition-colors ${
              disabled || uploading
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-primary-600 text-white hover:bg-primary-700'
            }`}
          >
            {uploading ? 'Uploading...' : currentPhotoUrl ? 'Change Photo' : 'Upload Photo'}
          </label>
          {currentPhotoUrl && !uploading && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled}
              className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 transition-colors disabled:text-gray-400"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {/* Compression info */}
      {compressionInfo && !error && (
        <p className="text-sm text-green-600">{compressionInfo}</p>
      )}

      {/* Helper text */}
      <p className="text-xs text-gray-500">
        Optional. Upload a profile photo to personalize your account.
        JPEG, PNG, or WebP up to 10MB.
      </p>
    </div>
  )
}
