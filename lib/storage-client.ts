"use client"

/**
 * Client-side upload/download against Supabase Storage. Files upload
 * directly from the browser to Storage (not proxied through a Next.js
 * server action) — the user's own authenticated session is what Storage
 * RLS checks, exactly like any other Supabase table, so there's no need
 * to route bytes through the server just to enforce access control.
 *
 * After a successful upload, the caller still needs to record the file in
 * `documents` or `media` via a server action — this module only talks to
 * Storage itself.
 */

import { createClient } from "@/lib/supabase/client"
import { STORAGE_BUCKET } from "@/lib/storage"

export async function uploadFile(
  path: string,
  file: File
): Promise<{ path: string; error?: string }> {
  const supabase = createClient()
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (error) return { path, error: error.message }
  return { path }
}

export async function getSignedUrl(path: string, expiresInSeconds = 3600): Promise<string | null> {
  const supabase = createClient()
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, expiresInSeconds)
  if (error || !data) return null
  return data.signedUrl
}

export async function removeFile(path: string): Promise<string | null> {
  const supabase = createClient()
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([path])
  return error ? error.message : null
}
