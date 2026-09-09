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
  Info,
  ListChecks,
  MessageSquareText,
  Play,
  RotateCcw,
  Save,
  Search,
  SkipBack,
  SkipForward,
  Users,
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
  studyQuestions,
  type StudyQuestion,
} from './data/study-data';

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
const PARTICIPANT_ID = 'P001';

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
    participant_id: PARTICIPANT_ID,
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

function formatTimestamp(seconds: number) {
  const rounded = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  return [hours, minutes, secs]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
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

const fullMovieSources: Record<string, string> = {
  'american-fiction-2023': '/media/full/american_fiction.mp4',
  'challengers-2024': '/media/full/challengers.mp4',
  'fair-play-2023': '/media/full/fair_play.mp4',
  'poker-face-101-dead-mans-hand-2023': '/media/full/poker_face_s01e01.mp4',
};

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
  const [mounted, setMounted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const currentIndexRef = useRef(currentIndex);
  const annotationsRef = useRef(annotations);

  const question = studyQuestions[currentIndex];
  const movie = movieById[question.movieId];
  const annotation = annotations[question.id];

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored)
        setAnnotations({ ...defaultAnnotations(), ...JSON.parse(stored) });
    } catch {
      setSaveLabel('Local draft could not be restored');
    }
    setMounted(true);
  }, []);

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
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const updateAnnotation = useCallback(
    (questionId: string, updater: (value: Annotation) => Annotation) => {
      setAnnotations((current) => {
        const next = updater(current[questionId]);
        const started = next.started_at || new Date().toISOString();
        return {
          ...current,
          [questionId]: {
            ...next,
            started_at: started,
            status:
              next.status === 'complete'
                ? 'complete'
                : touched({ ...next, started_at: started })
                  ? 'in_progress'
                  : 'not_started',
          },
        };
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

  const goToQuestion = useCallback((index: number) => {
    setCurrentIndex(Math.max(0, Math.min(studyQuestions.length - 1, index)));
    setActiveTab('question');
    setVideoMode('evidence');
    setCurrentTime(0);
    setTranscriptQuery('');
    setErrors([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const submitCurrent = useCallback(
    (fromTool = false) => {
      const index = currentIndexRef.current;
      const currentQuestion = studyQuestions[index];
      const currentAnnotation = annotationsRef.current[currentQuestion.id];
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
        ...annotationsRef.current,
        [currentQuestion.id]: completed,
      };
      annotationsRef.current = nextAnnotations;
      setAnnotations(nextAnnotations);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextAnnotations));
      setDirty(false);
      setSaveLabel('Question complete · saved');
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
    [goToQuestion],
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
  const openEvidence = () => {
    setVideoMode('evidence');
    window.setTimeout(() => void videoRef.current?.play(), 80);
  };
  const jumpToAnchor = () => {
    if (videoRef.current)
      videoRef.current.currentTime =
        videoMode === 'evidence'
          ? Math.max(0, question.anchor.start - question.clip.sourceStart)
          : question.anchor.start;
    void videoRef.current?.play();
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
  const unansweredCount = studyQuestions.reduce(
    (sum, item) => sum + validationErrors(annotations[item.id], item).length,
    0,
  );
  const progress = Math.round((completedCount / studyQuestions.length) * 100);
  const sourceOffset = videoMode === 'evidence' ? question.clip.sourceStart : 0;
  const displayTime = sourceOffset + currentTime;

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
  const forceSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));
    setDirty(false);
    setSaveLabel('Draft saved just now');
  };
  const toggleFlag = () =>
    updateAnnotation(question.id, (current) => ({
      ...current,
      flagged: !current.flagged,
    }));

  const exportJson = () => {
    const payload = {
      participant_id: PARTICIPANT_ID,
      exported_at: new Date().toISOString(),
      annotations: Object.values(annotations),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `videoqa-verification-${PARTICIPANT_ID}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const finalSubmit = () => {
    if (!finalConfirmed || unansweredCount > 0) return;
    const payload = {
      participant_id: PARTICIPANT_ID,
      submitted_at: new Date().toISOString(),
      annotations: Object.values(annotations),
    };
    localStorage.setItem(
      'videoqa-study-final-submission',
      JSON.stringify(payload),
    );
    setStudySubmitted(true);
  };

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
            <strong>{PARTICIPANT_ID}</strong>
          </div>
        </header>

        <div className="study-grid">
          <aside className="nav-panel">
            <div className="movie-summary">
              <img src={movie.poster} alt={`${movie.title} poster`} />
              <div>
                <p className="eyebrow">Current title</p>
                <h2>{movie.title}</h2>
                <p>
                  Question {currentIndex + 1} of {studyQuestions.length}
                </p>
              </div>
            </div>
            <Progress
              value={progress}
              aria-label={`Study is ${progress} percent complete`}
            />
            <div className="progress-copy">
              <span>Overall progress</span>
              <strong>{progress}%</strong>
            </div>
            <nav aria-label="Assigned questions" className="question-list">
              {groupedQuestions.map(
                ({ movie: listMovie, questions: listQuestions }) => (
                  <div className="question-group" key={listMovie.id}>
                    <p className="eyebrow">{listMovie.title}</p>
                    {listQuestions.map(({ entry, index }) => {
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
              onClick={forceSave}
            >
              <Save /> Save and exit
            </Button>
          </aside>

          <section className="content-panel">
            <div className="video-toolbar">
              <div>
                <span className="mode-dot" />
                {videoMode === 'evidence'
                  ? 'Evidence clip'
                  : 'Full movie proxy'}
              </div>
              <span>
                {formatTimestamp(displayTime)} /{' '}
                {formatTimestamp(movie.durationSeconds)}
              </span>
            </div>
            <div className="video-stage functional-video">
              <video
                key={`${question.id}-${videoMode}`}
                ref={videoRef}
                src={
                  videoMode === 'evidence'
                    ? question.clip.url
                    : fullMovieSources[question.movieId]
                }
                poster={movie.poster}
                controls
                preload="metadata"
                onTimeUpdate={(event) =>
                  setCurrentTime(event.currentTarget.currentTime)
                }
              >
                Your browser does not support HTML video.
              </video>
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
              <Button size="sm" onClick={openEvidence}>
                <Play />
                Open evidence · {formatTimestamp(question.anchor.start)}–
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
                variant="ghost"
                size="sm"
                onClick={() => setVideoMode('full')}
                disabled={videoMode === 'full'}
              >
                <RotateCcw />
                Return to full movie
              </Button>
            </div>

            <div className="resource-grid">
              <section className="resource-card">
                <div className="resource-title">
                  <Users />
                  <span>Character bank</span>
                  <Badge variant="secondary">{movie.characters.length}</Badge>
                </div>
                <div className="character-strip">
                  {movie.characters.map((character) => (
                    <div className="character" key={character.id}>
                      <img src={character.image} alt={character.name} />
                      <span>{character.name}</span>
                    </div>
                  ))}
                </div>
              </section>
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
                  prompt="Does the answer directly address the question?"
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
                  prompt="Does the answer include the information needed to answer the question?"
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
                          >
                            <Play />
                            Play clip
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={jumpToAnchor}
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

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent
          className="review-dialog"
          showCloseButton={!studySubmitted}
        >
          {studySubmitted ? (
            <div className="submitted-state">
              <div className="success-mark">
                <Check />
              </div>
              <p className="eyebrow">Submission received</p>
              <DialogTitle>Thank you for completing the study.</DialogTitle>
              <DialogDescription>
                Your structured annotations are saved locally for this first
                version. You may now close this page.
              </DialogDescription>
              <Button variant="outline" onClick={exportJson}>
                <Download />
                Download submitted JSON
              </Button>
            </div>
          ) : (
            <>
              <DialogHeader>
                <p className="eyebrow">Final review</p>
                <DialogTitle>Review your study before submission</DialogTitle>
                <DialogDescription>
                  Confirm every required judgment is complete. You can return to
                  any question and revise it.
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
                <Button variant="outline" onClick={exportJson}>
                  <Download />
                  Export draft JSON
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
