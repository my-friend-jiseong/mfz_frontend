import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { toYmd } from './visitRange';

/**
 * 오늘 로컬 날짜 'YYYY-MM-DD'. 자정을 넘기거나 앱으로 돌아오면(AppState active) 새 값이 된다.
 * 1-3 '최근 방문일'(오늘·1주…)이 하루 지난 기준으로 거르지 않게 memo 의존성에 넣는다.
 * 화면 포커스 대신 AppState 를 쓴다 — 시트(포털) 안에서도 navigation 문맥 없이 돌게.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => toYmd(new Date()));

  useEffect(() => {
    const sync = () => setToday(toYmd(new Date()));
    const now = new Date();
    // 다음 자정 + 1초.
    const ms = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime() + 1000;
    const timer = setTimeout(sync, ms);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') sync();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [today]);

  return today;
}
