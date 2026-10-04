// What register and login return (docs/openapi.yaml → SessionResponse).
// The session token itself goes in a cookie, never in the body.
export class SessionResponse {
  constructor(student, access) {
    this.student = student;   // StudentDTO
    this.access = access;     // AccessDTO
  }
}
