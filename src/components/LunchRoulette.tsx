import { useEffect, useMemo, useRef, useState } from 'react';
import * as Matter from 'matter-js';
import { supabase } from '../lib/supabase';
import './LunchRoulette.css';

type TeamRow = { assignee_names?: string[]; created_by_name?: string };
type Participant = { name: string; balls: number };
type RaceResult = { name: string; rank: number };
type RaceBall = Matter.Body & { playerName: string };

const ballColors = ['#ff6b4a', '#ffd166', '#56d89c', '#72a9ff', '#c28cff', '#ff83be', '#5de2e7'];

const LunchRoulette = () => {
  const boardRef = useRef<HTMLDivElement>(null);
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const [selected, setSelected] = useState<Record<string, { included: boolean; balls: number }>>({});
  const [manualName, setManualName] = useState('');
  const [isLoadingNames, setIsLoadingNames] = useState(true);
  const [raceParticipants, setRaceParticipants] = useState<Participant[]>([]);
  const [raceRun, setRaceRun] = useState(0);
  const [winnerCount, setWinnerCount] = useState(1);
  const [results, setResults] = useState<RaceResult[]>([]);
  const [isRacing, setIsRacing] = useState(false);
  const [notice, setNotice] = useState('팀원을 선택하고 공 개수를 정한 뒤 시작하세요. 가장 먼저 컵에 들어온 공이 당첨됩니다.');

  useEffect(() => {
    let active = true;
    const loadTeamNames = async () => {
      const [eventsResponse, tasksResponse] = await Promise.all([
        supabase.from('team_calendar_events').select('assignee_names, created_by_name'),
        supabase.from('work_tasks').select('assignee_names, created_by_name'),
      ]);
      if (!active) return;
      const rows = [...((eventsResponse.data || []) as TeamRow[]), ...((tasksResponse.data || []) as TeamRow[])];
      const names = [...new Set(rows.flatMap((row) => [...(row.assignee_names || []), row.created_by_name || '']).map((name) => name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko-KR'));
      setTeamNames(names);
      setSelected((current) => Object.fromEntries(names.map((name) => [name, current[name] || { included: true, balls: 1 }])));
      setIsLoadingNames(false);
      if (!names.length) setNotice('공유 스케줄러에 등록된 팀원 이름을 아직 찾지 못했습니다. 직접 이름을 추가할 수 있습니다.');
    };
    void loadTeamNames();
    return () => { active = false; };
  }, []);

  const participants = useMemo(() => teamNames.filter((name) => selected[name]?.included).map((name) => ({ name, balls: selected[name]?.balls || 1 })), [selected, teamNames]);

  useEffect(() => {
    if (!raceRun || !boardRef.current || !raceParticipants.length) return;
    const host = boardRef.current;
    const width = host.clientWidth;
    const height = Math.max(620, Math.min(900, Math.round(width * 1.72)));
    const engine = Matter.Engine.create({ gravity: { x: 0, y: 1.12, scale: 0.001 } });
    const render = Matter.Render.create({ element: host, engine, options: { width, height, wireframes: false, background: 'transparent', pixelRatio: window.devicePixelRatio || 1 } });
    const runner = Matter.Runner.create();
    const wallStyle = { isStatic: true, render: { fillStyle: '#3d2a1f' } };
    const pegStyle = { isStatic: true, restitution: .96, friction: 0, render: { fillStyle: '#f4d9a6', strokeStyle: '#9f6a3d', lineWidth: 2 } };
    const bodies: Matter.Body[] = [
      Matter.Bodies.rectangle(-12, height / 2, 24, height, wallStyle), Matter.Bodies.rectangle(width + 12, height / 2, 24, height, wallStyle), Matter.Bodies.rectangle(width / 2, height + 12, width, 24, wallStyle),
      Matter.Bodies.rectangle(width / 2, 22, width * .62, 13, { ...wallStyle, angle: .04 }), Matter.Bodies.rectangle(width * .24, 105, width * .38, 13, { ...wallStyle, angle: -.25 }), Matter.Bodies.rectangle(width * .76, 210, width * .38, 13, { ...wallStyle, angle: .25 }),
      Matter.Bodies.rectangle(width * .26, 323, width * .39, 13, { ...wallStyle, angle: -.28 }), Matter.Bodies.rectangle(width * .74, 443, width * .39, 13, { ...wallStyle, angle: .27 }), Matter.Bodies.rectangle(width * .27, 565, width * .42, 13, { ...wallStyle, angle: -.28 }),
      Matter.Bodies.rectangle(width * .73, height - 140, width * .42, 13, { ...wallStyle, angle: .28 }), Matter.Bodies.rectangle(width * .18, height - 74, width * .25, 15, wallStyle), Matter.Bodies.rectangle(width * .82, height - 74, width * .25, 15, wallStyle),
    ];
    for (let row = 0; row < 6; row += 1) for (let column = 0; column < (row % 2 ? 5 : 4); column += 1) {
      const columns = row % 2 ? 5 : 4;
      bodies.push(Matter.Bodies.circle(width * .25 + column * (width * .5 / Math.max(1, columns - 1)) + (row % 2 ? -width * .055 : 0), 155 + row * 88, 8, pegStyle));
    }
    const balls: RaceBall[] = raceParticipants.flatMap((participant, playerIndex) => Array.from({ length: participant.balls }, (_, ballIndex) => {
      const ball = Matter.Bodies.circle(width / 2 + ((playerIndex * 19 + ballIndex * 31) % 90) - 45, 48 + ballIndex * 5, 13, { restitution: .78, friction: .004, frictionAir: .0015, render: { fillStyle: ballColors[playerIndex % ballColors.length], strokeStyle: '#fff', lineWidth: 2 } }) as RaceBall;
      ball.playerName = participant.name; Matter.Body.setVelocity(ball, { x: ((playerIndex + ballIndex) % 3 - 1) * .9, y: 0 }); return ball;
    }));
    Matter.Composite.add(engine.world, [...bodies, ...balls]); Matter.Render.run(render); Matter.Runner.run(runner, engine);
    const finishers = new Set<string>(); let ending = false;
    const endRace = () => { if (ending) return; ending = true; window.setTimeout(() => { setIsRacing(false); setNotice(`${[...finishers].join(', ')}님${finishers.size > 1 ? '들이' : '이'} 오늘의 음료 담당입니다!`); }, 700); };
    const onTick = () => balls.forEach((ball) => {
      if (ball.position.y < height - 44 || finishers.has(ball.playerName)) return;
      finishers.add(ball.playerName); Matter.Body.setStatic(ball, true); setResults((current) => [...current, { name: ball.playerName, rank: finishers.size }]);
      if (finishers.size >= winnerCount) endRace();
    });
    Matter.Events.on(engine, 'beforeUpdate', onTick);
    const safetyTimer = window.setTimeout(() => {
      if (ending) return;
      raceParticipants.filter((participant) => !finishers.has(participant.name)).slice(0, winnerCount - finishers.size).forEach((participant) => finishers.add(participant.name));
      setResults([...finishers].map((name, index) => ({ name, rank: index + 1 }))); endRace();
    }, 15000);
    return () => { window.clearTimeout(safetyTimer); Matter.Events.off(engine, 'beforeUpdate', onTick); Matter.Render.stop(render); Matter.Runner.stop(runner); Matter.Composite.clear(engine.world, false); Matter.Engine.clear(engine); render.canvas.remove(); render.textures = {}; };
  }, [raceParticipants, raceRun, winnerCount]);

  const updateMember = (name: string, patch: Partial<{ included: boolean; balls: number }>) => { setSelected((current) => ({ ...current, [name]: { included: current[name]?.included ?? true, balls: current[name]?.balls ?? 1, ...patch } })); setResults([]); };
  const addManualMember = () => { const name = manualName.trim(); if (!name || teamNames.includes(name)) return; setTeamNames((current) => [...current, name].sort((a, b) => a.localeCompare(b, 'ko-KR'))); setSelected((current) => ({ ...current, [name]: { included: true, balls: 1 } })); setManualName(''); };
  const startRace = () => { if (participants.length < 2) { setNotice('최소 두 명을 체크해주세요. 공 개수가 많을수록 해당 팀원의 당첨 확률이 높아집니다.'); return; } setResults([]); setRaceParticipants(participants); setRaceRun((current) => current + 1); setIsRacing(true); setNotice('커피 폭포 맵에서 공이 떨어지고 있습니다...'); };
  const copyResult = async () => { if (!results.length) return; const text = `오늘의 음료 내기 결과: ${results.map((result) => `${result.rank}등 ${result.name}`).join(', ')}`; try { await navigator.clipboard.writeText(text); setNotice('결과를 복사했습니다.'); } catch { setNotice(text); } };

  return <main className="lunch-roulette lunch-roulette--physics">
    <header className="lunch-roulette__hero"><span>TEAM BREAK TIME · PHYSICS EDITION</span><h1>🎲 점심 내기 룰렛</h1><p>실제 물리 엔진으로 공이 굴러갑니다. 공이 많을수록 오늘의 커피를 살 확률도 높아집니다.</p></header>
    <section className="physics-game"><div className="physics-board-shell"><div className="physics-board-heading"><span>☕ COFFEE FALLS</span><strong>{isRacing ? 'DROP IN PROGRESS' : 'MARBLE DROP MAP'}</strong><small>FIRST TO CUP WINS</small></div><div className="physics-board" ref={boardRef}><div className="physics-start-badge">START<br />DROP</div><div className="physics-goal"><span>☕</span><b>WINNER CUP</b><span>☕</span></div></div></div>
      <aside className="physics-result"><span className="lunch-roulette__panel-label">TODAY&apos;S PICK</span><h2>오늘의 당첨자</h2>{results.length ? <ol>{results.map((result) => <li key={result.name}><em>{result.rank}등</em><strong>{result.name}</strong><small>결승 컵 도착</small></li>)}</ol> : <div className="physics-result__empty"><span>🥤</span><p>공이 컵에 가장 먼저<br />도착한 사람이 당첨!</p></div>}<button type="button" onClick={() => void copyResult()} disabled={!results.length}>결과 복사</button></aside>
    </section>
    <section className="participant-picker"><div className="participant-picker__head"><div><span>TEAM SCHEDULER</span><h2>참가자와 공 개수</h2><p>공유 스케줄 · 업무 트래커에 사용된 이름을 불러왔습니다.</p></div><b>{participants.length}명 참여 · 공 {participants.reduce((total, participant) => total + participant.balls, 0)}개</b></div>
      <div className="participant-table"><div className="participant-table__label"><span>참여</span><span>이름</span><span>공 개수</span></div>{isLoadingNames ? <p className="participant-loading">팀원 이름을 불러오는 중...</p> : teamNames.map((name) => <div className="participant-row" key={name}><label><input type="checkbox" checked={selected[name]?.included ?? false} onChange={(event) => updateMember(name, { included: event.target.checked })} /><span /></label><strong>{name}</strong><div className="ball-stepper"><button type="button" onClick={() => updateMember(name, { balls: Math.max(1, (selected[name]?.balls || 1) - 1) })} disabled={isRacing}>−</button><b>{selected[name]?.balls || 1}개</b><button type="button" onClick={() => updateMember(name, { balls: Math.min(5, (selected[name]?.balls || 1) + 1) })} disabled={isRacing}>+</button></div></div>)}</div>
      <div className="manual-member"><input value={manualName} onChange={(event) => setManualName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addManualMember(); }} placeholder="목록에 없는 팀원 이름" /><button type="button" onClick={addManualMember}>이름 추가</button></div>
      <div className="physics-actions"><div className="winner-count"><span>당첨 인원</span>{[1, 2, 3].map((count) => <button type="button" key={count} className={winnerCount === count ? 'active' : ''} disabled={count > participants.length || isRacing} onClick={() => setWinnerCount(count)}>{count}명</button>)}</div><button className="physics-start" type="button" onClick={startRace} disabled={participants.length < 2 || isRacing}>{isRacing ? '공 굴러가는 중...' : '☕ 공 떨어뜨리기'}</button></div><p className="physics-notice" role="status">{notice}</p>
    </section>
  </main>;
};

export default LunchRoulette;
