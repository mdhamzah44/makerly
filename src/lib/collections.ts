/** Client-safe metadata mirror of the server collection registry. */
export type ColumnDef = {
  field: string;
  label: string;
  kind?: "text" | "number" | "bool" | "date" | "image" | "badge";
  width?: string;
};

export type ClientCollection = {
  key: string;
  label: string;
  columns: ColumnDef[];
  /** Quick toggle fields shown as switches in the row actions. */
  toggles?: { field: string; label: string }[];
  newDoc?: Record<string, unknown>;
};

export const CLIENT_COLLECTIONS: Record<string, ClientCollection> = {
  products: {
    key: "products",
    label: "Products",
    columns: [
      { field: "images.0.url", label: "", kind: "image", width: "56px" },
      { field: "name", label: "Name" },
      { field: "category", label: "Category", kind: "badge" },
      { field: "price", label: "Price", kind: "number" },
      { field: "stock", label: "Stock", kind: "number" },
      { field: "status", label: "Status", kind: "badge" },
    ],
    toggles: [
      { field: "is_featured", label: "Featured" },
      { field: "is_bestseller", label: "Bestseller" },
      { field: "is_sponsored", label: "Sponsored" },
      { field: "is_popular", label: "Popular" },
      { field: "free_shipping", label: "Free shipping" },
    ],
    newDoc: {
      name: "New product",
      slug: "new-product",
      category: "",
      price: 0,
      compare_price: 0,
      stock: 1,
      description: "",
      images: [],
      seller: "",
      status: "draft",
      free_shipping: false,
    },
  },
  sellers: {
    key: "sellers",
    label: "Sellers",
    columns: [
      { field: "logo_url", label: "", kind: "image", width: "56px" },
      { field: "store_name", label: "Store" },
      { field: "city", label: "City" },
      { field: "status", label: "Status", kind: "badge" },
      { field: "rating", label: "Rating", kind: "number" },
      { field: "commission_rate", label: "Commission", kind: "number" },
    ],
    toggles: [{ field: "star_seller", label: "Star seller" }],
    newDoc: {
      store_name: "New store",
      slug: "new-store",
      tagline: "",
      description: "",
      city: "",
      country: "India",
      status: "pending",
      commission_rate: 12,
      rating: 5,
    },
  },
  users: {
    key: "users",
    label: "Users",
    columns: [
      { field: "name", label: "Name" },
      { field: "email", label: "Email" },
      { field: "phone", label: "Phone" },
      { field: "provider", label: "Provider", kind: "badge" },
      { field: "is_suspended", label: "Suspended", kind: "bool" },
      { field: "created_at", label: "Joined", kind: "date" },
    ],
    toggles: [{ field: "is_suspended", label: "Suspended" }],
    newDoc: { name: "", email: "", is_suspended: false, provider: "email" },
  },
  categories: {
    key: "categories",
    label: "Categories",
    columns: [
      { field: "name", label: "Name" },
      { field: "slug", label: "Slug" },
      { field: "icon", label: "Icon" },
      { field: "position", label: "Position", kind: "number" },
    ],
    newDoc: { name: "New category", slug: "new-category", icon: "tag", color: "#9cb380", position: 0 },
  },
  pages: {
    key: "pages",
    label: "Pages",
    columns: [
      { field: "title", label: "Title" },
      { field: "slug", label: "Slug" },
      { field: "published", label: "Published", kind: "bool" },
      { field: "updated_at", label: "Updated", kind: "date" },
    ],
    toggles: [{ field: "published", label: "Published" }],
    newDoc: { title: "New page", slug: "new-page", description: "", sections: [], published: false },
  },
  reviews: {
    key: "reviews",
    label: "Reviews",
    columns: [
      { field: "author", label: "Author" },
      { field: "rating", label: "Rating", kind: "number" },
      { field: "body", label: "Review" },
      { field: "product", label: "Product" },
      { field: "created_at", label: "Date", kind: "date" },
    ],
    newDoc: { author: "", rating: 5, body: "", product: "", created_at: new Date().toISOString() },
  },
  conversations: {
    key: "conversations",
    label: "Conversations",
    columns: [
      { field: "subject", label: "Subject" },
      { field: "user_name", label: "Customer" },
      { field: "store_name", label: "Store" },
      { field: "status", label: "Status", kind: "badge" },
      { field: "unread_staff", label: "Unread", kind: "number" },
      { field: "last_at", label: "Last", kind: "date" },
    ],
  },
  messages: {
    key: "messages",
    label: "Messages",
    columns: [
      { field: "author_name", label: "Author" },
      { field: "role", label: "Role", kind: "badge" },
      { field: "body", label: "Body" },
      { field: "created_at", label: "Sent", kind: "date" },
    ],
  },
  events: {
    key: "events",
    label: "Events",
    columns: [
      { field: "type", label: "Type", kind: "badge" },
      { field: "entity_name", label: "Entity" },
      { field: "session", label: "Session" },
      { field: "created_at", label: "At", kind: "date" },
    ],
  },
  translations: {
    key: "translations",
    label: "Translations",
    columns: [
      { field: "lang", label: "Lang", kind: "badge" },
      { field: "source", label: "Source" },
      { field: "value", label: "Translation" },
    ],
    newDoc: { lang: "hi", key: "", source: "", value: "" },
  },
  sessions: {
    key: "sessions",
    label: "User sessions",
    columns: [
      { field: "user", label: "User" },
      { field: "created_at", label: "Created", kind: "date" },
      { field: "expires_at", label: "Expires", kind: "date" },
    ],
  },
  favourites: {
    key: "favourites",
    label: "Favourites",
    columns: [
      { field: "user", label: "User" },
      { field: "product", label: "Product" },
    ],
  },
  cart_items: {
    key: "cart_items",
    label: "Cart items",
    columns: [
      { field: "user", label: "User" },
      { field: "product", label: "Product" },
      { field: "qty", label: "Qty", kind: "number" },
    ],
  },
  admin_audit: {
    key: "admin_audit",
    label: "Audit log",
    columns: [
      { field: "created_at", label: "When", kind: "date" },
      { field: "admin_email", label: "Admin" },
      { field: "action", label: "Action", kind: "badge" },
      { field: "detail", label: "Detail" },
    ],
  },
};

export function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type JsonDoc = { [key: string]: Json };
