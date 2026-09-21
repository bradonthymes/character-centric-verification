'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Download,
  FileQuestion,
  Flag,
  FolderOpen,
  Info,
  ListChecks,
  MessageSquareText,
  Play,
  RotateCcw,
  Save,
  Search,
  SkipBack,
  SkipForward,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  movieById,
  movies,
  studyIntegrity,
  studySource,
  studyQuestions,
  type StudyQuestion,
} from './data/study-data';
import {
  type FolderFiles,
  folderPermission,
  forgetFolderHandle,
  loadFolderHandle,
  pickFolder,
  readFileList,
  readFolderHandle,
  saveFolderHandle,
  supportsDirectoryPicker,
} from './media-folder';

type QuestionForm = {
  clarity: string;
  answerability: string;
  sufficiency: string;
  issues: string[];
  otherIssue: string;
  overall: string;
  revisedQuestion: string;
  removalReason: string;
  comments: string;
};

type AnswerForm = {
  correctness: string;
  relevance: string;
  completeness: string;
  overall: string;
  revisedAnswer: string;
  comments: string;
};

type ClaimForm = {
  understandability: string;
  support: string;
  relevance: string;
  evidence: string;
  suggestedTimestamp: string;
  correctionAction: string;
  revisedClaim: string;
  comments: string;
};

type Annotation = {
  participant_id: string;
  movie_id: string;
  question_id: string;
  question_verification: QuestionForm;
  answer_verification: AnswerForm;
  claim_verification: Record<string, ClaimForm>;
  status: 'not_started' | 'in_progress' | 'complete';
  flagged: boolean;
  started_at: string;
  completed_at: string;
  time_spent_seconds: number;
};

type AnnotationMap = Record<string, Annotation>;

declare global {
  interface Document {
    modelContext?: {
      registerTool: (
        tool: {
          name: string;
          title?: string;
          description: string;
          inputSchema: Record<string, unknown>;
          annotations?: {
            readOnlyHint?: boolean;
            untrustedContentHint?: boolean;
          };
          execute: (input: unknown) => unknown;
        },
        options?: { signal?: AbortSignal },
      ) => void | Promise<void>;
    };
  }
}

const STORAGE_KEY = 'videoqa-verification-v1';
const PARTICIPANT_KEY = 'videoqa-verification-participant-v1';
const FINAL_SUBMISSION_KEY = 'videoqa-study-final-submission';
const POSITION_KEY = 'videoqa-verification-position-v1';
const EXPORT_SCHEMA_VERSION = 2;

// Poster paths in the data are root-absolute. Next rewrites its own asset URLs
// for a GitHub Pages project site, but not strings we hand to <img>.
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const asset = (path: string) => `${BASE_PATH}${path}`;

// How many completed questions between off-browser backup nudges.
const BACKUP_PROMPT_EVERY = 25;

// Participant ids are assigned, not typed, so two reviewers cannot collide on
// the same label. The alphabet drops I, L, O, U, 0 and 1 so an id that gets
// read aloud or copied by hand cannot come back wrong.
const ID_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

