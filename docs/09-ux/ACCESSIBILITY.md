# Accessibility Checklist

## Keyboard Navigation (Assignment MVP)

### Email Dashboard Navigation
- [ ] **Arrow keys (↑/↓)**: Navigate up/down through email list items
- [ ] **Enter**: Select/open the focused email in detail pane
- [ ] **Tab**: Navigate between interactive elements (buttons, inputs, checkboxes)
- [ ] **Shift+Tab**: Navigate backwards through interactive elements
- [ ] **Escape**: Close modals (compose, etc.)
- [ ] **Space**: Toggle checkbox selection
- [ ] **Keyboard shortcuts for actions** (optional stretch):
  - `c` - Compose new email
  - `r` - Reply to selected email
  - `f` - Forward selected email
  - `d` - Delete selected email
  - `s` - Toggle star on selected email

### Folder Navigation
- [ ] **Arrow keys (↑/↓)**: Navigate through folder list
- [ ] **Enter**: Select/open the focused folder
- [ ] **Tab**: Move focus between folder list and email list

### Form Navigation (Login)
- [ ] **Tab**: Move between email and password fields
- [ ] **Enter**: Submit form when focus is on submit button or password field
- [ ] **Escape**: Clear form or cancel (if applicable)

## General Accessibility

- [ ] Provide keyboard navigation for all interactive elements (compose, inbox list, buttons).
- [ ] Ensure color contrast meets WCAG AA for dark/light themes.
- [ ] Provide ARIA labels for:
  - [ ] Email list items (sender, subject, unread status)
  - [ ] Folder list items (folder name, unread count)
  - [ ] Action buttons (Reply, Forward, Delete, etc.)
  - [ ] Status banners and error messages
  - [ ] AI summary panels (future)
- [ ] Support screen reader announcements for:
  - [ ] New messages (future)
  - [ ] Authentication success/failure
  - [ ] Email selection changes
- [ ] Accessible error messaging for auth flows:
  - [ ] Inline validation errors associated with form fields
  - [ ] Server errors displayed prominently with clear messaging
- [ ] Timeouts or auto-refresh include user warnings.
- [ ] Attachments UI supports keyboard file upload.
- [ ] Focus indicators visible for all keyboard-navigable elements.
- [ ] Skip links for main content (future enhancement).
- [ ] High-contrast mode toggle (stretch goal).

> Audit each release and log findings in `09-ux/`.

