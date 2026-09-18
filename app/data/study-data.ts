import studyQuestionsJson from './study-questions.json';

export type Movie = {
  id: string;
  title: string;
  poster: string;
  /** Filename the app looks for in the participant's attached media folder. */
  file: string;
  durationSeconds: number;
};

export type Claim = {
  id: string;
  text: string;
  role: 'core' | 'context';
};

export type StudyQuestion = {
  id: string;
  movieId: string;
  qType: string;
  category: string;
  holder: string;
  question: string;
  answer: string;
  anchor: { sceneId: string; start: number; end: number };
  /** Absolute seconds into the film: the anchored scene plus five either side. */
  window: { start: number; end: number };
  claims: Claim[];
  /** Which eligibility tier the item was selected under; 1 is the strict bar. */
  selectionTier: number;
};

type StudyData = {
  source: Record<string, string | number>;
  movies: Movie[];
  questions: StudyQuestion[];
};

// scripts/select_study_items.py writes this file from dataset.jsonl. The cast
// widens the JSON's literal types (role, for one) to the study types.
const studyData = studyQuestionsJson as unknown as StudyData;

export const movies: Movie[] = studyData.movies;
export const studyQuestions: StudyQuestion[] = studyData.questions;

export const movieById: Record<string, Movie> = Object.fromEntries(
  movies.map((movie) => [movie.id, movie]),
);
