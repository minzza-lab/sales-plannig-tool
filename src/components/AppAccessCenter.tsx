import { useEffect, useMemo, useState } from 'react'
import './AppAccessCenter.css'

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const isMac = () => /macintosh|mac os x/i.test(navigator.userAgent)

export default function AppAccessCenter() {
  const [installPrompt, setInstallPrompt] = useState<DeferredInstallPrompt | null>(null)
  const [notice, setNotice] = useState('')
  const standalone = useMemo(() => (
    window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  ), [])

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as DeferredInstallPrompt)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  const installApp = async () => {
    if (!installPrompt) {
      setNotice('브라우저 메뉴에서 “앱 설치” 또는 “바로가기 만들기”를 선택하면 됩니다.')
      return
    }
    await installPrompt.prompt()
    const result = await installPrompt.userChoice
    setInstallPrompt(null)
    setNotice(result.outcome === 'accepted' ? '앱 설치를 시작했습니다.' : '설치를 취소했습니다. 필요할 때 다시 이 화면에서 진행할 수 있습니다.')
  }

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin)
      setNotice('접속 주소를 복사했습니다.')
    } catch {
      setNotice(`접속 주소: ${window.location.origin}`)
    }
  }

  const bookmarkShortcut = isMac() ? '⌘ + D' : 'Ctrl + D'

  return (
    <section className="access-center">
      <header className="access-center__header">
        <p className="access-center__eyebrow">TEAM ACCESS</p>
        <h1>빠른 접속 설정</h1>
        <p>각 팀원이 쓰는 기기에서 한 번만 설정하면, 다음부터는 앱처럼 바로 열 수 있습니다.</p>
      </header>

      {standalone && <div className="access-center__installed">이 기기에는 이미 앱 형태로 설치되어 있습니다.</div>}
      {notice && <div className="access-center__notice" role="status">{notice}</div>}

      <div className="access-center__grid">
        <article className="access-card access-card--ios">
          <span className="access-card__icon"></span>
          <div><p className="access-card__label">IOS</p><h2>아이폰 · 아이패드</h2></div>
          <p>Safari에서 하단 <b>공유</b> 버튼을 누르고 <b>홈 화면에 추가</b>를 선택하세요.</p>
          {isIos() && <button className="access-card__button" onClick={copyAddress}>접속 주소 복사</button>}
        </article>

        <article className="access-card access-card--android">
          <span className="access-card__icon">◉</span>
          <div><p className="access-card__label">ANDROID</p><h2>안드로이드 앱 설치</h2></div>
          <p>Chrome에서 설치하면 홈 화면에 독립 앱으로 추가됩니다.</p>
          <button className="access-card__button" onClick={installApp}>{installPrompt ? '앱 설치하기' : '설치 방법 보기'}</button>
        </article>

        <article className="access-card access-card--chrome">
          <span className="access-card__icon">★</span>
          <div><p className="access-card__label">CHROME</p><h2>크롬 북마크 추가</h2></div>
          <p>현재 페이지에서 <b>{bookmarkShortcut}</b>을 누른 뒤 북마크 바에 저장하면 됩니다.</p>
          <button className="access-card__button access-card__button--subtle" onClick={copyAddress}>주소 복사</button>
        </article>

        <article className="access-card access-card--windows">
          <span className="access-card__icon">⊞</span>
          <div><p className="access-card__label">WINDOWS</p><h2>바탕화면 바로가기</h2></div>
          <p>Chrome 또는 Edge의 메뉴에서 <b>앱 설치</b>를 선택하면 시작 메뉴와 바탕화면에서 바로 열 수 있습니다.</p>
          <button className="access-card__button" onClick={installApp}>{installPrompt ? 'Windows 앱 설치' : '바로가기 방법 보기'}</button>
        </article>
      </div>

      <p className="access-center__footnote">설치·북마크 추가는 브라우저 보안 정책상 각 기기에서 마지막 확인을 한 번 눌러야 합니다.</p>
    </section>
  )
}
