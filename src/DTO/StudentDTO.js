// The Student object in docs/openapi.yaml. Only ever sent to the student
// themself (or an admin), so it may include the email.
export class StudentDTO {
  constructor(row, school) {
    this.id = row.id;
    this.full_name = row.full_name;
    this.leaderboard_name = StudentDTO.leaderboardName(row.full_name);
    this.email = row.email;
    this.school = school ? { name: school.name, school_code: school.school_code } : null;
    this.current_career = row.current_career;
    this.created_at = row.created_at;
  }

  // "Ananya Sharma" → "Ananya S." — the only name other students see (schema §2.1).
  static leaderboardName(fullName) {
    const words = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) return words[0] || '';
    return `${words[0]} ${words[words.length - 1][0].toUpperCase()}.`;
  }
}
