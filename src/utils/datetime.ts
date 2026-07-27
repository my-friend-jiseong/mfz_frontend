// 8 화면에 흩어져 있던 inline 포매터를 단일 진실 출처로 통합.
// 모두 undefined/invalid 안전 — 잘못된 입력에 'Invalid Date' 가 UI 에 노출되지 않게.

function safe(iso: string | undefined | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function fmtDate(iso: string | undefined | null): string {
  const d = safe(iso);
  if (!d) return '-';
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

export function fmtTime(iso: string | undefined | null): string {
  const d = safe(iso);
  if (!d) return '-';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDateTime(iso: string | undefined | null): string {
  const d = safe(iso);
  if (!d) return '-';
  return d.toLocaleString('ko-KR');
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'] as const;

// 'MM.DD (요일)' — 목록 카드처럼 연도가 문맥상 자명한 자리에서 하루를 특정할 때.
// 외근 기록은 "무슨 요일이었나" 가 실사용 단서라 요일을 함께 붙인다.
export function fmtDayLabel(iso: string | undefined | null): string {
  const d = safe(iso);
  if (!d) return '-';
  return `${pad(d.getMonth() + 1)}.${pad(d.getDate())} (${WEEKDAY[d.getDay()]})`;
}

// 목록 섹션 헤더용 상대 날짜 그룹 — 오늘 / 어제 / 이번 주 / 지난 주 / 'YYYY년 M월'.
// 주 시작은 월요일(업무 앱 관행). 로컬 자정 기준으로만 비교하므로 시각 성분에 영향받지 않는다.
// ms 산술 대신 Date 생성자 컴포넌트 연산 — 월말/연말 경계를 런타임이 알아서 정규화.
export function tripDateGroup(iso: string | undefined | null): string {
  const d = safe(iso);
  if (!d) return '날짜 없음';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const diffDays = Math.round(
    (today.getTime() - target.getTime()) / 86_400_000,
  );
  if (diffDays === 0) return '오늘';
  if (diffDays === 1) return '어제';

  // getDay(): 0(일)~6(토) → 월요일 기준 경과일로 환산
  const sinceMonday = (today.getDay() + 6) % 7;
  const thisWeekStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - sinceMonday,
  );
  if (target.getTime() >= thisWeekStart.getTime()) return '이번 주';

  const lastWeekStart = new Date(
    thisWeekStart.getFullYear(),
    thisWeekStart.getMonth(),
    thisWeekStart.getDate() - 7,
  );
  if (target.getTime() >= lastWeekStart.getTime()) return '지난 주';

  return `${target.getFullYear()}년 ${target.getMonth() + 1}월`;
}

// 이번 주(월요일 시작) 안에 드는 날짜인가. tripDateGroup 의 '오늘/어제' 는 주 경계와
// 무관한 라벨이라(월요일의 '어제' 는 지난 주다) 주간 집계는 이 함수로 따로 판정해야 한다.
export function isThisWeek(iso: string | undefined | null): boolean {
  const d = safe(iso);
  if (!d) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sinceMonday = (today.getDay() + 6) % 7;
  const weekStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - sinceMonday,
  );
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return target.getTime() >= weekStart.getTime();
}

// 두 시각의 간격(분). fmtDuration 이 문자열만 돌려줘 합산이 불가능한 자리(주간 총 소요 등)용.
export function durationMinutes(
  startIso: string | undefined | null,
  endIso: string | undefined | null,
): number {
  const start = safe(startIso);
  const end = safe(endIso);
  if (!start || !end) return 0;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000));
}

// 분 → '3시간 20분' / '45분'. durationMinutes 합산 결과를 사람이 읽는 형태로.
export function fmtMinutes(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

export function fmtDuration(
  startIso: string | undefined | null,
  endIso: string | undefined | null,
): string {
  const start = safe(startIso);
  if (!start) return '-';
  if (!endIso) return '진행 중';
  const end = safe(endIso);
  if (!end) return '진행 중';
  // end < start 가드 — clock skew / 백엔드 응답 inverted / 사용자 수정 등으로 음수 가능.
  // '-1시간 -30분' 같은 깨진 출력 대신 0분.
  const diff = Math.max(0, end.getTime() - start.getTime());
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}
