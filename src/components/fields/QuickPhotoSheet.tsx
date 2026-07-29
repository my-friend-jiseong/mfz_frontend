import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/EmptyState';
import { formatDistanceM, QUICK_PHOTO_MAX_DISTANCE_M } from '@/utils/nearestField';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { withAlpha } from '@/theme/withAlpha';
import type { Field } from '@/types/entities';
import type {
  QuickPhotoFallbackReason,
  QuickPhotoSession,
} from './useQuickPhoto';

// Quick Photo 확인/폴백 시트 — 계획 §4-5. AddDestinationModal 의 Modal 카드 패턴 재사용
// (BottomSheetModalProvider 미사용 코드베이스라 @gorhom modal 대신 RN Modal).
//
// confirm: 최근접 현장 1순위 기본 선택 + 차순위 후보(최대 3) 선택 변경 + 등록 1탭.
// fallback: 사유 안내 + 본인 현장 검색 리스트에서 직접 선택 → 즉시 등록.

interface Props {
  session: QuickPhotoSession | null;
  uploading: boolean;
  onUpload: (field: Field) => void;
  onFallback: () => void;
  /** 폴백에서 "이 위치에 새 현장 등록" — 사진·촬영 좌표를 등록 화면으로 이관. */
  onCreateNew: () => void;
  onClose: () => void;
}

// 키를 union 으로 고정 — 새 fallbackReason 추가 시 문구 누락이 컴파일 에러로 잡히게.
const FALLBACK_NOTICE: Record<QuickPhotoFallbackReason, string> = {
  no_location: '위치를 확인할 수 없어요. 등록할 현장을 직접 선택해 주세요.',
  no_nearby: `${QUICK_PHOTO_MAX_DISTANCE_M}m 이내 현장이 없어요. 등록할 현장을 직접 선택해 주세요.`,
  list_failed: '현장 목록을 모두 불러오지 못했어요. 등록할 현장을 직접 선택해 주세요.',
  manual: '등록할 현장을 선택해 주세요.',
};

