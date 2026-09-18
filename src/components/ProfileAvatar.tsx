import { useEffect, useState } from 'react'
import { supabase, type UserProfile } from '../lib/supabase'

type AvatarProfile = Pick<UserProfile, 'id' | 'display_name' | 'avatar_path' | 'updated_at'>

export function ProfileAvatar({ profile, className = '', alt }: { profile: AvatarProfile; className?: string; alt?: string }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setUrl(null)

    if (!profile.avatar_path) return () => { active = false }

    void supabase.storage
      .from('profile-photos')
      .createSignedUrl(profile.avatar_path, 3600)
      .then(({ data, error }) => {
        if (!active) return
        if (error || !data?.signedUrl) {
          setUrl(null)
          return
        }
        setUrl(data.signedUrl)
      })

    return () => { active = false }
  }, [profile.avatar_path, profile.updated_at])

  return (
    <span className={className} aria-label={alt || undefined}>
      {url
        ? <img src={url} alt={alt || ('Foto profil ' + (profile.display_name || 'pengguna'))} />
        : initials(profile.display_name)}
    </span>
  )
}

function initials(name?: string | null) {
  return (name || 'Pengguna').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}
