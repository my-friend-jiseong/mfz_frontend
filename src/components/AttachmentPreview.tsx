import { useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { createVoicePlayer, type VoicePlayer } from '@/utils/media';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

export interface PhotoItem {
  id: string;
  fileUrl: string;
}

export interface VoiceItem {
  id: string;
  /** 백엔드가 준 URL 또는 로컬 file:// uri */
  fileUrl: string;
  durationSec?: number;
  createdAt?: string;
}

/** 사진 그리드 미리보기 — 정사각 썸네일 3열 grid. */
export function PhotoGrid({ photos }: { photos: PhotoItem[] }) {
  if (photos.length === 0) return null;
  return (
    <View style={photoStyles.grid}>
      {photos.map((p) => (
        <View key={p.id} style={photoStyles.cell}>
          <Image source={{ uri: p.fileUrl }} style={photoStyles.image} resizeMode="cover" />
        </View>
      ))}
    </View>
  );
}

const photoStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  cell: {
    width: '32%',
    aspectRatio: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  image: { width: '100%', height: '100%' },
});

/** 음성 메모 1건 재생 버튼 — 토글식 (재생/중지). */
export function VoiceMemoRow({ memo }: { memo: VoiceItem }) {
  const playerRef = useRef<VoicePlayer | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    return () => {
      void playerRef.current?.unload();
      playerRef.current = null;
    };
  }, []);

  const toggle = async () => {
    if (playing) {
      await playerRef.current?.stop();
      setPlaying(false);
      return;
    }
    if (!playerRef.current) {
      playerRef.current = await createVoicePlayer(memo.fileUrl);
      if (!playerRef.current) return;
    }
    await playerRef.current.play();
    setPlaying(true);
    // 길이 만료 후 자동 false 처리
    if (memo.durationSec) {
      setTimeout(() => setPlaying(false), memo.durationSec * 1000 + 200);
    }
  };

  return (
    <Pressable
      onPress={() => void toggle()}
      style={({ pressed }) => [voiceStyles.row, pressed && voiceStyles.pressed]}
    >
      <Text style={voiceStyles.icon}>{playing ? '■' : '▶'}</Text>
      <View style={voiceStyles.body}>
        <Text style={voiceStyles.label}>
          {playing ? '재생 중...' : '음성 메모 재생'}
        </Text>
        {memo.durationSec ? (
          <Text style={voiceStyles.meta}>
            {Math.floor(memo.durationSec / 60)}:
            {String(Math.round(memo.durationSec) % 60).padStart(2, '0')}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** 음성 메모 리스트 (단순 wrapper). */
export function VoiceMemoList({ memos }: { memos: VoiceItem[] }) {
  if (memos.length === 0) return null;
  return (
    <View style={voiceStyles.list}>
      {memos.map((m) => (
        <VoiceMemoRow key={m.id} memo={m} />
      ))}
    </View>
  );
}

const voiceStyles = StyleSheet.create({
  list: { marginTop: spacing.sm, gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pressed: { opacity: 0.85 },
  icon: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '700',
    width: 20,
    textAlign: 'center',
  },
  body: { flex: 1 },
  label: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },
  meta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
});
