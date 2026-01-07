import { Card, Badge, Spinner } from 'react-bootstrap';
import { FaStar, FaRegStar, FaClock, FaExternalLinkAlt } from 'react-icons/fa';
import { useEffect, useState, useRef } from 'react';
import mailApi from '../../api/mail';
import { getGmailMessageUrl } from '../../utils/gmail';

interface KanbanCardProps {
  email: any;
  onClick: (email: any) => void;
  onSnooze?: (emailId: string) => void;
}

// Global cache to track which emails have already fetched summaries
const summaryFetchedCache = new Set<string>();

export default function KanbanCard({ email, onClick, onSnooze }: KanbanCardProps) {
  const sender = typeof email.sender === 'string' ? email.sender : (email.sender?.name || email.sender?.email || 'Unknown');
  const isStarred = (email.labels || []).includes('starred') || (email.tags || []).some((t: any) => t.id === 'starred');
  
  const [summary, setSummary] = useState<string>('');
  const [loadingSummary, setLoadingSummary] = useState(false);
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    // Skip if already fetched for this email ID globally
    if (summaryFetchedCache.has(email.id)) {
      return;
    }

    // Skip if already fetched in this component instance
    if (hasFetchedRef.current) {
      return;
    }

    // Fetch AI summary on mount
    const fetchSummary = async () => {
      if (email.ai_summary) {
        setSummary(email.ai_summary);
        hasFetchedRef.current = true;
        summaryFetchedCache.add(email.id);
        return;
      }
      
      setLoadingSummary(true);
      hasFetchedRef.current = true;
      summaryFetchedCache.add(email.id); // Mark as fetched BEFORE the API call
      
      try {
        const result = await mailApi.summarizeEmail(email.id);
        if (result && typeof result === 'object') {
          // Extract summary from response data
          const summaryText = result.summary || result.additionalProp1?.summary || '';
          
          // Check if summary looks like error/limit response (contains certain keywords or is JSON)
          const isError = summaryText.includes('limit') || 
                          summaryText.includes('error') || 
                          summaryText.includes('quota') ||
                          summaryText.includes('{') ||
                          summaryText.includes('additionalProp') ||
                          summaryText.length < 10;
          
          if (isError) {
            setSummary(''); // Leave blank if error/limit reached
          } else {
            setSummary(summaryText);
          }
        }
      } catch (error) {
        console.error('Failed to fetch summary:', error);
        setSummary(''); // Leave blank on error
      } finally {
        setLoadingSummary(false);
      }
    };

    fetchSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array - only run once on mount

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
        <div className="d-flex justify-content-between align-items-start">
          <h6 className="mb-2" style={{ fontWeight: email.unread ? 'bold' : 'normal', color: '#fff' }}>
            {email.subject}
          </h6>
          <FaExternalLinkAlt
            style={{ cursor: 'pointer', fontSize: '0.8em', opacity: 0.7 }}
            onClick={(e) => {
              e.stopPropagation();
              window.open(getGmailMessageUrl(email.id), '_blank');
            }}
            title="Open in Gmail"
          />
        </div>
        
        {/* Summary */}
        <Card.Text style={{ fontSize: '0.85rem', color: '#b8b8b8', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {loadingSummary ? (
            <span className="d-flex align-items-center gap-2">
              <Spinner size="sm" animation="border" /> Loading summary...
            </span>
          ) : (
            summary
          )}
        </Card.Text>

        {/* Badge */}
        {email.unread && <Badge bg="primary">New</Badge>}
      </Card.Body>
    </Card>
  );
}