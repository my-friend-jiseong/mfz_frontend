import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ExpoSpeechRecognitionModule as SpeechModule } from 'expo-speech-recognition';
import { confirm, notice } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';

/**
 * 체크인 메모 음성 입력(8-1·8-2). 말을 글자로만 바꾸고 녹음 파일은 남기지 않는다 — ERD v2 에서 폐기한 '음성 메모'(파일 업로드)와 다르다.
 *
 * - 한 번 누르면 한 마디: continuous 를 끄고 말을 멈추면 OS 인식기가 스스로 끝낸다(8-1 '말을 멈추면 자동으로 끝나요').
 * - 온디바이스 우선(2026-10-27 결정): iOS 는 ko-KR 온디바이스를 지원하는 기기면 네이티브가 알아서 켠다. Android 는
 *   한국어 오프라인 모델이 깔려 있을 때만 켠다. 그 밖은 서버 인식 — 8-1 안내와 개인정보처리방침이 이를 알린다.
 * - 네이티브 모듈은 dev/스토어 빌드에만 있다. Expo Go 에서 import 하면 바로 throw 하므로 require 를 감싸 읽고, 없으면 마이크를 숨긴다.
 */

type Speech = typeof SpeechModule;

let cached: Speech | null | undefined;
function speechModule(): Speech | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = (require('expo-speech-recognition') as { ExpoSpeechRecognitionModule: Speech }).ExpoSpeechRecognitionModule;
  } catch {
    cached = null;
  }
  return cached;
}

/** 이 기기·브라우저에서 음성 입력을 쓸 수 있는가. Safari 는 API 는 있지만 불안정하다(알고 둠, 2026-10-27). */
export function voiceInputSupported(): boolean {
  const m = speechModule();
  if (!m) return false;
  try {
    return m.isRecognitionAvailable();
  } catch {
    return false;
  }
}

// === 8-1 안내는 처음 한 번만 ===
const INTRO_KEY = 'mfz.voiceIntroSeen.v1';
let introSeen: boolean | null = null;
void AsyncStorage.getItem(INTRO_KEY)
  .then((v) => {
    if (introSeen === null) introSeen = v === '1';
  })
  .catch(() => undefined);

export function voiceIntroSeen(): boolean {
  return introSeen === true;
}
export function markVoiceIntroSeen() {
  introSeen = true;
  void AsyncStorage.setItem(INTRO_KEY, '1').catch(() => undefined);
}

/**
 * 마이크·음성 인식 권한을 묻는다(OS 팝업). 이미 거절해 OS 가 더 묻지 않으면 설정 안내를 띄우고 false.
 * 8-1 을 어떤 길로 닫아도 이리로 온다 — 안내 뒤엔 반드시 OS 팝업으로 이어져야 한다(App Store 5.1.1(iv), d63d081).
 */
