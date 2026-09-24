import { cmToFeetInches, daysInMonth, feetInchesToCm, kgToLb, MONTHS, toBirthDate, type Plan, type Unit } from '@overload/domain';
import type {
  ExperienceLevel,
  Gender,
  HeightUnit,
  TrainingGoal,
  TrainingPreferences,
  TrainingSplit,
} from '@overload/schema';
import { Lucide } from '@react-native-vector-icons/lucide';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { exerciseFilterOptions, getExercise, getExerciseDetail } from '../../data/exerciseRepo';
import { renameGym, setGymIcon } from '../../data/gymRepo';
import { GYM_PRESETS, planProgram, setUpGym, SKILLS } from '../../data/onboardingRepo';
import { getHeightUnit, getWeightUnit, setHeightUnit, setProfile, setWeightUnit } from '../../data/settingsRepo';
import { db } from '../../db/client';
import { Segmented } from '../../ui/Segmented';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import { textStyle } from '../../ui/typography';
import { WheelColumn, WheelRow } from '../../ui/WheelColumn';
import { MuscleThumb } from '../library/MuscleThumb';
import { BODY_FAT_OPTIONS } from './bodyFatImages';
import { estimateWorkoutMinutes, targetMuscles } from '../workouts/workoutTargets';
import { ExerciseSummaryRow, RIR_COLORS, TargetMuscleCards, WorkoutHeading } from '../workouts/WorkoutSummary';
import { GymDetailScreen } from '../settings/GymDetailScreen';
import { GYM_ICONS } from '../settings/GymProfilesScreen';

type IconName = ComponentProps<typeof Lucide>['name'];

export const PHASES = ['Basics', 'Gym & Equipment', 'Program'] as const;

export type Answers = {
  gender: Gender | null;
  birth: { day: number; month: number; year: number };
  heightCm: number;
  weightKg: number;
  bodyFat: number | null;
  /** undefined: not answered yet; null: "None". */
  lifting: ExperienceLevel | null | undefined;
  cardio: ExperienceLevel | null | undefined;
  gymPreset: string | null;
  gymName: string;
  gymIcon: string;
  gymId: string | null;
  equipmentFilter: string;
  goal: TrainingGoal | null;
  focus: Record<string, number>;
  deprioritized: string[];
  daysPerWeek: number;
  sessionMinutes: number | null;
  split: TrainingSplit;
  deload: boolean;
  skills: string[];
  programName: string;
  icon: IconName;
  color: string;
  smartProgression: boolean;
  warmups: boolean;
  plan: Plan | null;
};

export const INITIAL_ANSWERS: Answers = {
  gender: null,
  birth: { day: 1, month: 1, year: 2000 },
  heightCm: 175,
  weightKg: 75,
  bodyFat: null,
  lifting: undefined,
  cardio: undefined,
  gymPreset: null,
  gymName: '',
  gymIcon: GYM_ICONS[0],
  gymId: null,
  equipmentFilter: '',
  goal: null,
  focus: {},
  deprioritized: [],
  daysPerWeek: 3,
  sessionMinutes: null,
  split: 'full_body',
  deload: true,
  skills: [],
  programName: '',
  icon: 'rocket',
  color: '#E8834A',
  smartProgression: true,
  warmups: true,
  plan: null,
};

export function preferencesOf(a: Answers): TrainingPreferences {
  return {
    goal: a.goal ?? 'both',
    focus: a.focus,
    deprioritized: a.deprioritized,
    daysPerWeek: a.daysPerWeek,
    sessionMinutes: a.sessionMinutes ?? 60,
    split: a.split,
    deload: a.deload,
    skills: a.skills,
    smartProgression: a.smartProgression,
    warmups: a.warmups,
  };
}

export type Step = {
  kind: 'intro' | 'question';
  phase: 0 | 1 | 2;
  title?: string;
  subtitle?: string;
  body: ReactNode;
  ready: boolean;
  /** The button's label, when not "Next". */
  next?: string;
  /** Runs when leaving the step forwards. */
  onNext?: () => void;
  /** False for a body that scrolls itself (the equipment editor). */
  scroll?: boolean;
  /** Pinned above the Next button: a running count, or a search box. */
  footer?: ReactNode;
};

const YEARS = Array.from({ length: 90 }, (_, i) => new Date().getFullYear() - 10 - i);
const CM = Array.from({ length: 121 }, (_, i) => 120 + i);
const INCHES = Array.from({ length: 49 }, (_, i) => 48 + i);
const KG = Array.from({ length: 221 }, (_, i) => 30 + i);
const LB = Array.from({ length: 441 }, (_, i) => 66 + i);


