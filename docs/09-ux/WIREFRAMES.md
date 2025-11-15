# Wireframes

## Email Dashboard - 3-Column Layout (Assignment MVP)

### Desktop Layout (~1200px+)
Three-column responsive layout:
- **Column 1 (Left, ~20% width)**: Mailboxes/Folders sidebar
  - Vertical list of folders: Inbox (with unread count badge), Starred, Sent, Drafts, Archive, Trash, Custom folders
  - Each folder is a clickable item with hover state
  - Active folder highlighted
  - Scrollable if many folders
  
- **Column 2 (Center, ~40% width)**: Email List
  - Header with actions: Compose button (opens modal), Refresh, Select All checkbox, Delete, Mark Read/Unread
  - Scrollable list of email rows, each showing:
    - Checkbox for selection
    - Star/important indicator (icon)
    - Sender name (bold if unread)
    - Subject (single-line ellipsis, bold if unread)
    - Preview text (single-line ellipsis, gray)
    - Timestamp (right-aligned, relative or absolute)
  - Selected email highlighted
  - Pagination or virtual scrolling for large lists
  
- **Column 3 (Right, ~40% width)**: Email Detail
  - When email selected: Shows full email content
    - Header: From, To, CC (expandable), Subject, Received date/time
    - Body: Rendered HTML or plain text
    - Attachments: List with download buttons (if any)
    - Action buttons: Reply, Reply All, Forward, Delete, Mark as Unread, Toggle Star
  - When no email selected: Empty state message "Select an email to view details"

### Mobile Layout (<768px)
- Single-column view with navigation:
  - **Folder view**: Full-width folder list (replaces Column 1)
  - **Email list view**: Full-width email list (replaces Column 2) with back button to folders
  - **Email detail view**: Full-width email detail (replaces Column 3) with back button to email list
- Navigation between views via back buttons
- Hamburger menu for folder navigation when in list/detail views

## Authentication Screens

### Login Page (`/login`)
- Email input field with validation
- Password input field with validation
- "Sign in" button (primary action)
- "Sign in with Google" button (secondary action, Google branding)
- Link to Sign Up page (optional, future)
- Loading indicator during authentication
- Error message display area (inline validation + server errors)

### Wireframe References
- Inbox & thread detail: [Figma link placeholder](https://figma.com/file/...).
- Auth onboarding flow: TODO (upload screenshot).
- Admin settings: TODO (wireframe in progress).
- AI summary panel: TODO (design team working).

> Store exported wireframes in `docs/assets/wireframes` when ready.