export async function requestVoicePermission(): Promise<boolean> {
  const m = speechModule();
  if (!m) return false;
  // 웹은 권한 API 가 없다 — 브라우저가 start() 때 묻고, 막혀 있으면 'not-allowed' 오류로 온다.
  if (Platform.OS === 'web') return true;
  try {
    const cur = await m.getPermissionsAsync();
    if (cur.granted) return true;
    if (!cur.canAskAgain) {
      await askOpenSettings();
      return false;
    }
    return (await m.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

async function askOpenSettings() {
  if (Platform.OS === 'web') {
    await notice('마이크가 막혀 있어요', '주소창 왼쪽의 사이트 설정에서 마이크를 허용해 주세요.');
    return;
  }
  const ok = await confirm({
    title: '마이크 권한이 필요해요',
    message: '말로 메모를 남기려면 설정에서 마이크와 음성 인식을 허용해 주세요.',
    cancelLabel: '닫기',
    confirmLabel: '설정 열기',
  });
  if (ok) void Linking.openSettings().catch(() => undefined);
}

// Android 온디바이스: 한국어 오프라인 모델이 깔려 있어야 한다. 한 번 실패하면 이 실행 동안은 서버 인식으로.
let onDeviceBroken = false;
async function preferOnDevice(m: Speech): Promise<boolean> {
  if (onDeviceBroken) return false;
  // iOS 는 네이티브가 recognizer.supportsOnDeviceRecognition 일 때만 켠다 — 안 되는 기기는 그대로 서버 인식.
  if (Platform.OS === 'ios') return true;
  if (Platform.OS !== 'android') return false;
  try {
    if (!m.supportsOnDeviceRecognition()) return false;
    const { installedLocales } = await m.getSupportedLocales({ androidRecognitionServicePackage: 'com.google.android.as' });
    return installedLocales.some((l) => l.toLowerCase().startsWith('ko'));
  } catch {
    return false;
  }
}

const NO_SPEECH = new Set(['no-speech', 'speech-timeout']);
const STOP_GRACE_MS = 3000;
const ON_DEVICE_FAIL = new Set(['language-not-supported', 'service-not-allowed']);

export interface VoiceInput {
  /** 듣는 중(시작을 누른 순간부터 인식기가 끝날 때까지). */
  listening: boolean;
  /** 아직 확정되지 않은 말(8-2 메모 칸의 옅은 글자). */
  interim: string;
  /** 입력 소리 크기 0~1. 네이티브만 온다 — 웹은 null(파형은 제자리 움직임). */
  level: number | null;
  start: () => Promise<void>;
  /** 끝내기 — 들은 말은 메모에 넣는다. */
  stop: () => void;
  /** 취소 — 이번에 들은 말은 버린다. */
  cancel: () => void;
}

/** onText: 확정된 한 마디(앞뒤 공백 없음). 메모에 붙이는 일은 화면이 한다. */
export function useVoiceInput(onText: (text: string) => void): VoiceInput {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [level, setLevel] = useState<number | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  // 이번 세션 상태 — 이벤트 순서(result → end, error → end)에 맞춰 ref 로 들고 있는다.
  const session = useRef({ active: false, cancelled: false, gotFinal: false, interim: '', onDevice: false, retry: false, heard: false });

  const begin = useCallback(async (onDevice: boolean) => {
    const m = speechModule();
    if (!m) return;
    session.current = { active: true, cancelled: false, gotFinal: false, interim: '', onDevice, retry: false, heard: false };
    setListening(true);
    setInterim('');
    setLevel(null);
    try {
      m.start({
        lang: 'ko-KR',
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: onDevice,
        addsPunctuation: true,
        volumeChangeEventOptions: { enabled: true, intervalMillis: 100 },
      });
    } catch {
      session.current.active = false;
      setListening(false);
      toast('음성 입력을 시작하지 못했어요');
    }
  }, []);

  useEffect(() => {
    const m = speechModule();
    if (!m) return;
    const subs = [
      m.addListener('result', (e) => {
        const s = session.current;
        if (!s.active || s.cancelled) return;
        const text = e.results[0]?.transcript ?? '';
        if (text) s.heard = true;
        if (e.isFinal) {
          s.gotFinal = true;
          s.interim = '';
          setInterim('');
          if (text.trim()) onTextRef.current(text.trim());
        } else {
          s.interim = text;
          setInterim(text);
        }
      }),
      m.addListener('volumechange', (e) => {
        if (session.current.active) setLevel(Math.max(0, Math.min(1, (e.value + 2) / 12)));
      }),
      m.addListener('error', (e) => {
        const s = session.current;
        if (!s.active || s.cancelled || e.error === 'aborted') return;
        if (s.onDevice && !s.heard && ON_DEVICE_FAIL.has(e.error)) {
          // 온디바이스 모델이 없거나 못 쓴다 — 끝나면 서버 인식으로 한 번 다시 시작한다.
          onDeviceBroken = true;
          s.retry = true;
          return;
        }
        if (NO_SPEECH.has(e.error)) toast('말소리를 듣지 못했어요');
        else if (e.error === 'not-allowed') void askOpenSettings();
        else if (e.error === 'network') toast('인터넷 연결을 확인해 주세요');
        else toast('음성을 글자로 바꾸지 못했어요');
      }),
      m.addListener('end', () => {
        const s = session.current;
        if (!s.active) return;
        s.active = false;
        // 끝내기를 눌렀는데 기기에 따라 마지막 확정 결과 없이 끝난다 — 보던 말을 넣는다.
        if (!s.cancelled && !s.gotFinal && s.interim.trim()) onTextRef.current(s.interim.trim());
        setInterim('');
        setLevel(null);
        if (s.retry && !s.cancelled) void begin(false);
        else setListening(false);
      }),
    ];
    return () => subs.forEach((sub) => sub.remove());
  }, [begin]);

  // 끝내기 뒤 인식기가 'end' 를 끝내 안 보내는 기기가 있어도 패널이 남지 않게 — 잠시 기다렸다가 보던 말을 넣고 닫는다.
  const stop = useCallback(() => {
    const s = session.current;
    if (!s.active) return;
    speechModule()?.stop();
    setTimeout(() => {
      if (session.current !== s || !s.active) return;
      s.active = false;
      if (!s.cancelled && !s.gotFinal && s.interim.trim()) onTextRef.current(s.interim.trim());
      setInterim('');
      setLevel(null);
      setListening(false);
    }, STOP_GRACE_MS);
  }, []);
  // 취소는 기다리지 않고 바로 닫는다(늦게 온 'end' 는 active 가 꺼져 있어 무시된다).
  const cancel = useCallback(() => {
    const s = session.current;
    if (!s.active) return;
    s.cancelled = true;
    s.active = false;
    setInterim('');
    setLevel(null);
    setListening(false);
    speechModule()?.abort();
  }, []);

  const start = useCallback(async () => {
    const m = speechModule();
    if (!m || session.current.active) return;
    if (!(await requestVoicePermission())) return;
    await begin(await preferOnDevice(m));
  }, [begin]);

  // 앱이 뒤로 가면 끝낸다(들은 말은 넣는다). 화면을 떠나면 버린다.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') stop();
    });
    return () => {
      sub.remove();
      if (session.current.active) {
        session.current.cancelled = true;
        speechModule()?.abort();
      }
    };
  }, [stop]);

  return { listening, interim, level, start, stop, cancel };
}
