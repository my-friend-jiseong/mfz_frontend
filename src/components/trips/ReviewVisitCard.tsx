import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PhotoGrid } from '@/components/AttachmentPreview';
import { VISIT_STATUS_BADGE } from '@/theme/statusBadge';
import {
  VISIT_STATUS_LABEL,
  VISIT_STATUS_VALUES,
  type Visit,
  type VisitStatus,
} from '@/types/entities';
import { useVisitStore } from '@/stores/visitStore';
import { useFieldStore } from '@/stores/fieldStore';
import { pickPhoto, promptPhotoSource } from '@/utils/media';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { withAlpha } from '@/theme/withAlpha';
import { fmtTime } from '@/utils/datetime';

// checkin 화면의 chip 패턴과 동일 — 시각적 일관성. 색·형상·라벨 3중 인코딩.
const VISIT_SHAPE: Record<VisitStatus, string> = {
  completed: '■',
  absent: '●',
  refused: '▲',
  unknown_address: '◆',
  revisit_needed: '◆',
  other: '◆',
};

interface Props {
  visit: Visit;
  order: number;          // destination.order — 헤더에 "N번째" 표시
  fieldId: string;
  fieldAddress: string;
  fieldAddressDetail?: string;
  initiallyExpanded?: boolean;
}

