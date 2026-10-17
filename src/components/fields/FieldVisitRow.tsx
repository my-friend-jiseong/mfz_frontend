import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { AccordionBody, AccordionChevron, AccordionRow } from '@/components/ui/Accordion';
import { STATUS_LABEL } from '@/components/ui/StatusMark';
import { STATUS_TONE } from '@/components/trips/TripStopRow';
import type { FieldStatus } from '@/types/entities';
import type { VisitPhoto } from '@/api';
import { toAbsoluteFileUrl } from '@/api/config';
import { fmtTime } from '@/utils/datetime';
import { dayOfMonth, weekdayKo } from '@/utils/tripFormat';
import { c2, radius2, space } from '@/theme/v2';

const PHOTO_COLS = 3;
// 사진 칸 4:3(Figma 5 111.3×83.5).
const PHOTO_RATIO = 3 / 4;

interface Props {
  visitedAt: string;
  /** 그 방문이 속한 외근 제목(Figma '사하구 낙동대로 일대'). */
  tripTitle: string;
  /** 모르면 표시하지 않는다(서버에 방문 단위 조치 상태가 아직 없다 — 백로그 2차 D). */
  status: FieldStatus | null;
  photos: VisitPhoto[];
  memo?: string;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onOpenTrip: () => void;
  divider: boolean;
}

function monthOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}월`;
}

/**
 * 5 현장 상세의 방문 행(Figma 691:3492). 날짜 칸 · 외근 제목 · 'HH:mm 체크인 · 사진 N · 메모 1' · 조치 상태 · 펼침.
 * 펼치면 사진 3열 · 메모 · [기록 수정] [외근 보기]. 한 번에 하나만 펼친다(화면이 정한다).
 */
export function FieldVisitRow({ visitedAt, tripTitle, status, photos, memo, expanded, onToggle, onEdit, onOpenTrip, divider }: Props) {
  const [width, setWidth] = useState(0);
  const cell = width > 0 ? (width - space[8] * (PHOTO_COLS - 1)) / PHOTO_COLS : 0;
  const meta = [`${fmtTime(visitedAt)} 체크인`, photos.length > 0 ? `사진 ${photos.length}` : null, memo ? '메모 1' : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <AccordionRow style={[divider && styles.divider, expanded && styles.expandedPad]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Touchable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${monthOf(visitedAt)} ${dayOfMonth(visitedAt)}일 ${tripTitle}, ${meta}${status ? `, ${STATUS_LABEL[status]}` : ''}`}
        pressedOpacity={0.6}
        style={styles.head}
      >
        <View style={styles.date}>
          <Text v2="small.semibold" tone="tertiary">
            {monthOf(visitedAt)}
          </Text>
          <Text v2="title.m" numeric>
            {dayOfMonth(visitedAt)}
          </Text>
          <Text v2="micro.regular" tone="disabled">
            {weekdayKo(visitedAt)}
          </Text>
        </View>
        <View style={styles.body}>
          <Text v2="bodyL.semibold" numberOfLines={1}>
            {tripTitle}
          </Text>
          <Text v2="caption.regular" tone="tertiary" numberOfLines={1}>
            {meta}
          </Text>
        </View>
        {status ? (
          <Text v2="caption.bold" tone={STATUS_TONE[status]}>
            {STATUS_LABEL[status]}
          </Text>
        ) : null}
        <AccordionChevron expanded={expanded} color={c2.text.tertiary} />
      </Touchable>
      {expanded ? (
        <AccordionBody style={styles.detail}>
          {photos.length > 0 && cell > 0 ? (
            <View style={styles.photos}>
              {photos.map((p) => (
                <PhotoCell key={p.attachmentId} photo={p} size={cell} />
              ))}
            </View>
          ) : null}
          {memo ? (
            <View style={styles.memo}>
              <Text v2="bodyM.regular">{memo}</Text>
            </View>
          ) : null}
          <View style={styles.actions}>
            <Touchable onPress={onEdit} accessibilityRole="button" style={styles.action}>
              <Icon name="edit" size={16} color={c2.text.body} />
              <Text v2="bodyS.bold" tone="body">
                기록 수정
              </Text>
            </Touchable>
            <Touchable onPress={onOpenTrip} accessibilityRole="button" style={styles.action}>
              <Text v2="bodyS.bold" tone="link">
                외근 보기
              </Text>
              <Icon name="chevron-right" size={16} color={c2.text.link} />
            </Touchable>
          </View>
        </AccordionBody>
      ) : null}
    </AccordionRow>
  );
}

/** 사진 칸 + 찍은 시각. 파일을 못 받으면 회색 칸에 사진 아이콘(빈 칸이 로딩 중처럼 보이지 않게). */
function PhotoCell({ photo, size }: { photo: VisitPhoto; size: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={[styles.photo, { width: size, height: size * PHOTO_RATIO }]}>
      {failed ? (
        <View style={styles.broken} accessible accessibilityLabel="사진을 불러올 수 없어요">
          <Icon name="camera" size={24} color={c2.text.disabled} />
        </View>
      ) : (
        <Image
          source={{ uri: toAbsoluteFileUrl(photo.fileUrl) }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      )}
      <View style={styles.time}>
        <Text v2="micro.semibold" tone="inverse">
          {fmtTime(photo.createdAt)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  divider: { borderTopWidth: 1, borderTopColor: c2.border.subtle },
  expandedPad: { paddingBottom: space[16] },
  head: { height: 72, flexDirection: 'row', alignItems: 'center', gap: space[10] },
  date: { width: 44, alignItems: 'center', marginRight: space[4] },
  body: { flex: 1, gap: space[2] },
  detail: { gap: space[12], paddingTop: space[2] },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
  photo: { borderRadius: radius2.lg, overflow: 'hidden', backgroundColor: c2.bg.placeholder },
  broken: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  time: {
    position: 'absolute',
    left: space[6],
    bottom: space[6],
    paddingHorizontal: space[6],
    borderRadius: radius2.xs,
    backgroundColor: c2.bg.photoBadge,
  },
  memo: {
    paddingHorizontal: space[14],
    paddingVertical: space[12],
    borderRadius: radius2.lg,
    borderWidth: 1,
    borderColor: c2.border.default,
    backgroundColor: c2.bg.subtle,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  action: { height: 32, flexDirection: 'row', alignItems: 'center', gap: space[4] },
});
