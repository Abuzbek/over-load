import { startOfDay } from '@overload/domain';
import { newId, PHOTO_POSES, type PhotoPose } from '@overload/schema';
import { Lucide } from '@react-native-vector-icons/lucide';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deletePhotosOn, photosOn, savePhotos } from '../../data/bodyRepo';
import { db } from '../../db/client';
import { BottomSheet } from '../../ui/BottomSheet';
import { Button } from '../../ui/Button';
import { MonthGrid } from '../../ui/MonthGrid';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

const POSE: Record<PhotoPose, { label: string; icon: 'person-standing' | 'footprints' | 'accessibility' }> = {
  front: { label: 'Front', icon: 'person-standing' },
  side: { label: 'Side', icon: 'footprints' },
  back: { label: 'Back', icon: 'accessibility' },
};

/** Photos live in the app's documents folder: the picker's own copy is in a cache the system may clear. */
const PHOTO_DIR = `${FileSystem.documentDirectory}progress-photos/`;

async function keep(uri: string): Promise<string> {
  await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true }).catch(() => undefined);
  const to = `${PHOTO_DIR}${newId()}.jpg`;
  await FileSystem.copyAsync({ from: uri, to });
  return to;
}

const PICK: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [3, 4], quality: 0.8 };

/**
 * A day's progress photos, front, side and back. A slot offers the library or
 * the camera (and removal, once filled); nothing is written until Save.
 */
export function PhotosSheet({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved?: () => void }) {
  const insets = useSafeAreaInsets();
  const [day, setDay] = useState(() => startOfDay(Date.now()));
  const [picking, setPicking] = useState(false);
  const [choosing, setChoosing] = useState<PhotoPose | null>(null);
  const [draft, setDraft] = useState<Partial<Record<PhotoPose, string | null>>>({});
  const [error, setError] = useState<string | null>(null);
  const saved = visible ? photosOn(db, day) : {};
  const uriOf = (pose: PhotoPose) => (pose in draft ? draft[pose] : saved[pose]?.uri) ?? null;

  useEffect(() => {
    if (visible) setDay(startOfDay(Date.now()));
    setPicking(false);
    setChoosing(null);
    setDraft({});
    setError(null);
  }, [visible]);
  useEffect(() => setDraft({}), [day]);

  const choose = async (pose: PhotoPose, from: 'library' | 'camera') => {
    setChoosing(null);
    setError(null);
    const permission = from === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(from === 'camera' ? 'Camera access is off for Overload. Turn it on in Settings.' : 'Photo access is off for Overload. Turn it on in Settings.');
      return;
    }
    const result = from === 'camera' ? await ImagePicker.launchCameraAsync(PICK) : await ImagePicker.launchImageLibraryAsync(PICK);
    if (result.canceled || !result.assets[0]) return;
    try {
      const uri = await keep(result.assets[0].uri);
      setDraft((d) => ({ ...d, [pose]: uri }));
    } catch {
      setError('That photo could not be saved. Try another.');
    }
  };

  const hasSaved = Object.keys(saved).length > 0;
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={new Date(day).toLocaleDateString()}
      subtitle="Progress Photos"
      onTitlePress={() => setPicking((p) => !p)}
      headerRight={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete this day's photos"
          disabled={!hasSaved}
          hitSlop={10}
          onPress={() => {
            deletePhotosOn(db, day, Date.now());
            onSaved?.();
            onClose();
          }}
        >
          <Lucide name="trash-2" size={20} color={hasSaved ? theme.colors.text : theme.colors.border} />
        </Pressable>
      }
    >
      <View style={[styles.body, { paddingBottom: insets.bottom + theme.spacing.lg }]}>
        {picking ? (
          <MonthGrid
            initial={day}
            selected={day}
            action="choose day"
            onPick={(d) => {
              setDay(d);
              setPicking(false);
            }}
          />
        ) : (
          <>
            <View style={styles.slots}>
              {PHOTO_POSES.map((pose) => {
                const uri = uriOf(pose);
                return (
                  <View key={pose} style={styles.slotWrap}>
                    <Text variant="heading">{POSE[pose].label}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${POSE[pose].label} photo${uri ? ', change' : ', add'}`}
                      onPress={() => setChoosing((c) => (c === pose ? null : pose))}
                      style={[styles.slot, choosing === pose && styles.slotOn]}
                    >
                      {uri ? (
                        <Image source={{ uri }} style={styles.image} />
                      ) : (
                        <Lucide name={POSE[pose].icon} size={28} color={theme.colors.textMuted} />
                      )}
                    </Pressable>
                  </View>
                );
              })}
            </View>
            {choosing ? (
              <View style={styles.options}>
                <Option icon="upload" label="Upload Photo" onPress={() => choose(choosing, 'library')} />
                <Option icon="aperture" label="Take Photo" onPress={() => choose(choosing, 'camera')} />
                {uriOf(choosing) ? (
                  <Option
                    icon="trash-2"
                    label="Remove Photo"
                    onPress={() => {
                      setDraft((d) => ({ ...d, [choosing]: null }));
                      setChoosing(null);
                    }}
                  />
                ) : null}
              </View>
            ) : null}
            {error ? <Text variant="caption" color="danger">{error}</Text> : null}
            <Button
              title="Save"
              disabled={Object.keys(draft).length === 0}
              onPress={() => {
                savePhotos(db, day, draft, Date.now());
                onSaved?.();
                onClose();
              }}
            />
          </>
        )}
      </View>
    </BottomSheet>
  );
}

function Option({ icon, label, onPress }: { icon: 'upload' | 'aperture' | 'trash-2'; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
      <Lucide name={icon} size={20} color={theme.colors.text} />
      <Text>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.lg, gap: theme.spacing.lg },
  slots: { flexDirection: 'row', gap: theme.spacing.md },
  slotWrap: { flex: 1, alignItems: 'center', gap: theme.spacing.sm },
  slot: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.colors.textMuted,
    backgroundColor: theme.colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  slotOn: { borderColor: theme.colors.accent, borderStyle: 'solid' },
  image: { width: '100%', height: '100%' },
  options: { borderRadius: theme.radius.md, backgroundColor: theme.colors.surfaceRaised },
  option: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.lg },
  pressed: { opacity: 0.7 },
});
