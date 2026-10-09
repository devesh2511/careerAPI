// The student-facing contest objects in docs/openapi.yaml: Contest,
// PublicQuestion, Rank and LeaderboardRow. Nothing here ever carries
// another student's email or id.
import { StudentDTO } from './StudentDTO.js';

export const QUESTION_COUNT = 5;
export const POINTS_PER_QUESTION = 10;

// row: a contest with state (upcoming | open | closed) from the query.
export class ContestDTO {
  constructor(row) {
    this.id = row.id;
    this.number = row.id;
    this.opens_at = row.opens_at;
    this.closes_at = row.closes_at;
    this.status = row.state;
    this.question_count = QUESTION_COUNT;
    this.points_per_question = POINTS_PER_QUESTION;
  }

  static orNull(row) { return row ? new ContestDTO(row) : null; }
}

// Without correct_index or explanation — safe while the contest is open.
export class PublicQuestionDTO {
  constructor(q) {
    this.id = q.id;
    this.area = q.area;
    this.text = q.text;
    this.options = q.options;
  }
}

// With the answer, only after close.
export class ReviewQuestionDTO extends PublicQuestionDTO {
  constructor(q) {
    super(q);
    this.correct_index = q.correct_index;
    this.explanation = q.explanation;
    this.your_index = q.your_index ?? null;
  }
}

export const rankOrNull = (rank, total) => (rank == null ? null : { rank, total });

// The emoji the leaderboard shows next to a career. Careers are free text
// from the frontend's list, so unknown ones get the default.
const CAREER_EMOJI = {
  Architect: '🏛️', Engineer: '⚙️', 'Software Engineer': '💻', 'Data Scientist': '📊',
  Doctor: '🩺', Nurse: '🩹', Pharmacist: '💊', Scientist: '🔬', Teacher: '🍎',
  Lawyer: '⚖️', Accountant: '🧾', 'Chartered Accountant': '🧾', Entrepreneur: '🚀',
  Designer: '🎨', 'Graphic Designer': '🎨', Artist: '🎨', Musician: '🎵', Writer: '✍️',
  Journalist: '📰', Psychologist: '🧠', Pilot: '✈️', Chef: '👨‍🍳', Athlete: '🏅',
};
export const careerEmoji = career => (career && CAREER_EMOJI[career]) || '🎯';

// row: a board row from leaderboard.repository.js. contests is set on the
// Live board only.
export class LeaderboardRowDTO {
  constructor(row, live) {
    this.rank = row.rank;
    this.name = StudentDTO.leaderboardName(row.full_name);
    this.career = row.current_career;
    this.career_emoji = careerEmoji(row.current_career);
    this.score = row.score;
    this.correct = row.correct;
    this.total_questions = QUESTION_COUNT * (live ? row.contests : 1);
    this.time_taken_s = row.time_taken_s;
    if (live) this.contests = row.contests;
    this.is_me = row.is_me;
  }
}
