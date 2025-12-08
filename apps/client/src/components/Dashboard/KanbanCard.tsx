// apps/client/src/components/Dashboard/KanbanCard.tsx
import { Card, Badge } from 'react-bootstrap';
import { FaStar, FaRegStar } from 'react-icons/fa';

interface KanbanCardProps {
  email: any;
  onClick: (email: any) => void;
}

export default function KanbanCard({ email, onClick }: KanbanCardProps) {
  const sender = typeof email.sender === 'string' ? email.sender : (email.sender?.name || email.sender?.email || 'Unknown');
  const isStarred = (email.labels || []).includes('starred') || (email.tags || []).some((t: any) => t.id === 'starred');

  // Giả lập hiển thị AI Summary nếu có (theo yêu cầu W2)
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
      onClick={() => onClick(email)}
    >
      <Card.Body className="p-3">
        <div className="d-flex justify-content-between mb-2">
          <small className="text-info" style={{ fontSize: '0.8rem' }}>
            {sender}
          </small>
          {isStarred ? <FaStar className="text-warning" /> : <FaRegStar className="text-info" />}
        </div>
        
        <h6 className="mb-2" style={{ fontWeight: email.unread ? 'bold' : 'normal', color: '#fff' }}>
          {email.subject}
        </h6>
        
        <Card.Text style={{ fontSize: '0.85rem', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', color: '#c770f0' }}>
          {/* Đây là nơi sẽ hiển thị AI Summary sau này */}
          {summary}...
        </Card.Text>

        {email.unread && <Badge bg="primary">New</Badge>}
      </Card.Body>
    </Card>
  );
}