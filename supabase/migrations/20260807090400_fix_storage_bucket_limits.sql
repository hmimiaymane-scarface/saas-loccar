-- Found via productization wave 1 phase 7: the `company-files` bucket
-- (20260719090700_storage.sql) has never had `file_size_limit` or
-- `allowed_mime_types` configured — confirmed live (`null`/`null`).
-- `lib/storage.ts`'s 15MB cap and accepted-mime-type allowlist are
-- real, but were only ever enforced in browser JS and in the server
-- action's re-check of client-*reported* metadata
-- (`validateUploadForCompany`) — never by Storage itself. Confirmed
-- live: a direct-to-Storage upload bypassing the app's own JS entirely
-- (a plain authenticated API call, no app code involved) succeeded for
-- both an oversized file and a disallowed type. This sets the same
-- limits at the actual storage layer, matching lib/storage.ts exactly,
-- so enforcement no longer depends solely on code a caller can skip.
update storage.buckets
set file_size_limit = 15728640, -- MAX_FILE_SIZE_BYTES (lib/storage.ts) — 15 * 1024 * 1024
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf'] -- ACCEPTED_DOCUMENT_MIME_TYPES
where id = 'company-files';
