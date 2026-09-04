import { useEffect, useMemo, useRef, useState } from 'react';
import * as Matter from 'matter-js';
import { supabase } from '../lib/supabase';
import './LunchRoulette.css';

type TeamRow = { assignee_names?: string[]; created_by_name?: string };
type Participant = { name: string; balls: number };
type RaceResult = { name: string; rank: number };
type RaceBall = Matter.Body & { playerName: string };
const ballColors = ['#ff7a59', '#ffd166', '#63e6be', '#76a8ff', '#c58bff', '#ff8ac1', '#67e8f9'];

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
  const [notice, setNotice] = useState('팀원을 체크하고 공 개수를 정한 뒤, 커피 폭포로 출발시키세요.');

  useEffect(() => { let active = true; const loadTeamNames = async () => {
    const [eventsResponse, tasksResponse] = await Promise.all([supabase.from('team_calendar_events').select('assignee_names, created_by_name'), supabase.from('work_tasks').select('assignee_names, created_by_name')]);
    if (!active) return;
    const rows = [...((eventsResponse.data || []) as TeamRow[]), ...((tasksResponse.data || []) as TeamRow[])];
    const names = [...new Set(rows.flatMap((row) => [...(row.assignee_names || []), row.created_by_name || '']).map((name) => name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko-KR'));
    setTeamNames(names); setSelected((current) => Object.fromEntries(names.map((name) => [name, current[name] || { included: true, balls: 1 }]))); setIsLoadingNames(false);
    if (!names.length) setNotice('공유 스케줄러에 등록된 팀원 이름을 아직 찾지 못했습니다. 직접 이름을 추가할 수 있습니다.');
  }; void loadTeamNames(); return () => { active = false; }; }, []);

  const participants = useMemo(() => teamNames.filter((name) => selected[name]?.included).map((name) => ({ name, balls: selected[name]?.balls || 1 })), [selected, teamNames]);
  const totalBalls = participants.reduce((total, participant) => total + participant.balls, 0);

  useEffect(() => {
    if (!boardRef.current) return;
    const host = boardRef.current; const width = Math.max(300, host.clientWidth); const viewportHeight = Math.max(480, host.clientHeight); const worldHeight = Math.max(1320, Math.round(width * 3.35));
    const engine = Matter.Engine.create({ gravity: { x: 0, y: 1.05, scale: 0.001 } });
    const render = Matter.Render.create({ element: host, engine, options: { width, height: viewportHeight, wireframes: false, background: 'transparent', pixelRatio: window.devicePixelRatio || 1, hasBounds: true } });
    const runner = Matter.Runner.create(); const wall = { isStatic: true, render: { fillStyle: '#2b2035' } }; const rail = { isStatic: true, restitution: .58, friction: .012, render: { fillStyle: '#704661', strokeStyle: '#ffbb77', lineWidth: 1 } }; const peg = { isStatic: true, restitution: .95, friction: 0, render: { fillStyle: '#ffdf9f', strokeStyle: '#ce7b63', lineWidth: 2 } };
    const bodies: Matter.Body[] = [Matter.Bodies.rectangle(-14, worldHeight / 2, 28, worldHeight, wall), Matter.Bodies.rectangle(width + 14, worldHeight / 2, 28, worldHeight, wall), Matter.Bodies.rectangle(width / 2, worldHeight + 15, width + 30, 30, wall), Matter.Bodies.rectangle(width / 2, 46, width * .28, 10, { ...rail, angle: .03 })];
    ([[.30, 170, -.34], [.73, 305, .33], [.28, 445, -.31], [.74, 590, .30], [.28, 742, -.30], [.72, 890, .30], [.30, 1042, -.31], [.70, 1182, .33]] as const).forEach(([x, y, angle], index) => { bodies.push(Matter.Bodies.rectangle(width * x, y, width * .53, 12, { ...rail, angle })); for (let column = 0; column < 3; column += 1) bodies.push(Matter.Bodies.circle(width * (.32 + column * .18 + (index % 2 ? .04 : 0)), y + 48, 8, peg)); });
    bodies.push(Matter.Bodies.rectangle(width * .24, worldHeight - 92, width * .38, 14, { ...rail, angle: -.2 }), Matter.Bodies.rectangle(width * .76, worldHeight - 92, width * .38, 14, { ...rail, angle: .2 }), Matter.Bodies.rectangle(width * .5, worldHeight - 42, width * .2, 13, rail));
    const balls: RaceBall[] = (raceRun ? raceParticipants : []).flatMap((participant, playerIndex) => Array.from({ length: participant.balls }, (_, ballIndex) => { const ball = Matter.Bodies.circle(width / 2 + ((playerIndex * 23 + ballIndex * 29) % 92) - 46, 70 + ballIndex * 3, 13, { restitution: .72, friction: .003, frictionAir: .0018, render: { fillStyle: ballColors[playerIndex % ballColors.length], strokeStyle: '#fff7e6', lineWidth: 2 } }) as RaceBall; ball.playerName = participant.name; Matter.Body.setVelocity(ball, { x: ((playerIndex + ballIndex) % 3 - 1) * 1.2, y: .1 }); return ball; }));
    Matter.Composite.add(engine.world, [...bodies, ...balls]); Matter.Render.run(render); Matter.Runner.run(runner, engine);
    let cameraY = 0; let ending = false; const finishers = new Set<string>();
    const endRace = () => { if (ending) return; ending = true; window.setTimeout(() => { setIsRacing(false); setNotice(`${[...finishers].join(', ')}님${finishers.size > 1 ? '들이' : '이'} 오늘의 음료 담당입니다!`); }, 800); };
    const onTick = () => { if (balls.length) { const leadY = Math.max(...balls.filter((ball) => !ball.isStatic).map((ball) => ball.position.y), 0); const targetY = Math.max(0, Math.min(worldHeight - viewportHeight, leadY - viewportHeight * .36)); cameraY += (targetY - cameraY) * .075; render.bounds.min.y = cameraY; render.bounds.max.y = cameraY + viewportHeight; balls.filter((ball) => !ball.isStatic && ball.speed < .12 && ball.position.y < worldHeight - 130).forEach((ball) => Matter.Body.applyForce(ball, ball.position, { x: (Math.random() - .5) * .00045, y: .00055 })); }
      balls.forEach((ball) => { if (ball.position.y < worldHeight - 64 || finishers.has(ball.playerName)) return; finishers.add(ball.playerName); Matter.Body.setStatic(ball, true); setResults((current) => [...current, { name: ball.playerName, rank: finishers.size }]); if (finishers.size >= winnerCount) endRace(); }); };
    Matter.Events.on(engine, 'beforeUpdate', onTick);
    const safetyTimer = raceRun ? window.setTimeout(() => { if (ending) return; raceParticipants.filter((participant) => !finishers.has(participant.name)).slice(0, winnerCount - finishers.size).forEach((participant) => finishers.add(participant.name)); setResults([...finishers].map((name, index) => ({ name, rank: index + 1 }))); endRace(); }, 18000) : undefined;
    return () => { if (safetyTimer) window.clearTimeout(safetyTimer); Matter.Events.off(engine, 'beforeUpdate', onTick); Matter.Render.stop(render); Matter.Runner.stop(runner); Matter.Composite.clear(engine.world, false); Matter.Engine.clear(engine); render.canvas.remove(); render.textures = {}; };
  }, [raceParticipants, raceRun, winnerCount]);

  const updateMember = (name: string, patch: Partial<{ included: boolean; balls: number }>) => { setSelected((current) => ({ ...current, [name]: { included: current[name]?.included ?? true, balls: current[name]?.balls ?? 1, ...patch } })); setResults([]); };
  const addManualMember = () => { const name = manualName.trim(); if (!name || teamNames.includes(name)) return; setTeamNames((current) => [...current, name].sort((a, b) => a.localeCompare(b, 'ko-KR'))); setSelected((current) => ({ ...current, [name]: { included: true, balls: 1 } })); setManualName(''); };
  const startRace = () => { if (participants.length < 2) { setNotice('최소 두 명을 체크해주세요. 공 개수가 많을수록 해당 팀원의 당첨 확률이 높아집니다.'); return; } setResults([]); setRaceParticipants(participants); setRaceRun((current) => current + 1); setIsRacing(true); setNotice('커피 폭포를 따라 카메라가 이동합니다. 행운의 공을 지켜보세요!'); };
  const copyResult = async () => { if (!results.length) return; const text = `오늘의 음료 내기 결과: ${results.map((result) => `${result.rank}등 ${result.name}`).join(', ')}`; try { await navigator.clipboard.writeText(text); setNotice('결과를 복사했습니다.'); } catch { setNotice(text); } };

  return <main className="lunch-roulette lunch-roulette--physics"><header className="lunch-roulette__hero"><span>TEAM BREAK TIME · MARBLE RACE</span><h1>점심 내기 룰렛</h1><p>참가 공이 긴 코스를 내려가는 동안 카메라가 함께 이동합니다.</p></header><section className="physics-game"><div className="physics-board-shell"><div className="physics-board-heading"><span className="physics-live-dot">LIVE PHYSICS</span><strong>COFFEE FALLS</strong><small>{isRacing ? 'CAMERA FOLLOW ON' : 'READY TO DROP'}</small></div><div className="physics-route"><i /><i /><i /><i /><i /><b>FINISH</b></div><div className="physics-board" ref={boardRef}><div className="physics-start-badge">START<br />GATE</div><div className="physics-checkpoint">CHECKPOINTS · 08</div><div className="physics-goal"><span>☕</span><b>WINNER CUP</b><span>☕</span></div></div><div className="physics-stage-copy"><span>{isRacing ? 'FOLLOWING THE LEAD' : 'THE LONG WAY DOWN'}</span><b>{isRacing ? `${results.length}/${winnerCount} CUP IN` : `${totalBalls} MARBLES READY`}</b></div></div><aside className="physics-result"><span className="lunch-roulette__panel-label">TODAY&apos;S PICK</span><h2>오늘의 당첨자</h2>{results.length ? <ol>{results.map((result) => <li key={result.name}><em>{result.rank}등</em><strong>{result.name}</strong><small>WINNER CUP 도착</small></li>)}</ol> : <div className="physics-result__empty"><span>🥤</span><p>가장 먼저 결승 컵에<br />도착한 사람이 당첨!</p></div>}<button type="button" onClick={() => void copyResult()} disabled={!results.length}>결과 복사</button></aside></section><section className="participant-picker"><div className="participant-picker__head"><div><span>TEAM SCHEDULER</span><h2>참가자와 공 개수</h2><p>공유 스케줄 · 업무 트래커에 사용된 이름을 불러왔습니다.</p></div><b>{participants.length}명 참여 · 공 {totalBalls}개</b></div><div className="participant-table"><div className="participant-table__label"><span>참여</span><span>이름</span><span>공 개수</span></div>{isLoadingNames ? <p className="participant-loading">팀원 이름을 불러오는 중...</p> : teamNames.map((name) => <div className="participant-row" key={name}><label><input type="checkbox" checked={selected[name]?.included ?? false} onChange={(event) => updateMember(name, { included: event.target.checked })} disabled={isRacing} /><span /></label><strong>{name}</strong><div className="ball-stepper"><button type="button" onClick={() => updateMember(name, { balls: Math.max(1, (selected[name]?.balls || 1) - 1) })} disabled={isRacing}>−</button><b>{selected[name]?.balls || 1}개</b><button type="button" onClick={() => updateMember(name, { balls: Math.min(5, (selected[name]?.balls || 1) + 1) })} disabled={isRacing}>+</button></div></div>)}</div><div className="manual-member"><input value={manualName} disabled={isRacing} onChange={(event) => setManualName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addManualMember(); }} placeholder="목록에 없는 팀원 이름" /><button type="button" disabled={isRacing} onClick={addManualMember}>이름 추가</button></div><div className="physics-actions"><div className="winner-count"><span>당첨 인원</span>{[1, 2, 3].map((count) => <button type="button" key={count} className={winnerCount === count ? 'active' : ''} disabled={count > participants.length || isRacing} onClick={() => setWinnerCount(count)}>{count}명</button>)}</div><button className="physics-start" type="button" onClick={startRace} disabled={participants.length < 2 || isRacing}>{isRacing ? '카메라 추적 중...' : '☕ 레이스 시작'}</button></div><p className="physics-notice" role="status">{notice}</p></section></main>;
};
export default LunchRoulette;
