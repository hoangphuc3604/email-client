import { Card, Badge } from 'react-bootstrap';
import { FaStar, FaRegStar, FaClock } from 'react-icons/fa'; // Gộp import icon cho gọn

interface KanbanCardProps {
  email: any;
  onClick: (email: any) => void;
  onSnooze?: (emailId: string) => void; // Optional để tránh lỗi code cũ
}

export default function KanbanCard({ email, onClick, onSnooze }: KanbanCardProps) {
  const sender = typeof email.sender === 'string' ? email.sender : (email.sender?.name || email.sender?.email || 'Unknown');
  const isStarred = (email.labels || []).includes('starred') || (email.tags || []).some((t: any) => t.id === 'starred');

  // Giả lập hiển thị AI Summary nếu có
  const summary = email.ai_summary || email.body?.substring(0, 100) || email.preview || "";

  return (
    <Card 
      className="mb-3 kanban-card" 
      style={{ 
        cursor: 'pointer', 
        backgroundColor: email.unread ? '#2d2d44' : '#1e1e30',
        border: email.unread ? '1px solid #c770f0' : '1px solid rgba(255,255,255,0.1)',
        color: 'white'
      }}
      // SỬA TẠI ĐÂY: Dùng onDoubleClick thay vì onClick
      onDoubleClick={() => onClick(email)}
    >
      <Card.Body className="p-3">
        {/* Header: Sender + Icons */}
        <div className="d-flex justify-content-between mb-2">
          <small className="text-info" style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>
            {sender}
          </small>
          
          {/* Khu vực Action Icons: Snooze & Star - Dùng stopPropagation để tránh kích hoạt mở mail */}
          <div onClick={(e) => e.stopPropagation()} className="d-flex align-items-center gap-2"> 
              {/* Nút Snooze */}
              {onSnooze && (
                <FaClock 
                  className="text-secondary hover-icon" 
                  style={{cursor: 'pointer'}} 
                  title="Snooze"
                  onClick={() => onSnooze(email.id)}
                />
              )}
              
              {/* Nút Star */}
              {isStarred ? (
                <FaStar className="text-warning" style={{cursor: 'pointer'}} /> 
              ) : (
                <FaRegStar className="text-secondary" style={{cursor: 'pointer'}} />
              )}
          </div>
        </div> 
        
        {/* Subject */}
        <h6 className="mb-2" style={{ fontWeight: email.unread ? 'bold' : 'normal', color: '#fff' }}>
          {email.subject}
        </h6>
        
        {/* Summary */}
        <Card.Text style={{ fontSize: '0.85rem', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', color: '#b8b8b8' }}>
          {summary}...
        </Card.Text>

        {/* Badge */}
        {email.unread && <Badge bg="primary">New</Badge>}
      </Card.Body>
    </Card>
  );
}