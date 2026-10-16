import React, { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { confirm } from '@/components/ui/ConfirmDialog';
import { toAbsoluteFileUrl } from '@/api/config';
import { pickPhoto, promptPhotoSource } from '@/utils/media';
import { fmtTime } from '@/utils/datetime';
import type { CheckinPhoto } from '@/utils/visitRecord';
import { c2, radius2, space } from '@/theme/v2';

// 한 줄 3칸(사진 추가 + 최근 사진 2장). 나머지는 [전체 보기]로 펼친다(Figma 8 694:4175 · 3-7 '사진 3' 에 2장).
const COLS = 3;
const COLLAPSED_PHOTOS = COLS - 1;

interface Props {
  photos: CheckinPhoto[];
  onChange: (next: CheckinPhoto[]) => void;
  disabled?: boolean;
}

/**
 * 체크인·방문 기록 수정의 사진(Figma 8 '사진 N'). 전·중·후 칸 없이 찍은 순서대로 쌓는다.
 * 고르기만 하고 올리지 않는다 — [저장]을 눌러야 서버에 간다(닫으면 버림, 8-13).
 * 새로 고른 사진은 눌러서 뺄 수 있다. 이미 올린 사진은 서버에 지우는 기능이 없어 그대로 둔다.
 */
export function CheckinPhotos({ photos, onChange, disabled }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [width, setWidth] = useState(0);
  const cell = width > 0 ? (width - space[8] * (COLS - 1)) / COLS : 0;

  const add = () => {
    if (disabled) return;
    promptPhotoSource((source) => {
      void (async () => {
        const file = await pickPhoto(source);
        if (!file) return;
        const takenAt = new Date().toISOString();
        onChange([...photos, { key: `local-${Date.now().toString(36)}`, uri: file.uri, file, takenAt }]);
      })();
    });
  };

  const removeLocal = async (p: CheckinPhoto) => {
    if (disabled || !p.file) return;
    const ok = await confirm({ title: '사진을 뺄까요?', confirmLabel: '빼기', destructive: true });
    if (ok) onChange(photos.filter((x) => x.key !== p.key));
  };

  // 최근 사진이 앞에 온다(접었을 때 방금 찍은 사진이 보이게).
  const ordered = [...photos].reverse();
  const shown = expanded ? ordered : ordered.slice(0, COLLAPSED_PHOTOS);

  return (
    <View>
      <View style={styles.head}>
        <Text v2="bodyM.bold" style={styles.title}>
          {'사진'}
          {photos.length > 0 ? (
            <Text v2="bodyM.semibold" tone="tertiary">
              {` ${photos.length}`}
            </Text>
          ) : null}
        </Text>
        {/* 가려진 사진이 있을 때만 — 2장 이하면 눌러도 바뀌는 게 없다. */}
        {photos.length > COLLAPSED_PHOTOS ? (
          <Touchable
            onPress={() => setExpanded((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            style={styles.more}
          >
            <Text v2="bodyS.semibold" tone="link">
              {expanded ? '접기' : '전체 보기'}
            </Text>
          </Touchable>
        ) : null}
      </View>
      <View style={styles.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {cell > 0 ? (
          <>
            <Touchable
              onPress={add}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel="사진 추가"
              style={[styles.add, { width: cell, height: cell }]}
            >
              <Icon name="camera" size={26} color={c2.text.brand} />
              <Text v2="bodyS.bold" tone="brand">
                사진 추가
              </Text>
            </Touchable>
            {shown.map((p) => (
              <Thumb key={p.key} photo={p} size={cell} onPress={p.file ? () => void removeLocal(p) : undefined} />
            ))}
          </>
        ) : null}
      </View>
    </View>
  );
}

function Thumb({ photo, size, onPress }: { photo: CheckinPhoto; size: number; onPress?: () => void }) {
  const [failed, setFailed] = useState(false);
  const body = (
    <>
      {failed ? (
        <View style={styles.broken} accessible accessibilityLabel="사진을 불러올 수 없어요">
          <Icon name="camera" size={24} color={c2.text.disabled} />
        </View>
      ) : (
        <Image
          // 새로 고른 로컬 파일은 그대로, 서버 사진('/storage/…')만 절대화.
          source={{ uri: photo.file ? photo.uri : toAbsoluteFileUrl(photo.uri) }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      )}
      <View style={styles.time}>
        <Text v2="micro.semibold" tone="inverse" numeric>
          {fmtTime(photo.takenAt)}
        </Text>
      </View>
    </>
  );
  if (!onPress) return <View style={[styles.thumb, { width: size, height: size }]}>{body}</View>;
  return (
    <Touchable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${fmtTime(photo.takenAt)} 사진, 눌러서 빼기`}
      style={[styles.thumb, { width: size, height: size }]}
    >
      {body}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  head: { height: 22, flexDirection: 'row', alignItems: 'center', marginBottom: space[10] },
  title: { flex: 1 },
  more: { height: 38, justifyContent: 'center', paddingLeft: space[12], marginRight: -space[2] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
  add: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[4],
    borderRadius: radius2.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: c2.border.brandMuted,
    backgroundColor: c2.bg.brandSubtle,
  },
  thumb: { borderRadius: radius2.lg, overflow: 'hidden', backgroundColor: c2.bg.placeholder },
  broken: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  time: {
    position: 'absolute',
    left: space[6],
    bottom: space[6],
    height: 18,
    justifyContent: 'center',
    paddingHorizontal: space[6],
    borderRadius: radius2.xs,
    backgroundColor: c2.bg.photoBadge,
  },
});
