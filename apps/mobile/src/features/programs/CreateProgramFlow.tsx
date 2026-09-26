import { Lucide } from '@react-native-vector-icons/lucide';
import { router } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { activateGym, countOwnedEquipment, listGyms } from '../../data/gymRepo';
import { createProgramFromPlan } from '../../data/onboardingRepo';
import { createProgram } from '../../data/programRepo';
import { getProfile, getTrainingPreferences, setProfile, setTrainingPreferences } from '../../data/settingsRepo';
import { db } from '../../db/client';
import { Button } from '../../ui/Button';
import { Text } from '../../ui/Text';
import { theme } from '../../ui/theme';
import {
  Choices,
  ColorIconPicker,
  DaysStepper,
  defaultProgramName,
  Deprioritize,
  EXPERIENCE,
  Focus,
  FlowInput,
  FOCUS_POINTS,
  Generating,
  GOALS,
  INITIAL_ANSWERS,
  MAX_DEPRIORITIZED,
  PointsFooter,
  preferencesOf,
  Preview,
  SESSIONS,
  SPLITS,
  ToggleCard,
  type Answers,
  type Step,
} from '../onboarding/steps';
import { StepFlow } from '../onboarding/StepFlow';

type IconName = ComponentProps<typeof Lucide>['name'];
type Method = 'smart' | 'scratch';

/**
 * Where a new program starts: every question unanswered — goal, session
 * length, gym, split, experience — so each program is chosen afresh. Only what
 * no screen asks carries over: the profile, the skills, the progression and
 * warm-up preferences.
 */
function startingAnswers(): Answers {
  const prefs = getTrainingPreferences(db);
  const profile = getProfile(db);
  return {
    ...INITIAL_ANSWERS,
    gender: profile.gender,
    split: null,
    lifting: undefined,
    ...(prefs ? { skills: prefs.skills, smartProgression: prefs.smartProgression, warmups: prefs.warmups } : {}),
  };
}

/** "Sep 26, 2026": a scratch program's name until it is given one. */
const today = () => new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * + New Program. Smart Generation asks what onboarding asked about the program
 * — goal, focus, schedule, gym, split, deload and experience, nothing chosen in
 * advance — then names it and generates it, to activate or keep in the
 * library. Build From Scratch names it and opens an empty program to fill.
 */
