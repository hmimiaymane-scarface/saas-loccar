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
import { logOperationalEvent } from "@/lib/observability/log"
import { UPLOAD_SLOW_MS } from "@/lib/platform/launch-gate"

export async function uploadFile(
  path: string,
  file: File
): Promise<{ path: string; error?: string }> {
  const supabase = createClient()
  const startedAt = Date.now()
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  const durationMs = Date.now() - startedAt
  if (error) {
    // Roadmap phase 59 — uploads go straight from the browser to
    // Storage (see this file's own top comment), so a failure here
    // previously left zero server-side trace anywhere, just a client
    // toast. One shared chokepoint (every upload call site funnels
    // through this function) instead of touching each of the ~15
    // callers individually.
    //
    // Roadmap phase 60 — `path` is built by `buildStoragePath()` as
    // `{companyId}/{...segments}/{uuid}-{sanitized original filename}`.
    // The final segment can carry a customer-chosen filename (e.g. a
    // scanned ID named after the person it belongs to), and this event
    // is readable by platform admins at /platform/operations. Logging
    // the path's directory only (company + category, never the
    // filename segment) keeps the same debugging signal without
    // carrying that into a platform-operator-visible table.
    const pathPrefix = path.split("/").slice(0, -1).join("/")
    void logOperationalEvent({
      source: "upload",
      context: "storage_upload",
      message: error.message,
      metadata: { pathPrefix, fileType: file.type, fileSizeBytes: file.size },
    })
    return { path, error: error.message }
  }

  // Roadmap phase 66 (Launch Performance Gate) — "photo upload" is one
  // of the 9 named launch-readiness areas; a successful-but-slow
  // upload was previously invisible (only failures were logged, phase
  // 59). Same `pathPrefix`-only logging discipline as the failure path
  // above — never the filename segment.
  if (durationMs > UPLOAD_SLOW_MS) {
    const pathPrefix = path.split("/").slice(0, -1).join("/")
    void logOperationalEvent({
      source: "upload",
      severity: "warning",
      context: "slow_upload",
      message: `Upload took ${durationMs}ms`,
      metadata: { pathPrefix, fileType: file.type, fileSizeBytes: file.size },
      durationMs,
    })
  }
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
