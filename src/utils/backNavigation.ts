import { router as defaultRouter } from 'expo-router';

// expo-router 의 router.back() 은 navigation stack 이 비어 있으면 "닫기" 가 되어
// 웹/네이티브 양쪽에서 흰 화면으로 떨어지는 회로가 있다 (deep-link 진입 후 한 번도
// push 하지 않은 상태에서 back 누르는 경우). 모든 onBack 진입점이 이 헬퍼를 거치도록
// 통일해, stack 이 비었을 땐 외근 탭(/trips) 으로 강제 fallback.
//
// 사용 예: <Pressable onPress={() => safeBack(router)} />

type RouterLike = {
  canGoBack?: () => boolean;
  back: () => void;
  replace: (href: never) => void;
};

const FALLBACK_HREF = '/(tabs)/trips' as const;

export function safeBack(router?: RouterLike): void {
  const r = (router ?? defaultRouter) as RouterLike;
  if (typeof r.canGoBack === 'function' && r.canGoBack()) {
    r.back();
    return;
  }
  // canGoBack 미지원 환경(웹의 일부 케이스) 도 대비 — replace 로 안전 fallback.
  r.replace(FALLBACK_HREF as never);
}
