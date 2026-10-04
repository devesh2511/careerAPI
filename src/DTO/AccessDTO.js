// The Access object in docs/openapi.yaml: whether the student may use the
// app, who is paying, and — when not — the reason the paywall shows.
// reason: no_school | not_on_roster | school_not_subscribed
export class AccessDTO {
  constructor({ hasAccess, source = null, reason = null, school = null, endsAt = null, plan = null }) {
    this.has_access = hasAccess;
    this.source = source;
    this.reason = reason;
    this.school = school;
    // row_to_json gives '…+00:00'; the API always sends '…Z'.
    this.ends_at = endsAt ? new Date(endsAt).toISOString() : null;
    this.plan = plan;
  }

  static granted(source, school, plan) {
    return new AccessDTO({ hasAccess: true, source, school, endsAt: plan.ends_at, plan: plan.plan });
  }

  static denied(reason, school) {
    return new AccessDTO({ hasAccess: false, reason, school });
  }
}
