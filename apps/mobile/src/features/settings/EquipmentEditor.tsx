import { Lucide } from '@react-native-vector-icons/lucide';
import type { Equipment, EquipmentConfig } from '@overload/schema';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';

type Props = {
  item: Equipment | null;
  config: EquipmentConfig;
  onSave: (config: EquipmentConfig) => void;
  onClose: () => void;
};

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <View style={styles.chip}>
      <Text variant="caption">{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${label}`} hitSlop={8} onPress={onRemove}>
        <Lucide name="x" size={14} color={theme.colors.textMuted} />
      </Pressable>
    </View>
  );
}

function NumberField({ label, value, onChangeText }: { label: string; value: string; onChangeText: (t: string) => void }) {
  return (
    <View style={styles.field}>
      <Text variant="caption" color="textMuted">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholderTextColor={theme.colors.textMuted}
        style={styles.input}
      />
    </View>
  );
}

/**
 * One sheet for all four weight shapes, because which one you get is decided by
 * the equipment's category and the user never chooses it.
 */
export function EquipmentEditor({ item, config, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<EquipmentConfig>(config);
  const [entry, setEntry] = useState('');

  // Re-seed the draft whenever a different item opens the sheet.
  const [forItem, setForItem] = useState(item?.id ?? null);
  if (item && forItem !== item.id) {
    setForItem(item.id);
    setDraft(config);
    setEntry('');
  }

  function addEntry() {
    const text = entry.trim();
    if (!text) return;
    if (draft.kind === 'list') {
      const kg = Number.parseFloat(text.replace(',', '.'));
      if (!Number.isFinite(kg)) return;
      // Sorted, and never the same weight twice — this is a rack, not a log.
      if (draft.values.some((v) => v.kg === kg)) return setEntry('');
      setDraft({ kind: 'list', values: [...draft.values, { kg }].sort((a, b) => a.kg - b.kg) });
    } else if (draft.kind === 'labels') {
      setDraft({ kind: 'labels', labels: [...draft.labels, text] });
    }
    setEntry('');
  }

  return (
    <Sheet
      visible={item !== null}
      onRequestClose={onClose}
      anchor="bottom"
      title={item?.name ?? ''}
    >
      {draft.kind === 'list' ? (
        <>
          <View style={styles.chips}>
            {draft.values.length === 0 ? (
              <Text variant="caption" color="textMuted">No weights yet.</Text>
            ) : (
              draft.values.map((v) => (
                <Chip
                  key={`${v.kg}-${v.label ?? ''}`}
                  label={v.label ? `${v.kg} kg · ${v.label}` : `${v.kg} kg`}
                  onRemove={() =>
                    setDraft({ kind: 'list', values: draft.values.filter((x) => x.kg !== v.kg) })
                  }
                />
              ))
            )}
          </View>
          <View style={styles.addRow}>
            <TextInput
              value={entry}
              onChangeText={setEntry}
              placeholder="Add a weight in kg"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="decimal-pad"
              onSubmitEditing={addEntry}
              style={[styles.input, styles.grow]}
            />
            <Button title="Add" variant="secondary" onPress={addEntry} />
          </View>
        </>
      ) : null}

      {draft.kind === 'labels' ? (
        <>
          <View style={styles.chips}>
            {draft.labels.length === 0 ? (
              <Text variant="caption" color="textMuted">No resistances yet.</Text>
            ) : (
              draft.labels.map((l, i) => (
                <Chip
                  key={`${l}-${i}`}
                  label={l}
                  onRemove={() =>
                    setDraft({ kind: 'labels', labels: draft.labels.filter((_, j) => j !== i) })
                  }
                />
              ))
            )}
          </View>
          <View style={styles.addRow}>
            <TextInput
              value={entry}
              onChangeText={setEntry}
              placeholder="Add a colour or resistance"
              placeholderTextColor={theme.colors.textMuted}
              onSubmitEditing={addEntry}
              style={[styles.input, styles.grow]}
            />
            <Button title="Add" variant="secondary" onPress={addEntry} />
          </View>
        </>
      ) : null}

      {draft.kind === 'base' ? (
        <NumberField
          label="The machine's own weight, before you load it"
          value={String(draft.baseKg)}
          onChangeText={(t) =>
            setDraft({ kind: 'base', baseKg: Number.parseFloat(t.replace(',', '.')) || 0 })
          }
        />
      ) : null}

      {draft.kind === 'range' ? (
        <View style={styles.rangeRow}>
          <NumberField
            label="From"
            value={String(draft.minKg)}
            onChangeText={(t) => setDraft({ ...draft, minKg: Number.parseFloat(t.replace(',', '.')) || 0 })}
          />
          <NumberField
            label="To"
            value={String(draft.maxKg)}
            onChangeText={(t) => setDraft({ ...draft, maxKg: Number.parseFloat(t.replace(',', '.')) || 0 })}
          />
          <NumberField
            label="Step"
            value={String(draft.incrementKg)}
            onChangeText={(t) => setDraft({ ...draft, incrementKg: Number.parseFloat(t.replace(',', '.')) || 0 })}
          />
        </View>
      ) : null}

      {draft.kind === 'none' ? (
        <Text variant="caption" color="textMuted">This one has no weight to set.</Text>
      ) : null}

      <Button title="Save" onPress={() => onSave(draft)} />
      <Button title="Cancel" variant="secondary" onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  grow: { flex: 1 },
  field: { flex: 1, gap: theme.spacing.xs },
  rangeRow: { flexDirection: 'row', gap: theme.spacing.sm },
  input: {
    minHeight: 40,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
  },
});
