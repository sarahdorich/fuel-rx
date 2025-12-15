import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const BUCKET_NAME = 'meal-images'
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB max (should be much smaller after compression)

export async function POST(request: Request) {
  const supabase = await createClient()

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('image') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 })
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Please upload a JPEG, PNG, or WebP image.' }, { status: 400 })
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 5MB.' }, { status: 400 })
    }

    // Generate unique filename: userId/timestamp-randomstring.ext
    const fileExt = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const timestamp = Date.now()
    const randomString = Math.random().toString(36).substring(2, 8)
    const fileName = `${user.id}/${timestamp}-${randomString}.${fileExt}`

    // Convert File to ArrayBuffer for upload
    const arrayBuffer = await file.arrayBuffer()
    const fileBuffer = new Uint8Array(arrayBuffer)

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error('Error uploading image:', uploadError)
      return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName)

    return NextResponse.json({
      url: urlData.publicUrl,
      fileName
    })
  } catch (error) {
    console.error('Error handling image upload:', error)
    return NextResponse.json({ error: 'Failed to process image upload' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const supabase = await createClient()

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const fileName = searchParams.get('fileName')

    if (!fileName) {
      return NextResponse.json({ error: 'File name is required' }, { status: 400 })
    }

    // Verify the file belongs to the user (fileName starts with userId/)
    if (!fileName.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: 'Unauthorized to delete this file' }, { status: 403 })
    }

    const { error: deleteError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([fileName])

    if (deleteError) {
      console.error('Error deleting image:', deleteError)
      return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error handling image deletion:', error)
    return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 })
  }
}
