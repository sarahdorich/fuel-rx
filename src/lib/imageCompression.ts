/**
 * Client-side image compression utility
 * Compresses images before upload to minimize storage costs
 * Target: ~100KB per image (down from 2-5MB iPhone photos)
 */

interface CompressionOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
  outputType?: 'image/jpeg' | 'image/webp'
}

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  maxWidth: 800,
  maxHeight: 800,
  quality: 0.7, // 70% quality - good balance of size and visual quality
  outputType: 'image/jpeg',
}

/**
 * Compresses an image file to reduce file size
 * @param file - The image file to compress
 * @param options - Compression options
 * @returns Promise<Blob> - The compressed image as a Blob
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<Blob> {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  return new Promise((resolve, reject) => {
    const img = new Image()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      reject(new Error('Could not get canvas context'))
      return
    }

    img.onload = () => {
      // Calculate new dimensions while maintaining aspect ratio
      let { width, height } = img

      if (width > opts.maxWidth || height > opts.maxHeight) {
        const aspectRatio = width / height

        if (width > height) {
          width = opts.maxWidth
          height = Math.round(width / aspectRatio)
        } else {
          height = opts.maxHeight
          width = Math.round(height * aspectRatio)
        }
      }

      canvas.width = width
      canvas.height = height

      // Draw image on canvas
      ctx.drawImage(img, 0, 0, width, height)

      // Convert to blob with compression
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Failed to compress image'))
          }
        },
        opts.outputType,
        opts.quality
      )
    }

    img.onerror = () => {
      reject(new Error('Failed to load image'))
    }

    // Load the image from file
    img.src = URL.createObjectURL(file)
  })
}

/**
 * Validates that a file is an acceptable image type
 */
export function isValidImageType(file: File): boolean {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  return validTypes.includes(file.type.toLowerCase())
}

/**
 * Formats file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
