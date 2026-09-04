import { useEffect, useMemo, useRef, useState } from 'react';
import { Roulette } from '../vendor/lazygyu-roulette/roulette';
import { supabase } from '../lib/supabase';
import './LunchRoulette.css';

type TeamRow = { assignee_names?: string[]; created_by_name?: string };
type RaceResult = { name: string; rank: number };

const LunchRoulette = () => {
  const gameHostRef = useRef<HTMLDivElement>(null);
  const rouletteRef = useRef<Roulette | null>(null);
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<string, { included: boolean; balls: number }>>({});
  const [manualName, setManualName] = useState('');
  const [isLoadingNames, setIsLoadingNames] = useState(true);
  const [isEngineReady, setIsEngineReady] = useState(false);
  const [mapIndex, setMapIndex] = useState(0);
  const [maps, setMaps] = useState<Array<{ index: number; title: string }>>([]);
  const [winnerCount, setWinnerCount] = useState(1);
  const [results, setResults] = useState<RaceResult[]>([]);
  const [isRacing, setIsRacing] = useState(false);
  const [notice, setNotice] = useState('원본 마블 룰렛 엔진을 불러오는 중입니다.');

  useEffect(() => {
    let active = true;
    const loadTeamNames = async () => {
      const [eventsResponse, tasksResponse] = await Promise.all([supabase.from('team_calendar_events').select('assignee_names, created_by_name'), supabase.from('work_tasks').select('assignee_names, created_by_name')]);
      if (!active) return;
      const rows = [...((eventsResponse.data || []) as TeamRow[]), ...((tasksResponse.data || []) as TeamRow[])];
      const names = [...new Set(rows.flatMap((row) => [...(row.assignee_names || []), row.created_by_name || '']).map((name) => name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko-KR'));
      setTeamNames(names);
      setSelected((current) => Object.fromEntries(names.map((name) => [name, current[name] || { included: true, balls: 1 }])));
      setIsLoadingNames(false);
      if (!names.length) setNotice('공유 스케줄러 이름을 찾지 못했습니다. 직접 이름을 추가해 시작할 수 있습니다.');
    };
    void loadTeamNames();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const gameHost = gameHostRef.current;
    if (!gameHost) return;
    const roulette = new Roulette(gameHost);
    rouletteRef.current = roulette;
    const readyTimer = window.setInterval(() => {
      if (!roulette.isReady) return;
      window.clearInterval(readyTimer);
      roulette.setTheme('dark');
      setMaps(roulette.getMaps());
      setIsEngineReady(true);
      setNotice('원본 마블 룰렛 엔진 준비 완료. 참가자와 공 개수를 설정하세요.');
    }, 80);
    const handleGoal = (event: Event) => {
      const detail = (event as CustomEvent<{ winners: string[] }>).detail;
      const winners = detail.winners || [];
      setResults(winners.map((name, index) => ({ name, rank: index + 1 })));
      setIsRacing(false);
      setNotice(`${winners.join(', ')}님${winners.length > 1 ? '들이' : '이'} 오늘의 음료 담당입니다!`);
    };
    roulette.addEventListener('goal', handleGoal);
    return () => { window.clearInterval(readyTimer); roulette.removeEventListener('goal', handleGoal); gameHost.replaceChildren(); rouletteRef.current = null; };
  }, []);

  const participants = useMemo(() => teamNames.filter((name) => selected[name]?.included).map((name) => ({ name, balls: selected[name]?.balls || 1 })), [selected, teamNames]);
  const totalBalls = participants.reduce((total, participant) => total + participant.balls, 0);
  const updateMember = (name: string, patch: Partial<{ included: boolean; balls: number }>) => { setSelected((current) => ({ ...current, [name]: { included: current[name]?.included ?? true, balls: current[name]?.balls ?? 1, ...patch } })); setResults([]); };
  const addManualMember = () => { const name = manualName.trim(); if (!name || teamNames.includes(name)) return; setTeamNames((current) => [...current, name].sort((a, b) => a.localeCompare(b, 'ko-KR'))); setSelected((current) => ({ ...current, [name]: { included: true, balls: 1 } })); setManualName(''); };
  const changeMap = (nextMapIndex: number) => { if (isRacing || !rouletteRef.current) return; rouletteRef.current.setMap(nextMapIndex); setMapIndex(nextMapIndex); setResults([]); setNotice(`${maps[nextMapIndex]?.title || '선택한'} 맵으로 변경했습니다.`); };
  const startRace = () => {
    if (participants.length < 2) { setNotice('최소 두 명을 체크해주세요. 공 개수가 많을수록 해당 팀원의 당첨 확률이 높아집니다.'); return; }
    const roulette = rouletteRef.current;
    if (!roulette || !isEngineReady) return;
    roulette.setMarbles(participants.flatMap((participant) => Array.from({ length: participant.balls }, () => participant.name)));
    roulette.setWinnerRange(0, Math.min(winnerCount, participants.length) - 1);
    roulette.start();
    setResults([]); setIsRacing(true); setNotice('마블 레이스가 시작됐습니다. 원본 엔진의 카메라 추적과 슬로우 모션이 작동합니다.');
  };
  const copyResult = async () => { if (!results.length) return; const text = `오늘의 음료 내기 결과: ${results.map((result) => `${result.rank}등 ${result.name}`).join(', ')}`; try { await navigator.clipboard.writeText(text); setNotice('결과를 복사했습니다.'); } catch { setNotice(text); } };

  return <main className="lunch-roulette lunch-roulette--original"><header className="lunch-roulette__hero"><span>MARBLE ROULETTE · ORIGINAL ENGINE</span><h1>점심 내기 룰렛</h1><p>원본 마블 룰렛의 물리·카메라·결승 연출에 팀 참가자 설정을 연결했습니다.</p></header>
    <section className="original-game"><div className="original-game__stage"><div className="original-game__hud"><span><i /> LIVE MARBLE RACE</span><b>{isRacing ? 'RACE IN PROGRESS' : 'READY'}</b><small>{totalBalls} MARBLES</small></div><div className="original-game__canvas" ref={gameHostRef} /></div><aside className="physics-result"><span className="lunch-roulette__panel-label">TODAY&apos;S PICK</span><h2>오늘의 당첨자</h2>{results.length ? <ol>{results.map((result) => <li key={`${result.name}-${result.rank}`}><em>{result.rank}등</em><strong>{result.name}</strong><small>결승선 통과</small></li>)}</ol> : <div className="physics-result__empty"><span>🎱</span><p>긴 코스를 끝까지 통과한<br />마블의 주인이 당첨!</p></div>}<button type="button" onClick={() => void copyResult()} disabled={!results.length}>결과 복사</button></aside></section>
    <section className="participant-picker"><div className="participant-picker__head"><div><span>TEAM SCHEDULER</span><h2>참가자와 공 개수</h2><p>공유 스케줄 · 업무 트래커에 사용된 이름을 불러왔습니다.</p></div><b>{participants.length}명 참여 · 공 {totalBalls}개</b></div><div className="roulette-map-select"><span>맵 선택</span><div>{maps.map((map) => <button type="button" key={map.index} className={map.index === mapIndex ? 'active' : ''} disabled={isRacing || !isEngineReady} onClick={() => changeMap(map.index)}>{map.title}</button>)}</div></div>
      <div className="participant-table"><div className="participant-table__label"><span>참여</span><span>이름</span><span>공 개수</span></div>{isLoadingNames ? <p className="participant-loading">팀원 이름을 불러오는 중...</p> : teamNames.map((name) => <div className="participant-row" key={name}><label><input type="checkbox" checked={selected[name]?.included ?? false} onChange={(event) => updateMember(name, { included: event.target.checked })} disabled={isRacing} /><span /></label><strong>{name}</strong><div className="ball-stepper"><button type="button" onClick={() => updateMember(name, { balls: Math.max(1, (selected[name]?.balls || 1) - 1) })} disabled={isRacing}>−</button><b>{selected[name]?.balls || 1}개</b><button type="button" onClick={() => updateMember(name, { balls: Math.min(5, (selected[name]?.balls || 1) + 1) })} disabled={isRacing}>+</button></div></div>)}</div><div className="manual-member"><input value={manualName} disabled={isRacing} onChange={(event) => setManualName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addManualMember(); }} placeholder="목록에 없는 팀원 이름" /><button type="button" disabled={isRacing} onClick={addManualMember}>이름 추가</button></div><div className="physics-actions"><div className="winner-count"><span>당첨 인원</span>{[1, 2, 3].map((count) => <button type="button" key={count} className={winnerCount === count ? 'active' : ''} disabled={count > participants.length || isRacing} onClick={() => setWinnerCount(count)}>{count}명</button>)}</div><button className="physics-start" type="button" onClick={startRace} disabled={participants.length < 2 || isRacing || !isEngineReady}>{isRacing ? '레이스 진행 중...' : '▶ 레이스 시작'}</button></div><p className="physics-notice" role="status">{notice}</p><p className="roulette-license">Marble Roulette 원본 엔진 일부 사용 · Copyright © 2023 LazyGyu · MIT License</p></section>
  </main>;
};
export default LunchRoulette;