export function QuickPhotoSheet({
  session,
  uploading,
  onUpload,
  onFallback,
  onCreateNew,
  onClose,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // 새 촬영 세션마다 선택·검색 초기화.
  useEffect(() => {
    setSelectedId(null);
    setQuery('');
  }, [session?.file.uri]);

  // 후보는 거리 오름차순 — 1순위 기본 선택, 차순위 최대 3개까지 노출 (§4-5).
  const candidates = useMemo(
    () => (session?.candidates ?? []).slice(0, 4),
    [session?.candidates],
  );
  const selected =
    candidates.find((c) => c.field.id === selectedId) ?? candidates[0];

  const fallbackList = useMemo(() => {
    if (!session) return [];
    const q = query.trim().toLowerCase();
    if (!q) return session.myFields;
    return session.myFields.filter(
      (f) =>
        f.address.toLowerCase().includes(q) ||
        (f.addressDetail ?? '').toLowerCase().includes(q),
    );
  }, [session, query]);

  if (!session) return null;

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} disabled={uploading}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <View style={styles.headRow}>
            <Image source={{ uri: session.file.uri }} style={styles.thumb} />
            <View style={styles.headText}>
              <Text variant="h3">사진 등록</Text>
              <Text variant="bodySm" color="textMuted">
                {session.mode === 'confirm'
                  ? '가장 가까운 현장에 등록할까요?'
                  : FALLBACK_NOTICE[session.fallbackReason ?? 'manual']}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              disabled={uploading}
              accessibilityLabel="닫기"
              accessibilityRole="button"
            >
              <Ionicons
                name="close"
                size={20}
                color={uploading ? colors.border : colors.textMuted}
              />
            </Pressable>
          </View>

          {session.mode === 'confirm' ? (
            <>
              <View style={styles.candidateList}>
                {candidates.map((c, idx) => {
                  const active = c.field.id === selected?.field.id;
                  return (
                    <Pressable
                      key={c.field.id}
                      onPress={() => setSelectedId(c.field.id)}
                      disabled={uploading}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`${c.field.address}, ${formatDistanceM(c.distanceM)}`}
                      style={({ pressed }) => [
                        styles.row,
                        active && styles.rowActive,
                        pressed && { opacity: opacity.pressed },
                      ]}
                    >
                      <Ionicons
                        name={active ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={active ? colors.primary : colors.textMuted}
                      />
                      <View style={styles.rowText}>
                        <Text
                          variant="body"
                          weight={idx === 0 ? 'semibold' : 'regular'}
                          numberOfLines={1}
                        >
                          {c.field.address}
                        </Text>
                        {c.field.addressDetail ? (
                          <Text
                            variant="caption"
                            color="textMuted"
                            numberOfLines={1}
                            style={styles.rowDetail}
                          >
                            {c.field.addressDetail}
                          </Text>
                        ) : null}
                      </View>
                      <Text variant="caption" weight="bold" color="primary">
                        {formatDistanceM(c.distanceM)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Button
                onPress={() => selected && onUpload(selected.field)}
                loading={uploading}
                size="lg"
                fullWidth
                leftIcon="cloud-upload"
              >
                이 현장에 등록
              </Button>
              <Button
                onPress={onFallback}
                variant="ghost"
                size="sm"
                fullWidth
                disabled={uploading}
              >
                다른 현장 선택
              </Button>
            </>
          ) : (
            <>
              <Input
                value={query}
                onChangeText={setQuery}
                placeholder="주소·상세주소 검색"
                autoCapitalize="none"
                clearButtonMode="while-editing"
                leftSlot={
                  <Ionicons name="search" size={18} color={colors.textMuted} />
                }
              />
              {fallbackList.length === 0 ? (
                <EmptyState
                  icon="search-outline"
                  title="검색 결과가 없습니다"
                  description="검색어를 조정해보세요"
                />
              ) : (
                <ScrollView
                  style={styles.list}
                  contentContainerStyle={styles.listContent}
                >
                  {fallbackList.map((f) => (
                    <Pressable
                      key={f.id}
                      onPress={() => onUpload(f)}
                      disabled={uploading}
                      accessibilityRole="button"
                      accessibilityLabel={`${f.address}에 사진 등록`}
                      style={({ pressed }) => [
                        styles.row,
                        pressed && { opacity: opacity.pressed },
                        uploading && { opacity: opacity.disabled },
                      ]}
                    >
                      <View style={styles.rowText}>
                        <Text variant="body" weight="semibold" numberOfLines={1}>
                          {f.address}
                        </Text>
                        {f.addressDetail ? (
                          <Text
                            variant="caption"
                            color="textMuted"
                            numberOfLines={1}
                            style={styles.rowDetail}
                          >
                            {f.addressDetail}
                          </Text>
                        ) : null}
                      </View>
                      <Ionicons
                        name="cloud-upload-outline"
                        size={20}
                        color={colors.primary}
                      />
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              {/* 기존 현장 선택 외 제3의 선택지 — 촬영 위치에 새 현장을 만들고 사진까지 첨부. */}
              <Button
                onPress={onCreateNew}
                variant="secondary"
                size="sm"
                fullWidth
                leftIcon="add"
                disabled={uploading}
              >
                {session.pos ? '이 위치에 새 현장 등록' : '새 현장 등록'}
              </Button>
              {uploading ? (
                <Text variant="caption" color="textMuted" align="center">
                  등록 중…
                </Text>
              ) : null}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headText: { flex: 1 },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  candidateList: { gap: spacing.xs },
  list: { flexGrow: 0 },
  listContent: { gap: spacing.xs, paddingVertical: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowActive: {
    borderColor: colors.primary,
    backgroundColor: withAlpha(colors.primary, 0.06),
  },
  rowText: { flex: 1 },
  rowDetail: { marginTop: 2 },
});
