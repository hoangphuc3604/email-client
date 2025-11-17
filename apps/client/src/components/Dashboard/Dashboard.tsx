import React, { useState } from "react";
import {
  Container,
  Row,
  Col,
  ListGroup,
  Card,
  Button,
  Badge,
} from "react-bootstrap";
import Particle from "../Particle";
import "./Dashboard.css"; // Chúng ta sẽ tạo file này
import {
  FaInbox,
  FaStar,
  FaPaperPlane,
  FaEdit,
  FaTrash,
  FaSync,
  FaReply,
  FaForward,
} from "react-icons/fa";

// Dữ liệu mock cho Cột 2
const mockEmails = [
  // ... (Dữ liệu mockEmails giữ nguyên, không thay đổi) ...
  {
    id: 1,
    sender: "Alice Smith",
    subject: "Meeting Update",
    preview: "Hi team, the meeting time has been changed to 3 PM...",
    read: false,
  },
  {
    id: 2,
    sender: "Google",
    subject: "Security Alert",
    preview: "A new device signed into your account. Please review...",
    read: false,
  },
  {
    id: 3,
    sender: "Bob Johnson",
    subject: "Project Files",
    preview: "Here are the files you requested for the G03 project.",
    read: true,
  },
];

// Dữ liệu mock cho Cột 3
const mockEmailDetail = {
  // ... (Dữ liệu mockEmailDetail giữ nguyên, không thay đổi) ...
  id: 2,
  from: "security-noreply@google.com",
  to: "you@example.com",
  subject: "Security Alert",
  body: `
    <p>Hi,</p>
    <p>A new device (Windows 11, Chrome) signed into your account.</p>
    <p>If this was you, no action is needed. If you don't recognize this activity, please secure your account immediately.</p>
    <br/>
    <p>Thanks,</p>
    <p>The Google Team</p>
  `,
};

function Dashboard() {
  const [selectedEmail, setSelectedEmail] = useState(mockEmailDetail); // Hiển thị email đầu tiên

  return (
    <Container fluid className="dashboard-section">
      <Particle />
      <Container className="dashboard-container">
        {/* Hàng (Row) chính chứa 3 cột */}
        <Row className="dashboard-row">
          {/* CỘT 1: THƯ MỤC (Folders) */}
          <Col md={2} className="folder-column">
            {/* ... (Nội dung Cột 1 giữ nguyên) ... */}
            <h5 className="column-title">Mailboxes</h5>
            <ListGroup variant="flush">
              <ListGroup.Item action active>
                <FaInbox /> Inbox
                <Badge bg="danger" pill className="ms-2">
                  2
                </Badge>
              </ListGroup.Item>
              <ListGroup.Item action>
                <FaStar /> Starred
              </ListGroup.Item>
              <ListGroup.Item action>
                <FaPaperPlane /> Sent
              </ListGroup.Item>
              <ListGroup.Item action>
                <FaEdit /> Drafts
              </ListGroup.Item>
              <ListGroup.Item action>
                <FaTrash /> Trash
              </ListGroup.Item>
            </ListGroup>
          </Col>

          {/* CỘT 2: DANH SÁCH EMAIL (Email List) */}
          <Col md={4} className="email-list-column">
            {/* ... (Nội dung Cột 2 giữ nguyên) ... */}
            <div className="column-actions">
              <Button variant="primary">Compose</Button>
              <Button variant="outline-secondary" className="ms-2">
                <FaSync />
              </Button>
            </div>
            <ListGroup variant="flush" className="email-list-group">
              {mockEmails.map((email) => (
                <ListGroup.Item
                  key={email.id}
                  action
                  // onClick={() => setSelectedEmail(email)}
                  className={email.read ? "read" : "unread"}
                >
                  <div className="email-item-sender">{email.sender}</div>
                  <div className="email-item-subject">{email.subject}</div>
                  <div className="email-item-preview">{email.preview}</div>
                </ListGroup.Item>
              ))}
            </ListGroup>
          </Col>

          {/* CỘT 3: CHI TIẾT EMAIL (Email Detail) */}
          <Col md={6} className="email-detail-column">
            {!selectedEmail ? (
              // Trạng thái rỗng
              <div className="empty-state">
                <FaInbox size={50} />
                <p>Select an email to view details</p>
              </div>
            ) : (
              // Hiển thị chi tiết email
              <Card className="email-detail-card">
                <Card.Header className="email-detail-actions">
                  <Button variant="outline-secondary">
                    <FaReply /> Reply
                  </Button>
                  <Button variant="outline-secondary" className="ms-2">
                    <FaForward /> Forward
                  </Button>
                  <Button variant="outline-danger" className="ms-auto">
                    <FaTrash />
                  </Button>
                </Card.Header>
                <Card.Body>
                  <Card.Title>{selectedEmail.subject}</Card.Title>
                  
                  {/* === THAY ĐỔI Ở ĐÂY === */}
                  {/* Đã xóa class 'text-muted' để chữ có màu sáng (trắng) */}
                  <Card.Subtitle className="mb-2">
                    <strong>From:</strong> {selectedEmail.from}
                    <br />
                    <strong>To:</strong> {selectedEmail.to}
                  </Card.Subtitle>
                  {/* === KẾT THÚC THAY ĐỔI === */}
                  
                  <hr />
                  <div
                    className="email-body"
                    // Render HTML từ mock data
                    dangerouslySetInnerHTML={{ __html: selectedEmail.body }}
                  />
                </Card.Body>
              </Card>
            )}
          </Col>
        </Row>
      </Container>
    </Container>
  );
}

export default Dashboard;