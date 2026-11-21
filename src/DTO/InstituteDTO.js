// The Institute object in docs/openapi.yaml, as the admin panel sees it.
export class InstituteDTO {
  constructor(row) {
    this.id = row.id;
    this.institute_code = row.institute_code;
    this.type = row.type;
    this.name = row.name;
    this.address = row.address;
    this.city = row.city;
    this.contact_details = row.contact_details;
    this.status = row.status;
    this.accepts_requests = row.accepts_requests;
    this.is_deleted = row.is_deleted;
    this.deleted_at = row.deleted_at;
    this.created_at = row.created_at;
    this.updated_at = row.updated_at;
    this.list_count = row.list_count;
    this.registered_count = row.registered_count;
    // Join requests waiting for an admin.
    this.pending_count = row.pending_count;
    // Pilot mode (020_pilot_mode.sql). live: students not on the list can
    // take a seat now. used: seats taken by pilot students not yet on a
    // subscription.
    this.pilot = {
      mode: row.pilot_mode,
      live: Boolean(row.pilot_live),
      ends_at: row.pilot_ends_at ? new Date(row.pilot_ends_at).toISOString() : null,
      seats: {
        class9: { limit: row.pilot_seats_class9, used: row.pilot_used_class9 ?? 0 },
        class10: { limit: row.pilot_seats_class10, used: row.pilot_used_class10 ?? 0 },
      },
    };
    // The current subscription, else the latest one, else null. row_to_json
    // gives '…+00:00'; the API always sends '…Z'.
    const s = row.subscription;
    this.subscription = s
      ? {
        id: s.id, active: s.active, head_count: s.head_count, paid: s.paid,
        starts_at: new Date(s.starts_at).toISOString(), ends_at: new Date(s.ends_at).toISOString(),
      }
      : null;
  }
}
