import { Alert, Platform, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';

// 첨부 업로드 시 백엔드 multipart 가 받는 file 객체 형태.
// RN FormData 는 { uri, name, type } 객체를 받아 동작.
export type UploadFile = { uri: string; name: string; type: string };

function inferMime(uri: string, fallback: string): string {
  const m = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  if (!m) return fallback;
  const ext = m[1].toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'heic') return 'image/heic';
  if (ext === 'm4a' || ext === 'aac') return 'audio/m4a';
  if (ext === 'mp3') return 'audio/mp3';
  return fallback;
}

function basenameFromUri(uri: string, defaultName: string): string {
  const last = uri.split('/').pop() || '';
  return last.split('?')[0] || defaultName;
}

function openSettings() {
  if (Platform.OS === 'ios') void Linking.openURL('app-settings:');
  else void Linking.openSettings();
}

/**
 * 카메라 또는 갤러리에서 사진 1장 선택. 권한 거부 시 Alert + 설정 이동 옵션.
 * 사용자가 취소하면 null 반환.
 */
export async function pickPhoto(source: 'camera' | 'library'): Promise<UploadFile | null> {
  const perm =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!perm.granted) {
    Alert.alert(
      source === 'camera' ? '카메라 권한 필요' : '사진 라이브러리 권한 필요',
      '설정에서 권한을 허용해주세요.',
      [
        { text: '취소', style: 'cancel' },
        { text: '설정 열기', onPress: openSettings },
      ],
    );
    return null;
  }

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
          exif: true,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
          exif: true,
        });

  if (result.canceled || !result.assets[0]) return null;

  const a = result.assets[0];
  const name = a.fileName ?? basenameFromUri(a.uri, `photo-${Date.now()}.jpg`);
  const type = a.mimeType ?? inferMime(a.uri, 'image/jpeg');
  return { uri: a.uri, name, type };
}

/** 사용자에게 카메라 vs 라이브러리 선택을 묻는 Alert. */
export function promptPhotoSource(onPick: (src: 'camera' | 'library') => void) {
  Alert.alert('사진 첨부', '어떻게 첨부할까요?', [
    { text: '취소', style: 'cancel' },
    { text: '카메라', onPress: () => onPick('camera') },
    { text: '갤러리에서 선택', onPress: () => onPick('library') },
  ]);
}

// ----- 음성 녹음 -----

export interface VoiceRecorder {
  start: () => Promise<boolean>; // 권한 OK 면 true
  stop: () => Promise<{ file: UploadFile; durationSec: number } | null>;
  cancel: () => Promise<void>;
}

const MAX_RECORD_SEC = 300; // 5분

/** 녹음 컨트롤러 — 화면 상태와 함께 사용. */
export function createVoiceRecorder(): VoiceRecorder {
  let recording: Audio.Recording | null = null;
  let startedAt = 0;

  return {
    async start() {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('마이크 권한 필요', '설정에서 마이크 권한을 허용해주세요.', [
          { text: '취소', style: 'cancel' },
          { text: '설정 열기', onPress: openSettings },
        ]);
        return false;
      }
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        const r = new Audio.Recording();
        await r.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        await r.startAsync();
        recording = r;
        startedAt = Date.now();
        return true;
      } catch (e) {
        Alert.alert('녹음 시작 실패', e instanceof Error ? e.message : String(e));
        return false;
      }
    },

    async stop() {
      if (!recording) return null;
      try {
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        const durationSec = Math.min(
          MAX_RECORD_SEC,
          Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
        );
        recording = null;
        if (!uri) return null;
        const name = basenameFromUri(uri, `voice-${Date.now()}.m4a`);
        const type = inferMime(uri, 'audio/m4a');
        return { file: { uri, name, type }, durationSec };
      } catch {
        recording = null;
        return null;
      }
    },

    async cancel() {
      if (!recording) return;
      try {
        await recording.stopAndUnloadAsync();
      } catch {
        /* ignore */
      }
      recording = null;
    },
  };
}

export const VOICE_MAX_SECONDS = MAX_RECORD_SEC;

// ----- 음성 재생 -----

export interface VoicePlayer {
  play: () => Promise<void>;
  stop: () => Promise<void>;
  isPlaying: () => boolean;
  unload: () => Promise<void>;
}

/** uri 의 음성 파일을 재생하는 단일 컨트롤러 (재생/중지/정리). */
export async function createVoicePlayer(uri: string): Promise<VoicePlayer | null> {
  try {
    const { sound } = await Audio.Sound.createAsync({ uri });
    let playing = false;
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded) return;
      playing = status.isPlaying ?? false;
      if (status.didJustFinish) {
        playing = false;
        void sound.setPositionAsync(0);
      }
    });
    return {
      play: async () => {
        try {
          await sound.replayAsync();
          playing = true;
        } catch {
          /* ignore */
        }
      },
      stop: async () => {
        try {
          await sound.stopAsync();
        } catch {
          /* ignore */
        }
        playing = false;
      },
      isPlaying: () => playing,
      unload: async () => {
        try {
          await sound.unloadAsync();
        } catch {
          /* ignore */
        }
      },
    };
  } catch {
    return null;
  }
}
