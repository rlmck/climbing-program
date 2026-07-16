import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import {
  clearCftUploads,
  createProgram,
  updateBodyweight,
  uploadCftFile,
  upsertCftBenchmark,
  upsertMvcBenchmark,
} from '../lib/api';
import { parseCftFile, type CftSummary } from '../domain/cft';
import { trainingLoadFromMvc, displayWeight, formatKg } from '../domain/loads';
import { mondayOf, todayISO } from '../domain/dates';
import { GRIPS, HANDS, GRIP_LABEL, HAND_LABEL, type Grip, type Hand } from '../domain/types';

interface SlotState {
  fileName: string | null;
  fileText: string | null;
  summary: CftSummary | null;
  errors: string[];
  warnings: string[];
}

const emptySlot: SlotState = { fileName: null, fileText: null, summary: null, errors: [], warnings: [] };
const slotKey = (grip: Grip, hand: Hand) => `${grip}_${hand}` as const;

export default function Onboarding({ round }: { round: 1 | 2 }) {
  const { athlete, session, refreshAthlete } = useAuth();
  const navigate = useNavigate();
  const [bodyweight, setBodyweight] = useState('');
  const [mvc, setMvc] = useState<Record<Grip, string>>({ half_crimp: '', three_finger_drag: '' });
  const [slots, setSlots] = useState<Record<string, SlotState>>({});
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearMessage, setClearMessage] = useState<string | null>(null);

  const bw = parseFloat(bodyweight);
  const mvcNum: Record<Grip, number> = {
    half_crimp: parseFloat(mvc.half_crimp),
    three_finger_drag: parseFloat(mvc.three_finger_drag),
  };
  const manualValid =
    Number.isFinite(bw) && bw > 0 && GRIPS.every((g) => Number.isFinite(mvcNum[g]) && mvcNum[g] > 0);

  const parsedCount = useMemo(
    () => Object.values(slots).filter((s) => s.summary !== null).length,
    [slots],
  );

  function onFilePicked(grip: Grip, hand: Hand, file: File | undefined) {
    if (!file) return;
    const key = slotKey(grip, hand);
    void file.text().then((text) => {
      const result = parseCftFile(text, { grip, hand });
      setSlots((prev) => ({
        ...prev,
        [key]: {
          fileName: file.name,
          fileText: result.ok ? text : null,
          summary: result.summary,
          errors: result.errors,
          warnings: result.warnings,
        },
      }));
    });
  }

  async function submit() {
    if (!athlete || !session) return;
    setBusy(true);
    setSubmitError(null);
    try {
      for (const grip of GRIPS) {
        await upsertMvcBenchmark(athlete.id, round, grip, mvcNum[grip], bw);
      }
      for (const grip of GRIPS) {
        for (const hand of HANDS) {
          const slot = slots[slotKey(grip, hand)];
          if (!slot?.summary || !slot.fileText) continue;
          const path = await uploadCftFile(session.user.id, round, grip, hand, slot.fileText);
          await upsertCftBenchmark(athlete.id, round, grip, hand, slot.summary, path);
        }
      }
      if (round === 1 && !athlete.program_start_date) {
        // Program week 1 = the week onboarding completes (weeks run Mon-Sun).
        await createProgram(athlete, bw, mvcNum, mondayOf(todayISO()));
      } else {
        await updateBodyweight(athlete.id, bw);
      }
      await refreshAthlete();
      navigate(round === 1 ? '/week' : '/progress');
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{round === 1 ? 'Benchmark' : 'Retest (round 2)'}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {round === 1
            ? 'Run this once — it sets your training loads and generates your 13-week program.'
            : 'Same protocol as your baseline. Results overlay your round-1 graphs.'}
        </p>
      </div>

      <section className="card space-y-4">
        <h2 className="font-semibold">Manual entry</h2>
        <div>
          <label className="label" htmlFor="bw">
            Bodyweight (kg)
          </label>
          <input
            id="bw"
            className="input"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="20"
            value={bodyweight}
            onChange={(e) => setBodyweight(e.target.value)}
            placeholder="e.g. 72.4"
          />
        </div>
        {GRIPS.map((grip) => (
          <div key={grip}>
            <label className="label" htmlFor={`mvc-${grip}`}>
              MVC — {GRIP_LABEL[grip]} (kg, TOTAL load: bodyweight + added)
            </label>
            <p className="mb-1 text-xs text-slate-500">7s hang, 20mm edge</p>
            <input
              id={`mvc-${grip}`}
              className="input"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="1"
              value={mvc[grip]}
              onChange={(e) => setMvc((p) => ({ ...p, [grip]: e.target.value }))}
              placeholder="e.g. 98.5"
            />
            {Number.isFinite(mvcNum[grip]) && mvcNum[grip] > 0 && Number.isFinite(bw) && bw > 0 && (
              <TrainingLoadPreview mvcTotal={mvcNum[grip]} bodyweight={bw} />
            )}
          </div>
        ))}
      </section>

      <section className="card space-y-4">
        <div>
          <h2 className="font-semibold">Critical Force Test files</h2>
          <p className="mt-1 text-xs text-slate-500">
            Assign each JSON export to its grip + hand slot. The app never guesses the grip from
            the file — put each file where it belongs. ({parsedCount}/4 attached)
          </p>
        </div>
        {GRIPS.map((grip) =>
          HANDS.map((hand) => {
            const slot = slots[slotKey(grip, hand)] ?? emptySlot;
            return (
              <div
                key={slotKey(grip, hand)}
                className={`rounded-lg border-2 border-dashed p-3 ${
                  slot.summary
                    ? 'border-emerald-700 bg-emerald-950/30'
                    : slot.errors.length
                      ? 'border-rose-700 bg-rose-950/30'
                      : 'border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">
                      {GRIP_LABEL[grip]} · {HAND_LABEL[hand]} hand
                    </div>
                    {slot.fileName && (
                      <div className="text-xs text-slate-400">{slot.fileName}</div>
                    )}
                    {slot.summary && (
                      <div className="text-xs text-emerald-400">
                        CF {slot.summary.criticalForce.toFixed(1)} kg ·{' '}
                        {slot.summary.reps.length} reps
                      </div>
                    )}
                  </div>
                  <label className="btn-secondary cursor-pointer !px-3 !py-1.5 text-xs">
                    {slot.summary ? 'Replace' : 'Choose file'}
                    <input
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={(e) => onFilePicked(grip, hand, e.target.files?.[0])}
                    />
                  </label>
                </div>
                {slot.errors.map((err) => (
                  <p key={err} className="mt-2 text-xs text-rose-400">
                    {err}
                  </p>
                ))}
                {slot.warnings.map((w) => (
                  <p key={w} className="mt-2 text-xs text-amber-400">
                    {w}
                  </p>
                ))}
              </div>
            );
          }),
        )}

        <div className="border-t border-slate-800 pt-3">
          {!confirmClear ? (
            <button
              className="text-xs text-rose-400 underline"
              onClick={() => {
                setClearMessage(null);
                setConfirmClear(true);
              }}
            >
              Uploaded the wrong files? Clear ALL round-{round} CFT uploads…
            </button>
          ) : (
            <div className="space-y-2 rounded-lg border border-rose-800 bg-rose-950/30 p-3">
              <p className="text-xs text-rose-200">
                This deletes every uploaded CFT file and its parsed results for round {round} (all
                4 grip/hand slots, for this account). MVC entries and your program are untouched.
              </p>
              <div className="flex gap-2">
                <button
                  className="btn flex-1 border border-rose-600 bg-rose-900 text-xs text-white"
                  disabled={busy}
                  onClick={async () => {
                    if (!athlete || !session) return;
                    setBusy(true);
                    setSubmitError(null);
                    try {
                      const removed = await clearCftUploads(session.user.id, athlete.id, round);
                      setSlots({});
                      setClearMessage(`Cleared ${removed} uploaded file(s) and their parsed results.`);
                    } catch (e) {
                      setSubmitError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setBusy(false);
                      setConfirmClear(false);
                    }
                  }}
                >
                  {busy ? 'Clearing…' : 'Yes, delete them'}
                </button>
                <button
                  className="btn flex-1 border border-slate-700 bg-slate-800 text-xs"
                  disabled={busy}
                  onClick={() => setConfirmClear(false)}
                >
                  Keep files
                </button>
              </div>
            </div>
          )}
          {clearMessage && <p className="mt-2 text-xs text-emerald-400">{clearMessage}</p>}
        </div>
      </section>

      {submitError && <p className="text-sm text-rose-400">{submitError}</p>}
      {parsedCount < 4 && (
        <p className="text-xs text-amber-400">
          {4 - parsedCount} CFT file(s) missing — you can save now and come back to add them
          (re-opening this page updates the same test round).
        </p>
      )}
      <button className="btn-primary w-full" disabled={!manualValid || busy} onClick={() => void submit()}>
        {busy
          ? 'Saving…'
          : round === 1
            ? athlete?.program_start_date
              ? 'Update benchmark data'
              : 'Save benchmark & generate program'
            : 'Save retest'}
      </button>
    </div>
  );
}

function TrainingLoadPreview({ mvcTotal, bodyweight }: { mvcTotal: number; bodyweight: number }) {
  const load = trainingLoadFromMvc(mvcTotal);
  const dw = displayWeight(load, bodyweight);
  return (
    <p className="mt-1 text-xs text-emerald-400">
      Training load {formatKg(load)} total →{' '}
      {dw.mode === 'added' ? `+${formatKg(dw.kg)} added` : `${formatKg(dw.kg)} assisted (pulley)`}
    </p>
  );
}
