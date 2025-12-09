// apps/client/src/components/Dashboard/KanbanBoard.tsx
import { useState, useEffect } from 'react';
import { Row, Col, Spinner, Modal, Form, Button } from 'react-bootstrap';
import KanbanCard from './KanbanCard';
import mailApi from '../../api/mail';
import { FaClock } from 'react-icons/fa';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';

interface KanbanBoardProps {
  onOpenEmail: (email: any) => void;
}

// [CẬP NHẬT] Thêm cột Snoozed vào danh sách cột
const COLUMNS = [
  { id: 'inbox', title: 'Inbox' },
  { id: 'todo', title: 'To Do' },
  { id: 'snoozed', title: 'Snoozed' }, // Thêm cột Snoozed
  { id: 'done', title: 'Done' }
];

export default function KanbanBoard({ onOpenEmail }: KanbanBoardProps) {
  const [columnsData, setColumnsData] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  
  // State cho Snooze Modal
  const [showSnoozeModal, setShowSnoozeModal] = useState(false);
  const [snoozeTargetEmail, setSnoozeTargetEmail] = useState<string | null>(null);
  const [snoozeDate, setSnoozeDate] = useState("");

  useEffect(() => {
    fetchAllColumns();
  }, []);

  const fetchAllColumns = async () => {
    setLoading(true);
    try {
      const newData: Record<string, any[]> = {};
      
      await Promise.all(COLUMNS.map(async (col) => {
        try {
          const res = await mailApi.listEmails(col.id, 10);
          const emails = (res && res.previews) ? res.previews : (res && res.threads ? res.threads : []);
          newData[col.id] = emails;
        } catch (e) {
          console.error(`Error loading column ${col.id}`, e);
          newData[col.id] = [];
        }
      }));

      setColumnsData(newData);
    } finally {
      setLoading(false);
    }
  };

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
      // Gọi API Snooze
      await mailApi.snoozeEmail(snoozeTargetEmail, new Date(snoozeDate).toISOString());
      
      // Update UI (Optimistic)
      const newColumnsData = { ...columnsData };
      let snoozedItem = null;

      // 1. Tìm và xóa khỏi cột cũ (Inbox, Todo, Done...)
      Object.keys(newColumnsData).forEach(colId => {
        if (colId === 'snoozed') return; // Không xóa nếu đang ở cột snoozed
        const index = newColumnsData[colId]?.findIndex(e => e.id === snoozeTargetEmail);
        if (index !== undefined && index !== -1) {
          snoozedItem = newColumnsData[colId][index];
          newColumnsData[colId] = newColumnsData[colId].filter(e => e.id !== snoozeTargetEmail);
        }
      });

      // 2. Thêm vào cột Snoozed để hiển thị ngay lập tức
      if (snoozedItem) {
        // Đảm bảo cột snoozed tồn tại
        if (!newColumnsData['snoozed']) newColumnsData['snoozed'] = [];
        newColumnsData['snoozed'] = [snoozedItem, ...newColumnsData['snoozed']];
      }

      setColumnsData(newColumnsData);
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
    const newColumnsData = { ...columnsData };
    const draggedItem = newColumnsData[sourceColId][source.index];

    newColumnsData[sourceColId].splice(source.index, 1);
    
    if (sourceColId === destColId) {
      newColumnsData[sourceColId].splice(destination.index, 0, draggedItem);
    } else {
      newColumnsData[destColId].splice(destination.index, 0, draggedItem);
    }

    setColumnsData(newColumnsData);

    if (sourceColId !== destColId) {
      try {
        console.log(`Moving email ${draggableId} to ${destColId}`);
        await mailApi.modifyEmail(draggableId, {
          labels: [destColId] 
        });
      } catch (error) {
        console.error("Failed to update move on backend:", error);
        alert("Failed to move card. Please try again.");
        fetchAllColumns();
      }
    }
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center h-100">
        <Spinner animation="border" variant="light" />
      </div>
    );
  }

  return (
    <>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="h-100 overflow-auto px-2" style={{ minHeight: '74vh' }}>
          <Row className="flex-nowrap h-100" style={{ overflowX: 'auto' }}>
            {COLUMNS.map((col) => (
              <Col 
                key={col.id} 
                md={3} // Giảm độ rộng cột một chút để vừa 4 cột
                className="d-flex flex-column"
                style={{ minWidth: '270px' }}
              >
                <div className="p-3 mb-3 text-center rounded" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', borderBottom: '2px solid #c770f0' }}>
                  <h5 className="m-0 text-white">{col.title}</h5>
                  <small style={{ color: '#0dcaf0', fontWeight: 'bold' }}>
                    {columnsData[col.id]?.length || 0} cards
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
                      {columnsData[col.id]?.map((email: any, index: number) => (
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
                      
                      {(!columnsData[col.id] || columnsData[col.id].length === 0) && (
                        <div className="text-center mt-5" style={{ color: '#0dcaf0', opacity: 0.7 }}>
                          Empty
                        </div>
                      )}
                    </div>
                  )}
                </Droppable>
              </Col>
            ))}
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
          <Button variant="secondary" onClick={() => setShowSnoozeModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleConfirmSnooze}>Snooze</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}