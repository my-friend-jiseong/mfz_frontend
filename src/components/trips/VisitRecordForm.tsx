import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { Input } from '@/components/ui/Input';
import { FieldLabel } from '@/components/ui/FieldLabel';
import { BADGE_SHAPE_GLYPH } from '@/components/ui/Badge';
import { VISIT_STATUS_BADGE } from '@/theme/statusBadge';
import { VISIT_STATUS_LABEL, VISIT_STATUS_VALUES } from '@/types/entities';
import { toAbsoluteFileUrl } from '@/api/config';
import { pickPhoto, promptPhotoSource } from '@/utils/media';
import {
  OTHER_REASON_MIN,
  PHASES,
  PHASE_LABEL,
  type Phase,
  type VisitRecordValue,
} from '@/utils/visitRecord';
import { colors } from '@/theme/colors';
import { spacing, radius, touchTarget } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { withAlpha } from '@/theme/withAlpha';

interface Props {
  value: VisitRecordValue;
  onChange: (next: VisitRecordValue) => void;
  disabled?: boolean;
}

// 사진 슬롯 하단 라벨이 차지하는 높이 — 미리보기 이미지를 그만큼 띄운다.
const PHASE_LABEL_HEIGHT = 22;

/**
 * 방문 기록 폼 — 체크인(FE-CHK)과 방문 수정(FE-VED)이 같은 구성을 쓴다 (명세 FE-VED-01).
 * 모든 입력은 선택이다(FE-CHK-05). 결과 칩은 다시 누르면 선택이 풀린다.
 * 사진은 고르기만 하고 올리지 않는다 — 저장(체크인 완료·저장)을 눌러야 서버에 간다.
 * 그래서 뒤로가기는 아무것도 남기지 않는다(FE-CHK-01).
 */
export function VisitRecordForm({ value, onChange, disabled }: Props) {
  const set = (patch: Partial<VisitRecordValue>) => onChange({ ...value, ...patch });

  const pick = (phase: Phase) => {
    if (disabled) return;
    promptPhotoSource((source) => {
      void (async () => {
        const file = await pickPhoto(source);
        if (!file) return;
        onChange({ ...value, photos: { ...value.photos, [phase]: { uri: file.uri, file } } });
      })();
    });
  };

  const reasonLen = value.reason.trim().length;

  return (
    <View>
      <FieldLabel>방문 결과 상태</FieldLabel>
      <View style={styles.statusGrid}>
        {VISIT_STATUS_VALUES.map((s) => {
          const active = value.status === s;
          const c = colors.visitStatus[s];
          return (
            <Pressable
              key={s}
              disabled={disabled}
              onPress={() => set({ status: active ? null : s })}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled }}
              style={({ pressed }) => [
                styles.statusChip,
                active && { backgroundColor: withAlpha(c, 0.13), borderColor: c },
                pressed && { opacity: opacity.pressed },
              ]}
            >
              <Text
                variant="caption"
                style={[styles.glyph, { color: active ? c : colors.textSubtle }]}
              >
                {BADGE_SHAPE_GLYPH[VISIT_STATUS_BADGE[s].shape]}
              </Text>
              <Text
                variant="bodySm"
                weight={active ? 'bold' : 'regular'}
                style={{ color: active ? c : colors.textMuted }}
              >
                {VISIT_STATUS_LABEL[s]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {value.status === 'other' ? (
        <Input
          label="기타 사유"
          value={value.reason}
          onChangeText={(t) => set({ reason: t })}
          placeholder="현장 상황을 적어주세요"
          maxLength={500}
          multiline
          numberOfLines={3}
          editable={!disabled}
          style={styles.multiline}
          // 서버가 10자 미만을 거절한다(백로그 §37). 막기 전에 이유를 먼저 보여준다.
          helperText={
            reasonLen < OTHER_REASON_MIN
              ? `기타는 사유를 ${OTHER_REASON_MIN}자 이상 적어야 저장됩니다 (${reasonLen}/${OTHER_REASON_MIN})`
              : undefined
          }
          containerStyle={styles.reasonBox}
        />
      ) : null}

      <FieldLabel style={styles.sectionGap}>작업 사진 (선택 — 보고서에 활용)</FieldLabel>
      <View style={styles.phaseRow}>
        {PHASES.map((phase) => {
          const slot = value.photos[phase];
          const label = PHASE_LABEL[phase];
          return (
            <Pressable
              key={phase}
              onPress={() => pick(phase)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={slot ? `${label} 사진 바꾸기` : `${label} 사진 추가`}
              style={({ pressed }) => [
                styles.phaseSlot,
                slot && styles.phaseSlotFilled,
                pressed && { opacity: opacity.pressed },
              ]}
            >
              {slot ? (
                <Image
                  // 새로 고른 로컬 파일(file://·blob:)은 그대로, 서버 사진('/storage/…')만 절대화.
                  source={{ uri: slot.file ? slot.uri : toAbsoluteFileUrl(slot.uri) }}
                  style={styles.phasePreview}
                />
              ) : (
                <Ionicons name="camera-outline" size={22} color={colors.textMuted} />
              )}
              <Text variant="caption" weight="bold" color={slot ? 'primary' : 'textMuted'}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FieldLabel style={styles.sectionGap}>메모 (선택)</FieldLabel>
      <Input
        value={value.memo}
        onChangeText={(t) => set({ memo: t })}
        placeholder="현장에서 확인한 내용을 적어두세요"
        maxLength={2000}
        multiline
        numberOfLines={3}
        editable={!disabled}
        style={styles.multiline}
        accessibilityLabel="메모"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: touchTarget.control,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  glyph: { lineHeight: 12 },
  reasonBox: { marginTop: spacing.md },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  sectionGap: { marginTop: spacing.xl },
  phaseRow: { flexDirection: 'row', gap: spacing.sm },
  phaseSlot: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    overflow: 'hidden',
  },
  // 사진이 차면 라벨을 미리보기 아래 띠로 내린다 — 가운데 두면 사진 위에 글자가 얹힌다(실측).
  phaseSlotFilled: {
    justifyContent: 'flex-end',
    paddingBottom: 3,
    borderStyle: 'solid',
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  phasePreview: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: PHASE_LABEL_HEIGHT,
    width: '100%',
    height: undefined,
  },
});
