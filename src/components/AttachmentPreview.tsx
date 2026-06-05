import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { toAbsoluteFileUrl } from '@/api';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { withAlpha } from '@/theme/withAlpha';

// ERD v2: 음성 메모 폐기 — VoiceMemoRow/VoiceMemoList 및 오디오 재생 제거. 사진 그리드만 유지.

export interface PhotoItem {
  id: string;
  fileUrl: string;
}

/**
 * 사진 그리드 미리보기 — 정사각 썸네일 3열 grid.
 * onDelete 가 주어지면 각 셀에 삭제 버튼(우상단)을 노출.
 */
export function PhotoGrid({
  photos,
  onDelete,
}: {
  photos: PhotoItem[];
  onDelete?: (id: string) => void;
}) {
  if (photos.length === 0) return null;
  return (
    <View style={photoStyles.grid}>
      {photos.map((p) => (
        <View key={p.id} style={photoStyles.cell}>
          <Image
            // fileUrl 은 '/storage/...' 상대 경로일 수 있다 — 절대화 없인 네이티브에서 빈 칸.
            source={{ uri: toAbsoluteFileUrl(p.fileUrl) }}
            style={photoStyles.image}
            resizeMode="cover"
            accessibilityLabel="첨부 사진"
          />
          {onDelete ? (
            <Pressable
              onPress={() => onDelete(p.id)}
              accessibilityRole="button"
              accessibilityLabel="사진 삭제"
              hitSlop={6}
              style={({ pressed }) => [
                photoStyles.deleteBtn,
                pressed && { opacity: opacity.pressed },
              ]}
            >
              <Ionicons name="close" size={14} color={colors.onPrimary} />
            </Pressable>
          ) : null}
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
  deleteBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: withAlpha(colors.shadow, 0.55),
    alignItems: 'center',
    justifyContent: 'center',
  },
});