export function CreateProgramFlow() {
  const [answers, setAnswers] = useState<Answers>(startingAnswers);
  const [method, setMethod] = useState<Method | null>(null);
  const [index, setIndex] = useState(0);
  const set = (patch: Partial<Answers>) => setAnswers((a) => ({ ...a, ...patch }));
  const a = answers;
  const figure = a.gender === 'female' ? 'female' : 'male';

  const gyms = listGyms(db);
  const counts = countOwnedEquipment(db);

  const intro: Step = {
    kind: 'intro',
    phase: 2,
    body: (
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Lucide name="rocket" size={72} color={theme.colors.onAccent} />
        </View>
        <Text variant="display" style={styles.heroTitle}>Create program</Text>
        <Text color="textMuted">
          We will build a training program for your goals, schedule and gym. Or you can build your own from scratch.
        </Text>
      </View>
    ),
    ready: true,
  };

  const how: Step = {
    kind: 'question', phase: 2, title: 'How would you like to create your program?',
    body: (
      <Choices
        options={[
          { value: 'smart' as const, label: 'Use Smart Generation', note: 'A plan built for your goals, experience and gym equipment. Recommended.', icon: 'wand-sparkles' },
          { value: 'scratch' as const, label: 'Build From Scratch', note: 'Start from a blank program: add days and exercises yourself.', icon: 'wrench' },
        ]}
        value={method}
        onChange={setMethod}
      />
    ),
    ready: method !== null,
  };

  const name = (fallback: string): Step => ({
    kind: 'question', phase: 2, title: 'What would you like to name this program?',
    body: (
      <>
        <Text variant="caption" color="textMuted">Name</Text>
        <FlowInput value={a.programName} onChangeText={(programName) => set({ programName })} placeholder={fallback} />
      </>
    ),
    ready: true,
    onNext: () => {
      if (!a.programName.trim()) set({ programName: fallback });
    },
  });

  const look = (onNext?: () => void): Step => ({
    kind: 'question', phase: 2, title: 'What colour should we use to display this program?',
    body: <ColorIconPicker color={a.color} icon={a.icon} onChange={set} />,
    ready: true,
    onNext,
  });

  const smart: Step[] = [
    {
      kind: 'question', phase: 2, title: 'What is your primary goal?',
      body: <Choices options={GOALS.map((g) => ({ value: g.value, label: g.label, note: g.note, icon: g.icon }))} value={a.goal} onChange={(goal) => set({ goal })} />,
      ready: a.goal !== null,
    },
    {
      kind: 'question', phase: 2, title: 'Would you like to give extra focus to any muscles?',
      body: <Focus figure={figure} focus={a.focus} onChange={(focus) => set({ focus })} />,
      footer: <PointsFooter title="Focus points" used={Object.values(a.focus).reduce((n, p) => n + p, 0)} total={FOCUS_POINTS} left />,
      ready: true,
    },
    {
      kind: 'question', phase: 2, title: 'Would you like to deprioritize any specific muscles?',
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
      kind: 'question', phase: 2, title: 'How many times per week would you like to train?',
      body: <DaysStepper value={a.daysPerWeek} onChange={(daysPerWeek) => set({ daysPerWeek })} />,
      ready: true,
    },
    {
      kind: 'question', phase: 2, title: 'How much time would you like to budget per session?',
      body: <Choices options={SESSIONS.map((s) => ({ value: s.minutes, label: s.label, icon: 'timer' as IconName }))} value={a.sessionMinutes} onChange={(sessionMinutes) => set({ sessionMinutes })} />,
      ready: a.sessionMinutes !== null,
    },
    {
      kind: 'question', phase: 2, title: 'Which of your gyms will you be using during this program?',
      body: (
        <Choices
          options={gyms.map(({ gym, isActive }) => {
            const n = counts.get(gym.id) ?? 0;
            return {
              value: gym.id,
              label: gym.name,
              note: `${n} ${n === 1 ? 'piece' : 'pieces'} of equipment${isActive ? ' · Default' : ''}`,
              icon: (gym.icon ?? 'dumbbell') as IconName,
            };
          })}
          value={a.gymId}
          onChange={(gymId) => set({ gymId })}
        />
      ),
      ready: a.gymId !== null,
    },
    {
      kind: 'question', phase: 2, title: 'How do you prefer to structure your training?',
      body: (
        <Choices
          options={SPLITS.map((s) => ({ value: s.value, label: s.label, note: s.note, icon: (s.value === 'full_body' ? 'person-standing' : 'columns-2') as IconName }))}
          value={a.split}
          onChange={(split) => set({ split })}
        />
      ),
      ready: a.split !== null,
    },
    {
      kind: 'question', phase: 2, title: 'A lighter week, and your experience',
      body: (
        <>
          <ToggleCard
            icon="cloud"
            title="Deload"
            body="The training block ends with a lighter week to recover before the next one. Recommended."
            value={a.deload}
            onChange={(deload) => set({ deload })}
          />
          <Text variant="heading" style={styles.subhead}>Lifting experience</Text>
          <Choices
            options={EXPERIENCE.map((e) => ({ value: e.value, label: e.label, note: e.lifting, icon: e.icon }))}
            value={a.lifting}
            onChange={(lifting) => set({ lifting })}
          />
        </>
      ),
      ready: a.lifting !== undefined,
      // The generator reads the experience from the profile.
      onNext: () => setProfile(db, { liftingExperience: a.lifting ?? null }, Date.now()),
    },
    name(defaultProgramName(a)),
    // Anything changed since: the plan is generated afresh.
    look(() => set({ plan: null })),
    {
      kind: 'question', phase: 2, title: 'Generating your program',
      body: <Generating answers={a} onPlan={(plan) => set({ plan })} />,
      ready: a.plan !== null,
    },
    {
      kind: 'question', phase: 2, title: 'Your program',
      subtitle: 'One week of your cycle. Tap a day to see its workout.',
      body: a.plan ? <Preview plan={a.plan} figure={figure} /> : null,
      footer: <Button title="Save to Library" variant="secondary" onPress={() => finishSmart(false)} />,
      ready: true,
    },
  ];

  const scratch: Step[] = [name(today()), look()];

  const steps = [intro, how, ...(method === 'scratch' ? scratch : smart)];

  function finishSmart(activate: boolean) {
    if (!a.plan || !a.gymId) return;
    const at = Date.now();
    const id = createProgramFromPlan(db, a.plan, { name: a.programName.trim() || defaultProgramName(a), icon: a.icon, color: a.color }, at, { activate });
    setTrainingPreferences(db, preferencesOf(a), at);
    // The program is built for this gym: training it means training there.
    if (activate) activateGym(db, a.gymId, at);
    router.replace({ pathname: '/programs/[id]', params: { id, name: a.programName.trim() } });
  }

  function finishScratch() {
    const program = createProgram(db, { name: a.programName.trim() || today(), icon: a.icon, iconColor: a.color }, Date.now(), 1);
    router.replace({ pathname: '/programs/[id]', params: { id: program.id, name: program.name } });
  }

  return (
    <StepFlow
      steps={steps}
      index={index}
      onIndex={setIndex}
      title={() => 'Create Program'}
      lastLabel={method === 'scratch' ? 'Create program' : 'Activate Program'}
      onFinish={() => (method === 'scratch' ? finishScratch() : finishSmart(true))}
      onClose={() => router.back()}
      progressBy="flow"
    />
  );
}

const styles = StyleSheet.create({
  hero: { gap: theme.spacing.lg, paddingTop: theme.spacing.xxl },
  heroIcon: {
    alignSelf: 'center',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xl,
  },
  heroTitle: { textTransform: 'uppercase' },
  subhead: { marginTop: theme.spacing.lg },
});
