import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import './LunchRoulette.css';

type Candidate = { name: string; weight: number };
type Result = Candidate & { rank: number };

const DEFAULT_NAMES = '민지, 준상, 지우, 하늘, 도윤';

const parseCandidates = (value: string): Candidate[] => {
  const merged = new Map<string, number>();
  value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean).forEach((item) => {
    const match = item.match(/^(.*?)(?:\*(\d+))?$/);
    const name = match?.[1]?.trim() || '';
    const weight = Math.min(20, Math.max(1, Number(match?.[2] || 1)));
    if (name) merged.set(name, (merged.get(name) || 0) + weight);
  });
  return [...merged].map(([name, weight]) => ({ name, weight }));
};

const pickWeighted = (pool: Candidate[]) => {
  const total = pool.reduce((sum, candidate) => sum + candidate.weight, 0);
  let cursor = Math.random() * total;
  for (const candidate of pool) {
    cursor -= candidate.weight;
    if (cursor <= 0) return candidate;
  }
  return pool[pool.length - 1];
};

const LunchRoulette = () => {
  const [candidateText, setCandidateText] = useState(DEFAULT_NAMES);
  const [winnerCount, setWinnerCount] = useState(1);
  const [results, setResults] = useState<Result[]>([]);
  const [isRacing, setIsRacing] = useState(false);
  const [notice, setNotice] = useState('참가자를 입력한 뒤 시작을 눌러주세요. 당첨자는 오늘의 음료 담당입니다 ☕');
  const [raceId, setRaceId] = useState(0);

  const candidates = useMemo(() => parseCandidates(candidateText), [candidateText]);
  const actualWinnerCount = Math.min(winnerCount, candidates.length);
  const visibleRacers = candidates.slice(0, 12);

  const shuffle = () => {
    const items = candidateText.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
    for (let index = items.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    }
    setCandidateText(items.join(', '));
    setResults([]);
    setNotice('참가자 순서를 섞었습니다. 준비되면 시작하세요!');
  };

  const startRace = () => {
    if (candidates.length < 2) {
      setNotice('최소 2명의 참가자를 입력해주세요. 이름은 쉼표 또는 줄바꿈으로 구분합니다.');
      return;
    }
    const pool = [...candidates];
    const selected: Result[] = [];
    for (let index = 0; index < actualWinnerCount; index += 1) {
      const picked = pickWeighted(pool);
      selected.push({ ...picked, rank: index + 1 });
      pool.splice(pool.findIndex((candidate) => candidate.name === picked.name), 1);
    }
    setResults([]);
    setRaceId((current) => current + 1);
    setIsRacing(true);
    setNotice('구슬이 결승선을 향해 달립니다...');
    selected.forEach((result, index) => {
      window.setTimeout(() => setResults((current) => [...current, result]), 1550 + index * 380);
    });
    window.setTimeout(() => {
      setIsRacing(false);
      setNotice(`${selected.map((result) => result.name).join(', ')}님${selected.length > 1 ? '들이' : '이'} 오늘의 당첨자입니다!`);
    }, 1550 + selected.length * 380);
  };

  const copyResult = async () => {
    if (!results.length) return;
    const text = `오늘의 음료 추첨 결과: ${results.map((result) => `${result.rank}등 ${result.name}`).join(', ')}`;
    try {
      await navigator.clipboard.writeText(text);
      setNotice('추첨 결과를 복사했습니다. 단체 채팅방에 붙여넣어보세요!');
    } catch {
      setNotice(text);
    }
  };

  return (
    <main className="lunch-roulette">
      <header className="lunch-roulette__hero">
        <span>TEAM BREAK TIME</span>
        <h1>🎲 점심 내기 룰렛</h1>
        <p>점심값·커피·간식 내기, 눈치 보지 말고 시원하게 정하세요.</p>
      </header>

      <section className="lunch-roulette__game" aria-label="점심 내기 랜덤 추첨기">
        <div className={`lunch-roulette__race-stage ${isRacing ? 'is-racing' : ''}`} key={raceId}>
          <div className="lunch-roulette__score"><span>참가자 {candidates.length}명</span><b>{isRacing ? 'RACING' : results.length ? 'RESULT' : 'READY'}</b></div>
          <div className="lunch-roulette__finish">FINISH</div>
          <div className="lunch-roulette__lanes">
            {visibleRacers.map((candidate, index) => (
              <div className="lunch-roulette__lane" key={candidate.name}>
                <span className="lunch-roulette__lane-name">{candidate.name}</span>
                <span className={`lunch-roulette__marble marble-${index % 6}`} style={{ '--lane-delay': `${index * 65}ms`, '--lane-duration': `${1260 + (index % 5) * 90}ms` } as CSSProperties}>●</span>
              </div>
            ))}
            {!visibleRacers.length && <div className="lunch-roulette__empty-race">참가자를 입력하면 구슬이 출발합니다.</div>}
          </div>
        </div>

        <aside className="lunch-roulette__result-panel">
          <div><span className="lunch-roulette__panel-label">TODAY&apos;S PICK</span><h2>오늘의 당첨자</h2></div>
          {results.length ? (
            <ol className="lunch-roulette__results">
              {results.map((result) => <li key={result.name}><span>{result.rank}등</span><strong>{result.name}</strong><small>{result.weight > 1 ? `가중치 ${result.weight}` : '행운의 주인공'}</small></li>)}
            </ol>
          ) : <div className="lunch-roulette__result-empty"><span>☕</span><p>시작 버튼을 누르면<br />오늘의 주인공이 정해집니다.</p></div>}
          <button className="lunch-roulette__copy" type="button" onClick={() => void copyResult()} disabled={!results.length}>결과 복사</button>
        </aside>
      </section>

      <section className="lunch-roulette__settings">
        <div className="lunch-roulette__entry">
          <label htmlFor="roulette-names">참가자</label>
          <textarea id="roulette-names" value={candidateText} onChange={(event) => { setCandidateText(event.target.value); setResults([]); }} placeholder="예: 민지, 준상, 지우 또는 민지*2" rows={4} />
          <small>쉼표 또는 줄바꿈으로 구분 · <b>이름*2</b>는 해당 이름의 추첨 확률을 2배로 설정합니다.</small>
        </div>
        <div className="lunch-roulette__setting-actions">
          <div>
            <span>당첨 인원</span>
            <div className="lunch-roulette__count-buttons">{[1, 2, 3].map((count) => <button key={count} type="button" className={winnerCount === count ? 'active' : ''} onClick={() => setWinnerCount(count)} disabled={count > candidates.length}>{count}명</button>)}</div>
          </div>
          <button className="lunch-roulette__shuffle" type="button" onClick={shuffle} disabled={isRacing}>↻ 섞기</button>
          <button className="lunch-roulette__start" type="button" onClick={startRace} disabled={isRacing || candidates.length < 2}>{isRacing ? '추첨 중...' : '▶ 추첨 시작'}</button>
        </div>
        <p className="lunch-roulette__notice" role="status">{notice}</p>
      </section>
    </main>
  );
};

export default LunchRoulette;
