import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Container,
  Row,
  Col,
  ListGroup,
  Card,
  Button,
  Badge,
  Modal,
  Form,
} from 'react-bootstrap'
import Particle from '../Particle'
import './Dashboard.css'
import {
  FaInbox,
  FaStar,
  FaRegStar,
  FaPaperPlane,
  FaEdit,
  FaTrash,
  FaSync,
  FaReply,
  FaForward,
} from 'react-icons/fa'
import { BiEdit } from 'react-icons/bi'

const mockFolders = [
  { id: 'inbox', name: 'Inbox' },
  { id: 'starred', name: 'Starred' },
  { id: 'sent', name: 'Sent' },
  { id: 'drafts', name: 'Drafts' },
  { id: 'archive', name: 'Archive' },
  { id: 'trash', name: 'Trash' },
]

function makeMockEmails(folderId: string) {
  const base = [
    {
      id: `${folderId}-1`,
      sender: 'Alice Smith',
      subject: 'Meeting Update',
      preview: 'Hi team, the meeting time has been changed to 3 PM...',
      read: false,
      starred: false,
      timestamp: Date.now() - 1000 * 60 * 60,
      body: '<p>Meeting moved to 3 PM. See you there.</p>',
      attachments: [],
    },
    {
      id: `${folderId}-2`,
      sender: 'Google',
      subject: 'Security Alert',
      preview: "A new device signed into your account. Please review...",
      read: false,
      starred: true,
      timestamp: Date.now() - 1000 * 60 * 60 * 24,
      body:
        "<p>A new device (Windows 11, Chrome) signed into your account. If this wasn't you, secure your account.</p>",
      attachments: [],
    },
    {
      id: `${folderId}-3`,
      sender: 'Bob Johnson',
      subject: 'Project Files',
      preview: 'Here are the files you requested for the G03 project.',
      read: true,
      starred: false,
      timestamp: Date.now() - 1000 * 60 * 60 * 48,
      body: '<p>Files attached. Let me know if you need anything else.</p>',
      attachments: [
        { name: 'report.pdf', size: '120KB', url: '#' },
      ],
    },
  ]

  return Array.from({ length: 12 }).flatMap((_, i) => {
    const item = base[i % base.length]
    return [{ ...item, id: `${item.id}-${i}` }]
  })
}

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

