// Framework-free domain types. Nothing in src/domain/ may import React or Supabase.

export type Grip = 'half_crimp' | 'three_finger_drag';
export type Hand = 'left' | 'right';
export type SessionType = 'strength' | 'aerobic' | 'power_endurance' | 'easy_climbing' | 'mobility';
export type SessionStatus = 'unplaced' | 'planned' | 'complete' | 'failed';
export type AerobicVariable = 'grade' | 'length' | 'tut';

export const GRIPS: readonly Grip[] = ['half_crimp', 'three_finger_drag'];
export const HANDS: readonly Hand[] = ['left', 'right'];

export const GRIP_LABEL: Record<Grip, string> = {
  half_crimp: 'Half crimp',
  three_finger_drag: 'Three-finger drag',
};

export const HAND_LABEL: Record<Hand, string> = {
  left: 'Left',
  right: 'Right',
};

export interface GripFailureDetail {
  failed: boolean;
  /** Optional set numbers (1-4) the athlete ticked — reference only, never affects progression. */
  sets?: number[];
}

export type GripFailures = Partial<Record<Grip, GripFailureDetail>>;
