/** Client-safe registry describing every collection the admin can browse.
 *  Field keys match the real 1Antiq MongoDB schema — see the DB backup used
 *  to derive this list. Dot-notation keys (e.g. "verification.status") read
 *  and write nested sub-documents; Mongo's $set understands them natively.
 */

export type EntityField = {
  key: string;
  label: string;
  /** Rendering + editing hint. */
  type?: "text" | "number" | "boolean" | "date" | "money" | "badge" | "image" | "json";
  /** Editable via the row editor. */
  editable?: boolean;
  /** Shown in the compact table (mobile hides everything but the first two). */
  list?: boolean;
  /** Use a <textarea> instead of a single-line input when editing. */
  multiline?: boolean;
};

export type EntityGroup =
  | "Catalog"
  | "Sellers"
  | "Orders & Fulfillment"
  | "Finance"
  | "Marketing"
  | "Customers"
  | "Reviews & Trust"
  | "Content"
  | "Support"
  | "Reports & Logs"
  | "System";

export type EntityDef = {
  key: string;
  collection: string;
  label: string;
  plural: string;
  /** lucide-react icon name. */
  icon: string;
  /** Sidebar section this collection belongs to. */
  group: EntityGroup;
  /** Fields searched by the search box. */
  search: string[];
  /** Default sort field (descending). */
  sort: string;
  fields: EntityField[];
  /** Quick filters shown as chips. */
  filters?: { label: string; query: Record<string, unknown> }[];
  /** Shown under the title on the browser page. */
  hint?: string;
};

/** Sidebar section order. */
export const GROUP_ORDER: EntityGroup[] = [
  "Catalog",
  "Sellers",
  "Orders & Fulfillment",
  "Finance",
  "Marketing",
  "Customers",
  "Reviews & Trust",
  "Content",
  "Support",
  "Reports & Logs",
  "System",
];