function makeParticipantId() {
  const chars: string[] = [];
  const buffer = new Uint8Array(16);
  // 240 is the largest multiple of the alphabet under 256; discarding the rest
  // keeps every character equally likely.
  const limit = ID_ALPHABET.length * Math.floor(256 / ID_ALPHABET.length);
  while (chars.length < 8) {
    crypto.getRandomValues(buffer);
    for (const byte of buffer) {
      if (byte < limit && chars.length < 8)
        chars.push(ID_ALPHABET[byte % ID_ALPHABET.length]);
    }
  }
  return `P-${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

const emptyQuestionForm = (): QuestionForm => ({
  clarity: '',
  answerability: '',
  sufficiency: '',
  issues: [],
  otherIssue: '',
  overall: '',
  revisedQuestion: '',
  removalReason: '',
  comments: '',
});

const emptyAnswerForm = (): AnswerForm => ({
  correctness: '',
  relevance: '',
  completeness: '',
  overall: '',
  revisedAnswer: '',
  comments: '',
});

const emptyClaimForm = (): ClaimForm => ({
  understandability: '',
  support: '',
  relevance: '',
  evidence: '',
  suggestedTimestamp: '',
  correctionAction: '',
  revisedClaim: '',
  comments: '',
});

function makeAnnotation(question: StudyQuestion): Annotation {
  return {
    participant_id: '',
    movie_id: question.movieId,
    question_id: question.id,
    question_verification: emptyQuestionForm(),
    answer_verification: emptyAnswerForm(),
    claim_verification: Object.fromEntries(
      question.claims.map((claim) => [claim.id, emptyClaimForm()]),
    ),
    status: 'not_started',
    flagged: false,
    started_at: '',
    completed_at: '',
    time_spent_seconds: 0,
  };
}

const defaultAnnotations = () =>
  Object.fromEntries(
    studyQuestions.map((question) => [question.id, makeAnnotation(question)]),
  );

const annotationStatuses = ['not_started', 'in_progress', 'complete'] as const;

// Drafts are restored across dataset revisions, so a stored annotation is
// rebuilt field by field onto a fresh record: unknown keys and claims that no
// longer exist are dropped, and claims added since the draft was written get
// empty forms instead of undefined ones.
function mergeStringForm<T extends Record<string, string>>(
  base: T,
  stored: unknown,
): T {
  if (!stored || typeof stored !== 'object') return base;
  const source = stored as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(base).map(([key, fallback]) => [
      key,
      typeof source[key] === 'string' ? source[key] : fallback,
    ]),
  ) as T;
}

function mergeAnnotation(
  base: Annotation,
  stored: unknown,
  question: StudyQuestion,
): Annotation {
  if (!stored || typeof stored !== 'object') return base;
  const source = stored as Record<string, unknown>;
  const storedQuestion = mergeStringForm(
    { ...base.question_verification, issues: '' },
    source.question_verification,
  );
  const storedIssues = (
    source.question_verification as { issues?: unknown } | undefined
  )?.issues;
  const claims = source.claim_verification as
    | Record<string, unknown>
    | undefined;
  return {
    ...base,
    question_verification: {
      ...base.question_verification,
      ...storedQuestion,
      issues: Array.isArray(storedIssues)
        ? storedIssues.filter(
            (issue): issue is string => typeof issue === 'string',
          )
        : base.question_verification.issues,
    },
    answer_verification: mergeStringForm(
      base.answer_verification,
      source.answer_verification,
    ),
    claim_verification: Object.fromEntries(
      question.claims.map((claim) => [
        claim.id,
        mergeStringForm(emptyClaimForm(), claims?.[claim.id]),
      ]),
    ),
    status: annotationStatuses.includes(source.status as Annotation['status'])
      ? (source.status as Annotation['status'])
      : base.status,
    flagged: source.flagged === true,
    started_at:
      typeof source.started_at === 'string'
        ? source.started_at
        : base.started_at,
    completed_at:
      typeof source.completed_at === 'string'
        ? source.completed_at
        : base.completed_at,
    time_spent_seconds:
      typeof source.time_spent_seconds === 'number'
        ? source.time_spent_seconds
        : base.time_spent_seconds,
  };
}

function normalizeAnnotations(stored: unknown): AnnotationMap {
  const restored = defaultAnnotations();
  if (!stored || typeof stored !== 'object') return restored;
  const source = stored as Record<string, unknown>;
  for (const question of studyQuestions) {
    restored[question.id] = mergeAnnotation(
      restored[question.id],
      source[question.id],
      question,
    );
  }
  return restored;
}

function formatTimestamp(seconds: number) {
  const rounded = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  return [hours, minutes, secs]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

function fileSafeId(participantId: string) {
  return (
    participantId.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-|-$/g, '') ||
    'participant'
  );
}

function touched(annotation: Annotation) {
  const q = annotation.question_verification;
  const a = annotation.answer_verification;
  return Boolean(
    q.clarity ||
    q.answerability ||
    q.sufficiency ||
    q.issues.length ||
    q.overall ||
    q.comments ||
    a.correctness ||
    a.relevance ||
    a.completeness ||
    a.overall ||
    a.comments ||
    Object.values(annotation.claim_verification).some((claim) =>
      Object.values(claim).some(Boolean),
    ),
  );
}

function needsClaimCorrection(claim: ClaimForm) {
  return (
    claim.understandability === 'mostly' ||
    claim.understandability === 'no' ||
    ['partially_supported', 'unsupported', 'contradicted'].includes(
      claim.support,
    )
  );
}

function validationErrors(annotation: Annotation, question: StudyQuestion) {
  const errors: string[] = [];
  const q = annotation.question_verification;
  const a = annotation.answer_verification;
  if (!q.clarity) errors.push('Question clarity');
  if (!q.answerability) errors.push('Question answerability');
  if (!q.sufficiency) errors.push('Information sufficiency');
  if (!q.issues.length) errors.push('Question issues');
  if (q.issues.includes('other') && !q.otherIssue.trim())
    errors.push('Other issue description');
  if (q.issues.includes('no_issues') && q.issues.length > 1)
    errors.push('Resolve contradictory question issues');
  if (!q.overall) errors.push('Overall question judgment');
  if (q.overall === 'minor_revision' && !q.revisedQuestion.trim())
    errors.push('Corrected question');
  if (q.overall === 'remove_replace' && !q.removalReason.trim())
    errors.push('Question removal explanation');
  if (!a.correctness) errors.push('Answer correctness');
  if (!a.relevance) errors.push('Answer relevance');
  if (!a.completeness) errors.push('Answer completeness');
  if (!a.overall) errors.push('Overall answer judgment');
  if (
    ['minor_revision', 'replace'].includes(a.overall) &&
    !a.revisedAnswer.trim()
  )
    errors.push('Corrected reference answer');
  question.claims.forEach((claim, index) => {
    const value = annotation.claim_verification[claim.id];
    if (!value.understandability)
      errors.push(`Claim ${index + 1} understandability`);
    if (!value.support) errors.push(`Claim ${index + 1} factual support`);
    if (!value.relevance) errors.push(`Claim ${index + 1} relevance`);
    if (!value.evidence) errors.push(`Claim ${index + 1} evidence judgment`);
    if (needsClaimCorrection(value) && !value.correctionAction)
      errors.push(`Claim ${index + 1} correction action`);
    if (value.correctionAction === 'rewrite' && !value.revisedClaim.trim())
      errors.push(`Claim ${index + 1} rewrite`);
    if (
      value.correctionAction === 'replace_evidence' &&
      !value.suggestedTimestamp.trim()
    )
      errors.push(`Claim ${index + 1} alternative timestamp`);
  });
  return errors;
}

const questionIssueOptions = [
  ['ambiguous_wording', 'Ambiguous wording'],
  ['incorrect_character', 'Incorrect character name'],
  ['incorrect_premise', 'Incorrect event or premise'],
  ['outside_knowledge', 'Requires outside knowledge'],
  ['multiple_interpretations', 'Multiple reasonable interpretations'],
  ['reveals_answer', 'Reveals or strongly suggests the answer'],
  ['not_answerable', 'Cannot be answered from the movie'],
  ['other', 'Other'],
  ['no_issues', 'No issues'],
];

function RadioQuestion({
  label,
  prompt,
  value,
  options,
  onChange,
  tooltip,
}: {
  label: string;
  prompt: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
  tooltip?: string;
}) {
  return (
    <fieldset className="verification-fieldset">
      <legend>
        <span>{label}</span>
        <strong>{prompt}</strong>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger
              className="info-trigger"
              aria-label={`About ${label}`}
            >
              <Info />
            </TooltipTrigger>
            <TooltipContent side="left">{tooltip}</TooltipContent>
          </Tooltip>
        )}
      </legend>
      <RadioGroup value={value} onValueChange={onChange} aria-label={prompt}>
        {options.map(([optionValue, optionLabel]) => (
          <label className="choice-row" key={optionValue}>
            <RadioGroupItem value={optionValue} />
            <span>{optionLabel}</span>
          </label>
        ))}
      </RadioGroup>
    </fieldset>
  );
}

function ParticipantGate({
  participantId,
  onStart,
}: {
  participantId: string;
  onStart: () => void;
}) {
  const startRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    startRef.current?.focus();
  }, []);

  return (
    <main className="gate-shell">
      <section className="gate-card">
        <div className="brand-mark">VQ</div>
        <p className="eyebrow">Research study</p>
        <h1>VideoQA Dataset Verification</h1>
        <p className="gate-copy">
          You will review {studyQuestions.length} questions, their reference
          answers, and the atomic claims behind them, against clips from{' '}
          {movies.length} titles. Expect to work across several sittings.
        </p>
        <div className="gate-field">
          <span id="participant-id-label">Your participant ID</span>
          <output
            className="assigned-id"
            aria-labelledby="participant-id-label"
          >
            {participantId}
          </output>
          <small>
            Assigned automatically. It labels your responses and names the file
            you download at the end, so there is nothing to write down.
          </small>
        </div>
        <Button ref={startRef} className="gate-start" onClick={onStart}>
          Start verification <ArrowRight />
        </Button>
        <p className="gate-note">
          Nothing is uploaded. Your work is kept in this browser as you go, and
          at the end you download a single file to send to the research team.
        </p>
      </section>
    </main>
  );
}

export default function VerificationStudy() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [annotations, setAnnotations] =
    useState<AnnotationMap>(defaultAnnotations);
  const [activeTab, setActiveTab] = useState('question');
  const [videoMode, setVideoMode] = useState<'evidence' | 'full'>('evidence');
  const [currentTime, setCurrentTime] = useState(0);
  const [transcriptQuery, setTranscriptQuery] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saveLabel, setSaveLabel] = useState('All changes saved');
  const [errors, setErrors] = useState<string[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [finalConfirmed, setFinalConfirmed] = useState(false);
  const [studySubmitted, setStudySubmitted] = useState(false);
  const [responsesDownloaded, setResponsesDownloaded] = useState(false);
  const [finalPayloadJson, setFinalPayloadJson] = useState('');
  const [participantId, setParticipantId] = useState('');
  const [assignedId, setAssignedId] = useState('');
  const [pendingSeek, setPendingSeek] = useState<number | null>(null);
  const [mediaFiles, setMediaFiles] = useState<FolderFiles>(() => new Map());
  const [folderState, setFolderState] = useState<
    'checking' | 'none' | 'reconnect' | 'ready'
  >('checking');
  const [movieUrl, setMovieUrl] = useState('');
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [backupPromptAt, setBackupPromptAt] = useState(0);
  const [exitOpen, setExitOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const currentIndexRef = useRef(currentIndex);
  const annotationsRef = useRef(annotations);
  const questionOpenedAtRef = useRef(Date.now());

  const accrueCurrentQuestionTime = useCallback(() => {
    const now = Date.now();
    const elapsedSeconds = Math.max(
      0,
      Math.round((now - questionOpenedAtRef.current) / 1000),
    );
    questionOpenedAtRef.current = now;
    const activeQuestion = studyQuestions[currentIndexRef.current];
    const current = annotationsRef.current[activeQuestion.id];
    if (!current?.started_at || elapsedSeconds === 0)
      return annotationsRef.current;
    const updated: AnnotationMap = {
      ...annotationsRef.current,
      [activeQuestion.id]: {
        ...current,
        time_spent_seconds: current.time_spent_seconds + elapsedSeconds,
      },
    };
    annotationsRef.current = updated;
    return updated;
  }, []);

  const question = studyQuestions[currentIndex];
  const movie = movieById[question.movieId];
  const annotation = annotations[question.id];
  const movieFile = mediaFiles.get(movie.file);
  const foundFilms = movies.filter((item) => mediaFiles.has(item.file));
  const missingFilms = movies.filter((item) => !mediaFiles.has(item.file));

  useEffect(() => {
    try {
      const storedParticipant = localStorage.getItem(PARTICIPANT_KEY);
      // A returning reviewer keeps the id they were assigned; a new one is
      // offered a fresh id, which is only persisted once they start.
      if (storedParticipant) setParticipantId(storedParticipant);
      else setAssignedId(makeParticipantId());
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const restored = normalizeAnnotations(JSON.parse(stored));
        annotationsRef.current = restored;
        setAnnotations(restored);
      }
      const storedQuestionId = localStorage.getItem(POSITION_KEY);
      const storedIndex = studyQuestions.findIndex(
        (item) => item.id === storedQuestionId,
      );
      if (storedIndex >= 0) {
        currentIndexRef.current = storedIndex;
        setCurrentIndex(storedIndex);
      }
      // A reviewer who closed the page before downloading comes back to the
      // download step rather than to a finished study with no file.
      const storedFinalPayload = localStorage.getItem(FINAL_SUBMISSION_KEY);
      if (storedFinalPayload) {
        setFinalPayloadJson(storedFinalPayload);
        setStudySubmitted(true);
        setReviewOpen(true);
      }
    } catch {
      setSaveLabel('Local draft could not be restored');
    }
    questionOpenedAtRef.current = Date.now();
    setMounted(true);
  }, []);

  // A folder chosen through the directory picker can be remembered; restoring
  // it needs no gesture when permission survived, and one click when it did not.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const handle = await loadFolderHandle();
      if (!handle) {
        if (!cancelled) setFolderState('none');
        return;
      }
      const permission = await folderPermission(handle);
      if (cancelled) return;
      if (permission !== 'granted') {
        setFolderState('reconnect');
        return;
      }
      const files = await readFolderHandle(handle);
      if (cancelled) return;
      setMediaFiles(files);
      setFolderState(files.size ? 'ready' : 'none');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // One object URL per film, released as soon as another film is opened.
  useEffect(() => {
    if (!movieFile) {
      setMovieUrl('');
      return;
    }
    const url = URL.createObjectURL(movieFile);
    setMovieUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [movieFile]);

  const attachFolder = useCallback(async () => {
    if (supportsDirectoryPicker()) {
      const handle = await pickFolder();
      if (!handle) return;
      if ((await folderPermission(handle, true)) !== 'granted') return;
      const files = await readFolderHandle(handle);
      setMediaFiles(files);
      setFolderState(files.size ? 'ready' : 'none');
      await saveFolderHandle(handle);
      return;
    }
    // Safari and Firefox cannot persist a handle, so they re-pick each session.
    folderInputRef.current?.click();
  }, []);

  const reconnectFolder = useCallback(async () => {
    const handle = await loadFolderHandle();
    if (!handle) {
      setFolderState('none');
      return;
    }
    if ((await folderPermission(handle, true)) !== 'granted') return;
    const files = await readFolderHandle(handle);
    setMediaFiles(files);
    setFolderState(files.size ? 'ready' : 'none');
  }, []);

  const detachFolder = useCallback(async () => {
    await forgetFolderHandle();
    setMediaFiles(new Map());
    setFolderState('none');
  }, []);

  const startStudy = useCallback(() => {
    const id = assignedId || makeParticipantId();
    setParticipantId(id);
    writeStorage(PARTICIPANT_KEY, id);
    questionOpenedAtRef.current = Date.now();
  }, [assignedId]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
    annotationsRef.current = annotations;
  }, [annotations, currentIndex]);

  useEffect(() => {
    if (!mounted || !dirty) return;
    setSaveLabel('Saving…');
    const timeout = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));
        setDirty(false);
        setSaveLabel('All changes saved');
      } catch {
        setSaveLabel('Draft could not be saved');
      }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [annotations, dirty, mounted]);

  useEffect(() => {
    const persistNow = () => {
      const timedAnnotations = accrueCurrentQuestionTime();
      return writeStorage(STORAGE_KEY, JSON.stringify(timedAnnotations));
    };
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty && !persistNow()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const saveOnHide = () => {
      if (dirty) persistNow();
    };
    window.addEventListener('beforeunload', warn);
    window.addEventListener('pagehide', saveOnHide);
    return () => {
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('pagehide', saveOnHide);
    };
  }, [accrueCurrentQuestionTime, dirty]);

  const updateAnnotation = useCallback(
    (questionId: string, updater: (value: Annotation) => Annotation) => {
      setAnnotations((current) => {
        const next = updater(current[questionId]);
        const started = next.started_at || new Date().toISOString();
        const status: Annotation['status'] =
          next.status === 'complete'
            ? 'complete'
            : touched({ ...next, started_at: started })
              ? 'in_progress'
              : 'not_started';
        const updated: AnnotationMap = {
          ...current,
          [questionId]: {
            ...next,
            started_at: started,
            status,
          },
        };
        annotationsRef.current = updated;
        return updated;
      });
      setDirty(true);
      setErrors([]);
    },
    [],
  );

  const updateQuestion = (
    field: keyof QuestionForm,
    value: string | string[],
  ) =>
    updateAnnotation(question.id, (current) => ({
      ...current,
      status: current.status === 'complete' ? 'in_progress' : current.status,
      question_verification: {
        ...current.question_verification,
        [field]: value,
      },
    }));
  const updateAnswer = (field: keyof AnswerForm, value: string) =>
    updateAnnotation(question.id, (current) => ({
      ...current,
      status: current.status === 'complete' ? 'in_progress' : current.status,
      answer_verification: { ...current.answer_verification, [field]: value },
    }));
  const updateClaim = (
    claimId: string,
    field: keyof ClaimForm,
    value: string,
  ) =>
    updateAnnotation(question.id, (current) => ({
      ...current,
      status: current.status === 'complete' ? 'in_progress' : current.status,
      claim_verification: {
        ...current.claim_verification,
        [claimId]: { ...current.claim_verification[claimId], [field]: value },
      },
    }));

  const toggleIssue = (issue: string, checked: boolean) => {
    const previous = annotation.question_verification.issues;
    const next = checked
      ? issue === 'no_issues'
        ? ['no_issues']
        : [...previous.filter((item) => item !== 'no_issues'), issue]
      : previous.filter((item) => item !== issue);
    updateQuestion('issues', [...new Set(next)]);
  };

  const goToQuestion = useCallback(
    (index: number) => {
      const timedAnnotations = accrueCurrentQuestionTime();
      setAnnotations(timedAnnotations);
      writeStorage(STORAGE_KEY, JSON.stringify(timedAnnotations));
      const nextIndex = Math.max(0, Math.min(studyQuestions.length - 1, index));
      setCurrentIndex(nextIndex);
      currentIndexRef.current = nextIndex;
      writeStorage(POSITION_KEY, studyQuestions[nextIndex].id);
      setActiveTab('question');
      setVideoMode('evidence');
      setPendingSeek(null);
      setCurrentTime(0);
      setTranscriptQuery('');
      setErrors([]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [accrueCurrentQuestionTime],
  );

  const submitCurrent = useCallback(
    (fromTool = false) => {
      const index = currentIndexRef.current;
      const currentQuestion = studyQuestions[index];
      const timedAnnotations = accrueCurrentQuestionTime();
      const currentAnnotation = timedAnnotations[currentQuestion.id];
      const found = validationErrors(currentAnnotation, currentQuestion);
      if (found.length) {
        setErrors(found);
        if (found.some((item) => item.startsWith('Answer')))
          setActiveTab('answer');
        else if (found.some((item) => item.startsWith('Claim')))
          setActiveTab('claims');
        else setActiveTab('question');
        return {
          submitted: false,
          questionId: currentQuestion.id,
          missing: found,
        };
      }
      const completed = {
        ...currentAnnotation,
        status: 'complete' as const,
        completed_at: new Date().toISOString(),
      };
      const nextAnnotations = {
        ...timedAnnotations,
        [currentQuestion.id]: completed,
      };
      annotationsRef.current = nextAnnotations;
      setAnnotations(nextAnnotations);
      const stored = writeStorage(STORAGE_KEY, JSON.stringify(nextAnnotations));
      setDirty(!stored);
      setSaveLabel(
        stored ? 'Question complete · saved' : 'Draft could not be saved',
      );
      setErrors([]);
      if (!fromTool) {
        if (index < studyQuestions.length - 1) goToQuestion(index + 1);
        else setReviewOpen(true);
      }
      return {
        submitted: true,
        questionId: currentQuestion.id,
        status: 'complete',
      };
    },
    [accrueCurrentQuestionTime, goToQuestion],
  );

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const reportError = () => undefined;
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: 'navigate_verification_question',
            title: 'Open verification question',
            description:
              'Open one assigned VideoQA verification question by its source question ID.',
            inputSchema: {
              type: 'object',
              properties: { questionId: { type: 'string' } },
              required: ['questionId'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute(input) {
              const questionId = (input as { questionId?: unknown })
                ?.questionId;
              if (typeof questionId !== 'string')
                throw new Error('questionId must be a string');
              const index = studyQuestions.findIndex(
                (item) => item.id === questionId,
              );
              if (index < 0) throw new Error('Unknown assigned questionId');
              goToQuestion(index);
              return {
                opened: true,
                questionId,
                position: index + 1,
                total: studyQuestions.length,
              };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(reportError);
      void Promise.resolve(
        context.registerTool(
          {
            name: 'submit_current_question_verification',
            title: 'Submit current verification',
            description:
              'Validate and submit the currently open question, answer, and claim judgments. Returns missing requirements without changing completion state when invalid.',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute() {
              return submitCurrent(true);
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(reportError);
    } catch {
      reportError();
    }
    return () => lifecycle.abort();
  }, [goToQuestion, submitCurrent]);

  const seek = (delta: number) => {
    if (videoRef.current)
      videoRef.current.currentTime = Math.max(
        0,
        Math.min(
          videoRef.current.duration || Infinity,
          videoRef.current.currentTime + delta,
        ),
      );
  };
  // The whole film is attached, so evidence is a bounded seek into it rather
  // than a separate file: play the anchored scene, stop at its end.
  const seekTo = (seconds: number, play = true) => {
    const video = videoRef.current;
    if (!video) return;
    if (video.readyState === 0) {
      setPendingSeek(Math.max(0, seconds));
      return;
    }
    video.currentTime = Math.max(0, Math.min(movie.durationSeconds, seconds));
    if (play) void video.play();
  };
  const openEvidence = () => {
    setVideoMode('evidence');
    seekTo(question.window.start);
  };
  const browseWholeFilm = () => setVideoMode('full');
  const jumpToAnchor = () => {
    setVideoMode('evidence');
    seekTo(question.anchor.start);
  };

  const completedCount = Object.values(annotations).filter(
    (item) => item.status === 'complete',
  ).length;
  const flaggedCount = Object.values(annotations).filter(
    (item) => item.flagged,
  ).length;
  const invalidCount = Object.values(annotations).filter(
    (item) => item.question_verification.overall === 'remove_replace',
  ).length;
  const answerCorrectionCount = Object.values(annotations).filter((item) =>
    ['minor_revision', 'replace'].includes(item.answer_verification.overall),
  ).length;
  const unsupportedClaims = Object.values(annotations).reduce(
    (sum, item) =>
      sum +
      Object.values(item.claim_verification).filter((claim) =>
        ['unsupported', 'contradicted'].includes(claim.support),
      ).length,
    0,
  );
  // 150 questions with a dozen required fields each: too much to re-derive on
  // every keystroke.
  const unansweredCount = useMemo(
    () =>
      studyQuestions.reduce(
        (sum, item) =>
          sum + validationErrors(annotations[item.id], item).length,
        0,
      ),
    [annotations],
  );
  const progress = Math.round((completedCount / studyQuestions.length) * 100);
  // currentTime is now absolute film time, so it can be shown as-is.
  const displayTime = currentTime;

  const groupedQuestions = useMemo(
    () =>
      movies.map((item) => ({
        movie: item,
        questions: studyQuestions
          .map((entry, index) => ({ entry, index }))
          .filter(({ entry }) => entry.movieId === item.id),
      })),
    [],
  );
  const completedByMovie = useMemo(
    () =>
      Object.fromEntries(
        groupedQuestions.map(({ movie: item, questions: items }) => [
          item.id,
          items.filter(
            ({ entry }) => annotations[entry.id]?.status === 'complete',
          ).length,
        ]),
      ),
    [annotations, groupedQuestions],
  );
  const movieQuestions = groupedQuestions.find(
    (group) => group.movie.id === question.movieId,
  );
  const positionInMovie =
    (movieQuestions?.questions.findIndex(
      ({ index }) => index === currentIndex,
    ) ?? 0) + 1;
  const groupOpen = (movieId: string) =>
    openGroups[movieId] ?? movieId === question.movieId;
  const toggleGroup = (movieId: string) =>
    setOpenGroups((current) => ({
      ...current,
      [movieId]: !(current[movieId] ?? movieId === question.movieId),
    }));
  const forceSave = () => {
    const timedAnnotations = accrueCurrentQuestionTime();
    setAnnotations(timedAnnotations);
    const stored = writeStorage(STORAGE_KEY, JSON.stringify(timedAnnotations));
    setDirty(!stored);
    setSaveLabel(stored ? 'Draft saved just now' : 'Draft could not be saved');
    return stored;
  };
  const saveAndExit = () => {
    forceSave();
    setExitOpen(true);
  };
  // A study this long runs over many sittings, and the draft lives only in
  // this browser, so nudge for an off-browser copy as the work piles up.
  const backupDue =
    completedCount >= BACKUP_PROMPT_EVERY &&
    completedCount % BACKUP_PROMPT_EVERY === 0 &&
    backupPromptAt < completedCount &&
    completedCount < studyQuestions.length;
  const toggleFlag = () =>
    updateAnnotation(question.id, (current) => ({
      ...current,
      flagged: !current.flagged,
    }));

  const buildPayload = (kind: 'draft' | 'final') => ({
    export_schema_version: EXPORT_SCHEMA_VERSION,
    participant_id: participantId,
    study: 'videoqa-dataset-verification',
    export_kind: kind,
    exported_at: new Date().toISOString(),
    question_set: {
      dataset: studySource.dataset,
      released_records: studySource.released_records,
      dataset_sha256: studyIntegrity.dataset_sha256,
      questions_sha256: studyIntegrity.questions_sha256,
      question_count: studyQuestions.length,
      q_type_counts: Object.fromEntries(
        [...new Set(studyQuestions.map((item) => item.qType))]
          .sort()
          .map((qType) => [
            qType,
            studyQuestions.filter((item) => item.qType === qType).length,
          ]),
      ),
      selection_tier_counts: Object.fromEntries(
        [...new Set(studyQuestions.map((item) => item.selectionTier))]
          .sort((left, right) => left - right)
          .map((tier) => [
            String(tier),
            studyQuestions.filter((item) => item.selectionTier === tier).length,
          ]),
      ),
    },
    questions_total: studyQuestions.length,
    questions_complete: completedCount,
    unanswered_required_fields: unansweredCount,
    // Which films the reviewer actually had while judging, so an odd result can
    // be traced to missing or wrong media later.
    media_folder: {
      attached: folderState === 'ready',
      films_found: foundFilms.length,
      films_expected: movies.length,
      missing: missingFilms.map((item) => item.file),
      files: Object.fromEntries(
        foundFilms.map((item) => [
          item.file,
          {
            bytes: mediaFiles.get(item.file)?.size ?? 0,
            expected_runtime_seconds: item.durationSeconds,
          },
        ]),
      ),
    },
    annotations: studyQuestions.map((item) => ({
      ...annotationsRef.current[item.id],
      participant_id: participantId,
      movie_id: item.movieId,
      question_id: item.id,
      q_type: item.qType,
      question_category: item.category,
      selection_tier: item.selectionTier,
      holder: item.holder,
      anchor_scene_id: item.anchor.sceneId,
      anchor_start_seconds: item.anchor.start,
      anchor_end_seconds: item.anchor.end,
    })),
  });

  // The downloaded file is the only copy the research team receives, so the
  // anchor is attached to the document and the blob URL outlives the click.
  const downloadPayload = (kind: 'draft' | 'final') => {
    let payload = JSON.stringify(buildPayload(kind), null, 2);
    if (kind === 'final' && finalPayloadJson) {
      try {
        payload = JSON.stringify(JSON.parse(finalPayloadJson), null, 2);
      } catch {
        // Fall back to the current in-memory state if stored JSON is corrupt.
      }
    }
    const blob = new Blob([payload], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `videoqa-verification-${fileSafeId(participantId)}${
      kind === 'draft' ? '-draft' : ''
    }-${new Date().toISOString().slice(0, 10)}.json`;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    if (kind === 'final') setResponsesDownloaded(true);
  };

  const finalSubmit = () => {
    if (!finalConfirmed || unansweredCount > 0) return;
    if (!forceSave()) return;
    const payload = JSON.stringify(buildPayload('final'));
    if (!writeStorage(FINAL_SUBMISSION_KEY, payload)) {
      setSaveLabel('Final submission could not be saved');
      return;
    }
    setFinalPayloadJson(payload);
    setStudySubmitted(true);
  };

  // The stored participant ID is only readable after mount, so the first paint
  // matches the server and the gate never flashes for a returning reviewer.
  if (!mounted)
    return (
      <main className="gate-shell" aria-busy="true">
        <p className="gate-boot">Loading study…</p>
      </main>
    );
  if (!participantId)
    return <ParticipantGate participantId={assignedId} onStart={startStudy} />;

  return (
    <TooltipProvider>
      <main className="study-shell">
        <header className="study-header">
          <div className="brand-mark">VQ</div>
          <div>
            <p className="eyebrow">Research study</p>
            <h1>VideoQA Dataset Verification</h1>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="review-link"
            onClick={() => setReviewOpen(true)}
          >
            <ListChecks /> Review study
          </Button>
          <div className="participant-chip">
            <span>Participant</span>
            <strong>{participantId}</strong>
          </div>
        </header>

        <div className="study-grid">
          <aside className="nav-panel">
            <div className="movie-summary">
              <img src={asset(movie.poster)} alt={`${movie.title} poster`} />
              <div>
                <p className="eyebrow">Current title</p>
                <h2>{movie.title}</h2>
                <p>
                  Question {positionInMovie} of{' '}
                  {movieQuestions?.questions.length} here · {currentIndex + 1}{' '}
                  of {studyQuestions.length} overall
                </p>
              </div>
            </div>
            <Progress
              value={progress}
              aria-label={`Study is ${progress} percent complete`}
            />
            <div className="progress-copy">
              <span>
                {completedCount} of {studyQuestions.length} complete
              </span>
              <strong>{progress}%</strong>
            </div>
            <nav aria-label="Assigned questions" className="question-list">
              {groupedQuestions.map(
                ({ movie: listMovie, questions: listQuestions }) => (
                  <div className="question-group" key={listMovie.id}>
                    <button
                      className="group-toggle"
                      onClick={() => toggleGroup(listMovie.id)}
                      aria-expanded={groupOpen(listMovie.id)}
                    >
                      <ChevronRight
                        className={
                          groupOpen(listMovie.id)
                            ? 'group-caret open'
                            : 'group-caret'
                        }
                      />
                      <span className="eyebrow">{listMovie.title}</span>
                      <small
                        className={
                          completedByMovie[listMovie.id] ===
                          listQuestions.length
                            ? 'group-count done'
                            : 'group-count'
                        }
                      >
                        {completedByMovie[listMovie.id]}/{listQuestions.length}
                      </small>
                    </button>
                    {groupOpen(listMovie.id) &&
                      listQuestions.map(({ entry, index }) => {
                        const itemAnnotation = annotations[entry.id];
                        const status = itemAnnotation.flagged
                          ? 'Flagged'
                          : itemAnnotation.status === 'complete'
                            ? 'Complete'
                            : itemAnnotation.status === 'in_progress'
                              ? 'In progress'
                              : 'Not started';
                        return (
                          <button
                            className={
                              index === currentIndex
                                ? 'question-row active'
                                : 'question-row'
                            }
                            key={entry.id}
                            onClick={() => goToQuestion(index)}
                            aria-current={
                              index === currentIndex ? 'step' : undefined
                            }
                          >
                            <span>{String(index + 1).padStart(2, '0')}</span>
                            <div>
                              <strong>{entry.question}</strong>
                              <small>{status}</small>
                            </div>
                            {itemAnnotation.flagged ? (
                              <Flag className="flag-status" />
                            ) : itemAnnotation.status === 'complete' ? (
                              <CheckCircle2 className="complete-status" />
                            ) : itemAnnotation.status === 'in_progress' ? (
                              <Clock3 />
                            ) : (
                              <Circle className="not-started-status" />
                            )}
                          </button>
                        );
                      })}
                  </div>
                ),
              )}
            </nav>
            <Button
              variant="outline"
              className="mt-auto w-full"
              onClick={saveAndExit}
            >
              <Save /> Save and exit
            </Button>
          </aside>

          <section className="content-panel">
            <div className="video-toolbar">
              <div>
                <span className="mode-dot" />
                {videoMode === 'evidence'
                  ? `Anchored scene · ${formatTimestamp(question.window.start)}–${formatTimestamp(question.window.end)}`
                  : 'Browsing the whole film'}
              </div>
              <span>
                {formatTimestamp(displayTime)} /{' '}
                {formatTimestamp(movie.durationSeconds)}
              </span>
            </div>
            <div className="video-stage functional-video">
              {movieUrl ? (
                <video
                  key={movie.id}
                  ref={videoRef}
                  src={movieUrl}
                  poster={asset(movie.poster)}
                  controls
                  preload="metadata"
                  onLoadedMetadata={(event) => {
                    const video = event.currentTarget;
                    const target = pendingSeek ?? question.window.start;
                    setPendingSeek(null);
                    video.currentTime = Math.max(0, target);
                  }}
                  onTimeUpdate={(event) => {
                    const video = event.currentTarget;
                    setCurrentTime(video.currentTime);
                    // Evidence playback stops at the end of the anchored scene;
                    // browsing the film is unbounded.
                    if (
                      videoMode === 'evidence' &&
                      video.currentTime >= question.window.end
                    ) {
                      video.pause();
                      video.currentTime = question.window.end;
                    }
                  }}
                >
                  Your browser does not support HTML video.
                </video>
              ) : (
                <div className="video-placeholder">
                  <img src={asset(movie.poster)} alt="" />
                  <div>
                    <FolderOpen />
                    <strong>
                      {folderState === 'ready'
                        ? `${movie.file} is not in the attached folder`
                        : 'Attach your study media folder to watch the film'}
                    </strong>
                    <p>
                      The video stays on your computer — nothing is uploaded and
                      nothing is downloaded from this site.
                    </p>
                    <Button
                      size="sm"
                      onClick={
                        folderState === 'reconnect'
                          ? reconnectFolder
                          : attachFolder
                      }
                    >
                      <FolderOpen />
                      {folderState === 'reconnect'
                        ? 'Reconnect folder'
                        : 'Choose folder'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <div className="media-actions">
              <Button
                variant="outline"
                size="sm"
                onClick={() => seek(-10)}
                aria-label="Move video backward 10 seconds"
              >
                <SkipBack />
                10 sec
              </Button>
              <Button size="sm" onClick={openEvidence} disabled={!movieUrl}>
                <Play />
                Play anchored scene · {formatTimestamp(question.anchor.start)}–
                {formatTimestamp(question.anchor.end)}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => seek(10)}
                aria-label="Move video forward 10 seconds"
              >
                10 sec
                <SkipForward />
              </Button>
              <Button
                variant={videoMode === 'full' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={browseWholeFilm}
                disabled={!movieUrl || videoMode === 'full'}
              >
                <RotateCcw />
                Browse whole film
              </Button>
            </div>

            <output className="folder-status">
              <FolderOpen />
              {folderState === 'ready' ? (
                <span>
                  Media folder attached · {foundFilms.length} of {movies.length}{' '}
                  films found
                  {missingFilms.length > 0 &&
                    ` · missing ${missingFilms.map((item) => item.title).join(', ')}`}
                </span>
              ) : folderState === 'reconnect' ? (
                <span>
                  Your media folder needs reconnecting for this session.
                </span>
              ) : (
                <span>
                  No media folder attached. The films stay on your computer;
                  this site never uploads or downloads them.
                </span>
              )}
              <Button
                variant="outline"
                size="xs"
                onClick={
                  folderState === 'reconnect' ? reconnectFolder : attachFolder
                }
              >
                {folderState === 'ready'
                  ? 'Change folder'
                  : folderState === 'reconnect'
                    ? 'Reconnect'
                    : 'Choose folder'}
              </Button>
              {folderState === 'ready' && (
                <Button variant="ghost" size="xs" onClick={detachFolder}>
                  Forget
                </Button>
              )}
              {/* Safari and Firefox fall back to this; it cannot be persisted. */}
              <input
                ref={folderInputRef}
                type="file"
                accept="video/*"
                multiple
                hidden
                // @ts-expect-error -- webkitdirectory is not in React's typings
                webkitdirectory=""
                onChange={(event) => {
                  const files = readFileList(event.target.files);
                  setMediaFiles(files);
                  setFolderState(files.size ? 'ready' : 'none');
                }}
              />
            </output>

            <div className="resource-grid">
              <section className="resource-card transcript-card">
                <div className="resource-title">
                  <MessageSquareText />
                  <span>Transcript search</span>
                </div>
                <div className="search-input">
                  <Search />
                  <Input
                    value={transcriptQuery}
                    onChange={(event) => setTranscriptQuery(event.target.value)}
                    placeholder="Search subtitles…"
                    aria-label="Search subtitles or transcript"
                  />
                </div>
                <p>
                  {transcriptQuery
                    ? 'No transcript text is bundled for this title.'
                    : 'Transcript unavailable for this title; use video evidence.'}
                </p>
              </section>
            </div>

            <article className="dataset-card">
              <div className="question-block">
                <div className="content-line">
                  <span className="content-label question-label">Question</span>
                  <Badge variant="outline">{question.category}</Badge>
                </div>
                <h2>{question.question}</h2>
                <p className="source-id">
                  Perspective: {question.holder} · Source ID preserved
                </p>
              </div>
              <div className="answer-block">
                <div className="content-label">Reference answer</div>
                <p>{question.answer}</p>
              </div>
              <div>
                <div className="content-line">
                  <span className="content-label">
                    Atomic claims · {question.claims.length}
                  </span>
                  <span className="legend-note">
                    <span className="core-mark" />
                    Core <span className="context-mark" />
                    Context
                  </span>
                </div>
                <ol className="claim-list">
                  {question.claims.map((claim, index) => (
                    <li key={claim.id}>
                      <span>{index + 1}</span>
                      <div>
                        {claim.text}
                        <small
                          className={
                            claim.role === 'core'
                              ? 'claim-role core'
                              : 'claim-role'
                          }
                        >
                          {claim.role}
                        </small>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </article>
          </section>

          <aside className="form-panel">
            <div className="form-heading">
              <div>
                <p className="eyebrow">Verification form</p>
                <h2>Evaluate this item</h2>
              </div>
              <Button
                variant={annotation.flagged ? 'secondary' : 'ghost'}
                size="icon"
                onClick={toggleFlag}
                aria-label={
                  annotation.flagged ? 'Remove review flag' : 'Flag for review'
                }
              >
                {annotation.flagged ? <BookmarkCheck /> : <Bookmark />}
              </Button>
            </div>
            {errors.length > 0 && (
              <div className="validation-banner" role="alert">
                <AlertCircle />
                <div>
                  <strong>
                    {errors.length} required{' '}
                    {errors.length === 1 ? 'item' : 'items'} remaining
                  </strong>
                  <p>
                    {errors.slice(0, 4).join(' · ')}
                    {errors.length > 4 ? ` · +${errors.length - 4} more` : ''}
                  </p>
                </div>
              </div>
            )}
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="verification-tabs"
            >
              <TabsList className="verification-tabs-list">
                <TabsTrigger value="question">
                  <FileQuestion />
                  Question
                </TabsTrigger>
                <TabsTrigger value="answer">
                  <MessageSquareText />
                  Answer
                </TabsTrigger>
                <TabsTrigger value="claims">
                  <ListChecks />
                  Claims <Badge>{question.claims.length}</Badge>
                </TabsTrigger>
              </TabsList>
              <TabsContent value="question" className="tab-form">
                <div className="section-intro">
                  <span className="section-number">01</span>
                  <div>
                    <p className="eyebrow">Question verification</p>
                    <h3>{question.question}</h3>
                  </div>
                </div>
                <RadioQuestion
                  label="A · Clarity"
                  prompt="Is the question clearly written and understandable?"
                  value={annotation.question_verification.clarity}
                  onChange={(value) => updateQuestion('clarity', value)}
                  options={[
                    ['yes', 'Yes'],
                    ['mostly', 'Mostly, but it has a minor clarity issue'],
                    ['no', 'No'],
                  ]}
                />
                <RadioQuestion
                  label="B · Answerability"
                  prompt="Can this question be answered using information contained in the movie?"
                  value={annotation.question_verification.answerability}
                  onChange={(value) => updateQuestion('answerability', value)}
                  options={[
                    ['yes', 'Yes'],
                    ['partial_ambiguous', 'Partially or ambiguously'],
                    ['no', 'No'],
                    ['cannot_determine', 'Cannot determine'],
                  ]}
                />
                <RadioQuestion
                  label="C · Information sufficiency"
                  prompt="Does the movie provide enough information to determine a reliable answer?"
                  value={annotation.question_verification.sufficiency}
                  onChange={(value) => updateQuestion('sufficiency', value)}
                  options={[
                    ['yes', 'Yes'],
                    [
                      'missing_ambiguous',
                      'Some information is missing or ambiguous',
                    ],
                    ['no', 'No'],
                    ['cannot_determine', 'Cannot determine'],
                  ]}
                />
                <fieldset className="verification-fieldset">
                  <legend>
                    <span>D · Question issues</span>
                    <strong>
                      Does the question have any of the following problems?
                    </strong>
                  </legend>
                  <div className="checkbox-grid">
                    {questionIssueOptions.map(([value, label]) => (
                      <label className="checkbox-row" key={value}>
                        <Checkbox
                          checked={annotation.question_verification.issues.includes(
                            value,
                          )}
                          onCheckedChange={(checked) =>
                            toggleIssue(value, checked === true)
                          }
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  {annotation.question_verification.issues.includes(
                    'other',
                  ) && (
                    <Textarea
                      value={annotation.question_verification.otherIssue}
                      onChange={(event) =>
                        updateQuestion('otherIssue', event.target.value)
                      }
                      placeholder="Describe the other issue…"
                      aria-label="Other question issue"
                    />
                  )}
                </fieldset>
                <RadioQuestion
                  label="E · Overall judgment"
                  prompt="Should this question remain in the dataset?"
                  value={annotation.question_verification.overall}
                  onChange={(value) => updateQuestion('overall', value)}
                  options={[
                    ['keep', 'Keep as written'],
                    ['minor_revision', 'Keep after minor revision'],
                    ['remove_replace', 'Remove or replace'],
                    ['cannot_determine', 'Cannot determine'],
                  ]}
                />
                {annotation.question_verification.overall ===
                  'minor_revision' && (
                  <label className="text-field">
                    <span>
                      Please provide a corrected version of the question.
                    </span>
                    <Textarea
                      value={annotation.question_verification.revisedQuestion}
                      onChange={(event) =>
                        updateQuestion('revisedQuestion', event.target.value)
                      }
                    />
                  </label>
                )}
                {annotation.question_verification.overall ===
                  'remove_replace' && (
                  <label className="text-field">
                    <span>
                      Why should this question be removed or replaced?
                    </span>
                    <Textarea
                      value={annotation.question_verification.removalReason}
                      onChange={(event) =>
                        updateQuestion('removalReason', event.target.value)
                      }
                    />
                  </label>
                )}
                <label className="text-field">
                  <span>Optional question comments</span>
                  <Textarea
                    value={annotation.question_verification.comments}
                    onChange={(event) =>
                      updateQuestion('comments', event.target.value)
                    }
                    placeholder="Add context for the research team…"
                  />
                </label>
                <Button
                  className="next-section"
                  onClick={() => setActiveTab('answer')}
                >
                  Continue to answer <ArrowRight />
                </Button>
              </TabsContent>
              <TabsContent value="answer" className="tab-form">
                <div className="section-intro">
                  <span className="section-number">02</span>
                  <div>
                    <p className="eyebrow">Answer verification</p>
                    <h3 className="answer-repeat">{question.answer}</h3>
                  </div>
                </div>
                <RadioQuestion
                  label="A · Correctness"
                  prompt="How factually correct is the reference answer?"
                  value={annotation.answer_verification.correctness}
                  onChange={(value) => updateAnswer('correctness', value)}
                  options={[
                    ['fully_correct', 'Fully correct'],
                    ['mostly_correct', 'Mostly correct, with a minor error'],
                    [
                      'partially_correct',
                      'Partially correct, with an important error or omission',
                    ],
                    ['incorrect', 'Incorrect'],
                    ['cannot_determine', 'Cannot determine'],
                  ]}
                />
                <RadioQuestion
                  label="B · Relevance"
                  prompt="Is the reference answer relevant to what the question asks?"
                  value={annotation.answer_verification.relevance}
                  onChange={(value) => updateAnswer('relevance', value)}
                  options={[
                    ['yes', 'Yes'],
                    ['partially', 'Partially'],
                    ['no', 'No'],
                  ]}
                />
                <RadioQuestion
                  label="C · Completeness"
                  prompt="Does the reference answer address all parts of the question?"
                  value={annotation.answer_verification.completeness}
                  onChange={(value) => updateAnswer('completeness', value)}
                  options={[
                    ['complete', 'Complete'],
                    ['mostly_complete', 'Mostly complete'],
                    ['missing_information', 'Missing important information'],
                    [
                      'unsupported_information',
                      'Contains unnecessary or unsupported information',
                    ],
                    ['cannot_determine', 'Cannot determine'],
                  ]}
                />
                <RadioQuestion
                  label="D · Overall judgment"
                  prompt="Should this answer remain in the dataset?"
                  value={annotation.answer_verification.overall}
                  onChange={(value) => updateAnswer('overall', value)}
                  options={[
                    ['keep', 'Keep as written'],
                    ['minor_revision', 'Keep after minor revision'],
                    ['replace', 'Replace'],
                    ['cannot_determine', 'Cannot determine'],
                  ]}
                />
                {['minor_revision', 'replace'].includes(
                  annotation.answer_verification.overall,
                ) && (
                  <label className="text-field">
                    <span>Please provide a corrected reference answer.</span>
                    <Textarea
                      value={annotation.answer_verification.revisedAnswer}
                      onChange={(event) =>
                        updateAnswer('revisedAnswer', event.target.value)
                      }
                    />
                  </label>
                )}
                <label className="text-field">
                  <span>Optional answer comments</span>
                  <Textarea
                    value={annotation.answer_verification.comments}
                    onChange={(event) =>
                      updateAnswer('comments', event.target.value)
                    }
                    placeholder="Add context for the research team…"
                  />
                </label>
                <div className="section-nav">
                  <Button
                    variant="outline"
                    onClick={() => setActiveTab('question')}
                  >
                    <ArrowLeft />
                    Question
                  </Button>
                  <Button onClick={() => setActiveTab('claims')}>
                    Continue to claims <ArrowRight />
                  </Button>
                </div>
              </TabsContent>
              <TabsContent value="claims" className="tab-form claim-tab">
                <div className="section-intro">
                  <span className="section-number">03</span>
                  <div>
                    <p className="eyebrow">Atomic-claim verification</p>
                    <h3>
                      Evaluate every claim independently against the movie.
                    </h3>
                  </div>
                </div>
                <div className="support-legend">
                  <span className="supported">Supported</span>
                  <span className="partial">Partial</span>
                  <span className="unsupported">Unsupported</span>
                  <span className="contradicted">Contradicted</span>
                </div>
                {question.claims.map((claim, index) => {
                  const value = annotation.claim_verification[claim.id];
                  return (
                    <section
                      className={`claim-card support-${value.support || 'unset'}`}
                      key={claim.id}
                    >
                      <div className="claim-card-heading">
                        <span>{index + 1}</span>
                        <div>
                          <small>{claim.role} claim</small>
                          <h3>{claim.text}</h3>
                        </div>
                      </div>
                      <RadioQuestion
                        label="A · Understandability"
                        prompt="Is this claim clearly written and understandable on its own?"
                        value={value.understandability}
                        onChange={(next) =>
                          updateClaim(claim.id, 'understandability', next)
                        }
                        options={[
                          ['yes', 'Yes'],
                          ['mostly', 'Mostly'],
                          ['no', 'No'],
                        ]}
                      />
                      <RadioQuestion
                        label="B · Factual support"
                        prompt="How well is this claim supported by the movie?"
                        value={value.support}
                        onChange={(next) =>
                          updateClaim(claim.id, 'support', next)
                        }
                        tooltip="Supported: complete claim established. Partial: only part is established. Unsupported: evidence does not establish it. Contradicted: the movie shows it is false."
                        options={[
                          ['supported', 'Supported'],
                          ['partially_supported', 'Partially supported'],
                          ['unsupported', 'Unsupported'],
                          ['contradicted', 'Contradicted by the movie'],
                          ['cannot_determine', 'Cannot determine'],
                        ]}
                      />
                      <RadioQuestion
                        label="C · Relevance"
                        prompt="Is this claim relevant to answering the question?"
                        value={value.relevance}
                        onChange={(next) =>
                          updateClaim(claim.id, 'relevance', next)
                        }
                        options={[
                          ['relevant', 'Relevant'],
                          ['somewhat_relevant', 'Somewhat relevant'],
                          ['not_relevant', 'Not relevant'],
                        ]}
                      />
                      <div className="provided-evidence">
                        <div>
                          <Clock3 />
                          <span>Provided evidence</span>
                          <strong>
                            {formatTimestamp(question.anchor.start)}–
                            {formatTimestamp(question.anchor.end)}
                          </strong>
                        </div>
                        <div>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={openEvidence}
                            disabled={!movieUrl}
                          >
                            <Play />
                            Play scene
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={jumpToAnchor}
                            disabled={!movieUrl}
                          >
                            Jump to time
                          </Button>
                        </div>
                      </div>
                      <RadioQuestion
                        label="D · Evidence"
                        prompt="Does the provided evidence support this claim?"
                        value={value.evidence}
                        onChange={(next) =>
                          updateClaim(claim.id, 'evidence', next)
                        }
                        options={[
                          ['sufficient', 'Yes, the evidence is sufficient'],
                          [
                            'additional_context',
                            'Partially; additional context is needed',
                          ],
                          [
                            'does_not_support',
                            'No, the evidence does not support the claim',
                          ],
                          [
                            'incorrect_clip',
                            'The timestamp or clip is incorrect',
                          ],
                          ['no_evidence', 'No evidence was provided'],
                          ['cannot_determine', 'Cannot determine'],
                        ]}
                      />
                      <label className="text-field compact">
                        <span>
                          Add an alternative timestamp{' '}
                          <small>optional unless replacing evidence</small>
                        </span>
                        <Input
                          value={value.suggestedTimestamp}
                          onChange={(event) =>
                            updateClaim(
                              claim.id,
                              'suggestedTimestamp',
                              event.target.value,
                            )
                          }
                          placeholder="e.g. 00:42:18–00:42:44"
                        />
                      </label>
                      {needsClaimCorrection(value) && (
                        <RadioQuestion
                          label="E · Claim correction"
                          prompt="How should this claim be corrected?"
                          value={value.correctionAction}
                          onChange={(next) =>
                            updateClaim(claim.id, 'correctionAction', next)
                          }
                          options={[
                            ['rewrite', 'Rewrite the claim'],
                            ['remove', 'Remove the claim'],
                            ['replace_evidence', 'Replace the evidence'],
                            [
                              'cannot_verify',
                              'The claim cannot be reliably verified',
                            ],
                          ]}
                        />
                      )}
                      {value.correctionAction === 'rewrite' && (
                        <label className="text-field compact">
                          <span>Rewritten claim</span>
                          <Textarea
                            value={value.revisedClaim}
                            onChange={(event) =>
                              updateClaim(
                                claim.id,
                                'revisedClaim',
                                event.target.value,
                              )
                            }
                          />
                        </label>
                      )}
                      <label className="text-field compact">
                        <span>Optional explanation</span>
                        <Textarea
                          value={value.comments}
                          onChange={(event) =>
                            updateClaim(
                              claim.id,
                              'comments',
                              event.target.value,
                            )
                          }
                          placeholder="Explain your evidence judgment…"
                        />
                      </label>
                    </section>
                  );
                })}
                <Button
                  variant="outline"
                  onClick={() => setActiveTab('answer')}
                >
                  <ArrowLeft />
                  Back to answer
                </Button>
              </TabsContent>
            </Tabs>
            <div className="submission-bar">
              {backupDue && (
                <output className="backup-prompt">
                  <Download />
                  <span>
                    {completedCount} questions done. Keep a copy off this
                    browser.
                  </span>
                  <Button
                    size="xs"
                    onClick={() => {
                      downloadPayload('draft');
                      setBackupPromptAt(completedCount);
                    }}
                  >
                    Download
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setBackupPromptAt(completedCount)}
                  >
                    Later
                  </Button>
                </output>
              )}
              <div className="save-state">
                {dirty ? <Clock3 /> : <CheckCircle2 />}
                <span>{saveLabel}</span>
              </div>
              <div className="submission-actions">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToQuestion(currentIndex - 1)}
                  disabled={currentIndex === 0}
                >
                  <ChevronLeft />
                  Previous
                </Button>
                <Button variant="outline" size="sm" onClick={forceSave}>
                  <Save />
                  Save draft
                </Button>
                <Button
                  variant={annotation.flagged ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={toggleFlag}
                >
                  <Flag />
                  {annotation.flagged ? 'Flagged' : 'Flag for review'}
                </Button>
                <Button size="sm" onClick={() => submitCurrent(false)}>
                  Submit and continue <ChevronRight />
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </main>

      <Dialog open={exitOpen} onOpenChange={setExitOpen}>
        <DialogContent className="exit-dialog">
          <DialogHeader>
            <p className="eyebrow">Progress saved</p>
            <DialogTitle>
              {completedCount} of {studyQuestions.length} questions complete
            </DialogTitle>
            <DialogDescription>
              Your work is saved in this browser, on this device. Reopen this
              page on the same browser to pick up where you left off — clearing
              site data or switching machines loses the draft, so keep a copy.
            </DialogDescription>
          </DialogHeader>
          <div className="exit-movie-list">
            {groupedQuestions.map(({ movie: listMovie, questions: items }) => (
              <div key={listMovie.id}>
                <span>{listMovie.title}</span>
                <strong
                  className={
                    completedByMovie[listMovie.id] === items.length
                      ? 'group-count done'
                      : 'group-count'
                  }
                >
                  {completedByMovie[listMovie.id]}/{items.length}
                </strong>
              </div>
            ))}
          </div>
          <DialogFooter className="review-footer">
            <Button variant="outline" onClick={() => downloadPayload('draft')}>
              <Download />
              Download a draft copy
            </Button>
            <Button onClick={() => setExitOpen(false)}>Keep working</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent
          className="review-dialog"
          showCloseButton={!studySubmitted || responsesDownloaded}
        >
          {studySubmitted ? (
            <div className="submitted-state">
              <div className="success-mark">
                <Check />
              </div>
              <p className="eyebrow">One step left</p>
              <DialogTitle>Download your responses.</DialogTitle>
              <DialogDescription>
                Nothing was uploaded. Download the file below and send it to the
                research team — it is the only copy of your work, so please do
                this before closing the page.
              </DialogDescription>
              <Button onClick={() => downloadPayload('final')}>
                <Download />
                {responsesDownloaded
                  ? 'Download responses again'
                  : 'Download my responses'}
              </Button>
              <p
                className={
                  responsesDownloaded ? 'submitted-note done' : 'submitted-note'
                }
              >
                {responsesDownloaded
                  ? `Saved as videoqa-verification-${fileSafeId(
                      participantId,
                    )}-${new Date().toISOString().slice(0, 10)}.json. You may now close this page.`
                  : 'Your responses have not been downloaded yet.'}
              </p>
            </div>
          ) : (
            <>
              <DialogHeader>
                <p className="eyebrow">Final review</p>
                <DialogTitle>Review your study before submission</DialogTitle>
                <DialogDescription>
                  Confirm every required judgment is complete. You can return to
                  any question and revise it. When you submit, you will download
                  your responses as a single file to send to the research team.
                </DialogDescription>
              </DialogHeader>
              <div className="review-stats">
                <div>
                  <strong>{completedCount}</strong>
                  <span>Questions complete</span>
                </div>
                <div>
                  <strong>{flaggedCount}</strong>
                  <span>Flagged for review</span>
                </div>
                <div>
                  <strong>{invalidCount}</strong>
                  <span>Questions judged invalid</span>
                </div>
                <div>
                  <strong>{answerCorrectionCount}</strong>
                  <span>Answers need correction</span>
                </div>
                <div>
                  <strong>{unsupportedClaims}</strong>
                  <span>Unsupported or contradicted claims</span>
                </div>
                <div
                  className={
                    unansweredCount ? 'review-warning' : 'review-ready'
                  }
                >
                  <strong>{unansweredCount}</strong>
                  <span>Unanswered required fields</span>
                </div>
              </div>
              {unansweredCount > 0 && (
                <div className="review-callout">
                  <AlertCircle />
                  <p>
                    <strong>The study is not ready to submit.</strong> Finish
                    the remaining required fields, then return here.
                  </p>
                </div>
              )}
              <label className="confirmation-row">
                <Checkbox
                  checked={finalConfirmed}
                  onCheckedChange={(checked) =>
                    setFinalConfirmed(checked === true)
                  }
                  disabled={unansweredCount > 0}
                />
                <span>
                  I confirm that I reviewed these annotations and am ready to
                  submit them.
                </span>
              </label>
              <DialogFooter className="review-footer">
                <Button
                  variant="outline"
                  onClick={() => downloadPayload('draft')}
                >
                  <Download />
                  Download draft copy
                </Button>
                <Button
                  onClick={finalSubmit}
                  disabled={unansweredCount > 0 || !finalConfirmed}
                >
                  Submit final study
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
