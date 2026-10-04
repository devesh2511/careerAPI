// The AdminRef and Admin objects in docs/openapi.yaml.
export class AdminRefDTO {
  constructor(row) {
    this.id = row.id;
    this.email = row.email;
    this.full_name = row.full_name;
  }
}

// One row of the admin list; is_me marks the admin asking.
export class AdminDTO extends AdminRefDTO {
  constructor(row, meId) {
    super(row);
    this.last_login_at = row.last_login_at;
    this.is_deleted = row.is_deleted;
    this.deleted_at = row.deleted_at;
    this.created_at = row.created_at;
    this.is_me = row.id === meId;
  }
}
