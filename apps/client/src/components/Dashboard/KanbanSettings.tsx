import { useState, useEffect } from 'react';
import { Modal, Button, Form, ListGroup, Alert, Spinner } from 'react-bootstrap';
import { FaCog, FaPlus, FaTrash, FaEdit, FaSave, FaTimes, FaTag, FaSync } from 'react-icons/fa';
import mailApi from '../../api/mail';

export interface KanbanColumnConfig {
  id: string;
  title: string;
  gmailLabel: string; // The Gmail label to apply when cards are moved to this column
}

interface KanbanSettingsProps {
  show: boolean;
  onHide: () => void;
  onSave: (columns: KanbanColumnConfig[]) => void;
  currentColumns: KanbanColumnConfig[];
}

interface GmailLabel {
  id: string;
  name: string;
  type: string;
}

// Available Gmail system labels
const GMAIL_SYSTEM_LABELS = [
  { value: 'INBOX', label: 'INBOX' },
  { value: 'STARRED', label: 'STARRED' },
  { value: 'IMPORTANT', label: 'IMPORTANT' },
  { value: 'SENT', label: 'SENT' },
  { value: 'DRAFT', label: 'DRAFT' },
  { value: 'TRASH', label: 'TRASH' },
  { value: 'SPAM', label: 'SPAM' },
  { value: 'SNOOZED', label: 'SNOOZED' },
];

