// The Access object in docs/openapi.yaml: whether the student may use the
// app. They may while any institute list they're on has a subscription
// covering today; otherwise the paywall shows `message`.
// reason: not_subscribed | pending_approval (they asked to join an institute
// they aren't on the list of, and an admin hasn't approved it yet)
export const INACTIVE_MESSAGE = "Your account is INACTIVE your school hasn't subscribed yet";
export const PENDING_MESSAGE = 'Your account is waiting for approval from your institute';
const MESSAGES = { not_subscribed: INACTIVE_MESSAGE, pending_approval: PENDING_MESSAGE };

export class AccessDTO {
  constructor({ hasAccess, reason = null, institute = null, endsAt = null }) {
    this.has_access = hasAccess;
    this.source = hasAccess ? 'institute' : null;
    this.reason = reason;
    this.message = hasAccess ? null : MESSAGES[reason] || INACTIVE_MESSAGE;
    // The institute whose subscription covers them (when they have access),
    // the one they're waiting on (pending_approval), else the one their
    // account shows.
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

  static pending(institute) {
    return new AccessDTO({ hasAccess: false, reason: 'pending_approval', institute });
  }
}
