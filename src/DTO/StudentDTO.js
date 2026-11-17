// The Student object in docs/openapi.yaml: a user_metadata row. Only ever
// sent to the student themself (or an admin), so it may include the phone
// and email.
export class StudentDTO {
  constructor(row, institute) {
    this.id = row.id;
    this.username = row.username;
    this.full_name = row.name;
    this.leaderboard_name = StudentDTO.leaderboardName(row.name);
    this.phone_no = row.phone_no;
    this.email = row.email;
    this.email_verified = Boolean(row.email_verified_at);
    // Their school when they're on a school's list, else the first institute
    // they registered through.
    this.institute = institute
      ? { name: institute.name, institute_code: institute.institute_code, type: institute.type }
      : null;
    this.class = row.class;
    this.board = row.board;
    this.city = row.city;
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
