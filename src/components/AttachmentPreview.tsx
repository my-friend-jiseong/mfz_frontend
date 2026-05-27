import { Image, StyleSheet, View } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';

// ERD v2: 음성 메모 폐기 — VoiceMemoRow/VoiceMemoList 및 오디오 재생 제거. 사진 그리드만 유지.

export interface PhotoItem {
  id: string;
  fileUrl: string;
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
