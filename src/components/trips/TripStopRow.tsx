import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { AccordionBody, AccordionChevron, AccordionRow } from '@/components/ui/Accordion';
import { STATUS_LABEL } from '@/components/ui/StatusMark';
import type { FieldStatus } from '@/types/entities';
import type { VisitPhoto } from '@/api';
import { fmtTime } from '@/utils/datetime';
import { toAbsoluteFileUrl } from '@/api/config';
import { c2, radius2, space, type C2TextTone } from '@/theme/v2';

export const STATUS_TONE: Record<FieldStatus, C2TextTone> = {
  pending: 'warning',
  in_progress: 'brand',
  done: 'success',
};

const STATUS_BG: Record<FieldStatus, string> = {
  pending: c2.status.pending,
  in_progress: c2.status.inProgress,
  done: c2.status.done,
};

// 사진 시각 배지 모서리. Figma 3 에 변수 없이 5.
const PHOTO_BADGE_RADIUS = 5;

type Props =
  | {
      kind: 'visit';
      order: number;
      title: string;
      visitedAt: string;
      status: FieldStatus;
      expanded: boolean;
      onToggle: () => void;
      photos?: VisitPhoto[];
      memo?: string;
      onEdit: () => void;
      onOpenField: () => void;
      divider: boolean;
    }
  | { kind: 'skipped'; order: number; title: string; divider: boolean };

/**
 * 3 외근 상세의 방문 행(Figma 687:3426 List/Row). 방문: 순번 원(조치 상태 색) · 현장 · 'HH:mm 체크인' · 조치 상태 · 펼침.
 * 펼치면 사진·메모·[기록 수정]·[현장 상세 열기]. 건너뛴 목적지는 회색 행 '체크인 없음' · '건너뜀'(인수인계 용어 규칙).
 */
export function TripStopRow(props: Props) {
  const { order, title, divider } = props;
  if (props.kind === 'skipped') {
    // 위 줄을 펼치면 같이 밀려 내려가게 같은 layout 을 쓴다.
    return (
      <AccordionRow style={[styles.head, divider && styles.divider]}>
        <View style={[styles.num, { backgroundColor: c2.bg.placeholder }]}>
          <Text v2="bodyS.extrabold" tone="tertiary">
            {order}
          </Text>
        </View>
        <View style={styles.body}>
          <Text v2="bodyL.semibold" tone="tertiary" numberOfLines={1}>
            {title}
          </Text>
          <Text v2="caption.regular" tone="tertiary">
            체크인 없음
          </Text>
        </View>
        <Text v2="caption.bold" tone="tertiary">
          건너뜀
        </Text>
      </AccordionRow>
    );
  }

  const { status, expanded, onToggle, photos, memo, onEdit, onOpenField, visitedAt } = props;
  return (
    <AccordionRow style={[divider && styles.divider, expanded && styles.expandedPad]}>
      <Touchable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${order}번 ${title}, ${fmtTime(visitedAt)} 체크인, ${STATUS_LABEL[status]}`}
        pressedOpacity={0.6}
        style={styles.head}
      >
        <View style={[styles.num, { backgroundColor: STATUS_BG[status] }]}>
          <Text v2="bodyS.extrabold" tone="inverse">
            {order}
          </Text>
        </View>
        <View style={styles.body}>
          <Text v2="bodyL.semibold" numberOfLines={1}>
            {title}
          </Text>
          <Text v2="caption.regular" tone="tertiary">
            {`${fmtTime(visitedAt)} 체크인`}
          </Text>
        </View>
        <Text v2="caption.bold" tone={STATUS_TONE[status]}>
          {STATUS_LABEL[status]}
        </Text>
        <AccordionChevron expanded={expanded} color={c2.text.tertiary} style={styles.chevron} />
      </Touchable>
      {expanded ? (
        <AccordionBody style={styles.detail}>
          {photos && photos.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
              {photos.map((p) => (
                <PhotoThumb key={p.attachmentId} photo={p} />
              ))}
            </ScrollView>
          ) : null}
          {memo ? (
            <Text v2="bodyS.regular" tone="body">
              {memo}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Touchable onPress={onEdit} accessibilityRole="button" style={styles.action}>
              <Icon name="edit" size={16} color={c2.text.body} />
              <Text v2="bodyS.bold" tone="body">
                기록 수정
              </Text>
            </Touchable>
            <Touchable onPress={onOpenField} accessibilityRole="button" style={styles.action}>
              <Text v2="bodyS.bold" tone="link">
                현장 상세 열기
              </Text>
              <Icon name="chevron-right" size={16} color={c2.text.link} />
            </Touchable>
          </View>
        </AccordionBody>
      ) : null}
    </AccordionRow>
  );
}

/** 방문 사진 64 + 찍은 시각. 파일을 못 받으면 회색 칸에 사진 아이콘만(빈 칸이 로딩 중처럼 보이지 않게). */
function PhotoThumb({ photo }: { photo: VisitPhoto }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={styles.photo}>
      {failed ? (
        <View style={styles.photoBroken} accessible accessibilityLabel="사진을 불러올 수 없어요">
          <Icon name="camera" size={22} color={c2.text.disabled} />
        </View>
      ) : (
        <Image
          source={{ uri: toAbsoluteFileUrl(photo.fileUrl) }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      )}
      <View style={styles.photoTime}>
        <Text v2="tiny" tone="inverse">
          {fmtTime(photo.createdAt)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  divider: { borderTopWidth: 1, borderTopColor: c2.border.subtle },
  head: { height: 64, flexDirection: 'row', alignItems: 'center', gap: space[14] },
  num: { width: 28, height: 28, borderRadius: radius2.full, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: space[2] },
  chevron: { marginLeft: space[2] },
  expandedPad: { paddingBottom: space[14] },
  // 펼친 내용은 현장 이름 줄에 맞춘다(순번 원 28 + 14).
  detail: { paddingLeft: 42, gap: space[10] },
  photos: { gap: space[8] },
  photo: { width: 64, height: 64, borderRadius: radius2.md, overflow: 'hidden', backgroundColor: c2.bg.placeholder },
  photoBroken: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingBottom: space[12] },
  photoTime: {
    position: 'absolute',
    left: space[4],
    bottom: space[4],
    paddingHorizontal: 5,
    borderRadius: PHOTO_BADGE_RADIUS,
    backgroundColor: c2.bg.photoBadge,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  action: { height: 32, flexDirection: 'row', alignItems: 'center', gap: space[4] },
});