const EXPERIENCE: { value: ExperienceLevel | null; label: string; lifting: string; cardio: string; icon: IconName }[] = [
  { value: null, label: 'None', lifting: 'Not lifting at the moment', cardio: 'Not doing cardio at the moment', icon: 'circle-off' },
  { value: 'beginner', label: 'Beginner', lifting: 'Lifting for a year or less', cardio: 'Doing cardio for a year or less', icon: 'signal-low' },
  { value: 'intermediate', label: 'Intermediate', lifting: 'Lifting for one to four years', cardio: 'Doing cardio for one to four years', icon: 'signal-medium' },
  { value: 'advanced', label: 'Advanced', lifting: 'Lifting for four years or more', cardio: 'Doing cardio for four years or more', icon: 'signal-high' },
];

const PRESET_NOTES: Record<string, string> = {
  everything: 'Every piece of equipment in the catalogue',
  commercial: 'A full-service chain gym with machines, cables and free weights',
  warehouse: 'Strength-focused: racks, barbells, plates, benches and some machines',
  local: 'The essentials: racks, barbells, plates, benches and cables',
  garage: 'A home setup built around a rack and barbell',
  home: 'A few pieces at home, like dumbbells and bands',
  blank: 'Start empty and add your equipment yourself',
};
const PRESET_ICONS: Record<string, string> = {
  everything: 'warehouse', commercial: 'building-2', warehouse: 'warehouse', local: 'store', garage: 'house', home: 'house', blank: 'dumbbell',
};

const GOALS: { value: TrainingGoal; label: string; note: string; icon: IconName }[] = [
  { value: 'hypertrophy', label: 'Build muscle', note: 'Moderate weights for more reps, to grow muscle size', icon: 'biceps-flexed' },
  { value: 'strength', label: 'Get stronger', note: 'Heavier weights for fewer reps, to lift more', icon: 'weight' },
  { value: 'both', label: 'Both', note: 'A mix of heavy and moderate work', icon: 'scale' },
];

const SESSIONS: { minutes: number; label: string }[] = [
  { minutes: 20, label: 'Up to 20 minutes' },
  { minutes: 40, label: '20 to 40 minutes' },
  { minutes: 60, label: '40 to 60 minutes' },
  { minutes: 90, label: '60 to 90 minutes' },
  { minutes: 120, label: '90 to 120 minutes' },
];

const SPLITS: { value: TrainingSplit; label: string; note: string }[] = [
  { value: 'full_body', label: 'Full body', note: 'Train your whole body every workout. Recommended.' },
  { value: 'upper_lower', label: 'Upper / lower', note: 'Alternate upper-body and lower-body workouts' },
];

const COLORS = ['#E5484D', '#E8834A', '#F2B84B', '#3DD68C', '#3E8CF0', '#9B6CF2', '#2BB5B8'];
const PROGRAM_ICONS: IconName[] = [
  'rocket', 'dumbbell', 'flame', 'zap', 'trophy', 'target', 'mountain', 'heart', 'star', 'crown',
  'shield', 'bolt', 'sun', 'moon', 'leaf', 'anchor', 'bike', 'footprints', 'timer', 'medal',
];

/** Upper body first, then lower, the order the muscle screens list them. */
const UPPER = ['Chest', 'Upper Back', 'Lats', 'Front Delts', 'Side Delts', 'Rear Delts', 'Biceps', 'Triceps', 'Forearms', 'Upper Traps', 'Neck', 'Abs', 'Obliques', 'Serratus', 'Lower Back'];
const LOWER = ['Quads', 'Hamstrings', 'Glutes', 'Adductors', 'Abductors', 'Calves', 'Tibs', 'Hip flexors'];
const FOCUS_POINTS = 5;
const MAX_DEPRIORITIZED = 5;

