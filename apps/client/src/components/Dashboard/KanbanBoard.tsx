// apps/client/src/components/Dashboard/KanbanBoard.tsx
import { useState, useEffect } from 'react';
import { Row, Col, Spinner } from 'react-bootstrap';
import KanbanCard from './KanbanCard';
import mailApi from '../../api/mail';
// Sửa dòng này: thêm 'type' trước DropResult
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';

interface KanbanBoardProps {
  onOpenEmail: (email: any) => void;
}

const COLUMNS = [
  { id: 'inbox', title: 'Inbox' },
  { id: 'todo', title: 'To Do' },
  { id: 'done', title: 'Done' }
];

export default function KanbanBoard({ onOpenEmail }: KanbanBoardProps) {
  const [columnsData, setColumnsData] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

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

  // Hàm xử lý khi kết thúc kéo thả
  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;

    // 1. Kiểm tra nếu thả ra ngoài vùng cho phép hoặc thả lại vị trí cũ
    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    // 2. Cập nhật UI ngay lập tức (Optimistic Update)
    const sourceColId = source.droppableId;
    const destColId = destination.droppableId;

    // Sao chép dữ liệu hiện tại để thao tác
    const newColumnsData = { ...columnsData };
    
    // Lấy card đang được kéo
    const draggedItem = newColumnsData[sourceColId][source.index];

    // Xóa khỏi cột cũ
    newColumnsData[sourceColId].splice(source.index, 1);
    
    // Thêm vào cột mới
    // Nếu di chuyển trong cùng một cột
    if (sourceColId === destColId) {
      newColumnsData[sourceColId].splice(destination.index, 0, draggedItem);
    } else {
      // Nếu di chuyển sang cột khác
      newColumnsData[destColId].splice(destination.index, 0, draggedItem);
    }

    // Cập nhật state để UI thay đổi ngay
    setColumnsData(newColumnsData);

    // 3. Gọi API để cập nhật Backend (nếu chuyển cột khác)
    if (sourceColId !== destColId) {
      try {
        console.log(`Moving email ${draggableId} to ${destColId}`);
        
        // Gọi API modifyEmail để thay đổi nhãn (label) của email
        // Logic ở đây giả định backend sẽ thay thế nhãn cũ bằng nhãn mới
        await mailApi.modifyEmail(draggableId, {
          labels: [destColId] 
        });
        
      } catch (error) {
        console.error("Failed to update move on backend:", error);
        // Tùy chọn: Revert lại UI nếu API lỗi (chưa implement để giữ code đơn giản)
        alert("Failed to move card. Please try again.");
        fetchAllColumns(); // Tải lại dữ liệu gốc
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
    // Bọc toàn bộ khu vực kéo thả bằng DragDropContext
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="h-100 overflow-auto px-2" style={{ minHeight: '74vh' }}>
        <Row className="flex-nowrap h-100" style={{ overflowX: 'auto' }}>
          {COLUMNS.map((col) => (
            <Col 
              key={col.id} 
              md={4} 
              className="d-flex flex-column"
              style={{ minWidth: '300px' }}
            >
              <div className="p-3 mb-3 text-center rounded" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', borderBottom: '2px solid #c770f0' }}>
                <h5 className="m-0 text-white">{col.title}</h5>
                <small style={{ color: '#0dcaf0', fontWeight: 'bold' }}>
                  {columnsData[col.id]?.length || 0} cards
                </small>
              </div>
              
              {/* Định nghĩa vùng thả (Droppable) cho mỗi cột */}
              <Droppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="flex-grow-1 px-1 custom-scrollbar"
                    style={{ 
                      overflowY: 'auto', 
                      minHeight: '200px', // Đảm bảo luôn có vùng để thả vào dù cột rỗng
                      backgroundColor: snapshot.isDraggingOver ? 'rgba(199, 112, 240, 0.1)' : 'transparent',
                      transition: 'background-color 0.2s ease',
                      borderRadius: '8px'
                    }}
                  >
                    {columnsData[col.id]?.map((email: any, index: number) => (
                      // Định nghĩa phần tử kéo (Draggable) cho mỗi card
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
  );
}