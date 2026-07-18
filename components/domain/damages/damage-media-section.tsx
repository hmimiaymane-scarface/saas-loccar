"use client"

import { useState } from "react"

import type { MediaFile } from "@/types/rental"
import { DamagePhotoUpload } from "@/components/domain/damages/damage-photo-upload"

function DamageMediaSection({
  damageId,
  companyId,
  initialMedia,
  canUpload,
}: {
  damageId: string
  companyId: string
  initialMedia: MediaFile[]
  canUpload: boolean
}) {
  const [media, setMedia] = useState(initialMedia)

  return (
    <div className="flex flex-col gap-3">
      {media.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {media.map((m) => (
            <a
              key={m.id}
              href={m.url ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-muted"
            >
              {m.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt={m.caption ?? m.originalFilename} className="size-full object-cover" />
              ) : (
                <span className="text-xs text-muted-foreground">No preview</span>
              )}
            </a>
          ))}
        </div>
      )}
      {canUpload && (
        <DamagePhotoUpload
          damageId={damageId}
          companyId={companyId}
          onUploaded={(m) => setMedia((prev) => [...prev, m])}
        />
      )}
    </div>
  )
}

export { DamageMediaSection }