export default function KanbanSettings({ show, onHide, onSave, currentColumns }: KanbanSettingsProps) {
  const [columns, setColumns] = useState<KanbanColumnConfig[]>(currentColumns);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [newColumnLabel, setNewColumnLabel] = useState('');
  const [error, setError] = useState('');
  const [gmailLabels, setGmailLabels] = useState<GmailLabel[]>([]);
  const [loadingLabels, setLoadingLabels] = useState(false);

  useEffect(() => {
    setColumns(currentColumns);
  }, [currentColumns]);

  useEffect(() => {
    if (show) {
      fetchGmailLabels();
    }
  }, [show]);

  const fetchGmailLabels = async () => {
    setLoadingLabels(true);
    try {
      const labels = await mailApi.getLabels();
      setGmailLabels(labels);
    } catch (error) {
      console.error('Failed to fetch Gmail labels:', error);
      setError('Failed to load Gmail labels');
    } finally {
      setLoadingLabels(false);
    }
  };

  const getAllAvailableLabels = () => {
    // Combine system labels with user labels from Gmail
    const userLabels = gmailLabels
      .filter(label => label.type === 'user')
      .map(label => ({ value: label.name, label: label.name }));
    
    return [...GMAIL_SYSTEM_LABELS, ...userLabels];
  };

  const handleStartEdit = (column: KanbanColumnConfig) => {
    setEditingId(column.id);
    setEditTitle(column.title);
    setEditLabel(column.gmailLabel);
    setError('');
  };

  const handleSaveEdit = () => {
    if (!editTitle.trim()) {
      setError('Column title cannot be empty');
      return;
    }
    if (!editLabel.trim()) {
      setError('Gmail label cannot be empty');
      return;
    }

    // Check for duplicate titles (excluding current)
    const isDuplicate = columns.some(
      (col) => col.id !== editingId && col.title.toLowerCase() === editTitle.trim().toLowerCase()
    );
    if (isDuplicate) {
      setError('Column title already exists');
      return;
    }

    setColumns((prev) =>
      prev.map((col) =>
        col.id === editingId
          ? { ...col, title: editTitle.trim(), gmailLabel: editLabel.trim() }
          : col
      )
    );
    setEditingId(null);
    setError('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
    setEditLabel('');
    setError('');
  };

  const handleDelete = (id: string) => {
    if (columns.length <= 1) {
      setError('Cannot delete the last column');
      return;
    }
    if (window.confirm('Are you sure you want to delete this column?')) {
      setColumns((prev) => prev.filter((col) => col.id !== id));
      setError('');
    }
  };

  const handleAddColumn = () => {
    if (!newColumnTitle.trim()) {
      setError('Column title cannot be empty');
      return;
    }
    if (!newColumnLabel.trim()) {
      setError('Gmail label cannot be empty');
      return;
    }

    // Check for duplicate titles
    const isDuplicate = columns.some(
      (col) => col.title.toLowerCase() === newColumnTitle.trim().toLowerCase()
    );
    if (isDuplicate) {
      setError('Column title already exists');
      return;
    }

    const newColumn: KanbanColumnConfig = {
      id: newColumnTitle.toLowerCase().replace(/\s+/g, '_'),
      title: newColumnTitle.trim(),
      gmailLabel: newColumnLabel.trim(),
    };

    setColumns((prev) => [...prev, newColumn]);
    setNewColumnTitle('');
    setNewColumnLabel('');
    setError('');
  };

  const handleSaveAll = () => {
    if (columns.length === 0) {
      setError('You must have at least one column');
      return;
    }
    onSave(columns);
    onHide();
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>
          <FaCog className="me-2" />
          Kanban Board Settings
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && (
          <Alert variant="danger" dismissible onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <div className="d-flex justify-content-between align-items-center mb-3">
          <h6 className="mb-0">Customize Your Columns</h6>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={fetchGmailLabels}
            disabled={loadingLabels}
            title="Refresh Gmail labels"
          >
            {loadingLabels ? <Spinner size="sm" animation="border" /> : <FaSync />}
          </Button>
        </div>
        <p className="text-muted small mb-4">
          Define your workflow columns and map them to Gmail labels. When you move a card to a
          column, the corresponding Gmail label will be automatically applied.
        </p>

        <ListGroup className="mb-4">
          {columns.map((column, index) => (
            <ListGroup.Item key={column.id} className="d-flex align-items-center gap-2 p-3">
              <span className="text-muted me-2" style={{ minWidth: '30px' }}>
                #{index + 1}
              </span>

              {editingId === column.id ? (
                <>
                  <div className="flex-grow-1">
                    <Form.Group className="mb-2">
                      <Form.Label className="small mb-1">Column Title</Form.Label>
                      <Form.Control
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="e.g., To Do, In Progress"
                        autoFocus
                      />
                    </Form.Group>
                    <Form.Group>
                      <Form.Label className="small mb-1 d-flex align-items-center gap-1">
                        <FaTag size={12} /> Gmail Label
                      </Form.Label>
                      <Form.Control
                        type="text"
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        placeholder="e.g., todo, in_progress, STARRED"
                        list="gmail-labels-edit"
                      />
                      <datalist id="gmail-labels-edit">
                        {getAllAvailableLabels().map((label) => (
                          <option key={label.value} value={label.value} />
                        ))}
                      </datalist>
                      <Form.Text className="text-muted">
                        Type label name. Will be created in Gmail if it doesn't exist.
                      </Form.Text>
                    </Form.Group>
                  </div>
                  <div className="d-flex flex-column gap-2">
                    <Button
                      variant="success"
                      size="sm"
                      onClick={handleSaveEdit}
                      title="Save changes"
                    >
                      <FaSave />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleCancelEdit}
                      title="Cancel"
                    >
                      <FaTimes />
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex-grow-1">
                    <div className="fw-bold">{column.title}</div>
                    <div className="small text-muted d-flex align-items-center gap-1">
                      <FaTag size={10} />
                      <span>Label: {column.gmailLabel}</span>
                    </div>
                  </div>
                  <div className="d-flex gap-2">
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={() => handleStartEdit(column)}
                      title="Edit column"
                    >
                      <FaEdit />
                    </Button>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => handleDelete(column.id)}
                      title="Delete column"
                      disabled={columns.length <= 1}
                    >
                      <FaTrash />
                    </Button>
                  </div>
                </>
              )}
            </ListGroup.Item>
          ))}
        </ListGroup>

        <div className="border rounded p-3 bg-light">
          <h6 className="mb-3">
            <FaPlus className="me-2" />
            Add New Column
          </h6>
          <Form.Group className="mb-2">
            <Form.Label className="small mb-1">Column Title</Form.Label>
            <Form.Control
              type="text"
              value={newColumnTitle}
              onChange={(e) => setNewColumnTitle(e.target.value)}
              placeholder="e.g., Urgent, Waiting"
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label className="small mb-1 d-flex align-items-center gap-1">
              <FaTag size={12} /> Gmail Label
            </Form.Label>
            <Form.Control
              type="text"
              value={newColumnLabel}
              onChange={(e) => setNewColumnLabel(e.target.value)}
              placeholder="e.g., urgent, waiting, STARRED"
              list="gmail-labels-new"
            />
            <datalist id="gmail-labels-new">
              {getAllAvailableLabels().map((label) => (
                <option key={label.value} value={label.value} />
              ))}
            </datalist>
            <Form.Text className="text-muted">
              Type label name. Will be created in Gmail if it doesn't exist.
            </Form.Text>
          </Form.Group>
          <Button 
            variant="primary" 
            onClick={handleAddColumn} 
            className="w-100"
          >
            <FaPlus className="me-2" />
            Add Column
          </Button>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSaveAll}>
          Save Configuration
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
