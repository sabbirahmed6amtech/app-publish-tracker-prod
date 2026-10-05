export type Platform = "play_store" | "app_store";

/** How far the client's invite to their store account has got. */
export type AccessStatus = "pending" | "requested" | "granted";
export type AccountType = "organization" | "personal";
export type AppStatus =
  | "ongoing"
  | "in_review"
  | "closed_testing"
  | "rejected"
  | "production"
  | "on_hold";

/** Someone work can be assigned to. Every login gets one automatically. */
export type TeamMember = {
  id: string;
  user_id: string | null;
  /** The email their login signs in with, when they have one. */
  login_email?: string | null;
  name: string;
  email: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type Client = {
  id: string;
  ticket: string;
  name: string;
  note: string | null;
  archived: boolean;
  /** Play Console details shared by every app of this client. */
  play_privacy_url: string | null;
  play_delete_account_url: string | null;
  play_contact_email: string | null;
  play_listing_email: string | null;
  play_contact_phone: string | null;
  play_website: string | null;
  play_default_language: string | null;
  /** App Store Connect details shared by every App Store app of this client. */
  store_support_url: string | null;
  store_marketing_url: string | null;
  review_contact_first_name: string | null;
  review_contact_last_name: string | null;
  review_contact_phone: string | null;
  review_contact_email: string | null;
  /** The client intake form's private link token; null when there's no link. */
  intake_token: string | null;
  intake_submitted_at: string | null;
  /** What the client tells us through the intake form. */
  business_name: string | null;
  tagline: string | null;
  primary_market: string | null;
  service_area: string | null;
  business_model: string | null;
  future_modules: string | null;
  play_account_type: string | null;
  play_access_email: string | null;
  play_access_status: AccessStatus;
  apple_account_type: string | null;
  apple_access_email: string | null;
  apple_access_status: AccessStatus;
  created_at: string;
  updated_at: string;
};

export type PublisherAccount = {
  id: string;
  client_id: string;
  platform: Platform;
  account_name: string;
  account_type: AccountType;
  note: string | null;
  /** How the team gets in, as the client told us through the intake form. */
  access_method: AccessMethod | null;
  /** The address the client invited, or the login when they share it. */
  access_email: string | null;
  /** The shared login's password — team-only, like keystore passwords. */
  login_password: string | null;
  created_at: string;
  updated_at: string;
};

/** invite: the client added the team to the account. login: they share its login. */
export type AccessMethod = "invite" | "login";

/** A product the team sells (6amMart, StackFood …), with its projects and logo. */
export type ProductLine = {
  id: string;
  name: string;
  logo_path: string | null;
  /** Public URL of the logo, resolved on the server. */
  logo_url: string | null;
  sort_order: number;
  projects: string[];
};

/** What an app shows for its product line: the line's name and logo. */
export type LineBadge = { line: string; logo: string | null };

/** One of a client's permanent apps — set up once, submitted every release. */
export type Product = {
  id: string;
  client_id: string;
  account_id: string;
  project_name: string;
  app_name: string;
  keystore_id: string | null;
  store_url: string | null;
  note: string | null;
  sort_order: number;
  archived: boolean;
  /** What Play Console needs for this app. */
  package_name: string | null;
  play_category: string | null;
  short_description: string | null;
  long_description: string | null;
  demo_instructions: string | null;
  demo_login: string | null;
  demo_password: string | null;
  demo_details: string | null;
  /** App Store Connect listing; package_name holds the bundle ID. */
  ios_sku: string | null;
  ios_subtitle: string | null;
  ios_keywords: string | null;
  ios_promo_text: string | null;
  ios_primary_category: string | null;
  ios_secondary_category: string | null;
  ios_copyright: string | null;
  /** From the client intake form: where to publish, and links to the artwork. */
  publishing_countries: string | null;
  feature_graphic_url: string | null;
  screenshots_url: string | null;
  icon_url: string | null;
  /** The client's own note from the intake form; `note` stays the team's. */
  client_note: string | null;
  /** Store Watch (016): what the store's public page says. null = never checked. */
  store_live: boolean | null;
  store_version: string | null;
  store_updated_at: string | null;
  store_checked_at: string | null;
  store_error: string | null;
  created_at: string;
  updated_at: string;
};

/** The signing keystore a client's apps share. */
export type Keystore = {
  id: string;
  client_id: string;
  name: string;
  details: string | null;
  file_path: string | null;
  file_name: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

/** One versioned release for one client. */
export type Release = {
  id: string;
  client_id: string;
  version: string | null;
  title: string | null;
  assigned_to: string | null;
  note: string | null;
  started_on: string;
  released_on: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * One submission of a product in one release. The identity fields (project,
 * app name, account, keystore, store link) mirror the product.
 */
export type App = {
  id: string;
  release_id: string;
  product_id: string;
  account_id: string;
  project_name: string;
  app_name: string;
  status: AppStatus;
  assigned_to: string | null;
  build_version: string | null;
  flutter_version: string | null;
  keystore_id: string | null;
  /** Legacy — superseded by keystore_id. */
  jks: string | null;
  store_url: string | null;
  note: string | null;
  sort_order: number;
  status_changed_at: string;
  created_at: string;
  updated_at: string;
};

export type AppEvent = {
  id: string;
  app_id: string;
  kind: string;
  from_status: AppStatus | null;
  to_status: AppStatus | null;
  message: string | null;
  actor: string | null;
  created_at: string;
};

export type ReleaseWithApps = Release & { apps: App[] };

export type ClientFull = Client & {
  publisher_accounts: PublisherAccount[];
  keystores: Keystore[];
  products: Product[];
  releases: ReleaseWithApps[];
};

/** One flattened row per app — everything about it, for the sheet view. */
export type AppRow = App & {
  client_id: string;
  ticket: string;
  client_name: string;
  release_version: string | null;
  release_title: string | null;
  release_label: string;
  release_started_on: string;
  release_note: string | null;
  /** Resolved display names, so tables and CSV do not each re-join. */
  assignee_name: string | null;
  release_assignee_name: string | null;
  platform: Platform;
  account_name: string;
  account_type: AccountType;
};

/** A release's state, derived from its apps rather than stored. */
export type ReleaseState =
  | "empty"
  | "in_progress"
  | "attention"
  | "waiting"
  | "complete";

/** What the client intake form shows: shared store details and each app's listing. */
export type IntakeClientFields = {
  play_privacy_url: string | null;
  play_delete_account_url: string | null;
  play_contact_email: string | null;
  play_listing_email: string | null;
  play_contact_phone: string | null;
  play_website: string | null;
  play_default_language: string | null;
  store_support_url: string | null;
  store_marketing_url: string | null;
  review_contact_first_name: string | null;
  review_contact_last_name: string | null;
  review_contact_phone: string | null;
  review_contact_email: string | null;
  business_name: string | null;
  tagline: string | null;
  primary_market: string | null;
  service_area: string | null;
  business_model: string | null;
  future_modules: string | null;
  play_account_type: string | null;
  play_access_email: string | null;
  play_access_status: AccessStatus;
  apple_account_type: string | null;
  apple_access_email: string | null;
  apple_access_status: AccessStatus;
};

export type IntakeApp = {
  id: string;
  project_name: string;
  platform: Platform;
  app_name: string;
  package_name: string | null;
  play_category: string | null;
  short_description: string | null;
  long_description: string | null;
  demo_instructions: string | null;
  demo_login: string | null;
  /** Never the password itself — only whether one is saved. */
  has_demo_password: boolean;
  demo_details: string | null;
  ios_subtitle: string | null;
  ios_keywords: string | null;
  ios_promo_text: string | null;
  ios_primary_category: string | null;
  ios_secondary_category: string | null;
  ios_copyright: string | null;
  publishing_countries: string | null;
  feature_graphic_url: string | null;
  screenshots_url: string | null;
  icon_url: string | null;
  client_note: string | null;
  line: string | null;
  logo: string | null;
  /** The product line's generic store listing for this app role, if one is set. */
  std_short: string | null;
  std_long: string | null;
};

/** A store account as the intake form sees it — never its password. */
export type IntakeAccount = {
  id: string;
  platform: Platform;
  account_name: string;
  account_type: AccountType;
  access_method: AccessMethod | null;
  access_email: string | null;
  has_login_password: boolean;
};

export type Intake = {
  name: string;
  ticket: string;
  submitted_at: string | null;
  client: IntakeClientFields;
  accounts: IntakeAccount[];
  apps: IntakeApp[];
};

export type SupportArticle = {
  id: string;
  category: string;
  title: string;
  body: string;
  sort_order: number;
};