export function ReviewVisitCard({
  visit,
  order,
  fieldId,
  fieldAddress,
  fieldAddressDetail,
  initiallyExpanded = false,
}: Props) {
  const setResult = useVisitStore((s) => s.setResult);
  const addTextMemo = useFieldStore((s) => s.addTextMemo);
  const addPhoto = useFieldStore((s) => s.addPhoto);
  // 좁은 selector — 이 카드의 fieldId attachments 만 구독해 다른 카드 입력으로 인한 rerender 차단.
  const attachments = useFieldStore((s) => s.directAttachments[fieldId] ?? []);

  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [status, setStatus] = useState<VisitStatus>(visit.status);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [memoInput, setMemoInput] = useState('');
  const [memoSubmitting, setMemoSubmitting] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const textMemos = attachments.filter((a) => a.type === 'text');
  const photos = attachments
    .filter((a) => a.type === 'photo' && a.fileUrl)
    .map((a) => ({ id: a.id, fileUrl: a.fileUrl as string }));

  const handleAddMemo = async () => {
    const t = memoInput.trim();
    if (!t) return;
    setMemoSubmitting(true);
    const r = await addTextMemo(fieldId, t);
    setMemoSubmitting(false);
    if (r.ok) setMemoInput('');
    else Alert.alert('메모 추가 실패', r.error);
  };

  const uploadPhoto = async (source: 'camera' | 'library') => {
    setPhotoBusy(true);
    try {
      const file = await pickPhoto(source);
      if (!file) return;
      const r = await addPhoto(fieldId, file);
      if (!r.ok) Alert.alert('사진 추가 실패', r.error);
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleAddPhoto = () => {
    if (photoBusy) return;
    promptPhotoSource((src) => void uploadPhoto(src));
  };

  const reasonTrim = reason.trim();
  const otherReasonValid = status !== 'other' || reasonTrim.length >= 10;
  const dirty = status !== visit.status || (status === 'other' && reasonTrim.length > 0);

  const headBadge = VISIT_STATUS_BADGE[visit.status];

  const handleSave = async () => {
    if (!dirty || saving || !otherReasonValid) return;
    setError(null);
    setSaving(true);
    const r = await setResult(
      visit.id,
      status,
      status === 'other' ? reasonTrim : undefined,
    );
    setSaving(false);
    if (r.ok) {
      setSavedAt(Date.now());
      // 'other' reason 은 한 번 저장되면 비움 — 같은 카드에서 다시 다른 status 로 옮길 때 잔존 X.
      if (status !== 'other') setReason('');
    } else {
      setError(r.error);
    }
  };

  return (
    <Card padding="md" style={styles.card}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={({ pressed }) => [styles.head, pressed && { opacity: opacity.pressed }]}
      >
        <View style={styles.orderBadge}>
          <Text variant="bodySm" weight="bold" color="onPrimary">
            {order}
          </Text>
        </View>
        <View style={styles.headText}>
          <View style={styles.headTopRow}>
            <Text variant="bodySm" weight="bold" color="textMuted">
              {fmtTime(visit.visitedAt)}
            </Text>
            <Badge
              label={VISIT_STATUS_LABEL[visit.status]}
              tone={headBadge.tone}
              shape={headBadge.shape}
              size="sm"
            />
          </View>
          <Text variant="body" weight="semibold" numberOfLines={1}>
            {fieldAddress}
          </Text>
          {fieldAddressDetail ? (
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {fieldAddressDetail}
            </Text>
          ) : null}
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textMuted}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          <Text variant="caption" weight="bold" color="textMuted" style={styles.sectionLabel}>
            결과 확정
          </Text>
          <View style={styles.chipGrid}>
            {VISIT_STATUS_VALUES.map((s) => {
              const active = status === s;
              const c = colors.visitStatus[s];
              return (
                <Pressable
                  key={s}
                  onPress={() => setStatus(s)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.chip,
                    active && { backgroundColor: withAlpha(c, 0.13), borderColor: c },
                    pressed && { opacity: opacity.pressed },
                  ]}
                >
                  <Text
                    variant="caption"
                    style={[
                      styles.chipShape,
                      active ? { color: c } : { color: colors.textSubtle },
                    ]}
                  >
                    {VISIT_SHAPE[s]}
                  </Text>
                  <Text
                    variant="bodySm"
                    weight={active ? 'bold' : 'regular'}
                    style={active ? { color: c } : { color: colors.textMuted }}
                  >
                    {VISIT_STATUS_LABEL[s]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {status === 'other' ? (
            <Input
              label="기타 사유 (10자 이상)"
              value={reason}
              onChangeText={setReason}
              placeholder="현장 상황을 10자 이상 설명해주세요"
              maxLength={500}
              multiline
              numberOfLines={2}
              helperText={`${reasonTrim.length} / 10자 이상`}
              error={
                reasonTrim.length > 0 && reasonTrim.length < 10
                  ? `${reasonTrim.length} / 10자 이상 필요`
                  : undefined
              }
              containerStyle={styles.reasonBox}
            />
          ) : null}

          {error ? (
            <Text variant="caption" color="danger" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <Button
            onPress={handleSave}
            disabled={!dirty || !otherReasonValid}
            loading={saving}
            size="sm"
            leftIcon={savedAt ? 'checkmark-circle' : 'save'}
            style={styles.saveBtn}
          >
            {savedAt && !dirty ? '저장됨' : '결과 저장'}
          </Button>

          <View style={styles.divider} />

          <Text variant="caption" weight="bold" color="textMuted" style={styles.sectionLabel}>
            현장 메모 ({textMemos.length})
          </Text>
          <View style={styles.memoRow}>
            <Input
              value={memoInput}
              onChangeText={setMemoInput}
              placeholder="현장에 남길 메모"
              maxLength={2000}
              multiline
              numberOfLines={2}
              containerStyle={styles.memoInputWrap}
            />
            <Button
              onPress={handleAddMemo}
              disabled={!memoInput.trim()}
              loading={memoSubmitting}
              size="sm"
            >
              추가
            </Button>
          </View>
          {textMemos.length > 0 ? (
            <View style={styles.memoList}>
              {textMemos.map((m) => (
                <View key={m.id} style={styles.memoItem}>
                  <Text variant="bodySm">{m.text}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <Button
            onPress={handleAddPhoto}
            variant="secondary"
            size="sm"
            leftIcon="camera"
            loading={photoBusy}
            style={styles.photoBtn}
          >
            사진 추가{photos.length > 0 ? ` (${photos.length})` : ''}
          </Button>
          <PhotoGrid photos={photos} />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.sm, gap: 0 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  orderBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headText: { flex: 1, gap: 2 },
  headTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  body: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
    gap: spacing.sm,
  },
  sectionLabel: { marginBottom: 2 },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipShape: { lineHeight: 12 },
  reasonBox: { marginTop: spacing.xs },
  error: { marginTop: 2 },
  saveBtn: { alignSelf: 'flex-start', marginTop: spacing.xs },
  divider: {
    height: 1,
    backgroundColor: colors.borderMuted,
    marginVertical: spacing.sm,
  },
  memoRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-end',
  },
  memoInputWrap: { flex: 1 },
  memoList: { marginTop: spacing.xs, gap: spacing.xs },
  memoItem: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  photoBtn: { alignSelf: 'flex-start', marginTop: spacing.sm },
});