export function buildSteps(a: Answers, set: (patch: Partial<Answers>) => void): Step[] {
  const figure = a.gender === 'female' ? 'female' : 'male';
  const intro = (phase: 0 | 1 | 2): Step => ({
    kind: 'intro',
    phase,
    body: <PhaseOverview current={phase} />,
    ready: true,
    next: phase === 0 ? 'Get started' : `Continue to ${PHASES[phase]}`,
  });

  return [
    intro(0),
    {
      kind: 'question', phase: 0, title: 'What’s your gender?',
      subtitle: 'Used for your body figures and to size your starting weights.',
      body: (
        <Choices
          options={[{ value: 'female' as const, label: 'Female', icon: 'venus' }, { value: 'male' as const, label: 'Male', icon: 'mars' }]}
          value={a.gender}
          // The two body-fat scales differ, so a level picked for the other gender goes.
          onChange={(gender) => set(gender === a.gender ? {} : { gender, bodyFat: null })}
        />
      ),
      ready: a.gender !== null,
      onNext: () => setProfile(db, { gender: a.gender }, Date.now()),
    },
    {
      kind: 'question', phase: 0, title: 'When were you born?',
      body: <BirthDate value={a.birth} onChange={(birth) => set({ birth })} />,
      ready: true,
      onNext: () => setProfile(db, { birthDate: toBirthDate(a.birth.day, a.birth.month, a.birth.year) }, Date.now()),
    },
    {
      kind: 'question', phase: 0, title: 'What is your height?',
      body: <Height cm={a.heightCm} onChange={(heightCm) => set({ heightCm })} />,
      ready: true,
      onNext: () => setProfile(db, { heightCm: a.heightCm }, Date.now()),
    },
    {
      kind: 'question', phase: 0, title: 'What is your weight?',
      body: <Weight kg={a.weightKg} onChange={(weightKg) => set({ weightKg })} />,
      ready: true,
      onNext: () => setProfile(db, { bodyweightKg: a.weightKg }, Date.now()),
    },
    {
      kind: 'question', phase: 0, title: 'What is your body fat level?',
      subtitle: 'A rough visual guess is fine.',
      body: (
        <View style={styles.grid}>
          {BODY_FAT_OPTIONS[figure].map((b) => (
            <Pressable
              key={b.percent}
              accessibilityRole="radio"
              accessibilityLabel={`${b.label} body fat`}
              accessibilityState={{ selected: a.bodyFat === b.percent }}
              onPress={() => set({ bodyFat: b.percent })}
              style={[styles.gridCell, a.bodyFat === b.percent && styles.selected]}
            >
              <SvgXml xml={b.svg} width="100%" height="78%" />
              <Text variant="heading">{b.label}</Text>
            </Pressable>
          ))}
        </View>
      ),
      ready: a.bodyFat !== null,
      onNext: () => setProfile(db, { bodyFatPercent: a.bodyFat }, Date.now()),
    },
    {
      kind: 'question', phase: 0, title: 'How experienced are you with lifting?',
      body: (
        <Choices
          options={EXPERIENCE.map((e) => ({ value: e.value, label: e.label, note: e.lifting, icon: e.icon }))}
          value={a.lifting}
          onChange={(lifting) => set({ lifting })}
        />
      ),
      ready: a.lifting !== undefined,
      onNext: () => setProfile(db, { liftingExperience: a.lifting ?? null }, Date.now()),
    },
    {
      kind: 'question', phase: 0, title: 'How experienced are you with cardio?',
      body: (
        <Choices
          options={EXPERIENCE.map((e) => ({ value: e.value, label: e.label, note: e.cardio, icon: e.icon }))}
          value={a.cardio}
          onChange={(cardio) => set({ cardio })}
        />
      ),
      ready: a.cardio !== undefined,
      onNext: () => setProfile(db, { cardioExperience: a.cardio ?? null }, Date.now()),
    },

    intro(1),
    {
      kind: 'question', phase: 1, title: 'Where do you train?',
      subtitle: 'Pick the closest match; you can adjust the equipment next.',
      body: (
        <Choices
          options={GYM_PRESETS.map((p) => ({ value: p.key, label: p.name, note: PRESET_NOTES[p.key], icon: (PRESET_ICONS[p.key] ?? 'dumbbell') as IconName }))}
          value={a.gymPreset}
          onChange={(gymPreset) => set({ gymPreset, gymName: GYM_PRESETS.find((p) => p.key === gymPreset)?.name ?? '' })}
        />
      ),
      ready: a.gymPreset !== null,
      // Created here, so the equipment step can edit a real gym. Going back
      // and picking again replaces it.
      onNext: () => set({ gymId: setUpGym(db, a.gymPreset!, a.gymName, a.gymIcon, Date.now(), a.gymId) }),
    },
    {
      kind: 'question', phase: 1, title: 'Give this gym a name',
      body: (
        <>
          <TextInput
            value={a.gymName}
            onChangeText={(gymName) => set({ gymName })}
            placeholder="My gym"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
          />
          <View style={styles.iconRow}>
            {GYM_ICONS.map((icon) => (
              <Pressable
                key={icon}
                accessibilityRole="radio"
                accessibilityState={{ selected: a.gymIcon === icon }}
                onPress={() => set({ gymIcon: icon })}
                style={[styles.iconCell, a.gymIcon === icon && styles.selected]}
              >
                <Lucide name={icon as IconName} size={24} color={theme.colors.text} />
              </Pressable>
            ))}
          </View>
        </>
      ),
      ready: a.gymName.trim().length > 0,
      onNext: () => {
        if (!a.gymId) return;
        renameGym(db, a.gymId, a.gymName.trim(), Date.now());
        setGymIcon(db, a.gymId, a.gymIcon, Date.now());
      },
    },
    {
      kind: 'question', phase: 1, title: 'Adjust your equipment',
      subtitle: 'Optional — untick what your gym lacks, or set the weights you have.',
      body: a.gymId ? <GymDetailScreen gymId={a.gymId} embedded filter={a.equipmentFilter} /> : null,
      footer: (
        <View style={styles.search}>
          <Lucide name="list-filter" size={18} color={theme.colors.textMuted} />
          <TextInput
            value={a.equipmentFilter}
            onChangeText={(equipmentFilter) => set({ equipmentFilter })}
            placeholder="Filter equipment by name"
            placeholderTextColor={theme.colors.textMuted}
            autoCorrect={false}
            clearButtonMode="while-editing"
            style={styles.searchInput}
          />
        </View>
      ),
      ready: true,
      scroll: false,
    },

    intro(2),
    {
      kind: 'question', phase: 2, title: 'What is your main goal?',
      body: (
        <Choices
          options={GOALS.map((g) => ({ value: g.value, label: g.label, note: g.note, icon: g.icon }))}
          value={a.goal}
          onChange={(goal) => set({ goal })}
        />
      ),
      ready: a.goal !== null,
    },
    {
      kind: 'question', phase: 2, title: 'Any muscles to focus on?',
      subtitle: 'Each point adds a set; focused muscles are trained first.',
      body: <Focus figure={figure} focus={a.focus} onChange={(focus) => set({ focus })} />,
      footer: <PointsFooter title="Focus points" used={Object.values(a.focus).reduce((n, p) => n + p, 0)} total={FOCUS_POINTS} left />,
      ready: true,
    },
    {
      kind: 'question', phase: 2, title: 'Any muscles to train less?',
      subtitle: 'They are left out of your program.',
      body: (
        <Deprioritize
          figure={figure}
          exclude={Object.keys(a.focus).filter((id) => (a.focus[id] ?? 0) > 0)}
          value={a.deprioritized}
          onChange={(deprioritized) => set({ deprioritized })}
        />
      ),
      footer: <PointsFooter title="Train less" used={a.deprioritized.length} total={MAX_DEPRIORITIZED} />,
      ready: true,
    },
    {
      kind: 'question', phase: 2, title: 'How many days a week will you train?',
      body: (
        <View style={styles.stepper}>
          <StepButton icon="minus" disabled={a.daysPerWeek <= 1} onPress={() => set({ daysPerWeek: a.daysPerWeek - 1 })} />
          <View style={styles.stepperValue}>
            <Text style={styles.bigNumber}>{a.daysPerWeek}</Text>
            <Text color="textMuted">{a.daysPerWeek === 1 ? 'day a week' : 'days a week'}</Text>
          </View>
          <StepButton icon="plus" disabled={a.daysPerWeek >= 6} onPress={() => set({ daysPerWeek: a.daysPerWeek + 1 })} />
        </View>
      ),
      ready: true,
    },
    {
      kind: 'question', phase: 2, title: 'How long can each session be?',
      body: (
        <Choices
          options={SESSIONS.map((s) => ({ value: s.minutes, label: s.label, icon: 'timer' as IconName }))}
          value={a.sessionMinutes}
          onChange={(sessionMinutes) => set({ sessionMinutes })}
        />
      ),
      ready: a.sessionMinutes !== null,
    },
    {
      kind: 'question', phase: 2, title: 'How should your training be structured?',
      body: (
        <Choices
          options={SPLITS.map((s) => ({ value: s.value, label: s.label, note: s.note, icon: s.value === 'full_body' ? 'person-standing' : 'columns-2' }))}
          value={a.split}
          onChange={(split) => set({ split })}
        />
      ),
      ready: true,
    },
    {
      kind: 'question', phase: 2, title: 'Add a lighter recovery week?',
      body: (
        <ToggleCard
          icon="cloud"
          title="Deload"
          body="Every few weeks, a lighter week to recover before pushing on. Recommended."
          value={a.deload}
          onChange={(deload) => set({ deload })}
        />
      ),
      ready: true,
    },
    {
      kind: 'question', phase: 2, title: 'A few questions about what you can do',
      subtitle: 'Leave unticked what you cannot do yet — you will get an easier variation.',
      body: (
        <View>
          {SKILLS.map((s) => {
            const on = a.skills.includes(s.key);
            return (
              <Pressable
                key={s.key}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => set({ skills: on ? a.skills.filter((k) => k !== s.key) : [...a.skills, s.key] })}
                style={styles.checkRow}
              >
                <Text style={styles.flex}>{s.label}</Text>
                <View style={[styles.checkbox, on && styles.checkboxOn]}>
                  {on ? <Lucide name="check" size={16} color={theme.colors.onAccent} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ),
      ready: true,
      onNext: () => {
        if (!a.programName) set({ programName: defaultProgramName(a) });
      },
    },
    {
      kind: 'question', phase: 2, title: 'Name your program',
      body: (
        <TextInput
          value={a.programName}
          onChangeText={(programName) => set({ programName })}
          placeholder={defaultProgramName(a)}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
        />
      ),
      ready: a.programName.trim().length > 0,
    },
    {
      kind: 'question', phase: 2, title: 'Pick a colour and icon',
      body: (
        <>
          <View style={styles.colorRow}>
            {COLORS.map((color) => (
              <Pressable
                key={color}
                accessibilityRole="radio"
                accessibilityLabel={color}
                accessibilityState={{ selected: a.color === color }}
                onPress={() => set({ color })}
                style={[styles.swatch, { backgroundColor: color }, a.color === color && styles.swatchOn]}
              >
                <Lucide name={a.icon} size={18} color={theme.colors.onAccent} />
              </Pressable>
            ))}
          </View>
          <View style={styles.iconGrid}>
            {PROGRAM_ICONS.map((icon) => (
              <Pressable
                key={icon}
                accessibilityRole="radio"
                accessibilityLabel={icon}
                accessibilityState={{ selected: a.icon === icon }}
                onPress={() => set({ icon })}
                style={[styles.iconCell, a.icon === icon && styles.selected]}
              >
                <Lucide name={icon} size={22} color={a.icon === icon ? a.color : theme.colors.text} />
              </Pressable>
            ))}
          </View>
        </>
      ),
      ready: true,
    },
    {
      kind: 'question', phase: 2, title: 'Building your program',
      body: <Generating answers={a} onPlan={(plan) => set({ plan })} />,
      ready: a.plan !== null,
    },
    {
      kind: 'question', phase: 2, title: 'Your program',
      subtitle: 'One week of your cycle. Tap a day to see its workout.',
      body: a.plan ? <Preview plan={a.plan} figure={figure} /> : null,
      ready: true,
    },
    {
      kind: 'question', phase: 2, title: 'Let the app do the planning',
      body: (
        <>
          <ToggleCard
            icon="wand-sparkles"
            title="Smart progression"
            body="Adjust your weights and reps from how your last sessions went."
            value={a.smartProgression}
            onChange={(smartProgression) => set({ smartProgression })}
          />
          <ToggleCard
            icon="flame"
            title="Warm-up sets"
            body="Add warm-up sets when a workout reaches a muscle group for the first time. Recommended."
            value={a.warmups}
            onChange={(warmups) => set({ warmups })}
          />
          <Text variant="caption" color="textMuted">
            Saved with your account; they switch on as these features arrive in the app.
          </Text>
        </>
      ),
      ready: true,
    },
    {
      kind: 'question', phase: 2, title: 'Log each set and how hard it felt',
      body: <RirExplainer />,
      ready: true,
    },
  ];
}

function defaultProgramName(a: Answers): string {
  const level = a.lifting ? a.lifting[0]!.toUpperCase() + a.lifting.slice(1) : 'Starter';
  return `${level} ${a.split === 'full_body' ? 'Full Body' : 'Upper / Lower'}`;
}

function PhaseOverview({ current }: { current: 0 | 1 | 2 }) {
  const NOTES = [
    'Your height, weight and experience, so the program fits you.',
    'Where you train and what equipment is there.',
    'Your goals and schedule, to build your program.',
  ];
  return (
    <View style={styles.overview}>
      <Text variant="display" style={styles.center}>Let's set you up</Text>
      <Text color="textMuted" style={styles.center}>Three short steps to your own program</Text>
      <View style={styles.phases}>
        {PHASES.map((name, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <View key={name} style={styles.phaseRow}>
              <View style={[styles.phaseDot, done && styles.phaseDotDone, active && styles.phaseDotActive]}>
                {done ? (
                  <Lucide name="check" size={16} color={theme.colors.background} />
                ) : (
                  <Text variant="caption" color={active ? 'background' : 'text'}>{i + 1}</Text>
                )}
              </View>
              <View style={styles.flex}>
                <Text variant="heading" color={active || done ? 'text' : 'textMuted'}>{name}</Text>
                {active ? <Text variant="caption" color="textMuted">{NOTES[i]}</Text> : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Choices<T extends string | number | null>({ options, value, onChange }: {
  options: { value: T; label: string; note?: string; icon?: IconName }[];
  value: T | undefined;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.choices}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.choice, on && styles.selected]}
          >
            {o.icon ? <Lucide name={o.icon} size={24} color={theme.colors.text} /> : null}
            <View style={styles.flex}>
              <Text variant="heading">{o.label}</Text>
              {o.note ? <Text variant="caption" color="textMuted">{o.note}</Text> : null}
            </View>
            <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
          </Pressable>
        );
      })}
    </View>
  );
}

function BirthDate({ value, onChange }: { value: Answers['birth']; onChange: (v: Answers['birth']) => void }) {
  // February cannot hold the 31st, so a month or year change clamps the day.
  const change = (part: Partial<Answers['birth']>) => {
    const next = { ...value, ...part };
    next.day = Math.min(next.day, daysInMonth(next.month, next.year));
    onChange(next);
  };
  return (
    <WheelRow>
      <WheelColumn
        options={MONTHS.map((label, i) => ({ value: i + 1, label }))}
        value={value.month}
        onChange={(month) => change({ month })}
        accessibilityLabel="Month"
      />
      <WheelColumn
        options={Array.from({ length: daysInMonth(value.month, value.year) }, (_, i) => ({ value: i + 1, label: String(i + 1) }))}
        value={value.day}
        onChange={(day) => change({ day })}
        accessibilityLabel="Day"
      />
      <WheelColumn
        options={YEARS.map((y) => ({ value: y, label: String(y) }))}
        value={value.year}
        onChange={(year) => change({ year })}
        accessibilityLabel="Year"
      />
    </WheelRow>
  );
}

function nearest(values: number[], target: number): number {
  return values.reduce((best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best), values[0]!);
}

function Height({ cm, onChange }: { cm: number; onChange: (cm: number) => void }) {
  const [unit, setUnit] = useState<HeightUnit>(() => getHeightUnit(db));
  const change = (next: HeightUnit) => {
    setUnit(next);
    setHeightUnit(db, next, Date.now());
  };
  const inches = cmToFeetInches(cm).feet * 12 + cmToFeetInches(cm).inches;
  return (
    <>
      <View style={styles.unitSwitch}>
        <Segmented
          options={[{ value: 'ft', label: 'Feet and inches' }, { value: 'cm', label: 'Centimetres' }]}
          value={unit}
          onChange={change}
          accessibilityLabel="Height unit"
        />
      </View>
      <WheelRow>
        {unit === 'cm' ? (
          <WheelColumn options={CM.map((v) => ({ value: v, label: `${v} cm` }))} value={nearest(CM, cm)} onChange={onChange} accessibilityLabel="Height" />
        ) : (
          <WheelColumn
            options={INCHES.map((v) => ({ value: v, label: `${Math.floor(v / 12)}' ${v % 12}"` }))}
            value={nearest(INCHES, inches)}
            onChange={(v) => onChange(feetInchesToCm(0, v))}
            accessibilityLabel="Height"
          />
        )}
      </WheelRow>
    </>
  );
}

function Weight({ kg, onChange }: { kg: number; onChange: (kg: number) => void }) {
  const [unit, setUnit] = useState<Unit>(() => getWeightUnit(db));
  const change = (next: Unit) => {
    setUnit(next);
    setWeightUnit(db, next, Date.now());
  };
  const values = unit === 'kg' ? KG : LB;
  return (
    <>
      <View style={styles.unitSwitch}>
        <Segmented
          options={[{ value: 'lb', label: 'Pounds' }, { value: 'kg', label: 'Kilograms' }]}
          value={unit}
          onChange={change}
          accessibilityLabel="Weight unit"
        />
      </View>
      <WheelRow>
        <WheelColumn
          options={values.map((v) => ({ value: v, label: `${v} ${unit}` }))}
          value={nearest(values, unit === 'kg' ? kg : kgToLb(kg))}
          // Weight is always stored in kilograms.
          onChange={(v) => onChange(unit === 'kg' ? v : v / 2.20462)}
          accessibilityLabel="Weight"
        />
      </WheelRow>
    </>
  );
}

/** The catalogue's muscle groups, by name → id, in the display order above. */
function useMuscles(): { upper: { id: string; name: string }[]; lower: { id: string; name: string }[] } {
  const [muscles] = useState(() => {
    const all = exerciseFilterOptions(db, null).muscles;
    const pick = (names: string[]) => names.map((n) => all.find((m) => m.name === n)).filter((m): m is { id: string; name: string } => !!m);
    return { upper: pick(UPPER), lower: pick(LOWER) };
  });
  return muscles;
}

function Focus({ figure, focus, onChange }: { figure: 'male' | 'female'; focus: Record<string, number>; onChange: (f: Record<string, number>) => void }) {
  const { upper, lower } = useMuscles();
  const spent = Object.values(focus).reduce((s, p) => s + p, 0);
  const bump = (id: string, delta: number) => onChange({ ...focus, [id]: Math.min(Math.max((focus[id] ?? 0) + delta, 0), 2) });
  const row = (m: { id: string; name: string }) => {
    const points = focus[m.id] ?? 0;
    return (
      <View key={m.id} style={styles.focusRow}>
        <MuscleThumb figure={figure} muscle={m.name} size={56} selected={points > 0} />
        <View style={styles.flex}>
          <Text variant="heading">{m.name}</Text>
          <View style={styles.bars}>
            <View style={[styles.bar, points >= 1 && styles.barOn]} />
            <View style={[styles.bar, points >= 2 && styles.barOn]} />
          </View>
        </View>
        <StepButton icon="minus" small disabled={points === 0} onPress={() => bump(m.id, -1)} />
        <Text variant="numeric">{points}</Text>
        <StepButton icon="plus" small disabled={points >= 2 || spent >= FOCUS_POINTS} onPress={() => bump(m.id, 1)} />
      </View>
    );
  };
  return (
    <>
      <Text variant="label" color="textMuted">Upper</Text>
      {upper.map(row)}
      <Text variant="label" color="textMuted">Lower</Text>
      {lower.map(row)}
    </>
  );
}

function Deprioritize({ figure, exclude, value, onChange }: {
  figure: 'male' | 'female';
  exclude: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const { upper, lower } = useMuscles();
  const cell = (m: { id: string; name: string }) => {
    const on = value.includes(m.id);
    const disabled = !on && value.length >= MAX_DEPRIORITIZED;
    return (
      <Pressable
        key={m.id}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on, disabled }}
        disabled={disabled}
        onPress={() => onChange(on ? value.filter((id) => id !== m.id) : [...value, m.id])}
        style={[styles.muscleCell, disabled && styles.dim]}
      >
        <MuscleThumb figure={figure} muscle={m.name} size={92} selected={on} />
        <Text variant="caption" color={on ? 'accent' : 'textMuted'}>{m.name}</Text>
      </Pressable>
    );
  };
  const available = (list: typeof upper) => list.filter((m) => !exclude.includes(m.id));
  return (
    <>
      <Text variant="label" color="textMuted">Upper</Text>
      <View style={styles.muscleGrid}>{available(upper).map(cell)}</View>
      <Text variant="label" color="textMuted">Lower</Text>
      <View style={styles.muscleGrid}>{available(lower).map(cell)}</View>
    </>
  );
}

/** "Focus points · 5/5 available" and a dot per point, filled while unspent. */
function PointsFooter({ title, used, total, left = false }: { title: string; used: number; total: number; left?: boolean }) {
  const shown = left ? total - used : used;
  return (
    <View style={styles.points}>
      <View style={styles.flex}>
        <Text variant="heading">{title}</Text>
        <Text variant="caption" color="textMuted">{shown}/{total} {left ? 'available' : 'selected'}</Text>
      </View>
      <View style={styles.dots}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.dot, (left ? i < total - used : i < used) && styles.dotOn]} />
        ))}
      </View>
    </View>
  );
}

