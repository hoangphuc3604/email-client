// apps/client/src/components/Dashboard/KanbanBoard.tsx
import { useState, useEffect } from 'react';
import { Row, Col, Spinner } from 'react-bootstrap';
import KanbanCard from './KanbanCard';
import mailApi from '../../api/mail';

interface KanbanBoardProps {
  onOpenEmail: (email: any) => void;
}

// Định nghĩa các cột bạn muốn hiển thị
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
      
      // Fetch dữ liệu cho từng cột song song
      await Promise.all(COLUMNS.map(async (col) => {
        try {
          // Sử dụng API listEmails hiện có
          const res = await mailApi.listEmails(col.id, 10); // Lấy 10 mail mới nhất mỗi cột
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

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center h-100">
        <Spinner animation="border" variant="light" />
      </div>
    );
  }

  return (
    <div className="h-100 overflow-auto px-2" style={{ minHeight: '80vh' }}>
      <Row className="flex-nowrap h-100" style={{ overflowX: 'auto' }}>
        {COLUMNS.map((col) => (
          <Col 
            key={col.id} 
            md={4} 
            className="d-flex flex-column"
            style={{ minWidth: '300px' }}
          >
            <div className="p-3 mb-3 text-center rounded" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', borderBottom: '2px solid #c770f0' }}>
              <h5 className="mt-2 text-info">{col.title}</h5>
              <small className="text-white">{columnsData[col.id]?.length || 0} cards</small>
            </div>
            
            <div className="flex-grow-1 px-1 custom-scrollbar" style={{ overflowY: 'auto', minHeight: '0' }}>
              {columnsData[col.id]?.map((email: any) => (
                <KanbanCard 
                  key={email.id} 
                  email={email} 
                  onClick={onOpenEmail}
                />
              ))}
              {(!columnsData[col.id] || columnsData[col.id].length === 0) && (
                <div className="text-center text-info mt-5">
                  Empty
                </div>
              )}
            </div>
          </Col>
        ))}
      </Row>
    </div>
  );
}