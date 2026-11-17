// The Profile object in docs/openapi.yaml: the student's onboarding answers.
// class, board and city come from the account (user_metadata); the rest from
// student_profiles (row null before the first onboarding answer).
export class ProfileDTO {
  constructor(row, account) {
    this.class = account.class;
    this.board = account.board;
    this.medium = row?.medium ?? null;
    this.city = account.city;
    this.marks = row?.marks ?? null;
    this.favourite_subjects = row?.favourite_subjects ?? null;
    this.hobbies = row?.hobbies ?? null;
    this.dream_job = row?.dream_job ?? null;
    this.career_preference = row?.career_preference ?? null;
    this.study_location = row?.study_location ?? null;
    this.completed_at = row?.completed_at ?? null;
  }
}
