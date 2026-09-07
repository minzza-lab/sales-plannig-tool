import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { activitySectionPath } from '../lib/activitySections'

// Serialize writes so a slow previous request cannot replace a newer section.
let queue: Promise<void> = Promise.resolve()
export default function ActivityTracker({ userId }: { userId: string }) {
  const { pathname } = useLocation()
  useEffect(() => {
    const path = activitySectionPath(pathname)
    if (!path) return
    const timer = window.setTimeout(() => {
      queue = queue.then(async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user.id !== userId) return
        const { error } = await supabase.rpc('record_app_activity', { section_path: path })
        if (error) console.warn('접속 기록 저장 실패:', error.code)
      }).catch(() => { console.warn('접속 기록 저장에 연결하지 못했습니다.') })
    }, 150)
    return () => window.clearTimeout(timer)
  }, [pathname, userId])
  return null
}
