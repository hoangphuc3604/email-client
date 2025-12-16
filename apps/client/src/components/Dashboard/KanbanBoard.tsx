import { useState } from 'react';
import { Row, Col, Spinner, Modal, Form, Button, ButtonGroup } from 'react-bootstrap';
import KanbanCard from './KanbanCard';
import { FaClock, FaFilter, FaSortAmountDown, FaSortAmountUp } from 'react-icons/fa';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { KANBAN_COLUMNS, useKanbanColumns, useMoveEmail, useSnoozeEmail } from '../../hooks/useKanban';

interface KanbanBoardProps {
  onOpenEmail: (email: any) => void;
  searchResults?: any[]; // Optional search results to display instead of regular columns
}

type SortOption = 'newest' | 'oldest' | 'sender';
type FilterOption = 'all' | 'unread' | 'attachments';

export default function KanbanBoard({ onOpenEmail, searchResults }: KanbanBoardProps) {
  const { data: columnsData, isLoading, isError, error } = useKanbanColumns();
  const moveEmail = useMoveEmail();
  const snoozeEmail = useSnoozeEmail();
  
  // Filtering & Sorting State
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  
  // State cho Snooze Modal
  const [showSnoozeModal, setShowSnoozeModal] = useState(false);
  const [snoozeTargetEmail, setSnoozeTargetEmail] = useState<string | null>(null);
  const [snoozeDate, setSnoozeDate] = useState("");

  // Hàm mở modal snooze
  const handleOpenSnooze = (emailId: string) => {
    setSnoozeTargetEmail(emailId);
    // Mặc định snooze đến ngày mai 9h sáng
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    tmr.setHours(9, 0, 0, 0);
    
    // Fix múi giờ cho input datetime-local
    const localIsoString = new Date(tmr.getTime() - (tmr.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    setSnoozeDate(localIsoString); 
    setShowSnoozeModal(true);
  };

  const handleConfirmSnooze = async () => {
    if (!snoozeTargetEmail || !snoozeDate) return;

    try {
      await snoozeEmail.mutateAsync({
        emailId: snoozeTargetEmail,
        snoozeUntil: new Date(snoozeDate).toISOString()
      });
      setShowSnoozeModal(false);
    } catch (e) {
      console.error("Snooze failed", e);
      alert("Failed to snooze email.");
    }
  };

  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    const sourceColId = source.droppableId;
    const destColId = destination.droppableId;

    // [LOGIC MỚI] Nếu kéo vào cột Snoozed -> Mở Modal Snooze thay vì chuyển ngay
    if (destColId === 'snoozed') {
      handleOpenSnooze(draggableId);
      return; // Dừng logic di chuyển mặc định, chờ user confirm trên Modal
    }

    // Logic di chuyển thông thường (Inbox <-> Todo <-> Done)
    // Optimistic move handled inside mutation
    moveEmail.mutate({
      emailId: draggableId,
      from: sourceColId as any,
      to: destColId as any,
      index: destination.index
    });
  };

  // Filter and Sort emails within each column
  const getFilteredAndSortedEmails = (emails: any[]) => {
    if (!emails) return [];
    
    // Apply filtering
    let filtered = [...emails];
    
    if (filterBy === 'unread') {
      filtered = filtered.filter(email => email.unread === true);
    } else if (filterBy === 'attachments') {
      // Filter emails that have attachments (backend now provides hasAttachments field)
      filtered = filtered.filter(email => email.hasAttachments === true);
    }
    
    // Apply sorting
    if (sortBy === 'oldest') {
      // Just reverse the default order for oldest
      filtered = [...filtered].reverse();
    } else if (sortBy === 'sender') {
      filtered.sort((a, b) => {
        const senderA = typeof a.sender === 'string' ? a.sender : (a.sender?.name || a.sender?.email || '');
        const senderB = typeof b.sender === 'string' ? b.sender : (b.sender?.name || b.sender?.email || '');
        return senderA.toLowerCase().localeCompare(senderB.toLowerCase());
      });
    }
    // For 'newest', keep the default order from API
    
    return filtered;
  };

  // Show error state
  if (isError) {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center h-100 text-center p-4">
        <div className="text-danger mb-3">
          <h5>Failed to load Kanban board</h5>
          <p>{error instanceof Error ? error.message : 'Unknown error occurred'}</p>
        </div>
        <Button variant="outline-light" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  // Show loading only on initial load when no data exists
  if (isLoading && Object.keys(columnsData).length === 0) {
    return (
      <div className="d-flex justify-content-center align-items-center h-100">
        <Spinner animation="border" variant="light" />
        <span className="ms-3 text-white">Loading emails...</span>
      </div>
    );
  }

  return (
    <>
      {/* Filter & Sort Controls */}
      <div className="mb-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div className="d-flex gap-2 align-items-center">
          <FaFilter className="text-info" />
          <span className="text-white me-2">Filter:</span>
          <ButtonGroup size="sm">
            <Button 
              variant={filterBy === 'all' ? 'info' : 'outline-info'}
              onClick={() => setFilterBy('all')}
            >
              All
            </Button>
            <Button 
              variant={filterBy === 'unread' ? 'info' : 'outline-info'}
              onClick={() => setFilterBy('unread')}
            >
              Unread Only
            </Button>
            <Button 
              variant={filterBy === 'attachments' ? 'info' : 'outline-info'}
              onClick={() => setFilterBy('attachments')}
            >
              Has Attachments
            </Button>
          </ButtonGroup>
        </div>

        <div className="d-flex gap-2 align-items-center">
          {sortBy === 'newest' ? <FaSortAmountDown className="text-info" /> : <FaSortAmountUp className="text-info" />}
          <span className="text-white me-2">Sort:</span>
          <ButtonGroup size="sm">
            <Button 
              variant={sortBy === 'newest' ? 'info' : 'outline-info'}
              onClick={() => setSortBy('newest')}
            >
              Date: Newest First
            </Button>
            <Button 
              variant={sortBy === 'oldest' ? 'info' : 'outline-info'}
              onClick={() => setSortBy('oldest')}
            >
              Date: Oldest First
            </Button>
            <Button 
              variant={sortBy === 'sender' ? 'info' : 'outline-info'}
              onClick={() => setSortBy('sender')}
            >
              Sender (A-Z)
            </Button>
          </ButtonGroup>
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="kanban-scroll-container h-100 px-2" style={{ overflowX: 'auto', overflowY: 'hidden' }}>
          <Row className="flex-nowrap" style={{ minWidth: '100%', height: '100%' }}>
            {/* Search Results Mode - Single Column */}
            {searchResults ? (
              <Col 
                md={12}
                className="d-flex flex-column"
                style={{ width: '100%', minWidth: '300px', flex: '0 0 auto' }}
              >
                <div className="p-3 mb-3 text-center rounded" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', borderBottom: '2px solid #c770f0' }}>
                  <h5 className="m-0 text-white">Search Results</h5>
                  <small style={{ color: '#0dcaf0', fontWeight: 'bold' }}>
                    {getFilteredAndSortedEmails(searchResults).length} / {searchResults.length} cards
                  </small>
                </div>
                
                <div
                  className="flex-grow-1 px-1 custom-scrollbar"
                  style={{ 
                    overflowY: 'auto', 
                    minHeight: '200px',
                    borderRadius: '8px'
                  }}
                >
                  {getFilteredAndSortedEmails(searchResults).map((email: any, index: number) => (
                    <div key={email.id} style={{ marginBottom: '1rem' }}>
                      <KanbanCard 
                        email={email} 
                        onClick={onOpenEmail}
                        onSnooze={handleOpenSnooze}
                      />
                    </div>
                  ))}
                  {getFilteredAndSortedEmails(searchResults).length === 0 && (
                    <div className="text-center p-4 text-muted">
                      <p>No emails match the current filters</p>
                    </div>
                  )}
                </div>
              </Col>
            ) : (
              /* Normal Kanban Columns */
              KANBAN_COLUMNS.map((col) => (
              <Col 
                key={col.id} 
                md={3}
                className="d-flex flex-column"
                style={{ width: '30%', minWidth: '300px', flex: '0 0 auto' }}
              >
                <div className="p-3 mb-3 text-center rounded" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', borderBottom: '2px solid #c770f0' }}>
                  <h5 className="m-0 text-white">{col.title}</h5>
                  <small style={{ color: '#0dcaf0', fontWeight: 'bold' }}>
                    {getFilteredAndSortedEmails(columnsData[col.id] || []).length} / {columnsData[col.id]?.length || 0} cards
                  </small>
                </div>
                
                <Droppable droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="flex-grow-1 px-1 custom-scrollbar"
                      style={{ 
                        overflowY: 'auto', 
                        minHeight: '200px',
                        backgroundColor: snapshot.isDraggingOver ? 'rgba(199, 112, 240, 0.1)' : 'transparent',
                        transition: 'background-color 0.2s ease',
                        borderRadius: '8px'
                      }}
                    >
                      {getFilteredAndSortedEmails(columnsData[col.id] || []).map((email: any, index: number) => (
                        <Draggable 
                          key={email.id} 
                          draggableId={email.id} 
                          index={index}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              style={{
                                ...provided.draggableProps.style,
                                marginBottom: '1rem',
                                opacity: snapshot.isDragging ? 0.8 : 1,
                              }}
                            >
                              <KanbanCard 
                                email={email} 
                                onClick={onOpenEmail}
                                onSnooze={handleOpenSnooze}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      
                      {getFilteredAndSortedEmails(columnsData[col.id] || []).length === 0 && (
                        <div className="text-center mt-5" style={{ color: '#0dcaf0', opacity: 0.7 }}>
                          {columnsData[col.id]?.length > 0 ? 'No matching emails' : 'Empty'}
                        </div>
                      )}
                    </div>
                  )}
                </Droppable>
              </Col>
            ))
            )}
          </Row>
        </div>
      </DragDropContext>

      {/* Modal Snooze */}
      <Modal show={showSnoozeModal} onHide={() => setShowSnoozeModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title><FaClock /> Snooze Email</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group>
            <Form.Label>Snooze until:</Form.Label>
            <Form.Control 
              type="datetime-local" 
              value={snoozeDate}
              onChange={(e) => setSnoozeDate(e.target.value)}
            />
          </Form.Group>
          <div className="d-flex gap-2 mt-3 justify-content-center">
             <Button variant="outline-secondary" size="sm" onClick={() => {
                 const d = new Date(); d.setHours(d.getHours() + 1); 
                 const localIso = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
                 setSnoozeDate(localIso);
             }}>+1 Hour</Button>
             <Button variant="outline-secondary" size="sm" onClick={() => {
                 const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9,0,0,0);
                 const localIso = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
                 setSnoozeDate(localIso);
             }}>Tomorrow 9AM</Button>
             <Button variant="outline-secondary" size="sm" onClick={() => {
                 const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(9,0,0,0);
                 const localIso = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
                 setSnoozeDate(localIso);
             }}>Next Week</Button>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowSnoozeModal(false)} disabled={snoozeEmail.isLoading}>Cancel</Button>
          <Button variant="primary" onClick={handleConfirmSnooze} disabled={snoozeEmail.isLoading}>
            {snoozeEmail.isLoading && <Spinner size="sm" animation="border" className="me-2" />}
            {snoozeEmail.isLoading ? 'Snoozing...' : 'Snooze'}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}