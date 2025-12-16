import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const BUCKET_NAME = 'profile-photos'
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

    // Delete any existing profile photos for this user before uploading new one
    const { data: existingFiles } = await supabase.storage
      .from(BUCKET_NAME)
      .list(user.id)

    if (existingFiles && existingFiles.length > 0) {
      const filesToDelete = existingFiles.map(f => `${user.id}/${f.name}`)
      await supabase.storage.from(BUCKET_NAME).remove(filesToDelete)
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
      console.error('Error uploading profile photo:', uploadError)
      return NextResponse.json({ error: 'Failed to upload profile photo' }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName)

    // Update user profile with the new photo URL
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ profile_photo_url: urlData.publicUrl })
      .eq('id', user.id)

    if (updateError) {
      console.error('Error updating profile with photo URL:', updateError)
      // Still return success since the image was uploaded
    }

    return NextResponse.json({
      url: urlData.publicUrl,
      fileName
    })
  } catch (error) {
    console.error('Error handling profile photo upload:', error)
    return NextResponse.json({ error: 'Failed to process profile photo upload' }, { status: 500 })
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
      console.error('Error deleting profile photo:', deleteError)
      return NextResponse.json({ error: 'Failed to delete profile photo' }, { status: 500 })
    }

    // Clear the profile photo URL from the user profile
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ profile_photo_url: null })
      .eq('id', user.id)

    if (updateError) {
      console.error('Error clearing profile photo URL:', updateError)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error handling profile photo deletion:', error)
    return NextResponse.json({ error: 'Failed to delete profile photo' }, { status: 500 })
  }
}
