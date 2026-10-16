import { TabRootRedirect } from '@/components/shell/TabRootRedirect';

// 예전 외근 진행 주소(/trips/active). 외근 진행(7)은 이제 외근 탭 첫 화면(/trips)이 그린다 — 링크·북마크 호환용.
export default function ActiveTripRedirect() {
  return <TabRootRedirect tab="trips" />;
}
