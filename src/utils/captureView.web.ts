import type { RefObject } from 'react';
import type { View } from 'react-native';
import type { UploadFile } from './media';

// web: cross-origin 카카오 타일은 canvas-taint 로 캡처 불가(html2canvas 한계) → 항상 skip.
// 실사용 플랫폼은 Android 네이티브뿐이라 web 위치도 생략은 수용(backend-backlog §20).
export async function captureOverviewMap(
  _ref: RefObject<View | null>,
): Promise<UploadFile | null> {
  return null;
}
