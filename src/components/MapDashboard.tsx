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
} from '@/components/MapFilterBar';
import type { FieldStatus } from '@/types/entities';
import { colors } from '@/theme/colors';

export function MapDashboard() {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const allFields = useFieldStore((s) => s.fields);
  const allVisits = useVisitStore((s) => s.visits);
  const allTextMemos = useVisitStore((s) => s.textMemos);
  const allVoiceMemos = useVisitStore((s) => s.voiceMemos);
  const allPhotos = useVisitStore((s) => s.photos);

  const [displayMode, setDisplayMode] = useState<DisplayMode>('markers');
  const [selectedStatuses, setSelectedStatuses] = useState<FieldStatus[]>([]);
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

  const visibleFields = useMemo(() => {
    if (selectedStatuses.length === 0) return myFields;
    return myFields.filter((f) => selectedStatuses.includes(f.status));
  }, [myFields, selectedStatuses]);

  const attachmentPresenceByField = useMemo(() => {
    const map = new Map<
      string,
      { text: boolean; voice: boolean; photo: boolean }
    >();
    visibleFields.forEach((f) => {
      const visitIds = allVisits
        .filter((v) => v.fieldId === f.id)
        .map((v) => v.id);
      const hasText = visitIds.some((vid) =>
        allTextMemos.some((m) => m.visitId === vid),
      );
      const hasVoice = visitIds.some((vid) =>
        allVoiceMemos.some((m) => m.visitId === vid),
      );
      const hasPhoto = visitIds.some((vid) =>
        allPhotos.some((p) => p.visitId === vid),
      );
      map.set(f.id, { text: hasText, voice: hasVoice, photo: hasPhoto });
    });
    return map;
  }, [visibleFields, allVisits, allTextMemos, allVoiceMemos, allPhotos]);

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
