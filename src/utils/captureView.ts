import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import type { UploadFile } from './media';

// 네이티브 위치도 캡처 (backend-backlog §20). view-shot 은 화면을 OS 레벨로 래스터화하므로
// cross-origin 카카오 타일도 그대로 찍힌다 — 앱에서 보던 위치도 그대로 PNG 로.
// ⚠️ 안드로이드에서 WebView 가 하드웨어 레이어면 빈칸으로 나오는 알려진 케이스가 있다
//    → 실패·예외는 throw 하지 않고 null 반환해 호출 측이 '위치도 없이' 진행하게 둔다.
export async function captureOverviewMap(
  ref: RefObject<View | null>,
): Promise<UploadFile | null> {
  if (!ref.current) return null;
  try {
    const uri = await captureRef(ref, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
    });
    return { uri, name: `overview-${Date.now()}.png`, type: 'image/png' };
  } catch (e) {
    console.warn('위치도 캡처 실패 — 위치도 없이 진행', e);
    return null;
  }
}
