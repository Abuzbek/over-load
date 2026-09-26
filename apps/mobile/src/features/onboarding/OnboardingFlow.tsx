import { router } from 'expo-router';
import { useState } from 'react';
import { completeOnboarding, createProgramFromPlan } from '../../data/onboardingRepo';
import { db } from '../../db/client';
import { markOnboarded } from '../../sync/syncService';
import { buildSteps, INITIAL_ANSWERS, PHASES, preferencesOf, type Answers } from './steps';
import { StepFlow } from './StepFlow';

/**
 * First run for a new account, in three phases — Basics, Gym & Equipment,
 * Program — each opened by an overview of where you are. Answers stay in
 * memory until the last step, except the profile and the gym, which the
 * equipment step needs to exist; the program is written only on finishing.
 */
export function OnboardingFlow() {
  const [answers, setAnswers] = useState<Answers>(INITIAL_ANSWERS);
  const [index, setIndex] = useState(0);
  const set = (patch: Partial<Answers>) => setAnswers((a) => ({ ...a, ...patch }));

  const finish = () => {
    const at = Date.now();
    if (answers.plan) {
      createProgramFromPlan(db, answers.plan, { name: answers.programName.trim() || 'My Program', icon: answers.icon, color: answers.color }, at);
    }
    completeOnboarding(db, preferencesOf(answers), at);
    markOnboarded();
    router.replace('/');
  };

  return (
    <StepFlow
      steps={buildSteps(answers, set)}
      index={index}
      onIndex={setIndex}
      title={(step) => PHASES[step.phase]}
      lastLabel="Start training"
      onFinish={finish}
      progressBy="phase"
    />
  );
}
