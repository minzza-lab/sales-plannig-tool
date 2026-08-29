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
        <p>내 기기에 맞는 화면을 보고, 표시된 순서대로 한 번만 설정하세요.</p>
      </header>

      {standalone && <div className="access-center__installed">이 기기에는 이미 앱 형태로 설치되어 있습니다.</div>}
      {notice && <div className="access-center__notice" role="status">{notice}</div>}

      <div className="access-guides">
        <article className="access-guide">
          <div className="access-guide__copy"><p className="access-card__label">IOS · SAFARI</p><h2>아이폰 · 아이패드 홈 화면에 추가</h2><ol><li><b>Safari</b>에서 영업기획 도구를 엽니다.</li><li>화면 하단의 <b>공유</b> 아이콘을 누릅니다.</li><li>메뉴를 올려 <b>홈 화면에 추가</b>를 누르고 추가합니다.</li></ol>{isIos() && <button className="access-card__button" onClick={copyAddress}>접속 주소 복사</button>}</div>
          <div className="guide-shot guide-shot--phone"><div className="phone-frame"><div className="phone-top">9:41 <span>● ● ●</span></div><div className="phone-page"><span className="mini-logo">WHP</span><b>영업기획 도구</b><small>sales-plannig-tool.pages.dev</small></div><div className="safari-actions"><span>◀</span><span>▶</span><em className="callout callout--one">1</em><strong>⇧</strong><span>▤</span><span>⋯</span></div></div><div className="iphone-menu"><em className="callout callout--two">2</em><span>⊞</span><b>홈 화면에 추가</b><i>›</i></div></div>
        </article>

        <article className="access-guide access-guide--reverse">
          <div className="access-guide__copy"><p className="access-card__label">ANDROID · CHROME</p><h2>안드로이드 앱으로 설치</h2><ol><li>Chrome에서 이 페이지를 엽니다.</li><li>오른쪽 위 <b>⋮</b> 메뉴를 누릅니다.</li><li><b>앱 설치</b>를 누른 뒤 설치를 확인합니다.</li></ol><button className="access-card__button" onClick={installApp}>{installPrompt ? '앱 설치하기' : 'Chrome에서 설치하기'}</button></div>
          <div className="guide-shot guide-shot--phone"><div className="phone-frame phone-frame--android"><div className="android-bar">Chrome <b>⋮</b><em className="callout callout--one">1</em></div><div className="phone-page"><span className="mini-logo">WHP</span><b>영업기획 도구</b><small>오늘 운영 현황을 확인하세요</small></div></div><div className="android-menu"><em className="callout callout--two">2</em><span>⊞</span><b>앱 설치</b></div></div>
        </article>

        <article className="access-guide">
          <div className="access-guide__copy"><p className="access-card__label">WINDOWS · CHROME / EDGE</p><h2>컴퓨터 바탕화면에 바로가기</h2><ol><li>Chrome 또는 Edge에서 도구를 엽니다.</li><li>오른쪽 위 <b>⋮</b> 메뉴를 누릅니다.</li><li><b>앱 설치</b>를 누르면 시작 메뉴와 바탕화면에서 바로 열 수 있습니다.</li></ol><button className="access-card__button" onClick={installApp}>{installPrompt ? 'Windows 앱 설치' : '설치 메뉴 안내'}</button></div>
          <div className="guide-shot guide-shot--desktop"><div className="desktop-window"><div className="desktop-tabs"><i></i><i></i><i></i><span>영업기획 도구</span><b>⋮</b><em className="callout callout--one">1</em></div><div className="desktop-page"><span className="mini-logo">WHP</span><strong>통합 매출 운영현황</strong></div><div className="desktop-menu"><em className="callout callout--two">2</em><span>□ 새 창</span><span className="desktop-menu__active">⊞ 앱 설치</span><span>☆ 북마크</span></div></div></div>
        </article>

        <article className="bookmark-guide"><span className="bookmark-guide__icon">★</span><div><p className="access-card__label">CHROME BOOKMARK</p><h2>설치가 필요 없다면 북마크로 저장</h2><p>현재 페이지에서 <b>{bookmarkShortcut}</b>을 누르고, 저장 위치를 <b>북마크 바</b>로 선택하면 됩니다.</p></div><button className="access-card__button access-card__button--subtle" onClick={copyAddress}>접속 주소 복사</button></article>
      </div>

      <p className="access-center__footnote">아이폰은 Safari에서만 홈 화면 추가가 가능합니다. 설치가 끝나면 홈 화면 또는 바탕화면의 ‘영업기획 도구’ 아이콘으로 접속하세요.</p>
    </section>
  )
}
