// The Access object in docs/openapi.yaml: whether the student may use the
// app. They may while any institute list they're on has a subscription
// covering today; otherwise the paywall shows `message`.
// reason: not_subscribed
export const INACTIVE_MESSAGE = "Your account is INACTIVE your school hasn't subscribed yet";

export class AccessDTO {
  constructor({ hasAccess, reason = null, institute = null, endsAt = null }) {
    this.has_access = hasAccess;
    this.source = hasAccess ? 'institute' : null;
    this.reason = reason;
    this.message = hasAccess ? null : INACTIVE_MESSAGE;
    // The institute whose subscription covers them (when they have access),
    // else the one their account shows.
    this.institute = institute;
    // row_to_json gives '…+00:00'; the API always sends '…Z'.
    this.ends_at = endsAt ? new Date(endsAt).toISOString() : null;
  }

  static granted(plan) {
    return new AccessDTO({
      hasAccess: true, endsAt: plan.ends_at,
      institute: { name: plan.name, institute_code: plan.institute_code },
    });
  }

  static denied(institute) {
    return new AccessDTO({ hasAccess: false, reason: 'not_subscribed', institute });
  }
}
