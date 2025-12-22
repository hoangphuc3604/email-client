import type { KanbanColumnConfig } from '../components/Dashboard/KanbanSettings';

const STORAGE_KEY = 'kanban_columns_config';

// Default columns if nothing is saved
export const DEFAULT_COLUMNS: KanbanColumnConfig[] = [
  { id: 'inbox', title: 'Inbox', gmailLabel: 'INBOX' },
  { id: 'todo', title: 'To Do', gmailLabel: 'todo' },
  { id: 'snoozed', title: 'Snoozed', gmailLabel: 'SNOOZED' },
  { id: 'done', title: 'Done', gmailLabel: 'done' },
];

/**
 * Load column configuration from localStorage
 * Returns default columns if nothing is saved
 */
export function loadColumnConfig(): KanbanColumnConfig[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Validate structure
        const isValid = parsed.every(
          (col) =>
            col &&
            typeof col.id === 'string' &&
            typeof col.title === 'string' &&
            typeof col.gmailLabel === 'string'
        );
        if (isValid) {
          return parsed;
        }
      }
    }
  } catch (error) {
    console.error('Failed to load column config from localStorage:', error);
  }
  return DEFAULT_COLUMNS;
}

/**
 * Save column configuration to localStorage
 */
export function saveColumnConfig(columns: KanbanColumnConfig[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(columns));
  } catch (error) {
    console.error('Failed to save column config to localStorage:', error);
    throw new Error('Failed to save configuration');
  }
}

/**
 * Reset to default configuration
 */
export function resetColumnConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to reset column config:', error);
  }
}

/**
 * Get Gmail label for a column ID
 */
export function getGmailLabelForColumn(
  columnId: string,
  columns: KanbanColumnConfig[]
): string | undefined {
  const column = columns.find((col) => col.id === columnId);
  return column?.gmailLabel;
}
