import { Alert } from 'react-native';
import * as Location from 'expo-location';

export interface LatLng {
  lat: number;
  lng: number;
}

// docs/REQUIREMENTS_BEFORE_LAUCHING.md §5 — OS 권한 팝업이 뜨기 **전에** 위치를 어디에 쓰는지,
// 백그라운드로는 수집하지 않는다는 점을 먼저 알린다. 개인정보처리방침과 실제 동작을 맞추고,
// 맥락 없이 뜨는 팝업에 반사적으로 '거부' 를 누르는 것을 줄이려는 목적이다.
//
// 안내를 여기(유틸) 안에 둔 이유: 소비처가 5곳(MapDashboard·useQuickPhoto·fields/new·
// fields/[id]/edit·trips/navigate)이고, 그 중 MapDashboard 는 map 교차 레이어라
// 호출부를 건드리면 사실상 전 화면을 잠근다. 시그니처를 그대로 두면 소비처는 무변경이다.
const RATIONALE_TITLE = '위치 권한이 필요합니다';
const RATIONALE_BODY = [
  '현재 위치는',
  '',
  '• 지도에 내 위치 표시',
  '• 현장 위치 입력',
  '• 주변 현장 확인',
  '',
  '기능에만 사용됩니다.',
  '백그라운드 위치는 수집하지 않습니다.',
].join('\n');

// 한 세션 안에서 '나중에' 를 누른 뒤 화면을 옮길 때마다 다시 묻지 않도록 기억한다.
// 영속시키지 않는 건 의도다 — 앱을 다시 켜면 물어볼 기회가 한 번 더 생긴다.
let rationaleDeclined = false;

// single-flight — 두 화면이 같은 틱에 위치를 요청하면 안내가 두 겹으로 쌓인다.
// OS 팝업은 시스템이 알아서 합쳐 줬지만 우리 Alert 는 그렇지 않다.
// authStore 의 refresh single-flight 와 같은 패턴.
let rationaleInflight: Promise<boolean> | null = null;

function confirmRationale(): Promise<boolean> {
  if (rationaleInflight) return rationaleInflight;
  const pending = new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (v: boolean) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    Alert.alert(
      RATIONALE_TITLE,
      RATIONALE_BODY,
      [
        { text: '나중에', style: 'cancel', onPress: () => done(false) },
        { text: '계속', onPress: () => done(true) },
      ],
      // Android 백버튼으로 닫으면 어떤 onPress 도 안 돈다 — 여기서 풀어주지 않으면
      // Promise 가 영원히 미해결로 남아 호출한 화면이 조용히 멈춘다.
      { cancelable: true, onDismiss: () => done(false) },
    );
  });
  rationaleInflight = pending;
  void pending.then(() => {
    rationaleInflight = null;
  });
  return pending;
}

// 권한 거부·오류는 silent (null 반환) — 지도는 기본 중심으로 fallback.
// 한 번만 호출하기를 가정 — 캐싱은 호출 측에서 useState/useEffect 로.
// high: Quick Photo 처럼 수십 m 단위 판정이 필요한 곳만 (Balanced 는 ~100m 오차).
export async function requestUserLocation(opts?: {
  high?: boolean;
}): Promise<LatLng | null> {
  try {
    const current = await Location.getForegroundPermissionsAsync();

    if (!current.granted) {
      // 이미 영구 거부(‘다시 묻지 않음’) 라면 요청해봐야 팝업이 안 뜬다.
      // 그 상태에서 안내만 반복하면 화면 진입마다 방해가 되므로 조용히 포기한다.
      if (!current.canAskAgain) return null;
      if (rationaleDeclined) return null;

      const proceed = await confirmRationale();
      if (!proceed) {
        rationaleDeclined = true;
        return null;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;
    }

    const pos = await Location.getCurrentPositionAsync({
      accuracy: opts?.high ? Location.Accuracy.High : Location.Accuracy.Balanced,
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}
