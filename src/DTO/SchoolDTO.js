// The School object in docs/openapi.yaml, as the admin panel sees it.
export class SchoolDTO {
  constructor(row) {
    this.id = row.id;
    this.name = row.name;
    this.school_code = row.school_code;
    this.udise_code = row.udise_code;
    this.board = row.board;
    this.city = row.city;
    this.state = row.state;
    this.status = row.status;
    this.contact_name = row.contact_name;
    this.contact_email = row.contact_email;
    this.contact_phone = row.contact_phone;
    this.is_deleted = row.is_deleted;
    this.deleted_at = row.deleted_at;
    this.created_at = row.created_at;
    this.updated_at = row.updated_at;
    this.roster_count = row.roster_count;
    this.student_count = row.student_count;
    // The current plan, else the latest one, else null. row_to_json gives
    // '…+00:00'; the API always sends '…Z'.
    const sub = row.subscription;
    this.subscription = sub
      ? { active: sub.active, plan: sub.plan, ends_at: new Date(sub.ends_at).toISOString() }
      : null;
  }
}