function StepButton({ icon, disabled, onPress, small = false }: { icon: IconName; disabled?: boolean; onPress: () => void; small?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={icon === 'plus' ? 'More' : 'Fewer'}
      disabled={disabled}
      onPress={onPress}
      style={[small ? styles.stepSmall : styles.stepBig, disabled && styles.dim]}
    >
      <Lucide name={icon} size={small ? 18 : 24} color={theme.colors.text} />
    </Pressable>
  );
}

function ToggleCard({ icon, title, body, value, onChange }: { icon: IconName; title: string; body: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={[styles.toggleCard, value && styles.selected]}>
      <View style={styles.toggleHeader}>
        <Lucide name={icon} size={26} color={theme.colors.text} />
        <Switch value={value} onValueChange={onChange} trackColor={{ true: theme.colors.accent, false: theme.colors.border }} />
      </View>
      <Text variant="heading">{title}</Text>
      <Text variant="caption" color="textMuted">{body}</Text>
    </View>
  );
}

const GENERATING = [
  'Reading your answers',
  'Balancing muscle groups',
  'Matching your gym’s equipment',
  'Choosing exercises',
  'Setting sets and reps',
  'Laying out your week',
];

/**
 * The plan is computed at once; the checklist paces it so the steps can be
 * read. Nothing is written until onboarding finishes.
 */
