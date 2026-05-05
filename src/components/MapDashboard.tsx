import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFieldStore } from '@/stores/fieldStore';
import { useAuthStore } from '@/stores/authStore';
import { useVisitStore } from '@/stores/visitStore';
import { KakaoMapWebView, fieldsToMarkers } from '@/components/KakaoMapWebView';
import {
  MapFilterBar,
  type DisplayMode,
  type AttachmentKind,
  type VisibleAttachments,
  type RangePreset,
} from '@/components/MapFilterBar';
import type { FieldStatus } from '@/types/entities';
import { colors } from '@/theme/colors';

export function MapDashboard() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const allFields = useFieldStore((s) => s.fields);
  const directAttachmentsMap = useFieldStore((s) => s.directAttachments);
  const allVisits = useVisitStore((s) => s.visits);
  const allTextMemos = useVisitStore((s) => s.textMemos);
  const allVoiceMemos = useVisitStore((s) => s.voiceMemos);
  const allPhotos = useVisitStore((s) => s.photos);

  const [displayMode, setDisplayMode] = useState<DisplayMode>('markers');
  const [selectedStatuses, setSelectedStatuses] = useState<FieldStatus[]>([]);
  const [rangePreset, setRangePreset] = useState<RangePreset>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [visibleAttachments, setVisibleAttachments] = useState<VisibleAttachments>({
    text: true,
    voice: true,
    photo: true,
  });
  const [showBoundary, setShowBoundary] = useState(false);

  const myFields = useMemo(
    () => (userId ? allFields.filter((f) => f.userId === userId) : []),
    [allFields, userId],
  );

  // 가용 태그 — 내 현장에 등록된 태그 합집합 (정렬)
  const availableTags = useMemo(() => {
    const set = new Set<string>();
    myFields.forEach((f) => f.tags?.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [myFields]);

  const visibleFields = useMemo(() => {
    let list = myFields;
    if (selectedStatuses.length > 0) {
      list = list.filter((f) => selectedStatuses.includes(f.status));
    }
    if (rangePreset !== 'all') {
      const days = rangePreset === '30d' ? 30 : rangePreset === '7d' ? 7 : 1;
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      list = list.filter((f) => {
        const t = f.recentVisitedAt ?? f.updatedAt;
        if (!t) return false;
        const ms = new Date(t).getTime();
        return Number.isFinite(ms) && ms >= cutoff;
      });
    }
    if (selectedTags.length > 0) {
      list = list.filter((f) =>
        selectedTags.every((tag) => f.tags?.includes(tag)),
      );
    }
    return list;
  }, [myFields, selectedStatuses, rangePreset, selectedTags]);

  const attachmentPresenceByField = useMemo(() => {
    const map = new Map<
      string,
      { text: boolean; voice: boolean; photo: boolean }
    >();
    visibleFields.forEach((f) => {
      const visitIds = allVisits
        .filter((v) => v.fieldId === f.id)
        .map((v) => v.id);
      const visitText = visitIds.some((vid) =>
        allTextMemos.some((m) => m.visitId === vid),
      );
      const visitVoice = visitIds.some((vid) =>
        allVoiceMemos.some((m) => m.visitId === vid),
      );
      const visitPhoto = visitIds.some((vid) =>
        allPhotos.some((p) => p.visitId === vid),
      );
      // 현장 직접 첨부(visit 없이) 도 포함 — checkin 흐름이 아닌 현장 상세에서 추가된 것
      const direct = directAttachmentsMap[f.id] ?? [];
      const directText = direct.some((a) => a.type === 'text');
      const directVoice = direct.some((a) => a.type === 'audio');
      const directPhoto = direct.some((a) => a.type === 'photo');
      map.set(f.id, {
        text: visitText || directText,
        voice: visitVoice || directVoice,
        photo: visitPhoto || directPhoto,
      });
    });
    return map;
  }, [visibleFields, allVisits, allTextMemos, allVoiceMemos, allPhotos, directAttachmentsMap]);

  const markers = useMemo(() => {
    const base = fieldsToMarkers(visibleFields);
    return base.map((m) => {
      const presence = attachmentPresenceByField.get(m.id);
      if (!presence) return m;
      const tags: string[] = [];
      if (visibleAttachments.text && presence.text) tags.push('메모');
      if (visibleAttachments.voice && presence.voice) tags.push('음성');
      if (visibleAttachments.photo && presence.photo) tags.push('사진');
      return tags.length > 0
        ? { ...m, label: `${m.label} · ${tags.join('·')}` }
        : m;
    });
  }, [visibleFields, attachmentPresenceByField, visibleAttachments]);

  const toggleStatus = (s: FieldStatus) =>
    setSelectedStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );

  const toggleTag = (tag: string) =>
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag],
    );

  const toggleAttachment = (kind: AttachmentKind) =>
    setVisibleAttachments((prev) => ({ ...prev, [kind]: !prev[kind] }));

  const toggleBoundary = () => setShowBoundary((v) => !v);

  return (
    <View style={styles.container}>
      <MapFilterBar
        displayMode={displayMode}
        onChangeDisplayMode={setDisplayMode}
        selectedStatuses={selectedStatuses}
        onToggleStatus={toggleStatus}
        rangePreset={rangePreset}
        onChangeRangePreset={setRangePreset}
        availableTags={availableTags}
        selectedTags={selectedTags}
        onToggleTag={toggleTag}
        visibleAttachments={visibleAttachments}
        onToggleAttachment={toggleAttachment}
        showBoundary={showBoundary}
        onToggleBoundary={toggleBoundary}
      />
      <View style={styles.mapBox}>
        <KakaoMapWebView
          markers={markers}
          displayMode={displayMode}
          showBoundary={showBoundary}
          onMarkerPress={(fieldId) =>
            router.push(`/(tabs)/fields/${fieldId}` as never)
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  mapBox: { flex: 1 },
});