export default function Dashboard() {
  const [selectedFolder, setSelectedFolder] = useState('inbox')
  const [emailsMap, setEmailsMap] = useState<Record<string, any[]>>(() => {
    const inbox = makeMockEmails('inbox')
    const starred = inbox.filter((e) => e.starred)
    return {
      inbox,
      starred,
      sent: makeMockEmails('sent'),
      drafts: makeMockEmails('drafts'),
      archive: makeMockEmails('archive'),
      trash: makeMockEmails('trash'),
    }
  })

  const [selectedEmail, setSelectedEmail] = useState<any | null>(
    emailsMap['inbox']?.[0] ?? null,
  )
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({})
  const [showCompose, setShowCompose] = useState(false)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [cursorIndex, setCursorIndex] = useState(0)
  const listRef = useRef<HTMLDivElement | null>(null)

  const emailList = useMemo(() => emailsMap[selectedFolder] || [], [emailsMap, selectedFolder])

  const unreadInboxCount = useMemo(() => (emailsMap.inbox || []).filter((e) => !e.read).length, [emailsMap])
  
  // helper to mark a single email as selected (set cursor and selectedEmail)
  function selectEmailByIndex(idx: number) {
    const email = emailList[idx]
    if (!email) return
    setCursorIndex(idx)
    openEmail(email)
  }

  function selectFolder(id: string) {
    setSelectedFolder(id)
    setSelectedEmail(null)
    setSelectedIds({})
    setCursorIndex(0)
    setMobileView('list')
  }

  function openEmail(email: any) {
    setSelectedEmail(email)
    setEmailsMap((prev) => ({
      ...prev,
      [selectedFolder]: prev[selectedFolder].map((e) => (e.id === email.id ? { ...e, read: true } : e)),
    }))
    setMobileView('detail')
  }

  function toggleSelect(id: string) {
    setSelectedIds((s) => ({ ...s, [id]: !s[id] }))
  }

  function selectAllToggle() {
    const allSelected = emailList.length > 0 && emailList.every((e) => selectedIds[e.id])
    if (allSelected) setSelectedIds({})
    else setSelectedIds(Object.fromEntries(emailList.map((e) => [e.id, true])))
  }

  function deleteSelected() {
    const ids = new Set(Object.keys(selectedIds).filter((k) => selectedIds[k]))
    if (ids.size === 0) return
    setEmailsMap((prev) => {
      const next: Record<string, any[]> = {}
      for (const k of Object.keys(prev)) {
        next[k] = prev[k].filter((e) => !ids.has(e.id))
      }
      return next
    })
    if (selectedEmail && ids.has(selectedEmail.id)) setSelectedEmail(null)
    setSelectedIds({})
  }

  function markReadUnread(makeRead: boolean) {
    const ids = new Set(Object.keys(selectedIds).filter((k) => selectedIds[k]))
    if (ids.size === 0) return
    setEmailsMap((prev) => {
      const next: Record<string, any[]> = {}
      for (const k of Object.keys(prev)) {
        next[k] = prev[k].map((e) => (ids.has(e.id) ? { ...e, read: makeRead } : e))
      }
      return next
    })
    setSelectedIds({})
  }

  function toggleStar(email: any) {
    const newStar = !email.starred
    setEmailsMap((prev) => {
      const next: Record<string, any[]> = {}
      // update every folder's copy of the email if present
      for (const k of Object.keys(prev)) {
        next[k] = prev[k].map((e) => (e.id === email.id ? { ...e, starred: newStar } : e))
      }
      // maintain starred folder membership
      if (newStar) {
        const exists = next.starred.some((e) => e.id === email.id)
        if (!exists) {
          next.starred = [{ ...email, starred: true }, ...(next.starred || [])]
        }
      } else {
        next.starred = (next.starred || []).filter((e) => e.id !== email.id)
      }
      return next
    })
  }

  function refreshFolder() {
    setEmailsMap((prev) => {
      const next = { ...prev, [selectedFolder]: makeMockEmails(selectedFolder) }
      // if inbox refreshed, recompute starred from inbox
      if (selectedFolder === 'inbox') {
        next.starred = next.inbox.filter((e) => e.starred)
      }
      return next
    })
    setSelectedEmail(null)
    setSelectedIds({})
  }

  const [composeTo, setComposeTo] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')

  function sendCompose() {
    const item = {
      id: `sent-${Date.now()}`,
      sender: 'You',
      subject: composeSubject || '(no subject)',
      preview: (composeBody || '').slice(0, 80),
      read: true,
      starred: false,
      timestamp: Date.now(),
      body: `<p>${composeBody}</p>`,
      attachments: [],
    }
    setEmailsMap((prev) => ({ ...prev, sent: [item, ...(prev.sent || [])] }))
    setShowCompose(false)
    setComposeTo('')
    setComposeSubject('')
    setComposeBody('')
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (mobileView === 'detail') return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setCursorIndex((i) => Math.min(i + 1, emailList.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setCursorIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        const email = emailList[cursorIndex]
        if (email) openEmail(email)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [emailList, cursorIndex, mobileView])

  useEffect(() => {
    const id = emailList[cursorIndex]?.id
    if (!id) return
    const el = document.getElementById(`email-row-${id}`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [cursorIndex, emailList])

  return (
    <Container fluid className="dashboard-section">
      <Particle />
      <Container className="dashboard-container">
        <Row className="dashboard-row">
          <Col md={2} className={`folder-column ${mobileView === 'detail' ? 'hide-on-mobile' : ''}`}>
            <div className="folders-header d-flex align-items-center justify-content-between">
              <h5>Mailboxes</h5>
              <Button variant="link" size="sm" onClick={refreshFolder} aria-label="Refresh folders">
                <FaSync />
              </Button>
            </div>

            <ListGroup variant="flush" className="folders-list">
              {mockFolders.map((f) => (
                <ListGroup.Item key={f.id} action active={f.id === selectedFolder} onClick={() => selectFolder(f.id)}>
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      {f.id === 'inbox' && <FaInbox className="me-2" />}
                      {f.id === 'starred' && <FaStar className="me-2" />}
                      {f.id === 'sent' && <FaPaperPlane className="me-2" />}
                      {f.id === 'drafts' && <FaEdit className="me-2" />}
                      {f.id === 'trash' && <FaTrash className="me-2" />}
                      {f.name}
                    </div>
                    {f.id === 'inbox' && unreadInboxCount > 0 && (
                      <Badge bg="danger">{unreadInboxCount}</Badge>
                    )}
                  </div>
                </ListGroup.Item>
              ))}
            </ListGroup>
          </Col>

          <Col md={4} className={`email-list-column ${mobileView === 'detail' ? 'hide-on-mobile' : ''}`}>
            <div className="email-list-actions d-flex align-items-center mb-2">
              <Button variant="primary" onClick={() => setShowCompose(true)} aria-label="Compose">
                <BiEdit className="me-1" /> Compose
              </Button>
              <Button variant="light" className="ms-2" onClick={refreshFolder} aria-label="Refresh">
                <FaSync />
              </Button>
              <Button variant="outline-secondary" className="ms-2" onClick={selectAllToggle} aria-label="Select all">
                Select All
              </Button>
              <Button variant="outline-danger" className="ms-2" onClick={deleteSelected} aria-label="Delete selected">
                Delete
              </Button>
              <Button variant="outline-secondary" className="ms-2" onClick={() => markReadUnread(true)} aria-label="Mark read">
                Mark Read
              </Button>
              <Button variant="outline-secondary" className="ms-2" onClick={() => markReadUnread(false)} aria-label="Mark unread">
                Mark Unread
              </Button>
            </div>

            <div className="email-list" ref={listRef}>
              <ListGroup variant="flush">
                {emailList.map((email: any, idx: number) => (
                  <ListGroup.Item
                    id={`email-row-${email.id}`}
                    key={email.id}
                    action
                    className={`email-row d-flex align-items-start ${email.read ? 'read' : 'unread'} ${cursorIndex === idx ? 'cursor' : ''}`}
                    onClick={() => { setCursorIndex(idx); openEmail(email) }}
                  >
                    <div className="checkbox-col me-2">
                      <Form.Check type="checkbox" checked={!!selectedIds[email.id]} onChange={() => toggleSelect(email.id)} />
                    </div>
                    <div className="star-col me-2" onClick={(e) => { e.stopPropagation(); toggleStar(email) }}>
                      {email.starred ? <FaStar /> : <FaRegStar />}
                    </div>
                    <div className="meta-col flex-fill">
                      <div className="row-top d-flex justify-content-between">
                        <div className="sender">{email.sender}</div>
                        <div className="time">{timeAgo(email.timestamp)}</div>
                      </div>
                      <div className="subject">{email.subject}</div>
                      <div className="preview text-muted">{email.preview}</div>
                    </div>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            </div>
          </Col>

          <Col md={6} className={`email-detail-column ${mobileView === 'list' ? 'hide-on-mobile' : ''}`}>
            {!selectedEmail ? (
              <div className="empty-state text-center mt-5">
                <FaInbox size={48} />
                <p>Select an email to view details</p>
              </div>
            ) : (
              <Card className="email-detail-card">
                <Card.Header className="d-flex align-items-center">
                  <div className="me-2">
                    <Button variant="outline-secondary" size="sm" onClick={() => { /* reply mock */ }}>
                      <FaReply />
                    </Button>
                    <Button variant="outline-secondary" size="sm" className="ms-1" onClick={() => { /* forward mock */ }}>
                      <FaForward />
                    </Button>
                  </div>
                  <div className="ms-auto d-flex align-items-center">
                    <Button variant="outline-secondary" size="sm" onClick={() => { setSelectedEmail(null); setMobileView('list') }} className="me-2">
                      Back
                    </Button>
                    <Button variant="outline-danger" size="sm" onClick={() => { deleteSelected() }}>
                      <FaTrash />
                    </Button>
                  </div>
                </Card.Header>
                <Card.Body>
                  <Card.Title>{selectedEmail.subject}</Card.Title>
                  <Card.Subtitle className="mb-2 text-muted">
                    <div><strong>From:</strong> {selectedEmail.sender}</div>
                    <div><strong>To:</strong> you@example.com</div>
                  </Card.Subtitle>
                  <hr />
                  <div className="email-body" dangerouslySetInnerHTML={{ __html: selectedEmail.body }} />

                  {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                    <div className="attachments mt-3">
                      <h6>Attachments</h6>
                      <ul>
                        {selectedEmail.attachments.map((a: any, i: number) => (
                          <li key={i}><a href={a.url}>{a.name}</a> <small>({a.size})</small></li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card.Body>
              </Card>
            )}
          </Col>
        </Row>
      </Container>

      <Modal show={showCompose} onHide={() => setShowCompose(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Compose</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-2">
              <Form.Label>To</Form.Label>
              <Form.Control value={composeTo} onChange={(e) => setComposeTo(e.target.value)} />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>Subject</Form.Label>
              <Form.Control value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} />
            </Form.Group>
            <Form.Group>
              <Form.Label>Body</Form.Label>
              <Form.Control as="textarea" rows={6} value={composeBody} onChange={(e) => setComposeBody(e.target.value)} />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowCompose(false)}>Cancel</Button>
          <Button variant="primary" onClick={sendCompose}>Send</Button>
        </Modal.Footer>
      </Modal>
    </Container>
  )
}