function Generating({ answers, onPlan }: { answers: Answers; onPlan: (plan: Plan) => void }) {
  const [done, setDone] = useState(answers.plan ? GENERATING.length : 0);
  useEffect(() => {
    if (answers.plan || !answers.gymId) return;
    const plan = planProgram(db, answers.gymId, preferencesOf(answers));
    let n = 0;
    const timer = setInterval(() => {
      n += 1;
      setDone(n);
      if (n >= GENERATING.length) {
        clearInterval(timer);
        onPlan(plan);
      }
    }, 450);
    return () => clearInterval(timer);
    // Once, when the step opens; going back and forth keeps the plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={styles.generating}>
      {GENERATING.map((label, i) => (
        <View key={label} style={styles.generatingRow}>
          <Text color={i < done ? 'text' : 'textMuted'} style={styles.flex}>{label}</Text>
          {i < done ? <Lucide name="circle-check" size={22} color={theme.colors.success} /> : <Lucide name="circle" size={22} color={theme.colors.border} />}
        </View>
      ))}
    </View>
  );
}

/**
 * The cycle as the workout overview will show it: a tab per day, then the
 * day's target muscles, length and exercises with their sets, rep ranges and
 * reps in reserve.
 */
function Preview({ plan, figure }: { plan: Plan; figure: 'male' | 'female' }) {
  const [day, setDay] = useState(Math.max(plan.days.findIndex((d) => d !== null), 0));
  const workout = plan.days[day] === null ? null : plan.workouts[plan.days[day]!]!;
  const muscles = new Map(workout?.exercises.map((e) => [e.exerciseId, getExerciseDetail(db, e.exerciseId)?.muscles ?? []]) ?? []);

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {plan.days.map((w, i) => (
          <Pressable
            key={i}
            accessibilityRole="tab"
            accessibilityState={{ selected: day === i }}
            onPress={() => setDay(i)}
            style={[styles.tab, day === i && styles.tabOn]}
          >
            <Text variant="heading" color={day === i ? 'text' : 'textMuted'}>{w === null ? 'Rest' : plan.workouts[w]!.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {workout ? (
        <>
          <TargetMuscleCards
            volumes={targetMuscles(workout.exercises.map((e) => ({ sets: e.sets.length, muscles: muscles.get(e.exerciseId)! })))}
            figure={figure}
          />
          <WorkoutHeading
            count={workout.exercises.length}
            minutes={estimateWorkoutMinutes(workout.exercises.map((e) => ({ sets: e.sets.length, restSeconds: e.restSeconds, unilateral: e.unilateral })))}
          />
          {workout.exercises.map((e) => (
            <ExerciseSummaryRow
              key={e.exerciseId}
              name={getExercise(db, e.exerciseId)?.name ?? ''}
              sets={e.sets.map((set, i) => ({
                key: String(i),
                label: set.repsMax > set.repsMin ? `${set.repsMin}–${set.repsMax} reps` : `${set.repsMin} reps`,
                rir: set.rir,
              }))}
              muscles={muscles.get(e.exerciseId)!}
            />
          ))}
          {workout.exercises.length === 0 ? (
            <Text color="textMuted">Your gym has no equipment for this workout yet — add some under Gym profiles.</Text>
          ) : null}
        </>
      ) : (
        <Text color="textMuted" style={styles.rest}>Rest day. Recovery is when the muscle is built.</Text>
      )}
    </>
  );
}


function RirExplainer() {
  return (
    <>
      <View style={styles.rirHeader}>
        <Text variant="caption" color="textMuted">Hardest — nothing left</Text>
        <Text variant="caption" color="textMuted">Easiest — plenty left</Text>
      </View>
      <View style={styles.rirRow}>
        {RIR_COLORS.map((color, i) => (
          <View key={i} style={[styles.rirDot, { backgroundColor: color }]}>
            <Text variant="caption" color="onAccent">{i === 6 ? '6+' : i}</Text>
          </View>
        ))}
      </View>
      <Text variant="heading">Reps in reserve (RIR)</Text>
      <Text color="textMuted">
        After a set, ask how many more clean reps you could have done. 0–1 means you went to your limit; 4 or more
        means the set felt easy.
      </Text>
      <Text color="textMuted">
        Logging it is optional, but it tells your progress apart from a good day, and it is what smart progression
        will read.
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  dim: { opacity: 0.35 },
  // Border width never changes with selection, so nothing shifts when picked.
  selected: { borderColor: theme.colors.text },
  choices: { gap: theme.spacing.md },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
    padding: theme.spacing.lg,
    minHeight: 72,
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
  },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: theme.colors.textMuted, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: theme.colors.text, backgroundColor: theme.colors.text },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.background },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md },
  gridCell: {
    width: '31%',
    aspectRatio: 0.9,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: theme.spacing.sm,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
  },
  unitSwitch: { alignItems: 'center', paddingBottom: theme.spacing.xl },
  input: {
    ...textStyle('body', true),
    color: theme.colors.text,
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    minHeight: 50,
  },
  iconRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md },
  iconCell: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
  },
  colorRow: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: theme.spacing.lg },
  swatch: { width: 40, height: 40, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  swatchOn: { borderWidth: 3, borderColor: theme.colors.text },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.xxl, paddingTop: 80 },
  stepperValue: { alignItems: 'center' },
  bigNumber: { fontSize: 48, lineHeight: 56, fontWeight: '700' },
  stepBig: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceRaised },
  stepSmall: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceRaised },
  focusRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.sm },
  bars: { flexDirection: 'row', gap: 4, marginTop: 4 },
  bar: { width: 28, height: 5, borderRadius: 2, backgroundColor: theme.colors.border },
  barOn: { backgroundColor: theme.colors.text },
  muscleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md },
  muscleCell: { alignItems: 'center', gap: theme.spacing.xs, width: '30%' },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  checkbox: { width: 24, height: 24, borderRadius: 5, borderWidth: 2, borderColor: theme.colors.textMuted, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  toggleCard: { gap: theme.spacing.sm, padding: theme.spacing.lg, borderWidth: 2, borderColor: theme.colors.border, borderRadius: theme.radius.lg },
  toggleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  generating: { gap: 0 },
  generatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  overview: { gap: theme.spacing.md, paddingTop: theme.spacing.xl },
  phases: { gap: theme.spacing.xl, paddingTop: theme.spacing.xxl },
  phaseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.lg },
  phaseDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceRaised,
  },
  phaseDotDone: { backgroundColor: theme.colors.success },
  phaseDotActive: { backgroundColor: theme.colors.text },
  points: { flexDirection: 'row', alignItems: 'center', paddingBottom: theme.spacing.md },
  dots: { flexDirection: 'row', gap: theme.spacing.sm },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: theme.colors.textMuted },
  dotOn: { backgroundColor: theme.colors.text, borderColor: theme.colors.text },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    height: 50,
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceRaised,
  },
  searchInput: { flex: 1, color: theme.colors.text, ...textStyle('body', true) },
  tabs: { gap: theme.spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border, marginBottom: theme.spacing.lg },
  tab: { paddingVertical: theme.spacing.md, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: theme.colors.text },
  rest: { paddingTop: theme.spacing.xl },
  rirHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  rirRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: theme.spacing.md },
  rirDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