export const ENTITIES: EntityDef[] = [
  /* ------------------------------- Catalog ------------------------------- */
  {
    key: "products",
    collection: "products",
    label: "Product",
    plural: "Products",
    icon: "Package",
    group: "Catalog",
    search: ["name", "slug", "sku", "brand", "category"],
    sort: "created_at",
    filters: [
      { label: "Active", query: { status: "active" } },
      { label: "Featured", query: { is_featured: true } },
      { label: "Bestseller", query: { is_bestseller: true } },
      { label: "Out of stock", query: { stock: 0 } },
      { label: "Low stock", query: { stock: { $gt: 0, $lte: 5 } } },
    ],
    fields: [
      { key: "name", label: "Name", list: true, editable: true },
      { key: "slug", label: "Slug", editable: true },
      { key: "sku", label: "SKU", editable: true },
      { key: "brand", label: "Brand", editable: true },
      { key: "category", label: "Category", list: true, editable: true },
      { key: "subcategory", label: "Subcategory", editable: true },
      { key: "sub_subcategory", label: "Sub-subcategory", editable: true },
      { key: "price", label: "Price", type: "money", list: true, editable: true },
      { key: "compare_price", label: "Compare-at price", type: "money", editable: true },
      { key: "cost", label: "Cost", type: "money", editable: true },
      { key: "stock", label: "Stock", type: "number", list: true, editable: true },
      { key: "status", label: "Status", type: "badge", list: true, editable: true },
      { key: "seller", label: "Seller ID", list: true },
      { key: "is_featured", label: "Featured", type: "boolean", editable: true },
      { key: "is_bestseller", label: "Bestseller", type: "boolean", editable: true },
      { key: "is_popular", label: "Popular", type: "boolean", editable: true },
      { key: "is_sponsored", label: "Sponsored", type: "boolean", editable: true },
      { key: "sponsor_rank", label: "Sponsor rank", type: "number", editable: true },
      { key: "free_shipping", label: "Free shipping", type: "boolean", editable: true },
      { key: "handmade", label: "Handmade", type: "boolean", editable: true },
      { key: "returns_accepted", label: "Returns accepted", type: "boolean", editable: true },
      { key: "rating", label: "Rating", type: "number" },
      { key: "review_count", label: "Reviews", type: "number" },
      { key: "view_count", label: "Views", type: "number" },
      { key: "views", label: "Views (legacy)", type: "number" },
      { key: "cart_count", label: "In carts", type: "number" },
      { key: "favourite_count", label: "Favourited", type: "number" },
      { key: "wishlist_count", label: "Wishlisted", type: "number" },
      { key: "short_description", label: "Short description", editable: true, multiline: true },
      { key: "description", label: "Description", editable: true, multiline: true },
      { key: "material", label: "Material", editable: true },
      { key: "color", label: "Color", editable: true },
      { key: "weight_grams", label: "Weight (g)", type: "number", editable: true },
      { key: "processing_time", label: "Processing time", editable: true },
      { key: "country_of_origin", label: "Country of origin", editable: true },
      { key: "images", label: "Images", type: "json" },
      { key: "videos", label: "Videos", type: "json" },
      { key: "tags", label: "Tags", type: "json", editable: true },
      { key: "keywords", label: "Keywords", type: "json", editable: true },
      { key: "variants", label: "Variants", type: "json" },
      { key: "product_details", label: "Product details", type: "json" },
      { key: "customization", label: "Customization", type: "json" },
      { key: "created_at", label: "Created", type: "date", list: true },
      { key: "updated_at", label: "Updated", type: "date" },
    ],
  },
  {
    key: "categories",
    collection: "categories",
    label: "Category",
    plural: "Categories",
    icon: "Tags",
    group: "Catalog",
    search: ["name", "slug", "description"],
    sort: "position",
    hint: 'Subcategories are nested inside each category\'s "children" field (edit as JSON).',
    fields: [
      { key: "name", label: "Name", list: true, editable: true },
      { key: "slug", label: "Slug", list: true },
      { key: "description", label: "Description", editable: true },
      { key: "color", label: "Color", editable: true },
      { key: "icon", label: "Icon / image URL", type: "image", editable: true },
      { key: "position", label: "Position", type: "number", list: true, editable: true },
      { key: "children", label: "Subcategories", type: "json", editable: true },
      { key: "updated_at", label: "Updated", type: "date", list: true },
    ],
  },

  /* -------------------------------- Sellers ------------------------------ */
  {
    key: "sellers",
    collection: "sellers",
    label: "Seller",
    plural: "Sellers",
    icon: "Store",
    group: "Sellers",
    search: ["store_name", "slug", "city", "country"],
    sort: "created_at",
    filters: [
      { label: "Approved", query: { "verification.status": "approved" } },
      { label: "Pending review", query: { "verification.status": "pending" } },
      { label: "Rejected", query: { "verification.status": "rejected" } },
      { label: "Star sellers", query: { star_seller: true } },
      { label: "On vacation", query: { vacationMode: true } },
    ],
    fields: [
      { key: "store_name", label: "Store name", list: true, editable: true },
      { key: "slug", label: "Slug", list: true, editable: true },
      { key: "tagline", label: "Tagline", editable: true },
      { key: "description", label: "About", editable: true, multiline: true },
      { key: "owner", label: "Owner (user id)", list: true },
      { key: "email", label: "Contact email", editable: true },
      { key: "city", label: "City", list: true, editable: true },
      { key: "country", label: "Country", editable: true },
      {
        key: "verification.status",
        label: "Verification status",
        type: "badge",
        list: true,
        editable: true,
      },
      { key: "star_seller", label: "Star seller", type: "boolean", list: true, editable: true },
      { key: "vacationMode", label: "Vacation mode", type: "boolean", editable: true },
      { key: "rating", label: "Rating", type: "number" },
      { key: "review_count", label: "Reviews", type: "number" },
      { key: "view_count", label: "Views", type: "number" },
      { key: "processing_time", label: "Processing time", editable: true },
      { key: "shipping_policy", label: "Shipping policy", editable: true, multiline: true },
      { key: "return_policy", label: "Return policy", editable: true, multiline: true },
      { key: "logo_url", label: "Logo", type: "image" },
      { key: "banner_url", label: "Banner", type: "image" },
      { key: "shipping", label: "Shipping settings", type: "json", editable: true },
      { key: "payout", label: "Payout settings", type: "json", editable: true },
      { key: "verification", label: "Verification (full record)", type: "json" },
      { key: "created_at", label: "Joined", type: "date", list: true },
    ],
  },
  {
    key: "team",
    collection: "team",
    label: "Team member",
    plural: "Seller team members",
    icon: "UserRound",
    group: "Sellers",
    search: ["name", "email"],
    sort: "created_at",
    filters: [
      { label: "Active", query: { status: "active" } },
      { label: "Pending", query: { status: "pending" } },
    ],
    fields: [
      { key: "name", label: "Name", list: true, editable: true },
      { key: "email", label: "Email", list: true },
      { key: "seller", label: "Seller ID", list: true },
      { key: "role", label: "Role", type: "badge", list: true, editable: true },
      { key: "status", label: "Status", type: "badge", list: true, editable: true },
      { key: "created_at", label: "Added", type: "date", list: true },
    ],
  },

  /* ------------------------- Orders & Fulfillment ------------------------ */
  {
    key: "orders",
    collection: "orders",
    label: "Order",
    plural: "Orders",
    icon: "ShoppingCart",
    group: "Orders & Fulfillment",
    search: ["order_number", "invoice_number", "tracking_number"],
    sort: "created_at",
    filters: [
      { label: "Pending", query: { status: "pending" } },
      { label: "Processing", query: { status: "processing" } },
      { label: "Shipped", query: { status: "shipped" } },
      { label: "Delivered", query: { status: "delivered" } },
      { label: "Cancelled", query: { status: "cancelled" } },
      { label: "Payment failed", query: { payment_status: "failed" } },
    ],
    fields: [
      { key: "order_number", label: "Order #", list: true },
      { key: "invoice_number", label: "Invoice #", editable: true },
      { key: "user", label: "Customer (user id)", list: true },
      { key: "total", label: "Total", type: "money", list: true },
      { key: "subtotal", label: "Subtotal", type: "money" },
      { key: "shipping", label: "Shipping", type: "money" },
      { key: "tax", label: "Tax", type: "money" },
      { key: "currency", label: "Currency" },
      { key: "status", label: "Status", type: "badge", list: true, editable: true },
      { key: "payment_status", label: "Payment", type: "badge", list: true, editable: true },
      { key: "carrier", label: "Carrier", editable: true },
      { key: "tracking_number", label: "Tracking #", editable: true },
      { key: "items", label: "Items", type: "json" },
      { key: "address", label: "Shipping address", type: "json" },
      { key: "payment", label: "Payment details", type: "json" },
      { key: "timeline", label: "Timeline", type: "json" },
      { key: "created_at", label: "Placed", type: "date", list: true },
      { key: "updated_at", label: "Updated", type: "date" },
    ],
  },
  {
    key: "return_requests",
    collection: "return_requests",
    label: "Return request",
    plural: "Returns & Refunds",
    icon: "Undo2",
    group: "Orders & Fulfillment",
    search: ["order_number", "reason"],
    sort: "created_at",
    filters: [
      { label: "Requested", query: { status: "requested" } },
      { label: "Approved", query: { status: "approved" } },
      { label: "Rejected", query: { status: "rejected" } },
      { label: "Refunded", query: { status: "refunded" } },
    ],
    fields: [
      { key: "order_number", label: "Order #", list: true },
      { key: "user", label: "Customer (user id)", list: true },
      { key: "reason", label: "Reason", list: true, editable: true },
      { key: "status", label: "Status", type: "badge", list: true, editable: true },
      { key: "refund_amount", label: "Refund amount", type: "money", editable: true },
      { key: "notes", label: "Internal notes", editable: true, multiline: true },
      { key: "created_at", label: "Requested", type: "date", list: true },
    ],
  },

  /* --------------------------------- Finance ------------------------------ */
  {
    key: "payouts",
    collection: "payouts",
    label: "Payout",
    plural: "Seller payouts",
    icon: "Wallet",
    group: "Finance",
    search: ["seller"],
    sort: "created_at",
    filters: [
      { label: "Pending", query: { status: "pending" } },
      { label: "Paid", query: { status: "paid" } },
      { label: "Failed", query: { status: "failed" } },
    ],
    fields: [
      { key: "seller", label: "Seller ID", list: true },
      { key: "amount", label: "Amount", type: "money", list: true, editable: true },
      { key: "method", label: "Method", editable: true },
      { key: "status", label: "Status", type: "badge", list: true, editable: true },
      { key: "created_at", label: "Requested", type: "date", list: true },
    ],
  },
  {
    key: "seller_invoices",
    collection: "seller_invoices",
    label: "Seller invoice",
    plural: "Seller invoices",
    icon: "Receipt",
    group: "Finance",
    search: ["seller", "reference", "kind"],
    sort: "created_at",
    filters: [
      { label: "Pending", query: { status: "pending" } },
      { label: "Paid", query: { status: "paid" } },
    ],
    fields: [
      { key: "seller", label: "Seller ID", list: true },
      { key: "kind", label: "Kind", type: "badge", list: true, editable: true },
      { key: "amount", label: "Amount", type: "money", list: true, editable: true },
      { key: "currency", label: "Currency" },
      { key: "method", label: "Method", editable: true },
      { key: "status", label: "Status", type: "badge", list: true, editable: true },
      { key: "reference", label: "Reference", editable: true },
      { key: "description", label: "Description", editable: true, multiline: true },
      { key: "created_at", label: "Date", type: "date", list: true },
    ],
  },
  {
    key: "invoices",
    collection: "invoices",
    label: "Invoice",
    plural: "Platform invoices",
    icon: "FileText",
    group: "Finance",
    search: ["number"],
    sort: "created_at",
    fields: [
      { key: "number", label: "Invoice #", list: true },
      { key: "order", label: "Order", list: true },
      { key: "amount", label: "Amount", type: "money", list: true },
      { key: "status", label: "Status", type: "badge", list: true, editable: true },
      { key: "created_at", label: "Date", type: "date", list: true },
    ],
  },
  {
    key: "bank_accounts",
    collection: "bank_accounts",
    label: "Bank account",
    plural: "Seller bank accounts",
    icon: "Landmark",
    group: "Finance",
    search: ["seller", "account_name"],
    sort: "created_at",
    hint: "Sensitive financial data — visible to admins for payout verification only.",
    fields: [
      { key: "seller", label: "Seller ID", list: true },
      { key: "account_name", label: "Account holder", list: true },
      { key: "bank_name", label: "Bank", list: true },
      { key: "account_number", label: "Account number" },
      { key: "ifsc", label: "IFSC / routing" },
      { key: "verified", label: "Verified", type: "boolean", list: true, editable: true },
      { key: "created_at", label: "Added", type: "date", list: true },
    ],
  },

  /* -------------------------------- Marketing ----------------------------- */
  {
    key: "coupons",
    collection: "coupons",
    label: "Coupon",
    plural: "Coupons & Promotions",
    icon: "Ticket",
    group: "Marketing",
    search: ["code"],
    sort: "created_at",
    filters: [{ label: "Active", query: { active: true } }],
    fields: [
      { key: "code", label: "Code", list: true, editable: true },
      { key: "type", label: "Type", type: "badge", list: true, editable: true },
      { key: "value", label: "Value", type: "number", list: true, editable: true },
      { key: "min_order", label: "Min order", type: "money", editable: true },
      { key: "usage_limit", label: "Usage limit", type: "number", editable: true },
      { key: "starts_at", label: "Starts", type: "date", editable: true },
      { key: "ends_at", label: "Ends", type: "date", list: true, editable: true },
      { key: "active", label: "Active", type: "boolean", list: true, editable: true },
    ],
  },
  {
    key: "campaigns",
    collection: "campaigns",
    label: "Campaign",
    plural: "Campaigns",
    icon: "Megaphone",
    group: "Marketing",
    search: ["name"],
    sort: "created_at",
    filters: [{ label: "Active", query: { active: true } }],
    fields: [
      { key: "name", label: "Name", list: true, editable: true },
      { key: "type", label: "Type", type: "badge", list: true, editable: true },
      { key: "starts_at", label: "Starts", type: "date", editable: true },
      { key: "ends_at", label: "Ends", type: "date", list: true, editable: true },
      { key: "active", label: "Active", type: "boolean", list: true, editable: true },
    ],
  },
  {
    key: "subscribers",
    collection: "subscribers",
    label: "Subscriber",
    plural: "Newsletter subscribers",
    icon: "Rss",
    group: "Marketing",
    search: ["email"],
    sort: "created_at",
    fields: [
      { key: "email", label: "Email", list: true },
      { key: "source", label: "Source", type: "badge", list: true },
      { key: "created_at", label: "Subscribed", type: "date", list: true },
    ],
  },

  /* -------------------------------- Customers ----------------------------- */
  {
    key: "users",
    collection: "users",
    label: "User",
    plural: "Customers",
    icon: "Users",
    group: "Customers",
    search: ["name", "email"],
    sort: "created_at",
    filters: [
      { label: "Verified", query: { email_verified: true } },
      { label: "Unverified", query: { email_verified: false } },
      { label: "Suspended", query: { is_suspended: true } },
      { label: "Admin flag", query: { is_admin: true } },
      { label: "2FA on", query: { two_factor_enabled: true } },
    ],
    fields: [
      { key: "name", label: "Name", list: true, editable: true },
      { key: "email", label: "Email", list: true },
      { key: "provider", label: "Provider", type: "badge", list: true },
      {
        key: "email_verified",
        label: "Email verified",
        type: "boolean",
        list: true,
        editable: true,
      },
      { key: "is_suspended", label: "Suspended", type: "boolean", list: true, editable: true },
      { key: "is_admin", label: "Admin flag", type: "boolean", editable: true },
      { key: "two_factor_enabled", label: "2FA enabled", type: "boolean", editable: true },
      { key: "avatar_url", label: "Avatar", type: "image" },
      { key: "created_at", label: "Joined", type: "date", list: true },
    ],
  },
  {
    key: "addresses",
    collection: "addresses",
    label: "Address",
    plural: "Saved addresses",
    icon: "MapPin",
    group: "Customers",
    search: ["name", "city", "pincode"],
    sort: "created_at",
    fields: [
      { key: "user", label: "User ID", list: true },
      { key: "name", label: "Name", list: true, editable: true },
      { key: "city", label: "City", list: true, editable: true },
      { key: "state", label: "State", editable: true },
      { key: "pincode", label: "Pincode", list: true, editable: true },
      { key: "country", label: "Country", editable: true },
      { key: "is_default", label: "Default", type: "boolean", editable: true },
    ],
  },
  {
    key: "favourites",
    collection: "favourites",
    label: "Favourite",
    plural: "Wishlist entries",
    icon: "Heart",
    group: "Customers",
    search: ["user", "product"],
    sort: "created_at",
    fields: [
      { key: "user", label: "User ID", list: true },
      { key: "product", label: "Product ID", list: true },
      { key: "created_at", label: "Added", type: "date", list: true },
    ],
  },
  {
    key: "cart_items",
    collection: "cart_items",
    label: "Cart item",
    plural: "Active carts",
    icon: "ShoppingCart",
    group: "Customers",
    search: ["user", "product"],
    sort: "updated_at",
    fields: [
      { key: "user", label: "User ID", list: true },
      { key: "product", label: "Product ID", list: true },
      { key: "qty", label: "Quantity", type: "number", list: true, editable: true },
      { key: "updated_at", label: "Updated", type: "date", list: true },
    ],
  },

  /* ------------------------------ Reviews & Trust -------------------------- */
  {
    key: "reviews",
    collection: "reviews",
    label: "Review",
    plural: "Reviews & Ratings",
    icon: "Star",
    group: "Reviews & Trust",
    search: ["author", "body"],
    sort: "created_at",
    filters: [
      { label: "1–2 stars", query: { rating: { $lte: 2 } } },
      { label: "5 stars", query: { rating: 5 } },
    ],
    fields: [
      { key: "rating", label: "Rating", type: "number", list: true, editable: true },
      { key: "author", label: "Author", list: true, editable: true },
      { key: "body", label: "Review", list: true, editable: true, multiline: true },
      { key: "product", label: "Product ID", list: true },
      { key: "user", label: "User ID" },
      { key: "created_at", label: "Posted", type: "date", list: true },
    ],
  },

  /* --------------------------------- Content -------------------------------- */
  {
    key: "pages",
    collection: "pages",
    label: "Page",
    plural: "Pages",
    icon: "FileText",
    group: "Content",
    search: ["title", "slug", "description"],
    sort: "updated_at",
    filters: [
      { label: "Published", query: { published: true } },
      { label: "Unpublished", query: { published: false } },
    ],
    fields: [
      { key: "title", label: "Title", list: true, editable: true },
      { key: "slug", label: "Slug", list: true },
      { key: "description", label: "Description", editable: true, multiline: true },
      { key: "sections", label: "Sections", type: "json", editable: true },
      { key: "published", label: "Published", type: "boolean", list: true, editable: true },
      { key: "updated_at", label: "Updated", type: "date", list: true },
    ],
  },
  {
    key: "site_settings",
    collection: "site_settings",
    label: "Site setting",
    plural: "Site settings",
    icon: "Settings",
    group: "Content",
    search: ["site_name"],
    sort: "site_name",
    hint: "One document controls the whole storefront. Nested sections open as JSON.",
    fields: [
      { key: "site_name", label: "Site name", list: true, editable: true },
      { key: "site_short_name", label: "Short name", editable: true },
      { key: "tagline", label: "Tagline", editable: true },
      { key: "logo_text", label: "Logo text", editable: true },
      { key: "logo_url", label: "Logo URL", type: "image", editable: true },
      { key: "currency_code", label: "Currency code", list: true, editable: true },
      { key: "currency_symbol", label: "Currency symbol", editable: true },
      { key: "locale_default", label: "Default locale", editable: true },
      { key: "sellers_url", label: "Sellers site URL", editable: true },
      { key: "announcement", label: "Announcement bar", type: "json", editable: true },
      { key: "header", label: "Header / nav", type: "json", editable: true },
      { key: "hero", label: "Hero section", type: "json", editable: true },
      { key: "footer", label: "Footer", type: "json", editable: true },
      { key: "popup", label: "Popup", type: "json", editable: true },
      { key: "promo", label: "Promo banner", type: "json", editable: true },
      { key: "promos", label: "Promos", type: "json", editable: true },
      { key: "sections", label: "Homepage sections", type: "json", editable: true },
      { key: "seo", label: "SEO defaults", type: "json", editable: true },
      { key: "trust_badges", label: "Trust badges", type: "json", editable: true },
      { key: "commerce", label: "Commerce settings", type: "json", editable: true },
      { key: "updated_at", label: "Updated", type: "date" },
    ],
  },
  {
    key: "store_policies",
    collection: "store_policies",
    label: "Store policy",
    plural: "Store policies",
    icon: "ScrollText",
    group: "Content",
    search: ["title"],
    sort: "updated_at",
    fields: [
      { key: "title", label: "Title", list: true, editable: true },
      { key: "body", label: "Body", editable: true, multiline: true },
      { key: "updated_at", label: "Updated", type: "date", list: true },
    ],
  },

  /* --------------------------------- Support -------------------------------- */
  {
    key: "conversations",
    collection: "conversations",
    label: "Conversation",
    plural: "Conversations",
    icon: "MessagesSquare",
    group: "Support",
    search: ["subject", "user_name", "store_name"],
    sort: "last_at",
    filters: [
      { label: "Open", query: { status: "open" } },
      { label: "Closed", query: { status: "closed" } },
      { label: "Escalated", query: { escalated: true } },
    ],
    fields: [
      { key: "subject", label: "Subject", list: true, editable: true },
      { key: "kind", label: "Kind", type: "badge", list: true },
      { key: "user_name", label: "Customer", list: true },
      { key: "store_name", label: "Store", list: true },
      { key: "status", label: "Status", type: "badge", list: true, editable: true },
      { key: "escalated", label: "Escalated", type: "boolean", list: true, editable: true },
      { key: "last_message", label: "Last message" },
      { key: "unread_user", label: "Unread (user)", type: "number" },
      { key: "unread_staff", label: "Unread (staff)", type: "number" },
      { key: "last_at", label: "Last activity", type: "date", list: true },
      { key: "created_at", label: "Started", type: "date" },
    ],
  },
  {
    key: "messages",
    collection: "messages",
    label: "Message",
    plural: "Messages",
    icon: "Mail",
    group: "Support",
    search: ["body", "author_name"],
    sort: "created_at",
    fields: [
      { key: "author_name", label: "From", list: true },
      { key: "role", label: "Role", type: "badge", list: true },
      { key: "body", label: "Message", list: true, editable: true, multiline: true },
      { key: "conversation", label: "Thread ID" },
      { key: "created_at", label: "Sent", type: "date", list: true },
    ],
  },

  /* ------------------------------ Reports & Logs ----------------------------- */
  {
    key: "events",
    collection: "events",
    label: "Event",
    plural: "Activity events",
    icon: "Activity",
    group: "Reports & Logs",
    search: ["type", "entity_name"],
    sort: "created_at",
    fields: [
      { key: "type", label: "Type", type: "badge", list: true },
      { key: "entity_name", label: "Entity", list: true },
      { key: "entity_id", label: "Entity ID" },
      { key: "seller", label: "Seller ID", list: true },
      { key: "user", label: "User ID" },
      { key: "day", label: "Day", list: true },
      { key: "meta", label: "Meta", type: "json" },
      { key: "created_at", label: "When", type: "date", list: true },
    ],
  },
  {
    key: "login_events",
    collection: "login_events",
    label: "Login event",
    plural: "Login history",
    icon: "LogIn",
    group: "Reports & Logs",
    search: ["user", "method"],
    sort: "created_at",
    filters: [
      { label: "Successful", query: { success: true } },
      { label: "Failed", query: { success: false } },
    ],
    fields: [
      { key: "user", label: "User", list: true },
      { key: "method", label: "Method", type: "badge", list: true },
      { key: "success", label: "Success", type: "boolean", list: true },
      { key: "ip", label: "IP", list: true },
      { key: "user_agent", label: "Device" },
      { key: "created_at", label: "When", type: "date", list: true },
    ],
  },
  {
    key: "rate_limits",
    collection: "rate_limits",
    label: "Rate limit",
    plural: "Rate limits",
    icon: "Gauge",
    group: "Reports & Logs",
    search: ["identifier", "action"],
    sort: "updated_at",
    fields: [
      { key: "identifier", label: "Identifier", list: true },
      { key: "action", label: "Action", type: "badge", list: true },
      { key: "count", label: "Attempts", type: "number", list: true },
      { key: "blocked_until", label: "Blocked until", type: "date", list: true },
      { key: "ip", label: "IP" },
      { key: "updated_at", label: "Updated", type: "date" },
    ],
  },

  /* ---------------------------------- System ---------------------------------- */
  {
    key: "translations",
    collection: "translations",
    label: "Translation",
    plural: "Translations",
    icon: "Languages",
    group: "System",
    search: ["key", "value", "lang"],
    sort: "key",
    fields: [
      { key: "key", label: "Key", list: true },
      { key: "lang", label: "Language", type: "badge", list: true, editable: true },
      { key: "source", label: "Source text", list: true },
      { key: "value", label: "Translated value", list: true, editable: true, multiline: true },
    ],
  },
  {
    key: "sessions",
    collection: "sessions",
    label: "Session",
    plural: "Storefront sessions",
    icon: "KeyRound",
    group: "System",
    search: ["user"],
    sort: "created_at",
    hint: "Deleting a session signs that customer out.",
    fields: [
      { key: "user", label: "User ID", list: true },
      { key: "created_at", label: "Started", type: "date", list: true },
      { key: "expires_at", label: "Expires", type: "date", list: true },
    ],
  },
];

export function entityByKey(key: string) {
  return ENTITIES.find((e) => e.key === key);
}

export function entitiesByGroup(): { group: EntityGroup; entities: EntityDef[] }[] {
  return GROUP_ORDER.map((group) => ({
    group,
    entities: ENTITIES.filter((e) => e.group === group),
  })).filter((g) => g.entities.length > 0);
}
